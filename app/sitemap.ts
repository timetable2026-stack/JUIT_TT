import type { MetadataRoute } from "next";
import { getStore } from "@/lib/store";
import { siteConfig } from "@/lib/site";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { url } = siteConfig();
  const live = await getStore().getPublished().catch(() => null);
  const lastModified = live?.publishedAt ? new Date(live.publishedAt) : new Date();
  return [{ url: `${url}/`, lastModified, changeFrequency: "daily", priority: 1 }];
}
