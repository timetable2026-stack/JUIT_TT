// The public timetable payload, built once here and used by both the API route
// and the server-rendered home page (so the first paint needs no client fetch).
import { siteConfig } from "./site";
import { getStore } from "./store";
import type { PublicPayload } from "./types";

export async function getPublicPayload(): Promise<PublicPayload> {
  const store = getStore();
  const versions = await store.listVersions();
  const live = versions.find((v) => v.status === "published") ?? null;
  const published = versions.filter((v) => v.status !== "draft").sort((a, b) => b.id - a.id);
  const recent = published.slice(0, 8);
  const [acks, prefs, settings] = await Promise.all([store.listAcks(recent.map((v) => v.id)), store.listPrefs(), store.getSettings()]);
  const now = Date.now();
  const announcements = (await store.listAnnouncements()).filter((a) => !a.expiresAt || Date.parse(a.expiresAt) > now).slice(0, 30);
  return {
    version: live ? { id: live.id, publishedAt: live.publishedAt!, note: live.note } : null,
    data: live?.data ?? null,
    changes: live?.changes ?? [],
    recentPublishes: recent.map((v) => ({ id: v.id, publishedAt: v.publishedAt!, note: v.note, changes: v.changes })),
    announcements, acks, prefs, settings,
    site: siteConfig(),
  };
}
