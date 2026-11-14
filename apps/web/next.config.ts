import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const BUILD_OUTPUT = process.env.NEXT_STANDALONE_OUTPUT
  ? "standalone"
  : undefined;
const SHOULD_UPLOAD_SENTRY_SOURCEMAPS =
  process.env.SENTRY_UPLOAD_SOURCE_MAPS === "1";

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
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(self), geolocation=()",
  },
];

const embedSecurityHeaders = [
  ...securityHeaders.filter(
    ({ key }) =>
      key !== "X-Frame-Options" &&
      key !== "Content-Security-Policy" &&
      key !== "Permissions-Policy",
  ),
  {
    key: "Content-Security-Policy",
    value:
      "frame-ancestors *; object-src 'none'; base-uri 'self'; form-action 'self'",
  },
  {
    key: "Permissions-Policy",
    value:
      "camera=(), microphone=(), clipboard-read=(), clipboard-write=(self)",
  },
];

const getConfig = () => {
  const nextConfig: NextConfig = {
    poweredByHeader: false,
    output: BUILD_OUTPUT,
    // The /updates → /index redirect moved to apps/marketing/next.config.ts
    // with the changelog page; on this domain the middleware sends former
    // marketing URLs (including /updates) straight to the marketing site.
    // Workspace packages ship TypeScript source; Next must transpile them.
    transpilePackages: [
      "@keinsaas/mcp-types",
      "@keinsaas/mcp-core",
      "@keinsaas/mcp-router",
      "@keinsaas/workflow-dashboard-kit",
    ],
    // Native binding (a .node file) used to rasterize PDF pages for vision
    // models. Bundling it breaks the require of the platform-specific binary,
    // so Next must leave it to the Node runtime to resolve.
    serverExternalPackages: [
      "@napi-rs/canvas",
      "playwright",
      "playwright-core",
      "@llamaindex/liteparse",
    ],
    cleanDistDir: true,
    devIndicators: {
      position: "bottom-right",
    },
    env: {
      NO_HTTPS: process.env.NO_HTTPS,
    },
    experimental: {
      taint: true,
      authInterrupts: true,
    },
    headers: async () => [
      {
        source: "/((?!embed(?:/|$)|embed\\.js$).*)",
        headers: securityHeaders,
      },
      { source: "/embed/:path*", headers: embedSecurityHeaders },
      { source: "/embed.js", headers: embedSecurityHeaders },
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        source: "/manifest.webmanifest",
        headers: [{ key: "Content-Type", value: "application/manifest+json" }],
      },
    ],
  };
  const withNextIntl = createNextIntlPlugin();
  return withNextIntl(nextConfig);
};

export default withSentryConfig(getConfig, {
  org: "chut-ai-cb",
  project: "javascript-nextjs",
  silent: true,
  telemetry: false,
  widenClientFileUpload: false,
  sourcemaps: {
    disable: !SHOULD_UPLOAD_SENTRY_SOURCEMAPS,
  },
  tunnelRoute: "/monitoring",
  webpack: {
    automaticVercelMonitors: true,
    treeshake: {
      removeDebugLogging: true,
    },
  },
});
