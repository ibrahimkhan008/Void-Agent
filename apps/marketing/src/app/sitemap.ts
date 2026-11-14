import type { MetadataRoute } from "next";

const MARKETING_URL = (
  process.env.NEXT_PUBLIC_MARKETING_URL ?? "https://voidagent.space"
).replace(/\/+$/, "");

/** Every public marketing route. `/index` is the changelog hub (the `/updates`
 * alias 301s to it — see next.config.ts). */
const ROUTES = [
  "/",
  "/pricing",
  "/about",
  "/docs",
  "/docs/mcp",
  "/contact",
  "/contact-sales",
  "/vs/manus",
  "/index",
  "/branding",
  "/privacy-policy",
  "/terms-of-service",
  "/cookies-policy",
  "/refund-policy",
  "/grievance-redressal",
];

export default function sitemap(): MetadataRoute.Sitemap {
  return ROUTES.map((route) => ({
    url: `${MARKETING_URL}${route}`,
    lastModified: new Date(),
  }));
}
