// Email delivery. Two ways to send, picked by what is configured:
//   1. The office mailbox itself over SMTP (timetable2026@juitsolan.in with an app
//      password) — no DNS changes needed, mail shows as sent by the office.
//   2. Resend (RESEND_API_KEY) once the domain is verified there.
// With neither, nothing is sent and every message is logged as "skipped".
import type { EmailContent } from "./format";
import type { EmailLogEntry } from "./types";

export interface Recipient { facultyId: string; email: string; name: string }
export interface Attachment { filename: string; content: Uint8Array; contentType?: string }
export interface Outgoing { to: Recipient; content: EmailContent; attachments?: Attachment[] }

export const OFFICE_EMAIL = "timetable2026@juitsolan.in";
export const DEFAULT_FROM = `JUIT Time Table Committee <${OFFICE_EMAIL}>`;

export function emailFrom() { return process.env.EMAIL_FROM || DEFAULT_FROM; }
export function emailReplyTo() { return process.env.EMAIL_REPLY_TO || OFFICE_EMAIL; }

export function emailTransport(): "smtp" | "resend" | "none" {
  if (process.env.SMTP_USER && process.env.SMTP_PASS) return "smtp";
  if (process.env.RESEND_API_KEY) return "resend";
  return "none";
}
export function emailConfigured() { return emailTransport() !== "none"; }

export async function sendBatch(kind: EmailLogEntry["kind"], refId: number, items: Outgoing[]): Promise<Omit<EmailLogEntry, "id">[]> {
  const now = new Date().toISOString();
  if (!items.length) return [];
  const transport = emailTransport();
  if (transport === "none") {
    return items.map(({ to, content }) => ({ createdAt: now, kind, refId, recipient: to.email, facultyId: to.facultyId, subject: content.subject, status: "skipped" as const, error: "Email not configured (set SMTP_USER + SMTP_PASS for the office mailbox, or RESEND_API_KEY)" }));
  }
  return transport === "smtp" ? sendViaSmtp(kind, refId, items, now) : sendViaResend(kind, refId, items, now);
}

async function sendViaSmtp(kind: EmailLogEntry["kind"], refId: number, items: Outgoing[], now: string) {
  const nodemailer = (await import("nodemailer")).default;
  const port = Number(process.env.SMTP_PORT || 465);
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port,
    secure: port === 465,
    auth: { user: process.env.SMTP_USER!, pass: process.env.SMTP_PASS! },
    pool: true, maxConnections: 3, maxMessages: 100,
  });
  const from = emailFrom(); const replyTo = emailReplyTo();
  const log: Omit<EmailLogEntry, "id">[] = [];
  for (const { to, content, attachments } of items) {
    try {
      const info = await transporter.sendMail({ from, to: `${to.name} <${to.email}>`, replyTo, subject: content.subject, html: content.html, text: content.text,
        attachments: attachments?.map((a) => ({ filename: a.filename, content: Buffer.from(a.content), contentType: a.contentType ?? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })) });
      log.push({ createdAt: now, kind, refId, recipient: to.email, facultyId: to.facultyId, subject: content.subject, status: "sent", providerId: info?.messageId });
    } catch (err: any) {
      log.push({ createdAt: now, kind, refId, recipient: to.email, facultyId: to.facultyId, subject: content.subject, status: "failed", error: String(err?.message ?? err) });
    }
  }
  transporter.close();
  return log;
}

async function sendViaResend(kind: EmailLogEntry["kind"], refId: number, items: Outgoing[], now: string) {
  const { Resend } = await import("resend");
  const resend = new Resend(process.env.RESEND_API_KEY!);
  const from = emailFrom(); const replyTo = emailReplyTo();
  const log: Omit<EmailLogEntry, "id">[] = [];
  for (let i = 0; i < items.length; i += 100) {
    const chunk = items.slice(i, i + 100);
    try {
      const res: any = await resend.batch.send(chunk.map(({ to, content, attachments }) => ({ from, to: [to.email], replyTo, subject: content.subject, html: content.html, text: content.text, attachments: attachments?.map((a) => ({ filename: a.filename, content: Buffer.from(a.content).toString("base64") })) })));
      if (res.error) throw new Error(res.error.message ?? JSON.stringify(res.error));
      const ids: { id: string }[] = res.data?.data ?? res.data ?? [];
      chunk.forEach(({ to, content }, j) => log.push({ createdAt: now, kind, refId, recipient: to.email, facultyId: to.facultyId, subject: content.subject, status: "sent", providerId: ids[j]?.id }));
    } catch (e: any) {
      for (const { to, content, attachments } of chunk) {
        try {
          const r: any = await resend.emails.send({ from, to: [to.email], replyTo, subject: content.subject, html: content.html, text: content.text, attachments: attachments?.map((a) => ({ filename: a.filename, content: Buffer.from(a.content).toString("base64") })) });
          if (r.error) throw new Error(r.error.message ?? JSON.stringify(r.error));
          log.push({ createdAt: now, kind, refId, recipient: to.email, facultyId: to.facultyId, subject: content.subject, status: "sent", providerId: r.data?.id });
        } catch (err: any) {
          log.push({ createdAt: now, kind, refId, recipient: to.email, facultyId: to.facultyId, subject: content.subject, status: "failed", error: String(err?.message ?? err ?? e?.message) });
        }
      }
    }
  }
  return log;
}

/** One test message to prove the mailbox credentials work. */
export async function sendTestEmail(to: string): Promise<{ ok: boolean; error?: string; transport: string }> {
  const transport = emailTransport();
  if (transport === "none") return { ok: false, transport, error: "Email is not configured." };
  const { siteConfig } = await import("./site");
  const site = siteConfig();
  const html = `<!doctype html><html><body style="margin:0;padding:24px 12px;background:#f4f6f9;font-family:Arial,Helvetica,sans-serif;color:#1a1d21"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden"><tr><td style="background:#1f3a5f;color:#fff;padding:14px 24px"><div style="font-size:12px;letter-spacing:.06em;text-transform:uppercase;opacity:.85">${site.department}</div><div style="font-size:16px;font-weight:bold">JUIT Timetable</div></td></tr><tr><td style="padding:22px 24px;line-height:1.55"><h2 style="margin:0 0 8px;font-size:18px">Email is working</h2><p style="margin:0 0 14px">This test message was sent by the university timetable portal through <b>${emailFrom().replace(/</g, "&lt;")}</b>. Faculty will receive timetable publications, change alerts and morning reminders from this address.</p><p style="margin:0"><a href="${site.url}" style="display:inline-block;background:#1f3a5f;color:#fff;text-decoration:none;padding:11px 18px;border-radius:8px;font-weight:bold">Open the portal</a></p><p style="font-size:12px;color:#6b7684;margin:10px 0 0;word-break:break-all">${site.url}</p></td></tr></table></body></html>`;
  const [entry] = await sendBatch("announcement", 0, [{ to: { facultyId: "TEST", email: to, name: "Test" }, content: { subject: "Timetable portal: email is working", html, text: `Email is working. This test was sent by the university timetable portal via ${transport} from ${emailFrom()}.\n\nOpen the portal: ${site.url}` } }]);
  return { ok: entry.status === "sent", transport, error: entry.error };
}
