// The public timetable payload, built once here and used by both the API route
// and the server-rendered home page (so the first paint needs no client fetch).
import { siteConfig } from "./site";
import { getStore } from "./store";
import type { Change, PublicPayload, Slot } from "./types";

/** The portal only needs each change's text, audience and the slot keys it touches — not two full Slot objects. */
function slim(c: Change): Change {
  return { id: c.id, type: c.type, text: c.text, affectedFacultyIds: c.affectedFacultyIds, before: c.before ? ({ key: c.before.key } as Slot) : undefined, after: c.after ? ({ key: c.after.key } as Slot) : undefined };
}

let memo: { at: number; value: PublicPayload } | null = null;
const MEMO_MS = 15_000; // per-instance; the CDN cache in front is the main one

export async function getPublicPayload(): Promise<PublicPayload> {
  if (memo && Date.now() - memo.at < MEMO_MS) return memo.value;
  const store = getStore();
  // Everything in parallel; the published version is the only row that carries slot data.
  const [live, summaries, prefs, settings, allAnnouncements] = await Promise.all([
    store.getPublished(), store.listVersionSummaries(12), store.listPrefs(), store.getSettings(), store.listAnnouncements(),
  ]);
  const recent = summaries.filter((v) => v.status !== "draft").slice(0, 8);
  const acks = await store.listAcks(recent.map((v) => v.id));
  const now = Date.now();
  const announcements = allAnnouncements.filter((a) => !a.expiresAt || Date.parse(a.expiresAt) > now).slice(0, 30);
  const value: PublicPayload = {
    version: live ? { id: live.id, publishedAt: live.publishedAt!, note: live.note } : null,
    data: live?.data ?? null,
    changes: [], // the live version's changes are in recentPublishes under its id; the portal reads them from there
    recentPublishes: recent.map((v) => ({ id: v.id, publishedAt: v.publishedAt!, note: v.note, changes: v.changes.slice(0, 600).map(slim) })),
    announcements, acks, prefs, settings,
    site: siteConfig(),
  };
  memo = { at: Date.now(), value };
  return value;
}

/** Forget the cached payload (called after a publish or announcement). */
export function invalidatePublicPayload() { memo = null; }
