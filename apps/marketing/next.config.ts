import path from "node:path";
import type { NextConfig } from "next";

const BUILD_OUTPUT = process.env.NEXT_STANDALONE_OUTPUT
  ? "standalone"
  : undefined;

// Pin the monorepo root. Without this, Next infers the workspace root from
// lockfile discovery and a stray package-lock.json anywhere ABOVE the repo
// makes it pick the wrong root — which trips the "Expected
// clientReferenceManifest to be defined" prerender bug.
const REPO_ROOT = path.join(import.meta.dirname, "..", "..");

const securityHeaders = [
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  {
    key: "Content-Security-Policy",
    value:
      "frame-ancestors 'self'; object-src 'none'; base-uri 'self'; form-action 'self'",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  output: BUILD_OUTPUT,
  outputFileTracingRoot: REPO_ROOT,
  // The three markdown legal pages read ./legal-consent/*.md at runtime via
  // process.cwd(). Plain `next start` runs from the app directory and finds
  // them in the checkout; standalone output must be told to trace them (the
  // Docker build additionally COPYs the folder — see docker/marketing.Dockerfile).
  outputFileTracingIncludes: {
    "/privacy-policy": ["./legal-consent/**/*"],
    "/terms-of-service": ["./legal-consent/**/*"],
    "/cookies-policy": ["./legal-consent/**/*"],
  },
  // The changelog hub's one true URL is /index. /updates existed only for
  // the abandoned Vercel workaround (Vercel's platform intercepted /index
  // before any page code ran); it was reverted when the Vercel footprint
  // was removed. This redirect moved here verbatim from apps/web when the
  // marketing site was extracted — keep it so the old name still lands on
  // the page.
  async redirects() {
    return [{ source: "/updates", destination: "/index", permanent: true }];
  },
  headers: async () => [
    { source: "/:path*", headers: securityHeaders },
    {
      source: "/manifest.webmanifest",
      headers: [{ key: "Content-Type", value: "application/manifest+json" }],
    },
  ],
};

export default nextConfig;
