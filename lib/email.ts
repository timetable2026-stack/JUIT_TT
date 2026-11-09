// Email delivery through Resend. Without RESEND_API_KEY nothing is sent and every
// message is logged as "skipped", so the rest of the system keeps working.
import type { EmailContent } from "./format";
import type { EmailLogEntry } from "./types";

export interface Recipient { facultyId: string; email: string; name: string }

export function emailConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export async function sendBatch(kind: EmailLogEntry["kind"], refId: number, items: { to: Recipient; content: EmailContent }[]): Promise<Omit<EmailLogEntry, "id">[]> {
  const now = new Date().toISOString();
  if (!items.length) return [];
  if (!emailConfigured()) {
    return items.map(({ to, content }) => ({ createdAt: now, kind, refId, recipient: to.email, facultyId: to.facultyId, subject: content.subject, status: "skipped" as const, error: "Email not configured (RESEND_API_KEY / EMAIL_FROM missing)" }));
  }
  const { Resend } = await import("resend");
  const resend = new Resend(process.env.RESEND_API_KEY!);
  const from = process.env.EMAIL_FROM!;
  const replyTo = process.env.EMAIL_REPLY_TO || undefined;
  const log: Omit<EmailLogEntry, "id">[] = [];

  // Resend allows batches of up to 100 messages per call.
  for (let i = 0; i < items.length; i += 100) {
    const chunk = items.slice(i, i + 100);
    try {
      const res: any = await resend.batch.send(chunk.map(({ to, content }) => ({ from, to: [to.email], replyTo, subject: content.subject, html: content.html, text: content.text })));
      if (res.error) throw new Error(res.error.message ?? JSON.stringify(res.error));
      const ids: { id: string }[] = res.data?.data ?? res.data ?? [];
      chunk.forEach(({ to, content }, j) => log.push({ createdAt: now, kind, refId, recipient: to.email, facultyId: to.facultyId, subject: content.subject, status: "sent", providerId: ids[j]?.id }));
    } catch (e: any) {
      // Fall back to one-by-one so one bad address does not block the batch.
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
