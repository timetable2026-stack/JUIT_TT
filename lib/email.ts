// Email delivery. Two ways to send, picked by what is configured:
//   1. The office mailbox itself over SMTP (timetable2026@juitsolan.in with an app
//      password) — no DNS changes needed, mail shows as sent by the office.
//   2. Resend (RESEND_API_KEY) once the domain is verified there.
// With neither, nothing is sent and every message is logged as "skipped".
import type { EmailContent } from "./format";
import type { EmailLogEntry } from "./types";

export interface Recipient { facultyId: string; email: string; name: string }

export const OFFICE_EMAIL = "timetable2026@juitsolan.in";
export const DEFAULT_FROM = `JUIT Timetable Office <${OFFICE_EMAIL}>`;

export function emailFrom() { return process.env.EMAIL_FROM || DEFAULT_FROM; }
export function emailReplyTo() { return process.env.EMAIL_REPLY_TO || OFFICE_EMAIL; }

export function emailTransport(): "smtp" | "resend" | "none" {
  if (process.env.SMTP_USER && process.env.SMTP_PASS) return "smtp";
  if (process.env.RESEND_API_KEY) return "resend";
  return "none";
}
export function emailConfigured() { return emailTransport() !== "none"; }

export async function sendBatch(kind: EmailLogEntry["kind"], refId: number, items: { to: Recipient; content: EmailContent }[]): Promise<Omit<EmailLogEntry, "id">[]> {
  const now = new Date().toISOString();
  if (!items.length) return [];
  const transport = emailTransport();
  if (transport === "none") {
    return items.map(({ to, content }) => ({ createdAt: now, kind, refId, recipient: to.email, facultyId: to.facultyId, subject: content.subject, status: "skipped" as const, error: "Email not configured (set SMTP_USER + SMTP_PASS for the office mailbox, or RESEND_API_KEY)" }));
  }
  return transport === "smtp" ? sendViaSmtp(kind, refId, items, now) : sendViaResend(kind, refId, items, now);
}

async function sendViaSmtp(kind: EmailLogEntry["kind"], refId: number, items: { to: Recipient; content: EmailContent }[], now: string) {
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
  for (const { to, content } of items) {
    try {
      const info = await transporter.sendMail({ from, to: `${to.name} <${to.email}>`, replyTo, subject: content.subject, html: content.html, text: content.text });
      log.push({ createdAt: now, kind, refId, recipient: to.email, facultyId: to.facultyId, subject: content.subject, status: "sent", providerId: info?.messageId });
    } catch (err: any) {
      log.push({ createdAt: now, kind, refId, recipient: to.email, facultyId: to.facultyId, subject: content.subject, status: "failed", error: String(err?.message ?? err) });
    }
  }
  transporter.close();
  return log;
}

async function sendViaResend(kind: EmailLogEntry["kind"], refId: number, items: { to: Recipient; content: EmailContent }[], now: string) {
  const { Resend } = await import("resend");
  const resend = new Resend(process.env.RESEND_API_KEY!);
  const from = emailFrom(); const replyTo = emailReplyTo();
  const log: Omit<EmailLogEntry, "id">[] = [];
  for (let i = 0; i < items.length; i += 100) {
    const chunk = items.slice(i, i + 100);
    try {
      const res: any = await resend.batch.send(chunk.map(({ to, content }) => ({ from, to: [to.email], replyTo, subject: content.subject, html: content.html, text: content.text })));
      if (res.error) throw new Error(res.error.message ?? JSON.stringify(res.error));
      const ids: { id: string }[] = res.data?.data ?? res.data ?? [];
      chunk.forEach(({ to, content }, j) => log.push({ createdAt: now, kind, refId, recipient: to.email, facultyId: to.facultyId, subject: content.subject, status: "sent", providerId: ids[j]?.id }));
    } catch (e: any) {
      for (const { to, content } of chunk) {
        try {
          const r: any = await resend.emails.send({ from, to: [to.email], replyTo, subject: content.subject, html: content.html, text: content.text });
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
  const [entry] = await sendBatch("announcement", 0, [{ to: { facultyId: "TEST", email: to, name: "Test" }, content: { subject: "Timetable portal: test email", html: `<p>This is a test from the department timetable portal. Sending works.</p><p style="color:#666;font-size:12px">Sent via ${transport} from ${emailFrom()}.</p>`, text: `This is a test from the department timetable portal. Sending works. (via ${transport} from ${emailFrom()})` } }]);
  return { ok: entry.status === "sent", transport, error: entry.error };
}
