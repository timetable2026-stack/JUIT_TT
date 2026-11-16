import type { MetadataRoute } from "next";
import { siteConfig } from "@/lib/site";
import { SPACES } from "@/lib/space";

export default function robots(): MetadataRoute.Robots {
  const { url } = siteConfig();
  return { rules: [{ userAgent: "*", allow: "/", disallow: [...SPACES.map((s) => s.admin), ...SPACES.map((s) => `${s.portal}/api/`)] }], sitemap: `${url}/sitemap.xml`, host: url };
}
