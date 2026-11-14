import type { MetadataRoute } from "next";

const MARKETING_URL = (
  process.env.NEXT_PUBLIC_MARKETING_URL ?? "https://voidagent.space"
).replace(/\/+$/, "");

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${MARKETING_URL}/sitemap.xml`,
  };
}
