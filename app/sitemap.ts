import type { MetadataRoute } from "next";
import { getStore } from "@/lib/store";
import { siteConfig } from "@/lib/site";
import { SPACES } from "@/lib/space";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { url } = siteConfig();
  const out: MetadataRoute.Sitemap = [];
  for (const space of SPACES) {
    const live = await getStore(space).getPublished().catch(() => null);
    if (space.id && !live) continue; // an extra space appears once something is published there
    const lastModified = live?.publishedAt ? new Date(live.publishedAt) : new Date();
    out.push({ url: `${url}${space.portal}/`.replace(/\/\/$/, "/"), lastModified, changeFrequency: "daily", priority: space.id ? 0.8 : 1 });
  }
  return out;
}
