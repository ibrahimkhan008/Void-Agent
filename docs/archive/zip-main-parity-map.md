# zip-main -> staging parity map (WP6a)

Generated: 2026-11-11. Source of record for the zip-main -> staging promotion gate.

- ORIGINAL: zip-main @ `aa9fce0f545afb18b9a191724be092887f83630b` (tracked `src/` tree, 1,213 files).
- STAGING: `Void Agent-integration-staging` @ working tree, rooted at `apps/web/src`.
- DESTINATION (secondary reference): `Void Agent` working tree `src/` (evolved fork of the original).

## (a) Method + counts

Method: `git ls-tree -r aa9fce0 -- src/` enumerates originals (read via `git archive` to a temp dir; repos untouched). For each zip-main path `src/X`: (1) staging same-path `apps/web/src/X` -> sha256 compare after CRLF->LF normalization; (2) else basename search across `apps/web` (generic Next.js filenames like `route.ts`, `page.tsx`, `actions.ts`, `index.ts`, `client.ts` count only when the parent directory name also matches, or when the basename is unique and non-generic); (3) else UNMATCHED. Every unmatched path was additionally looked up in the destination `src/` (same path, then same rules) as a secondary reference. Paths matched case-insensitively.

| bucket | count | % of 1,213 |
|---|---|---|
| total zip-main src files | 1213 | 100% |
| same-path identical (content) | 304 | 25.1% |
| - of which byte-identical | 267 | 22.0% |
| - of which EOL-only difference | 37 | 3.1% |
| same-path different | 366 | 30.2% |
| basename match (moved/renamed in staging) | 129 | 10.6% |
| unmatched (no same-path, no credible basename match) | 414 | 34.1% |

Cross-checks: 413 of 414 unmatched paths exist in the DESTINATION `src/` at the same path (344 content-equal, 69 differing); 1 path exists nowhere (`.bak` backup). So the unmatched bucket is dominated by destination-only features, not by renames. Largest content-drift risk is the 366 same-path-different files (Appendix A), not path drift.

## (b) UNMATCHED paths (414)

Every guess below is UNVERIFIED - a later agent must verify semantically. `[dest=...]` shows the destination reference (the evolved fork carries these files).

| zip-main path | family | one-line guess (unverified) |
|---|---|---|
| `src/app/(auth)/auth/page.tsx` | app/(auth) | guess: staging app/(auth) exists with its own upstream auth page - verify parity `[dest=same-path, content-equal]` |
| `src/app/(chat)/(admin)/admin/audit/page.tsx` | app/(chat) | guess: destination admin audit page; staging security events = 0075_void_agent_security_events.sql + app/api/admin/security-settings + security-events-settings.tsx - map `[dest=same-path, content-equal]` |
| `src/app/(chat)/(admin)/admin/health/page.tsx` | app/(chat) | guess: destination site-config admin console page (settings tabs); staging admin = app/(chat)/admin/{payments,providers,security} + app/api/admin/{actions,api-keys,payments,providers,security-settings} - port per tab `[dest=same-path, content-equal]` |
| `src/app/(chat)/(admin)/admin/page.tsx` | app/(chat) | guess: destination site-config admin console page (settings tabs); staging admin = app/(chat)/admin/{payments,providers,security} + app/api/admin/{actions,api-keys,payments,providers,security-settings} - port per tab `[dest=same-path, content-equal]` |
| `src/app/(chat)/(admin)/admin/settings/artifacts/page.tsx` | app/(chat) | guess: destination site-config admin console page (settings tabs); staging admin = app/(chat)/admin/{payments,providers,security} + app/api/admin/{actions,api-keys,payments,providers,security-settings} - port per tab `[dest=same-path, content-equal]` |
| `src/app/(chat)/(admin)/admin/settings/branding/page.tsx` | app/(chat) | guess: destination site-config admin console page (settings tabs); staging admin = app/(chat)/admin/{payments,providers,security} + app/api/admin/{actions,api-keys,payments,providers,security-settings} - port per tab `[dest=same-path, content-equal]` |
| `src/app/(chat)/(admin)/admin/settings/canvas/page.tsx` | app/(chat) | guess: destination site-config admin console page (settings tabs); staging admin = app/(chat)/admin/{payments,providers,security} + app/api/admin/{actions,api-keys,payments,providers,security-settings} - port per tab `[dest=same-path, content-equal]` |
| `src/app/(chat)/(admin)/admin/settings/chat/page.tsx` | app/(chat) | guess: destination site-config admin console page (settings tabs); staging admin = app/(chat)/admin/{payments,providers,security} + app/api/admin/{actions,api-keys,payments,providers,security-settings} - port per tab `[dest=same-path, content-equal]` |
| `src/app/(chat)/(admin)/admin/settings/general/page.tsx` | app/(chat) | guess: destination site-config admin console page (settings tabs); staging admin = app/(chat)/admin/{payments,providers,security} + app/api/admin/{actions,api-keys,payments,providers,security-settings} - port per tab `[dest=same-path, content-equal]` |
| `src/app/(chat)/(admin)/admin/settings/layout.tsx` | app/(chat) | guess: destination site-config admin console page (settings tabs); staging admin = app/(chat)/admin/{payments,providers,security} + app/api/admin/{actions,api-keys,payments,providers,security-settings} - port per tab `[dest=same-path, content-equal]` |
| `src/app/(chat)/(admin)/admin/settings/models/page.tsx` | app/(chat) | guess: destination admin models tab; staging provider mgmt = app/(chat)/admin/providers/page.tsx + dynamic-providers-settings.tsx - map `[dest=same-path, differs]` |
| `src/app/(chat)/(admin)/admin/settings/oauth/page.tsx` | app/(chat) | guess: destination site-config admin console page (settings tabs); staging admin = app/(chat)/admin/{payments,providers,security} + app/api/admin/{actions,api-keys,payments,providers,security-settings} - port per tab `[dest=same-path, content-equal]` |
| `src/app/(chat)/(admin)/admin/settings/page.tsx` | app/(chat) | guess: destination site-config admin console page (settings tabs); staging admin = app/(chat)/admin/{payments,providers,security} + app/api/admin/{actions,api-keys,payments,providers,security-settings} - port per tab `[dest=same-path, content-equal]` |
| `src/app/(chat)/(admin)/admin/settings/tools/page.tsx` | app/(chat) | guess: destination site-config admin console page (settings tabs); staging admin = app/(chat)/admin/{payments,providers,security} + app/api/admin/{actions,api-keys,payments,providers,security-settings} - port per tab `[dest=same-path, content-equal]` |
| `src/app/(chat)/(admin)/admin/users/(list)/layout.tsx` | app/(chat) | guess: staging admin user mgmt = components/admin/users-table.tsx; route path differs - verify `[dest=same-path, content-equal]` |
| `src/app/(chat)/(admin)/admin/users/(list)/loading.tsx` | app/(chat) | guess: staging admin user mgmt = components/admin/users-table.tsx; route path differs - verify `[dest=same-path, content-equal]` |
| `src/app/(chat)/(admin)/admin/users/(list)/page.tsx` | app/(chat) | guess: staging admin user mgmt = components/admin/users-table.tsx; route path differs - verify `[dest=same-path, content-equal]` |
| `src/app/(chat)/(admin)/admin/users/[id]/layout.tsx` | app/(chat) | guess: staging admin user mgmt = components/admin/users-table.tsx; route path differs - verify `[dest=same-path, content-equal]` |
| `src/app/(chat)/(admin)/layout.tsx` | app/(chat) | guess: destination site-config admin console page (settings tabs); staging admin = app/(chat)/admin/{payments,providers,security} + app/api/admin/{actions,api-keys,payments,providers,security-settings} - port per tab `[dest=same-path, content-equal]` |
| `src/app/(chat)/archive/[id]/archive-actions-client.tsx` | app/(chat) | guess: staging archives at app/(chat)/archives (C40, migration 0078) - verify action parity `[dest=same-path, content-equal]` |
| `src/app/(chat)/canvas/page.tsx` | app/(chat) | guess: staging canvas = ecanvas (app/(chat)/ecanvas, components/canvas/ecanvas, app/api/ecanvas) - verify vs zip canvas-panel `[dest=same-path, content-equal]` |
| `src/app/(chat)/dashboard/page.tsx` | app/(chat) | guess: staging dashboard lives at app/dashboard/page.tsx (root-level, upstream) - verify parity `[dest=same-path, content-equal]` |
| `src/app/(chat)/profile/page.tsx` | app/(chat) | guess: staging user settings via app/api/user/details + components/user/user-detail - verify route `[dest=same-path, content-equal]` |
| `src/app/(chat)/profile/pending-reconcile.tsx` | app/(chat) | guess: staging user settings via app/api/user/details + components/user/user-detail - verify route `[dest=same-path, content-equal]` |
| `src/app/(chat)/sandboxes/page.tsx` | app/(chat) | guess: staging sandbox sessions = app/api/sandbox + lib/inngest/functions/reap-sandboxes.ts; page not found - verify `[dest=same-path, content-equal]` |
| `src/app/(chat)/settings/connectors/connectors-settings-view.tsx` | app/(chat) | guess: staging connectors UI at app/(chat)/connectors/page.tsx (upstream layout) - verify `[dest=same-path, differs]` |
| `src/app/(public)/about/layout.tsx` | app/(public) | guess: destination-only public page (about/cookies/landing/plans/privacy/refund/terms); staging app/(public) has only ecanvas/export/p - product disposition decision `[dest=same-path, content-equal]` |
| `src/app/(public)/about/page.tsx` | app/(public) | guess: destination-only public page (about/cookies/landing/plans/privacy/refund/terms); staging app/(public) has only ecanvas/export/p - product disposition decision `[dest=same-path, content-equal]` |
| `src/app/(public)/cookies-policy/layout.tsx` | app/(public) | guess: destination-only public page (about/cookies/landing/plans/privacy/refund/terms); staging app/(public) has only ecanvas/export/p - product disposition decision `[dest=same-path, content-equal]` |
| `src/app/(public)/cookies-policy/page.tsx` | app/(public) | guess: destination-only public page (about/cookies/landing/plans/privacy/refund/terms); staging app/(public) has only ecanvas/export/p - product disposition decision `[dest=same-path, content-equal]` |
| `src/app/(public)/landing/layout.tsx` | app/(public) | guess: destination-only public page (about/cookies/landing/plans/privacy/refund/terms); staging app/(public) has only ecanvas/export/p - product disposition decision `[dest=same-path, content-equal]` |
| `src/app/(public)/landing/page.tsx` | app/(public) | guess: destination-only public page (about/cookies/landing/plans/privacy/refund/terms); staging app/(public) has only ecanvas/export/p - product disposition decision `[dest=same-path, content-equal]` |
| `src/app/(public)/plans/page.tsx` | app/(public) | guess: destination-only public page (about/cookies/landing/plans/privacy/refund/terms); staging app/(public) has only ecanvas/export/p - product disposition decision `[dest=same-path, content-equal]` |
| `src/app/(public)/privacy-policy/layout.tsx` | app/(public) | guess: destination-only public page (about/cookies/landing/plans/privacy/refund/terms); staging app/(public) has only ecanvas/export/p - product disposition decision `[dest=same-path, content-equal]` |
| `src/app/(public)/privacy-policy/page.tsx` | app/(public) | guess: destination-only public page (about/cookies/landing/plans/privacy/refund/terms); staging app/(public) has only ecanvas/export/p - product disposition decision `[dest=same-path, content-equal]` |
| `src/app/(public)/refund-policy/layout.tsx` | app/(public) | guess: destination-only public page (about/cookies/landing/plans/privacy/refund/terms); staging app/(public) has only ecanvas/export/p - product disposition decision `[dest=same-path, content-equal]` |
| `src/app/(public)/refund-policy/page.tsx` | app/(public) | guess: destination-only public page (about/cookies/landing/plans/privacy/refund/terms); staging app/(public) has only ecanvas/export/p - product disposition decision `[dest=same-path, content-equal]` |
| `src/app/(public)/terms-of-service/layout.tsx` | app/(public) | guess: destination-only public page (about/cookies/landing/plans/privacy/refund/terms); staging app/(public) has only ecanvas/export/p - product disposition decision `[dest=same-path, content-equal]` |
| `src/app/(public)/terms-of-service/page.tsx` | app/(public) | guess: destination-only public page (about/cookies/landing/plans/privacy/refund/terms); staging app/(public) has only ecanvas/export/p - product disposition decision `[dest=same-path, content-equal]` |
| `src/app/api/admin/audit/route.ts` | app/api/admin | guess: staging security-events (0075 + app/api/admin/security-settings) - map `[dest=same-path, content-equal]` |
| `src/app/api/admin/dashboard/stats/route.ts` | app/api/admin | guess: staging admin stats not found at this path - verify `[dest=same-path, content-equal]` |
| `src/app/api/admin/health/route.ts` | app/api/admin | guess: staging has no health route - destination-only diagnostics `[dest=same-path, differs]` |
| `src/app/api/admin/users/route.ts` | app/api/admin | guess: staging components/admin/users-table.tsx exists; route may differ - verify `[dest=same-path, content-equal]` |
| `src/app/api/agent/[id]/view/route.test.ts` | app/api/agent | guess: staging app/api/agent = {route, [id], ai, from-preset}; publication = app/api/published-page + app/marketplace - map view/published semantics `[dest=same-path, content-equal]` |
| `src/app/api/agent/[id]/view/route.ts` | app/api/agent | guess: staging app/api/agent = {route, [id], ai, from-preset}; publication = app/api/published-page + app/marketplace - map view/published semantics `[dest=same-path, content-equal]` |
| `src/app/api/agent/published/route.test.ts` | app/api/agent | guess: staging app/api/agent = {route, [id], ai, from-preset}; publication = app/api/published-page + app/marketplace - map view/published semantics `[dest=same-path, content-equal]` |
| `src/app/api/agent/published/route.ts` | app/api/agent | guess: staging app/api/agent = {route, [id], ai, from-preset}; publication = app/api/published-page + app/marketplace - map view/published semantics `[dest=same-path, content-equal]` |
| `src/app/api/archive/actions.ts` | app/api/archive | guess: staging archives staging-native (app/api/archive route.ts + [id]/items, C40) - zip server-actions variant; verify `[dest=same-path, content-equal]` |
| `src/app/api/chat/export/actions.ts` | app/api/chat | guess: staging app/api/chat/export exists without actions.ts - verify `[dest=same-path, content-equal]` |
| `src/app/api/connectors/[provider]/delete/route.ts` | app/api/connectors | guess: staging app/api/connectors/[provider] has only authorize+callback; lifecycle via credentials/approvals routes - verify `[dest=same-path, content-equal]` |
| `src/app/api/connectors/[provider]/token-connect/route.ts` | app/api/connectors | guess: staging app/api/connectors/[provider] has only authorize+callback; lifecycle via credentials/approvals routes - verify `[dest=same-path, content-equal]` |
| `src/app/api/connectors/github/route.ts` | app/api/connectors | guess: staging generic [provider]/authorize+callback (+freshdesk/zulip credentials) replaces per-provider authorize routes - verify `[dest=same-path, content-equal]` |
| `src/app/api/connectors/gmail/route.ts` | app/api/connectors | guess: staging generic [provider]/authorize+callback (+freshdesk/zulip credentials) replaces per-provider authorize routes - verify `[dest=same-path, content-equal]` |
| `src/app/api/connectors/google-calendar/route.ts` | app/api/connectors | guess: staging generic [provider]/authorize+callback (+freshdesk/zulip credentials) replaces per-provider authorize routes - verify `[dest=same-path, content-equal]` |
| `src/app/api/connectors/google-drive/route.ts` | app/api/connectors | guess: staging generic [provider]/authorize+callback (+freshdesk/zulip credentials) replaces per-provider authorize routes - verify `[dest=same-path, content-equal]` |
| `src/app/api/connectors/notion/route.ts` | app/api/connectors | guess: staging generic [provider]/authorize+callback (+freshdesk/zulip credentials) replaces per-provider authorize routes - verify `[dest=same-path, content-equal]` |
| `src/app/api/connectors/outlook/route.ts` | app/api/connectors | guess: staging generic [provider]/authorize+callback (+freshdesk/zulip credentials) replaces per-provider authorize routes - verify `[dest=same-path, content-equal]` |
| `src/app/api/connectors/slack/route.ts` | app/api/connectors | guess: staging generic [provider]/authorize+callback (+freshdesk/zulip credentials) replaces per-provider authorize routes - verify `[dest=same-path, content-equal]` |
| `src/app/api/cron/tick/route.ts` | app/api/cron | guess: staging background jobs run via lib/inngest (app/api/inngest); no cron/tick endpoint - port decision `[dest=same-path, differs]` |
| `src/app/api/export/[id]/og-image/route.ts` | app/api/export | guess: destination OG-image generation for exports; staging export has no og-image - port decision `[dest=same-path, differs]` |
| `src/app/api/export/[id]/og-image/template.tsx` | app/api/export | guess: destination OG-image generation for exports; staging export has no og-image - port decision `[dest=same-path, content-equal]` |
| `src/app/api/files/[...path]/route.ts` | app/api/files | guess: staging file serving via app/api/storage + attachments + presigned uploads (hooks/use-presigned-upload.ts) - verify `[dest=same-path, differs]` |
| `src/app/api/health/route.ts` | app/api/health | guess: staging lacks health endpoint - destination-only diagnostics `[dest=same-path, content-equal]` |
| `src/app/api/mcp/composio/route.ts` | app/api/mcp | guess: staging composio via lib/composio/* + chat tools; no /api/mcp/composio route - verify `[dest=same-path, content-equal]` |
| `src/app/api/scheduler/jobs/[jobId]/route.ts` | app/api/scheduler | guess: zip scheduler subsystem (cron-parser/jobs/leader/outbox-worker); staging equivalent = app/api/scheduled-tasks + lib/inngest functions + 0045/0073 migrations - port decision `[dest=same-path, differs]` |
| `src/app/api/scheduler/jobs/route.ts` | app/api/scheduler | guess: zip scheduler subsystem (cron-parser/jobs/leader/outbox-worker); staging equivalent = app/api/scheduled-tasks + lib/inngest functions + 0045/0073 migrations - port decision `[dest=same-path, differs]` |
| `src/app/api/sentry-example-api/route.ts` | app/api/sentry-example-api | guess: Sentry example route/page; staging sentry configs exist (sentry.edge/server.config.ts) but no example route - verify or drop `[dest=same-path, content-equal]` |
| `src/app/api/thread/[id]/fork/route.test.ts` | app/api/thread | guess: A08 destination fork feature; staging has no fork routes - port decision `[dest=same-path, differs]` |
| `src/app/api/thread/[id]/fork/route.ts` | app/api/thread | guess: A08 destination fork feature; staging has no fork routes - port decision `[dest=same-path, differs]` |
| `src/app/api/user/memory/route.ts` | app/api/user | guess: staging memory repo exists (0069) but no /api/user/memory route found - verify `[dest=same-path, content-equal]` |
| `src/app/api/voice/groq-konvo/stt/route.ts` | app/api/voice | guess: destination Konvo(Groq) STT/TTS; staging voice = audio-command/devices/sessions/xiaozhi - port decision `[dest=same-path, content-equal]` |
| `src/app/api/voice/groq-konvo/tts/route.ts` | app/api/voice | guess: destination Konvo(Groq) STT/TTS; staging voice = audio-command/devices/sessions/xiaozhi - port decision `[dest=same-path, content-equal]` |
| `src/app/api/workflow/actions.ts` | app/api/workflow | guess: staging app/api/workflow = {route, [id], executions, tools}; actions.ts not found - verify `[dest=same-path, content-equal]` |
| `src/app/apple-touch-icon.webp` | app/apple-touch-icon.webp | guess: destination branding/PWA asset; staging has own icon set (favicon.ico/png, android-chrome) - asset decision `[dest=same-path, content-equal]` |
| `src/app/favicon-16x16.webp` | app/favicon-16x16.webp | guess: destination branding/PWA asset; staging has own icon set (favicon.ico/png, android-chrome) - asset decision `[dest=same-path, content-equal]` |
| `src/app/favicon-32x32.webp` | app/favicon-32x32.webp | guess: destination branding/PWA asset; staging has own icon set (favicon.ico/png, android-chrome) - asset decision `[dest=same-path, content-equal]` |
| `src/app/favicon-96x96.png` | app/favicon-96x96.png | guess: destination branding/PWA asset; staging has own icon set (favicon.ico/png, android-chrome) - asset decision `[dest=same-path, content-equal]` |
| `src/app/favicon-96x96.webp` | app/favicon-96x96.webp | guess: destination branding/PWA asset; staging has own icon set (favicon.ico/png, android-chrome) - asset decision `[dest=same-path, content-equal]` |
| `src/app/favicon.svg` | app/favicon.svg | guess: destination branding/PWA asset; staging has own icon set (favicon.ico/png, android-chrome) - asset decision `[dest=same-path, content-equal]` |
| `src/app/global-error.tsx` | app/global-error.tsx | guess: staging error.tsx under app/(chat); root global-error not found - verify `[dest=same-path, content-equal]` |
| `src/app/page.tsx` | app/page.tsx | guess: destination root landing entry; staging root is chat-first - verify `[dest=same-path, content-equal]` |
| `src/app/robots.ts` | app/robots.ts | guess: destination SEO entry; staging counterpart not found - port decision `[dest=same-path, content-equal]` |
| `src/app/sentry-example-page/page.tsx` | app/sentry-example-page | guess: Sentry example route/page; staging sentry configs exist (sentry.edge/server.config.ts) but no example route - verify or drop `[dest=same-path, content-equal]` |
| `src/app/sitemap.ts` | app/sitemap.ts | guess: destination SEO entry; staging counterpart not found - port decision `[dest=same-path, content-equal]` |
| `src/app/web-app-manifest-192x192.png` | app/web-app-manifest-192x192.png | guess: destination branding/PWA asset; staging has own icon set (favicon.ico/png, android-chrome) - asset decision `[dest=same-path, content-equal]` |
| `src/app/web-app-manifest-192x192.webp` | app/web-app-manifest-192x192.webp | guess: destination branding/PWA asset; staging has own icon set (favicon.ico/png, android-chrome) - asset decision `[dest=same-path, content-equal]` |
| `src/app/web-app-manifest-512x512.png` | app/web-app-manifest-512x512.png | guess: destination branding/PWA asset; staging has own icon set (favicon.ico/png, android-chrome) - asset decision `[dest=same-path, content-equal]` |
| `src/app/web-app-manifest-512x512.webp` | app/web-app-manifest-512x512.webp | guess: destination branding/PWA asset; staging has own icon set (favicon.ico/png, android-chrome) - asset decision `[dest=same-path, content-equal]` |
| `src/components/agent-gallery.tsx` | components | guess: staging marketplace (app/marketplace) + agent-install-repository.pg.ts - verify `[dest=same-path, differs]` |
| `src/components/chunk-error-recovery.tsx` | components | guess: destination-only UI helper; no staging counterpart found - verify `[dest=same-path, content-equal]` |
| `src/components/connectors-popover.tsx` | components | guess: destination connectors quick-switch; staging connectors UI differs - verify `[dest=same-path, content-equal]` |
| `src/components/customize-popup.tsx` | components | guess: destination customize drawer (skills/saved-notes/prefs); staging settings differ - port decision `[dest=same-path, differs]` |
| `src/components/knowledge-dashboard.tsx` | components | guess: staging knowledge-bases (app/api/knowledge-bases, hooks/queries/use-knowledge-bases.ts) - verify `[dest=same-path, differs]` |
| `src/components/knowledge-detail.tsx` | components | guess: staging knowledge-bases (app/api/knowledge-bases, hooks/queries/use-knowledge-bases.ts) - verify `[dest=same-path, differs]` |
| `src/components/mcp-card.tsx` | components | guess: staging mcp-dashboard.tsx / mcp-editor.tsx / mcp-marketplace.tsx - map `[dest=same-path, content-equal]` |
| `src/components/mcp-overview.tsx` | components | guess: staging mcp-dashboard.tsx / mcp-editor.tsx / mcp-marketplace.tsx - map `[dest=same-path, content-equal]` |
| `src/components/message-parts.tsx` | components | guess: staging restructured into components/message-parts/ directory - port carefully `[dest=same-path, differs]` |
| `src/components/text-selection-popup.tsx` | components | guess: destination-only UI helper; no staging counterpart found - verify `[dest=same-path, content-equal]` |
| `src/components/warning-banner.tsx` | components | guess: destination-only UI helper; no staging counterpart found - verify `[dest=same-path, content-equal]` |
| `src/components/admin/admin-shell.tsx` | components/admin | guess: destination admin console component; staging components/admin = {dodo-payments-settings, dynamic-providers-settings, security-events-settings, users-table(+skeleton)} - map per component `[dest=same-path, content-equal]` |
| `src/components/admin/admin-sidebar.tsx` | components/admin | guess: destination admin console component; staging components/admin = {dodo-payments-settings, dynamic-providers-settings, security-events-settings, users-table(+skeleton)} - map per component `[dest=same-path, differs]` |
| `src/components/admin/back-button-skeleton.tsx` | components/admin | guess: destination admin console component; staging components/admin = {dodo-payments-settings, dynamic-providers-settings, security-events-settings, users-table(+skeleton)} - map per component `[dest=same-path, content-equal]` |
| `src/components/admin/config/artifacts-tab.tsx` | components/admin | guess: destination admin console component; staging components/admin = {dodo-payments-settings, dynamic-providers-settings, security-events-settings, users-table(+skeleton)} - map per component `[dest=same-path, content-equal]` |
| `src/components/admin/config/canvas-tab.tsx` | components/admin | guess: destination admin console component; staging components/admin = {dodo-payments-settings, dynamic-providers-settings, security-events-settings, users-table(+skeleton)} - map per component `[dest=same-path, content-equal]` |
| `src/components/admin/config/general-tab.tsx` | components/admin | guess: destination admin console component; staging components/admin = {dodo-payments-settings, dynamic-providers-settings, security-events-settings, users-table(+skeleton)} - map per component `[dest=same-path, content-equal]` |
| `src/components/admin/config/models-tab.tsx` | components/admin | guess: destination admin console component; staging components/admin = {dodo-payments-settings, dynamic-providers-settings, security-events-settings, users-table(+skeleton)} - map per component `[dest=same-path, content-equal]` |
| `src/components/admin/config/tools-tab.tsx` | components/admin | guess: destination admin console component; staging components/admin = {dodo-payments-settings, dynamic-providers-settings, security-events-settings, users-table(+skeleton)} - map per component `[dest=same-path, content-equal]` |
| `src/components/admin/ui/admin-card.tsx` | components/admin | guess: destination admin console component; staging components/admin = {dodo-payments-settings, dynamic-providers-settings, security-events-settings, users-table(+skeleton)} - map per component `[dest=same-path, content-equal]` |
| `src/components/admin/ui/admin-settings-page.tsx` | components/admin | guess: destination admin console component; staging components/admin = {dodo-payments-settings, dynamic-providers-settings, security-events-settings, users-table(+skeleton)} - map per component `[dest=same-path, content-equal]` |
| `src/components/admin/ui/form-fields.tsx` | components/admin | guess: destination admin console component; staging components/admin = {dodo-payments-settings, dynamic-providers-settings, security-events-settings, users-table(+skeleton)} - map per component `[dest=same-path, content-equal]` |
| `src/components/admin/ui/model-selector.tsx` | components/admin | guess: destination admin console component; staging components/admin = {dodo-payments-settings, dynamic-providers-settings, security-events-settings, users-table(+skeleton)} - map per component `[dest=same-path, content-equal]` |
| `src/components/admin/ui/shortcut-help-modal.tsx` | components/admin | guess: destination admin console component; staging components/admin = {dodo-payments-settings, dynamic-providers-settings, security-events-settings, users-table(+skeleton)} - map per component `[dest=same-path, content-equal]` |
| `src/components/admin/ui/toast-helpers.ts` | components/admin | guess: destination admin console component; staging components/admin = {dodo-payments-settings, dynamic-providers-settings, security-events-settings, users-table(+skeleton)} - map per component `[dest=same-path, content-equal]` |
| `src/components/auth/auth-page.tsx` | components/auth | guess: staging auth via app/(auth) + lib/auth (captcha.ts/captcha-plugin.ts covers Turnstile) - verify `[dest=same-path, content-equal]` |
| `src/components/auth/segmented-control.tsx` | components/auth | guess: staging auth via app/(auth) + lib/auth (captcha.ts/captcha-plugin.ts covers Turnstile) - verify `[dest=same-path, content-equal]` |
| `src/components/auth/turnstile-widget.tsx` | components/auth | guess: staging auth via app/(auth) + lib/auth (captcha.ts/captcha-plugin.ts covers Turnstile) - verify `[dest=same-path, content-equal]` |
| `src/components/canvas/canvas-panel-wrapper.tsx` | components/canvas | guess: staging canvas = components/canvas/ecanvas (upstream ecanvas) - verify vs zip canvas-panel `[dest=same-path, content-equal]` |
| `src/components/canvas/canvas-panel.tsx` | components/canvas | guess: staging canvas = components/canvas/ecanvas (upstream ecanvas) - verify vs zip canvas-panel `[dest=same-path, content-equal]` |
| `src/components/chat/citation.tsx` | components/chat | guess: no staging counterpart found - destination carries implementation `[dest=same-path, differs]` |
| `src/components/gallery/my-installed-agents.tsx` | components/gallery | guess: staging marketplace (app/marketplace) + agent-install-repository.pg.ts - verify `[dest=same-path, content-equal]` |
| `src/components/landing/landing-page-body.tsx` | components/landing | guess: destination-only landing redesign; staging has no landing tree - product disposition decision `[dest=same-path, content-equal]` |
| `src/components/landing/lib/motion.ts` | components/landing | guess: destination-only landing redesign; staging has no landing tree - product disposition decision `[dest=same-path, content-equal]` |
| `src/components/landing/lib/tokens.ts` | components/landing | guess: destination-only landing redesign; staging has no landing tree - product disposition decision `[dest=same-path, content-equal]` |
| `src/components/landing/provider.tsx` | components/landing | guess: destination-only landing redesign; staging has no landing tree - product disposition decision `[dest=same-path, content-equal]` |
| `src/components/landing/sections/AtomsSection.tsx` | components/landing | guess: destination-only landing redesign; staging has no landing tree - product disposition decision `[dest=same-path, content-equal]` |
| `src/components/landing/sections/BuiltToScale.tsx` | components/landing | guess: destination-only landing redesign; staging has no landing tree - product disposition decision `[dest=same-path, content-equal]` |
| `src/components/landing/sections/CareersCTA.tsx` | components/landing | guess: destination-only landing redesign; staging has no landing tree - product disposition decision `[dest=same-path, content-equal]` |
| `src/components/landing/sections/ConnectSection.tsx` | components/landing | guess: destination-only landing redesign; staging has no landing tree - product disposition decision `[dest=same-path, content-equal]` |
| `src/components/landing/sections/DeveloperSection.tsx` | components/landing | guess: destination-only landing redesign; staging has no landing tree - product disposition decision `[dest=same-path, content-equal]` |
| `src/components/landing/sections/EnterpriseSecurity.tsx` | components/landing | guess: destination-only landing redesign; staging has no landing tree - product disposition decision `[dest=same-path, content-equal]` |
| `src/components/landing/sections/Footer.tsx` | components/landing | guess: destination-only landing redesign; staging has no landing tree - product disposition decision `[dest=same-path, content-equal]` |
| `src/components/landing/sections/Hero.tsx` | components/landing | guess: destination-only landing redesign; staging has no landing tree - product disposition decision `[dest=same-path, content-equal]` |
| `src/components/landing/sections/LatestResearch.tsx` | components/landing | guess: destination-only landing redesign; staging has no landing tree - product disposition decision `[dest=same-path, content-equal]` |
| `src/components/landing/sections/MachineIntelligence.tsx` | components/landing | guess: destination-only landing redesign; staging has no landing tree - product disposition decision `[dest=same-path, content-equal]` |
| `src/components/landing/sections/Navbar.tsx` | components/landing | guess: destination-only landing redesign; staging has no landing tree - product disposition decision `[dest=same-path, content-equal]` |
| `src/components/landing/sections/PlatformUI.tsx` | components/landing | guess: destination-only landing redesign; staging has no landing tree - product disposition decision `[dest=same-path, content-equal]` |
| `src/components/landing/sections/Thesis.tsx` | components/landing | guess: destination-only landing redesign; staging has no landing tree - product disposition decision `[dest=same-path, content-equal]` |
| `src/components/landing/SmoothScroll.tsx` | components/landing | guess: destination-only landing redesign; staging has no landing tree - product disposition decision `[dest=same-path, content-equal]` |
| `src/components/landing/ui/AnimCounter.tsx` | components/landing | guess: destination-only landing redesign; staging has no landing tree - product disposition decision `[dest=same-path, content-equal]` |
| `src/components/landing/ui/FadeIn.tsx` | components/landing | guess: destination-only landing redesign; staging has no landing tree - product disposition decision `[dest=same-path, content-equal]` |
| `src/components/landing/ui/InteractiveConsole.tsx` | components/landing | guess: destination-only landing redesign; staging has no landing tree - product disposition decision `[dest=same-path, content-equal]` |
| `src/components/landing/ui/Marquee.tsx` | components/landing | guess: destination-only landing redesign; staging has no landing tree - product disposition decision `[dest=same-path, content-equal]` |
| `src/components/landing/ui/WaveformBars.tsx` | components/landing | guess: destination-only landing redesign; staging has no landing tree - product disposition decision `[dest=same-path, content-equal]` |
| `src/components/landing/ui/WorkflowPreview.tsx` | components/landing | guess: destination-only landing redesign; staging has no landing tree - product disposition decision `[dest=same-path, content-equal]` |
| `src/components/layouts/app-sidebar-canvas-history.tsx` | components/layouts | guess: staging components/layouts restructured (app-sidebar*, app-shell, app-header, swr-config.tsx) - map `[dest=same-path, content-equal]` |
| `src/components/layouts/mobile-sidebar-sheet.tsx` | components/layouts | guess: staging components/layouts restructured (app-sidebar*, app-shell, app-header, swr-config.tsx) - map `[dest=same-path, content-equal]` |
| `src/components/payments/comparison-table.tsx` | components/payments | guess: staging payments UI is Dodo-focused; zip plans/comparison UI - verify which plans UI staging uses `[dest=same-path, content-equal]` |
| `src/components/payments/dodo/dodo-upgrade-card.tsx` | components/payments | guess: staging Dodo payments present (components/payments/dodo + app/api/payments/dodo); zip upgrade card differs - verify `[dest=same-path, differs]` |
| `src/components/payments/dodo/upgrade-plan-button.tsx` | components/payments | guess: staging Dodo payments present (components/payments/dodo + app/api/payments/dodo); zip upgrade card differs - verify `[dest=same-path, content-equal]` |
| `src/components/payments/hero-orbital.tsx` | components/payments | guess: staging payments UI is Dodo-focused; zip plans/comparison UI - verify which plans UI staging uses `[dest=same-path, content-equal]` |
| `src/components/payments/plan-card.tsx` | components/payments | guess: staging payments UI is Dodo-focused; zip plans/comparison UI - verify which plans UI staging uses `[dest=same-path, content-equal]` |
| `src/components/payments/plans-faq.tsx` | components/payments | guess: staging payments UI is Dodo-focused; zip plans/comparison UI - verify which plans UI staging uses `[dest=same-path, content-equal]` |
| `src/components/payments/plans-page-content.tsx` | components/payments | guess: staging payments UI is Dodo-focused; zip plans/comparison UI - verify which plans UI staging uses `[dest=same-path, content-equal]` |
| `src/components/pwa/service-worker-registration.tsx` | components/pwa | guess: destination PWA service-worker registration; staging PWA support not found - port decision `[dest=same-path, content-equal]` |
| `src/components/sandbox/sandbox-dashboard.tsx` | components/sandbox | guess: no staging counterpart found - destination carries implementation `[dest=same-path, content-equal]` |
| `src/components/tool-invocation/artifact-creator.tsx` | components/tool-invocation | guess: staging artifact UI under components/artifact-panel/ + message-parts/ - verify `[dest=same-path, content-equal]` |
| `src/components/tool-invocation/browser-agent.tsx` | components/tool-invocation | guess: destination browser-agent card (FIRECRAWL); staging browser-automation-tool UI differs - port decision `[dest=same-path, content-equal]` |
| `src/components/tool-invocation/canvas-ppt-maker.tsx` | components/tool-invocation | guess: staging ecanvas/presentations tooling - verify `[dest=same-path, content-equal]` |
| `src/components/tool-invocation/code.worker.ts` | components/tool-invocation | guess: destination code-engine web worker; staging code tools = lib/ai/tools/code/{e2b-sandbox,js-run,python-run} (B20 blocked) - port decision `[dest=same-path, content-equal]` |
| `src/components/tool-invocation/memory-action.tsx` | components/tool-invocation | guess: staging memory UI = components/user/user-detail/memory-settings-card.tsx - verify `[dest=same-path, content-equal]` |
| `src/components/tool-invocation/sequential-thinking.tsx` | components/tool-invocation | guess: staging reasoning card not found - port decision `[dest=same-path, content-equal]` |
| `src/components/tool-invocation/video-generator.tsx` | components/tool-invocation | guess: staging has image-generator.tsx only; video generation absent - port decision `[dest=same-path, content-equal]` |
| `src/components/ui/airtable-icon.tsx` | components/ui | guess: connector/brand logo icon for destination connectors UI; staging components/ui (63 files) lacks it - port with connector catalog decision `[dest=same-path, content-equal]` |
| `src/components/ui/asana-icon.tsx` | components/ui | guess: connector/brand logo icon for destination connectors UI; staging components/ui (63 files) lacks it - port with connector catalog decision `[dest=same-path, content-equal]` |
| `src/components/ui/atlassian-icon.tsx` | components/ui | guess: connector/brand logo icon for destination connectors UI; staging components/ui (63 files) lacks it - port with connector catalog decision `[dest=same-path, content-equal]` |
| `src/components/ui/axero-icon.tsx` | components/ui | guess: connector/brand logo icon for destination connectors UI; staging components/ui (63 files) lacks it - port with connector catalog decision `[dest=same-path, content-equal]` |
| `src/components/ui/bitbucket-icon.tsx` | components/ui | guess: connector/brand logo icon for destination connectors UI; staging components/ui (63 files) lacks it - port with connector catalog decision `[dest=same-path, content-equal]` |
| `src/components/ui/bookstack-icon.tsx` | components/ui | guess: connector/brand logo icon for destination connectors UI; staging components/ui (63 files) lacks it - port with connector catalog decision `[dest=same-path, content-equal]` |
| `src/components/ui/breadcrumb.tsx` | components/ui | guess: generic UI primitive; staging shadcn ui set may cover - verify `[dest=same-path, content-equal]` |
| `src/components/ui/canva-icon.tsx` | components/ui | guess: connector/brand logo icon for destination connectors UI; staging components/ui (63 files) lacks it - port with connector catalog decision `[dest=same-path, content-equal]` |
| `src/components/ui/canvas-lms-icon.tsx` | components/ui | guess: connector/brand logo icon for destination connectors UI; staging components/ui (63 files) lacks it - port with connector catalog decision `[dest=same-path, content-equal]` |
| `src/components/ui/clickup-icon.tsx` | components/ui | guess: connector/brand logo icon for destination connectors UI; staging components/ui (63 files) lacks it - port with connector catalog decision `[dest=same-path, content-equal]` |
| `src/components/ui/coda-icon.tsx` | components/ui | guess: connector/brand logo icon for destination connectors UI; staging components/ui (63 files) lacks it - port with connector catalog decision `[dest=same-path, content-equal]` |
| `src/components/ui/composio-icon.tsx` | components/ui | guess: connector/brand logo icon for destination connectors UI; staging components/ui (63 files) lacks it - port with connector catalog decision `[dest=same-path, content-equal]` |
| `src/components/ui/confluence-icon.tsx` | components/ui | guess: connector/brand logo icon for destination connectors UI; staging components/ui (63 files) lacks it - port with connector catalog decision `[dest=same-path, content-equal]` |
| `src/components/ui/connector-logo-icon.tsx` | components/ui | guess: connector/brand logo icon for destination connectors UI; staging components/ui (63 files) lacks it - port with connector catalog decision `[dest=same-path, content-equal]` |
| `src/components/ui/connectors-icon.tsx` | components/ui | guess: connector/brand logo icon for destination connectors UI; staging components/ui (63 files) lacks it - port with connector catalog decision `[dest=same-path, content-equal]` |
| `src/components/ui/decrypted-text.tsx` | components/ui | guess: generic UI primitive; staging shadcn ui set may cover - verify `[dest=same-path, content-equal]` |
| `src/components/ui/discord-icon.tsx` | components/ui | guess: connector/brand logo icon for destination connectors UI; staging components/ui (63 files) lacks it - port with connector catalog decision `[dest=same-path, content-equal]` |
| `src/components/ui/discourse-icon.tsx` | components/ui | guess: connector/brand logo icon for destination connectors UI; staging components/ui (63 files) lacks it - port with connector catalog decision `[dest=same-path, content-equal]` |
| `src/components/ui/document360-icon.tsx` | components/ui | guess: connector/brand logo icon for destination connectors UI; staging components/ui (63 files) lacks it - port with connector catalog decision `[dest=same-path, content-equal]` |
| `src/components/ui/dropbox-icon.tsx` | components/ui | guess: connector/brand logo icon for destination connectors UI; staging components/ui (63 files) lacks it - port with connector catalog decision `[dest=same-path, content-equal]` |
| `src/components/ui/drupal-wiki-icon.tsx` | components/ui | guess: connector/brand logo icon for destination connectors UI; staging components/ui (63 files) lacks it - port with connector catalog decision `[dest=same-path, content-equal]` |
| `src/components/ui/egnyte-icon.tsx` | components/ui | guess: connector/brand logo icon for destination connectors UI; staging components/ui (63 files) lacks it - port with connector catalog decision `[dest=same-path, content-equal]` |
| `src/components/ui/fireflies-icon.tsx` | components/ui | guess: connector/brand logo icon for destination connectors UI; staging components/ui (63 files) lacks it - port with connector catalog decision `[dest=same-path, content-equal]` |
| `src/components/ui/form-group.tsx` | components/ui | guess: generic UI primitive; staging shadcn ui set may cover - verify `[dest=same-path, content-equal]` |
| `src/components/ui/freshdesk-icon.tsx` | components/ui | guess: connector/brand logo icon for destination connectors UI; staging components/ui (63 files) lacks it - port with connector catalog decision `[dest=same-path, content-equal]` |
| `src/components/ui/gitbook-icon.tsx` | components/ui | guess: connector/brand logo icon for destination connectors UI; staging components/ui (63 files) lacks it - port with connector catalog decision `[dest=same-path, content-equal]` |
| `src/components/ui/gitlab-icon.tsx` | components/ui | guess: connector/brand logo icon for destination connectors UI; staging components/ui (63 files) lacks it - port with connector catalog decision `[dest=same-path, content-equal]` |
| `src/components/ui/gmail-icon.tsx` | components/ui | guess: connector/brand logo icon for destination connectors UI; staging components/ui (63 files) lacks it - port with connector catalog decision `[dest=same-path, content-equal]` |
| `src/components/ui/gong-icon.tsx` | components/ui | guess: connector/brand logo icon for destination connectors UI; staging components/ui (63 files) lacks it - port with connector catalog decision `[dest=same-path, content-equal]` |
| `src/components/ui/google-drive-icon.tsx` | components/ui | guess: connector/brand logo icon for destination connectors UI; staging components/ui (63 files) lacks it - port with connector catalog decision `[dest=same-path, content-equal]` |
| `src/components/ui/guru-icon.tsx` | components/ui | guess: connector/brand logo icon for destination connectors UI; staging components/ui (63 files) lacks it - port with connector catalog decision `[dest=same-path, content-equal]` |
| `src/components/ui/highspot-icon.tsx` | components/ui | guess: connector/brand logo icon for destination connectors UI; staging components/ui (63 files) lacks it - port with connector catalog decision `[dest=same-path, content-equal]` |
| `src/components/ui/hubspot-icon.tsx` | components/ui | guess: connector/brand logo icon for destination connectors UI; staging components/ui (63 files) lacks it - port with connector catalog decision `[dest=same-path, content-equal]` |
| `src/components/ui/jira-icon.tsx` | components/ui | guess: connector/brand logo icon for destination connectors UI; staging components/ui (63 files) lacks it - port with connector catalog decision `[dest=same-path, content-equal]` |
| `src/components/ui/linear-icon.tsx` | components/ui | guess: connector/brand logo icon for destination connectors UI; staging components/ui (63 files) lacks it - port with connector catalog decision `[dest=same-path, content-equal]` |
| `src/components/ui/loopio-icon.tsx` | components/ui | guess: connector/brand logo icon for destination connectors UI; staging components/ui (63 files) lacks it - port with connector catalog decision `[dest=same-path, content-equal]` |
| `src/components/ui/mediawiki-icon.tsx` | components/ui | guess: connector/brand logo icon for destination connectors UI; staging components/ui (63 files) lacks it - port with connector catalog decision `[dest=same-path, content-equal]` |
| `src/components/ui/neon-icon.tsx` | components/ui | guess: connector/brand logo icon for destination connectors UI; staging components/ui (63 files) lacks it - port with connector catalog decision `[dest=same-path, content-equal]` |
| `src/components/ui/notion-icon.tsx` | components/ui | guess: connector/brand logo icon for destination connectors UI; staging components/ui (63 files) lacks it - port with connector catalog decision `[dest=same-path, content-equal]` |
| `src/components/ui/outline-icon.tsx` | components/ui | guess: connector/brand logo icon for destination connectors UI; staging components/ui (63 files) lacks it - port with connector catalog decision `[dest=same-path, content-equal]` |
| `src/components/ui/paypal-icon.tsx` | components/ui | guess: connector/brand logo icon for destination connectors UI; staging components/ui (63 files) lacks it - port with connector catalog decision `[dest=same-path, content-equal]` |
| `src/components/ui/playwright-icon.tsx` | components/ui | guess: connector/brand logo icon for destination connectors UI; staging components/ui (63 files) lacks it - port with connector catalog decision `[dest=same-path, content-equal]` |
| `src/components/ui/productboard-icon.tsx` | components/ui | guess: connector/brand logo icon for destination connectors UI; staging components/ui (63 files) lacks it - port with connector catalog decision `[dest=same-path, content-equal]` |
| `src/components/ui/salesforce-icon.tsx` | components/ui | guess: connector/brand logo icon for destination connectors UI; staging components/ui (63 files) lacks it - port with connector catalog decision `[dest=same-path, content-equal]` |
| `src/components/ui/slab-icon.tsx` | components/ui | guess: connector/brand logo icon for destination connectors UI; staging components/ui (63 files) lacks it - port with connector catalog decision `[dest=same-path, content-equal]` |
| `src/components/ui/slack-icon.tsx` | components/ui | guess: connector/brand logo icon for destination connectors UI; staging components/ui (63 files) lacks it - port with connector catalog decision `[dest=same-path, content-equal]` |
| `src/components/ui/stripe-icon.tsx` | components/ui | guess: connector/brand logo icon for destination connectors UI; staging components/ui (63 files) lacks it - port with connector catalog decision `[dest=same-path, content-equal]` |
| `src/components/ui/teams-icon.tsx` | components/ui | guess: connector/brand logo icon for destination connectors UI; staging components/ui (63 files) lacks it - port with connector catalog decision `[dest=same-path, content-equal]` |
| `src/components/ui/telegram-icon.tsx` | components/ui | guess: connector/brand logo icon for destination connectors UI; staging components/ui (63 files) lacks it - port with connector catalog decision `[dest=same-path, content-equal]` |
| `src/components/ui/testrail-icon.tsx` | components/ui | guess: connector/brand logo icon for destination connectors UI; staging components/ui (63 files) lacks it - port with connector catalog decision `[dest=same-path, content-equal]` |
| `src/components/ui/toggle.tsx` | components/ui | guess: generic UI primitive; staging shadcn ui set may cover - verify `[dest=same-path, content-equal]` |
| `src/components/ui/wikipedia-icon.tsx` | components/ui | guess: connector/brand logo icon for destination connectors UI; staging components/ui (63 files) lacks it - port with connector catalog decision `[dest=same-path, content-equal]` |
| `src/components/ui/xenforo-icon.tsx` | components/ui | guess: connector/brand logo icon for destination connectors UI; staging components/ui (63 files) lacks it - port with connector catalog decision `[dest=same-path, content-equal]` |
| `src/components/ui/youtube-icon.tsx` | components/ui | guess: connector/brand logo icon for destination connectors UI; staging components/ui (63 files) lacks it - port with connector catalog decision `[dest=same-path, content-equal]` |
| `src/components/ui/zendesk-icon.tsx` | components/ui | guess: connector/brand logo icon for destination connectors UI; staging components/ui (63 files) lacks it - port with connector catalog decision `[dest=same-path, content-equal]` |
| `src/components/ui/zulip-icon.tsx` | components/ui | guess: connector/brand logo icon for destination connectors UI; staging components/ui (63 files) lacks it - port with connector catalog decision `[dest=same-path, content-equal]` |
| `src/components/user/user-detail/memory-ui-helpers.test.ts` | components/user | guess: staging has components/user/user-detail/memory-ui-helpers.ts (no test) - port test `[dest=same-path, content-equal]` |
| `src/components/user/user-detail/user-detail-card.tsx` | components/user | guess: staging user-detail.tsx / user-detail-form-card.tsx - map `[dest=same-path, content-equal]` |
| `src/components/user/user-detail/user-detail-content.tsx` | components/user | guess: staging user-detail.tsx (+ skeleton variants) - map `[dest=same-path, content-equal]` |
| `src/components/user/user-detail/user-info-card.tsx` | components/user | guess: staging user-access-card.tsx - map `[dest=same-path, content-equal]` |
| `src/components/user/user-detail/user-sessions.tsx` | components/user | guess: staging sessions UI not found under user-detail - verify `[dest=same-path, content-equal]` |
| `src/components/user/user-detail/user-stats.tsx` | components/user | guess: staging user-statistics-card.tsx / user-stats-card-loader.tsx - map `[dest=same-path, content-equal]` |
| `src/components/workflow/workflow-context-menu.tsx` | components/workflow | guess: staging components/workflow (workflow-index.tsx, node-context-menu-content.tsx, workflow-panel.tsx) - verify `[dest=same-path, content-equal]` |
| `src/components/workflow/workflow-list-page.tsx` | components/workflow | guess: staging components/workflow (workflow-index.tsx, node-context-menu-content.tsx, workflow-panel.tsx) - verify `[dest=same-path, differs]` |
| `src/hooks/use-state-with-browserstorage.ts` | hooks | guess: destination-only hook; staging hooks lack it - verify `[dest=same-path, content-equal]` |
| `src/hooks/use-unsaved-changes.ts` | hooks | guess: destination-only hook; staging hooks lack it - verify `[dest=same-path, content-equal]` |
| `src/hooks/queries/use-archives.tsx` | hooks/queries | guess: staging hooks/queries/use-archives.ts exists (zip is .tsx) - verify `[dest=same-path, content-equal]` |
| `src/hooks/queries/use-builds.ts` | hooks/queries | guess: staging hooks/queries/use-app-builds.ts (C43 rename) - verify `[dest=same-path, content-equal]` |
| `src/hooks/queries/use-sandboxes.ts` | hooks/queries | guess: staging sandbox query hook not found by this name - verify `[dest=same-path, content-equal]` |
| `src/lib/browser-stroage.ts` | lib | guess: destination-only helper (filename typo) - verify `[dest=same-path, content-equal]` |
| `src/lib/const.test.ts` | lib | guess: staging has src/lib/const.ts at same path (matched); only this test is missing - port test `[dest=same-path, content-equal]` |
| `src/lib/site-config-runtime.ts` | lib | guess: destination site-config runtime layer; staging equivalent = lib/db/pg/repositories/site-config-repository.pg.ts - verify `[dest=same-path, content-equal]` |
| `src/lib/site-config.ts` | lib | guess: destination site-config runtime layer; staging equivalent = lib/db/pg/repositories/site-config-repository.pg.ts - verify `[dest=same-path, differs]` |
| `src/lib/admin/site-config-defaults.ts` | lib/admin | guess: destination site-config defaults/reader over site_config table; staging has site-config-repository.pg.ts (upstream shape) - merge decision `[dest=same-path, content-equal]` |
| `src/lib/admin/site-config-reader.ts` | lib/admin | guess: destination site-config defaults/reader over site_config table; staging has site-config-repository.pg.ts (upstream shape) - merge decision `[dest=same-path, content-equal]` |
| `src/lib/ai/agent/example.ts` | lib/ai | guess: staging lib/ai/agent/ has presets.ts; example preset not found - verify `[dest=same-path, content-equal]` |
| `src/lib/ai/codemode/create-codemode-tool.ts` | lib/ai | guess: destination codemode (@cloudflare/codemode dep is zip-only); staging code exec = lib/ai/tools/code/{e2b-sandbox,js-run,python-run} - port decision `[dest=same-path, content-equal]` |
| `src/lib/ai/codemode/executor.ts` | lib/ai | guess: destination codemode (@cloudflare/codemode dep is zip-only); staging code exec = lib/ai/tools/code/{e2b-sandbox,js-run,python-run} - port decision `[dest=same-path, content-equal]` |
| `src/lib/ai/composio.ts` | lib/ai | guess: staging moved composio to lib/composio/{client,config,scoped-tools}.ts - verify `[dest=same-path, differs]` |
| `src/lib/ai/harness.ts` | lib/ai | guess: destination agent harness; staging lib/ai/agent/ + lib/ai/subagents/research-subagent.ts - verify `[dest=same-path, content-equal]` |
| `src/lib/ai/image/edit-image.test.ts` | lib/ai | guess: staging lib/ai/image = generate-image.ts / image-models.ts (+ mask utils); zip void-agent/konvo image gen + edit are destination providers - map `[dest=same-path, differs]` |
| `src/lib/ai/image/edit-image.ts` | lib/ai | guess: staging lib/ai/image = generate-image.ts / image-models.ts (+ mask utils); zip void-agent/konvo image gen + edit are destination providers - map `[dest=same-path, differs]` |
| `src/lib/ai/image/edit-models.ts` | lib/ai | guess: staging lib/ai/image = generate-image.ts / image-models.ts (+ mask utils); zip void-agent/konvo image gen + edit are destination providers - map `[dest=same-path, content-equal]` |
| `src/lib/ai/image/generate-void-agent-image.test.ts` | lib/ai | guess: staging lib/ai/image = generate-image.ts / image-models.ts (+ mask utils); zip void-agent/konvo image gen + edit are destination providers - map `[dest=same-path, differs]` |
| `src/lib/ai/image/generate-void-agent-image.ts` | lib/ai | guess: staging lib/ai/image = generate-image.ts / image-models.ts (+ mask utils); zip void-agent/konvo image gen + edit are destination providers - map `[dest=same-path, differs]` |
| `src/lib/ai/image/models.ts` | lib/ai | guess: staging lib/ai/image = generate-image.ts / image-models.ts (+ mask utils); zip void-agent/konvo image gen + edit are destination providers - map `[dest=same-path, content-equal]` |
| `src/lib/ai/ingest/csv-ingest.test.ts` | lib/ai | guess: staging lib/ai/ingest (readers/, pdf-rasterize.ts, formats.ts, limits.ts); csv-ingest + konvo-vision are destination extras - map `[dest=same-path, differs]` |
| `src/lib/ai/ingest/csv-ingest.ts` | lib/ai | guess: staging lib/ai/ingest (readers/, pdf-rasterize.ts, formats.ts, limits.ts); csv-ingest + konvo-vision are destination extras - map `[dest=same-path, differs]` |
| `src/lib/ai/ingest/konvo-vision-ingest.test.ts` | lib/ai | guess: staging lib/ai/ingest (readers/, pdf-rasterize.ts, formats.ts, limits.ts); csv-ingest + konvo-vision are destination extras - map `[dest=same-path, differs]` |
| `src/lib/ai/ingest/konvo-vision-ingest.ts` | lib/ai | guess: staging lib/ai/ingest (readers/, pdf-rasterize.ts, formats.ts, limits.ts); csv-ingest + konvo-vision are destination extras - map `[dest=same-path, differs]` |
| `src/lib/ai/ingest/pdf-ingest.ts` | lib/ai | guess: staging lib/ai/ingest (readers/, pdf-rasterize.ts, formats.ts, limits.ts); csv-ingest + konvo-vision are destination extras - map `[dest=same-path, differs]` |
| `src/lib/ai/mcp/mcp-config-diff.test.ts` | lib/ai | guess: staging lib/ai/mcp is a large upstream set - locate equivalent validators `[dest=same-path, content-equal]` |
| `src/lib/ai/mcp/mcp-config-diff.ts` | lib/ai | guess: staging lib/ai/mcp is a large upstream set - locate equivalent validators `[dest=same-path, content-equal]` |
| `src/lib/ai/mcp/mcp-tool-id.test.ts` | lib/ai | guess: staging lib/ai/ restructured (agent/, routing/, subagents/, prompts.ts) - locate equivalent `[dest=same-path, content-equal]` |
| `src/lib/ai/mcp/validate-mcp-server-config.test.ts` | lib/ai | guess: staging lib/ai/mcp is a large upstream set - locate equivalent validators `[dest=same-path, content-equal]` |
| `src/lib/ai/mcp/validate-mcp-server-config.ts` | lib/ai | guess: staging lib/ai/mcp is a large upstream set - locate equivalent validators `[dest=same-path, content-equal]` |
| `src/lib/ai/memory/backfill.test.ts` | lib/ai | guess: destination-only memory pipeline (extract/embed/insights/backfill); staging has lib/db/pg/repositories/memory-repository.pg.ts + 0069_void_agent_gallery_memory.sql + thread-insights (C41) - semantic verify `[dest=same-path, content-equal]` |
| `src/lib/ai/memory/backfill.ts` | lib/ai | guess: destination-only memory pipeline (extract/embed/insights/backfill); staging has lib/db/pg/repositories/memory-repository.pg.ts + 0069_void_agent_gallery_memory.sql + thread-insights (C41) - semantic verify `[dest=same-path, content-equal]` |
| `src/lib/ai/memory/embed.ts` | lib/ai | guess: destination-only memory pipeline (extract/embed/insights/backfill); staging has lib/db/pg/repositories/memory-repository.pg.ts + 0069_void_agent_gallery_memory.sql + thread-insights (C41) - semantic verify `[dest=same-path, content-equal]` |
| `src/lib/ai/memory/extract-and-store.test.ts` | lib/ai | guess: destination-only memory pipeline (extract/embed/insights/backfill); staging has lib/db/pg/repositories/memory-repository.pg.ts + 0069_void_agent_gallery_memory.sql + thread-insights (C41) - semantic verify `[dest=same-path, content-equal]` |
| `src/lib/ai/memory/extract-and-store.ts` | lib/ai | guess: destination-only memory pipeline (extract/embed/insights/backfill); staging has lib/db/pg/repositories/memory-repository.pg.ts + 0069_void_agent_gallery_memory.sql + thread-insights (C41) - semantic verify `[dest=same-path, content-equal]` |
| `src/lib/ai/memory/extract-memories.ts` | lib/ai | guess: destination-only memory pipeline (extract/embed/insights/backfill); staging has lib/db/pg/repositories/memory-repository.pg.ts + 0069_void_agent_gallery_memory.sql + thread-insights (C41) - semantic verify `[dest=same-path, differs]` |
| `src/lib/ai/memory/generate-json.ts` | lib/ai | guess: destination-only memory pipeline (extract/embed/insights/backfill); staging has lib/db/pg/repositories/memory-repository.pg.ts + 0069_void_agent_gallery_memory.sql + thread-insights (C41) - semantic verify `[dest=same-path, content-equal]` |
| `src/lib/ai/memory/insights-backfill.test.ts` | lib/ai | guess: destination-only memory pipeline (extract/embed/insights/backfill); staging has lib/db/pg/repositories/memory-repository.pg.ts + 0069_void_agent_gallery_memory.sql + thread-insights (C41) - semantic verify `[dest=same-path, content-equal]` |
| `src/lib/ai/memory/insights-backfill.ts` | lib/ai | guess: destination-only memory pipeline (extract/embed/insights/backfill); staging has lib/db/pg/repositories/memory-repository.pg.ts + 0069_void_agent_gallery_memory.sql + thread-insights (C41) - semantic verify `[dest=same-path, content-equal]` |
| `src/lib/ai/memory/insights.test.ts` | lib/ai | guess: destination-only memory pipeline (extract/embed/insights/backfill); staging has lib/db/pg/repositories/memory-repository.pg.ts + 0069_void_agent_gallery_memory.sql + thread-insights (C41) - semantic verify `[dest=same-path, differs]` |
| `src/lib/ai/memory/insights.ts` | lib/ai | guess: destination-only memory pipeline (extract/embed/insights/backfill); staging has lib/db/pg/repositories/memory-repository.pg.ts + 0069_void_agent_gallery_memory.sql + thread-insights (C41) - semantic verify `[dest=same-path, differs]` |
| `src/lib/ai/memory/memory-source.ts` | lib/ai | guess: destination-only memory pipeline (extract/embed/insights/backfill); staging has lib/db/pg/repositories/memory-repository.pg.ts + 0069_void_agent_gallery_memory.sql + thread-insights (C41) - semantic verify `[dest=same-path, content-equal]` |
| `src/lib/ai/skills/index.ts` | lib/ai | guess: staging skills = upstream marketplace (app/api/skills, skill-repository.pg.ts, lib/ai/skill-prompts.ts); zip skills index/schedule is destination variant - verify `[dest=same-path, differs]` |
| `src/lib/ai/skills/schedule.test.ts` | lib/ai | guess: staging skills = upstream marketplace (app/api/skills, skill-repository.pg.ts, lib/ai/skill-prompts.ts); zip skills index/schedule is destination variant - verify `[dest=same-path, differs]` |
| `src/lib/ai/skills/schedule.ts` | lib/ai | guess: staging skills = upstream marketplace (app/api/skills, skill-repository.pg.ts, lib/ai/skill-prompts.ts); zip skills index/schedule is destination variant - verify `[dest=same-path, differs]` |
| `src/lib/ai/sort-providers.ts` | lib/ai | guess: staging lib/ai/routing/ (model-switch, signals) likely covers ordering - verify `[dest=same-path, content-equal]` |
| `src/lib/ai/speech/elevenlabs/use-voice-chat-elevenlabs.ts` | lib/ai | guess: staging lib/ai/speech has no elevenlabs (index.ts, open-ai/, voice-gateway.server.ts, voice-realtime-config.ts) - destination ElevenLabs voice - port decision `[dest=same-path, differs]` |
| `src/lib/ai/speech/konvo/use-voice-chat-konvo.ts` | lib/ai | guess: destination Konvo voice client; no staging counterpart `[dest=same-path, differs]` |
| `src/lib/ai/speech/open-ai/openai-realtime-event.ts` | lib/ai | guess: staging lib/ai/speech/open-ai/ exists - verify event types `[dest=same-path, differs]` |
| `src/lib/ai/speech/providers.ts` | lib/ai | guess: staging speech/index.ts + voice-realtime-config.ts - verify `[dest=same-path, content-equal]` |
| `src/lib/ai/system-prompt.ts` | lib/ai | guess: staging lib/ai/prompts.ts covers - verify `[dest=same-path, content-equal]` |
| `src/lib/ai/tools/artifacts/artifact-creator.ts` | lib/ai | guess: staging artifact tooling under components/artifact-panel/ + lib/ai/tools/planning (C30 create-plan) - verify `[dest=same-path, differs]` |
| `src/lib/ai/tools/browser/browser-agent.ts` | lib/ai | guess: destination browser stack (FIRECRAWL/cloak); staging only lib/ai/tools/browser/browser-automation-tool.ts (@onkernel) - port decision `[dest=same-path, differs]` |
| `src/lib/ai/tools/browser/cloak-browser.ts` | lib/ai | guess: destination browser stack (FIRECRAWL/cloak); staging only lib/ai/tools/browser/browser-automation-tool.ts (@onkernel) - port decision `[dest=same-path, differs]` |
| `src/lib/ai/tools/browser/crawl-gateway.ts` | lib/ai | guess: destination browser stack; staging only browser-automation-tool.ts - verify `[dest=same-path, content-equal]` |
| `src/lib/ai/tools/browser/steel-fleet.ts` | lib/ai | guess: destination browser stack; staging only browser-automation-tool.ts - verify `[dest=same-path, content-equal]` |
| `src/lib/ai/tools/canvas/ecanvas-tool.ts` | lib/ai | guess: staging ecanvas tooling under app/api/ecanvas + components/canvas/ecanvas - verify `[dest=same-path, differs]` |
| `src/lib/ai/tools/canvas/ppt-maker.ts` | lib/ai | guess: staging ecanvas tooling under app/api/ecanvas + components/canvas/ecanvas - verify `[dest=same-path, differs]` |
| `src/lib/ai/tools/code-engine/executor.ts` | lib/ai | guess: destination code-engine; staging lib/ai/tools/code/ (e2b/js/python; B20-adjacent) - port decision `[dest=same-path, content-equal]` |
| `src/lib/ai/tools/code-engine/index.ts` | lib/ai | guess: destination code-engine; staging lib/ai/tools/code/ (e2b/js/python; B20-adjacent) - port decision `[dest=same-path, content-equal]` |
| `src/lib/ai/tools/code-engine/normalize.ts` | lib/ai | guess: destination code-engine; staging lib/ai/tools/code/ (e2b/js/python; B20-adjacent) - port decision `[dest=same-path, content-equal]` |
| `src/lib/ai/tools/code-engine/types-gen.ts` | lib/ai | guess: destination code-engine; staging lib/ai/tools/code/ (e2b/js/python; B20-adjacent) - port decision `[dest=same-path, content-equal]` |
| `src/lib/ai/tools/connectors/airtable-tool.ts` | lib/ai | guess: C42: staging connector registry (lib/ai/tools/connectors/registry.ts + providers asana/calendar/clickup/drive/freshdesk/github/gmail/jira/linear/notion/outlook/productboard/slack/teams/zendesk/zulip) lacks airtable - port = add tool + registry entry `[dest=same-path, content-equal]` |
| `src/lib/ai/tools/connectors/axero-tool.ts` | lib/ai | guess: C42: staging connector registry (lib/ai/tools/connectors/registry.ts + providers asana/calendar/clickup/drive/freshdesk/github/gmail/jira/linear/notion/outlook/productboard/slack/teams/zendesk/zulip) lacks axero - port = add tool + registry entry `[dest=same-path, content-equal]` |
| `src/lib/ai/tools/connectors/bitbucket-tool.ts` | lib/ai | guess: C42: staging connector registry (lib/ai/tools/connectors/registry.ts + providers asana/calendar/clickup/drive/freshdesk/github/gmail/jira/linear/notion/outlook/productboard/slack/teams/zendesk/zulip) lacks bitbucket - port = add tool + registry entry `[dest=same-path, content-equal]` |
| `src/lib/ai/tools/connectors/bookstack-tool.ts` | lib/ai | guess: C42: staging connector registry (lib/ai/tools/connectors/registry.ts + providers asana/calendar/clickup/drive/freshdesk/github/gmail/jira/linear/notion/outlook/productboard/slack/teams/zendesk/zulip) lacks bookstack - port = add tool + registry entry `[dest=same-path, content-equal]` |
| `src/lib/ai/tools/connectors/canvas-lms-tool.ts` | lib/ai | guess: C42: staging connector registry (lib/ai/tools/connectors/registry.ts + providers asana/calendar/clickup/drive/freshdesk/github/gmail/jira/linear/notion/outlook/productboard/slack/teams/zendesk/zulip) lacks canvas-lms - port = add tool + registry entry `[dest=same-path, content-equal]` |
| `src/lib/ai/tools/connectors/coda-tool.ts` | lib/ai | guess: C42: staging connector registry (lib/ai/tools/connectors/registry.ts + providers asana/calendar/clickup/drive/freshdesk/github/gmail/jira/linear/notion/outlook/productboard/slack/teams/zendesk/zulip) lacks coda - port = add tool + registry entry `[dest=same-path, content-equal]` |
| `src/lib/ai/tools/connectors/confluence-tool.ts` | lib/ai | guess: C42: staging connector registry (lib/ai/tools/connectors/registry.ts + providers asana/calendar/clickup/drive/freshdesk/github/gmail/jira/linear/notion/outlook/productboard/slack/teams/zendesk/zulip) lacks confluence - port = add tool + registry entry `[dest=same-path, content-equal]` |
| `src/lib/ai/tools/connectors/discord-tool.ts` | lib/ai | guess: C42: staging connector registry (lib/ai/tools/connectors/registry.ts + providers asana/calendar/clickup/drive/freshdesk/github/gmail/jira/linear/notion/outlook/productboard/slack/teams/zendesk/zulip) lacks discord - port = add tool + registry entry `[dest=same-path, differs]` |
| `src/lib/ai/tools/connectors/discourse-tool.ts` | lib/ai | guess: C42: staging connector registry (lib/ai/tools/connectors/registry.ts + providers asana/calendar/clickup/drive/freshdesk/github/gmail/jira/linear/notion/outlook/productboard/slack/teams/zendesk/zulip) lacks discourse - port = add tool + registry entry `[dest=same-path, content-equal]` |
| `src/lib/ai/tools/connectors/document360-tool.ts` | lib/ai | guess: C42: staging connector registry (lib/ai/tools/connectors/registry.ts + providers asana/calendar/clickup/drive/freshdesk/github/gmail/jira/linear/notion/outlook/productboard/slack/teams/zendesk/zulip) lacks document360 - port = add tool + registry entry `[dest=same-path, content-equal]` |
| `src/lib/ai/tools/connectors/dropbox-tool.ts` | lib/ai | guess: C42: staging connector registry (lib/ai/tools/connectors/registry.ts + providers asana/calendar/clickup/drive/freshdesk/github/gmail/jira/linear/notion/outlook/productboard/slack/teams/zendesk/zulip) lacks dropbox - port = add tool + registry entry `[dest=same-path, content-equal]` |
| `src/lib/ai/tools/connectors/drupal-wiki-tool.ts` | lib/ai | guess: C42: staging connector registry (lib/ai/tools/connectors/registry.ts + providers asana/calendar/clickup/drive/freshdesk/github/gmail/jira/linear/notion/outlook/productboard/slack/teams/zendesk/zulip) lacks drupal-wiki - port = add tool + registry entry `[dest=same-path, content-equal]` |
| `src/lib/ai/tools/connectors/egnyte-tool.ts` | lib/ai | guess: C42: staging connector registry (lib/ai/tools/connectors/registry.ts + providers asana/calendar/clickup/drive/freshdesk/github/gmail/jira/linear/notion/outlook/productboard/slack/teams/zendesk/zulip) lacks egnyte - port = add tool + registry entry `[dest=same-path, content-equal]` |
| `src/lib/ai/tools/connectors/fireflies-tool.ts` | lib/ai | guess: C42: staging connector registry (lib/ai/tools/connectors/registry.ts + providers asana/calendar/clickup/drive/freshdesk/github/gmail/jira/linear/notion/outlook/productboard/slack/teams/zendesk/zulip) lacks fireflies - port = add tool + registry entry `[dest=same-path, content-equal]` |
| `src/lib/ai/tools/connectors/gitbook-tool.ts` | lib/ai | guess: C42: staging connector registry (lib/ai/tools/connectors/registry.ts + providers asana/calendar/clickup/drive/freshdesk/github/gmail/jira/linear/notion/outlook/productboard/slack/teams/zendesk/zulip) lacks gitbook - port = add tool + registry entry `[dest=same-path, content-equal]` |
| `src/lib/ai/tools/connectors/gitlab-tool.ts` | lib/ai | guess: C42: staging connector registry (lib/ai/tools/connectors/registry.ts + providers asana/calendar/clickup/drive/freshdesk/github/gmail/jira/linear/notion/outlook/productboard/slack/teams/zendesk/zulip) lacks gitlab - port = add tool + registry entry `[dest=same-path, content-equal]` |
| `src/lib/ai/tools/connectors/gong-tool.ts` | lib/ai | guess: C42: staging connector registry (lib/ai/tools/connectors/registry.ts + providers asana/calendar/clickup/drive/freshdesk/github/gmail/jira/linear/notion/outlook/productboard/slack/teams/zendesk/zulip) lacks gong - port = add tool + registry entry `[dest=same-path, content-equal]` |
| `src/lib/ai/tools/connectors/guru-tool.ts` | lib/ai | guess: C42: staging connector registry (lib/ai/tools/connectors/registry.ts + providers asana/calendar/clickup/drive/freshdesk/github/gmail/jira/linear/notion/outlook/productboard/slack/teams/zendesk/zulip) lacks guru - port = add tool + registry entry `[dest=same-path, content-equal]` |
| `src/lib/ai/tools/connectors/highspot-tool.ts` | lib/ai | guess: C42: staging connector registry (lib/ai/tools/connectors/registry.ts + providers asana/calendar/clickup/drive/freshdesk/github/gmail/jira/linear/notion/outlook/productboard/slack/teams/zendesk/zulip) lacks highspot - port = add tool + registry entry `[dest=same-path, content-equal]` |
| `src/lib/ai/tools/connectors/hubspot-tool.ts` | lib/ai | guess: C42: staging connector registry (lib/ai/tools/connectors/registry.ts + providers asana/calendar/clickup/drive/freshdesk/github/gmail/jira/linear/notion/outlook/productboard/slack/teams/zendesk/zulip) lacks hubspot - port = add tool + registry entry `[dest=same-path, content-equal]` |
| `src/lib/ai/tools/connectors/index.ts` | lib/ai | guess: C42: zip connector catalog index; staging uses registry.ts - merge catalog `[dest=same-path, content-equal]` |
| `src/lib/ai/tools/connectors/loopio-tool.ts` | lib/ai | guess: C42: staging connector registry (lib/ai/tools/connectors/registry.ts + providers asana/calendar/clickup/drive/freshdesk/github/gmail/jira/linear/notion/outlook/productboard/slack/teams/zendesk/zulip) lacks loopio - port = add tool + registry entry `[dest=same-path, content-equal]` |
| `src/lib/ai/tools/connectors/mediawiki-tool.ts` | lib/ai | guess: C42: staging connector registry (lib/ai/tools/connectors/registry.ts + providers asana/calendar/clickup/drive/freshdesk/github/gmail/jira/linear/notion/outlook/productboard/slack/teams/zendesk/zulip) lacks mediawiki - port = add tool + registry entry `[dest=same-path, content-equal]` |
| `src/lib/ai/tools/connectors/outline-tool.ts` | lib/ai | guess: C42: staging connector registry (lib/ai/tools/connectors/registry.ts + providers asana/calendar/clickup/drive/freshdesk/github/gmail/jira/linear/notion/outlook/productboard/slack/teams/zendesk/zulip) lacks outline - port = add tool + registry entry `[dest=same-path, content-equal]` |
| `src/lib/ai/tools/connectors/salesforce-tool.ts` | lib/ai | guess: C42: staging connector registry (lib/ai/tools/connectors/registry.ts + providers asana/calendar/clickup/drive/freshdesk/github/gmail/jira/linear/notion/outlook/productboard/slack/teams/zendesk/zulip) lacks salesforce - port = add tool + registry entry `[dest=same-path, content-equal]` |
| `src/lib/ai/tools/connectors/slab-tool.ts` | lib/ai | guess: C42: staging connector registry (lib/ai/tools/connectors/registry.ts + providers asana/calendar/clickup/drive/freshdesk/github/gmail/jira/linear/notion/outlook/productboard/slack/teams/zendesk/zulip) lacks slab - port = add tool + registry entry `[dest=same-path, content-equal]` |
| `src/lib/ai/tools/connectors/testrail-tool.ts` | lib/ai | guess: C42: staging connector registry (lib/ai/tools/connectors/registry.ts + providers asana/calendar/clickup/drive/freshdesk/github/gmail/jira/linear/notion/outlook/productboard/slack/teams/zendesk/zulip) lacks testrail - port = add tool + registry entry `[dest=same-path, content-equal]` |
| `src/lib/ai/tools/connectors/wikipedia-tool.ts` | lib/ai | guess: C42: staging connector registry (lib/ai/tools/connectors/registry.ts + providers asana/calendar/clickup/drive/freshdesk/github/gmail/jira/linear/notion/outlook/productboard/slack/teams/zendesk/zulip) lacks wikipedia - port = add tool + registry entry `[dest=same-path, content-equal]` |
| `src/lib/ai/tools/connectors/xenforo-tool.ts` | lib/ai | guess: C42: staging connector registry (lib/ai/tools/connectors/registry.ts + providers asana/calendar/clickup/drive/freshdesk/github/gmail/jira/linear/notion/outlook/productboard/slack/teams/zendesk/zulip) lacks xenforo - port = add tool + registry entry `[dest=same-path, content-equal]` |
| `src/lib/ai/tools/memory.ts` | lib/ai | guess: staging memory via repositories + lib/ai/mcp/memory-mcp-config-storage.ts - verify `[dest=same-path, content-equal]` |
| `src/lib/ai/tools/sandbox/sandbox-tool.ts` | lib/ai | guess: staging lib/ai/tools/code/e2b-sandbox-tool.ts - verify `[dest=same-path, differs]` |
| `src/lib/ai/tools/sanitize-tool-schemas.ts` | lib/ai | guess: staging sanitization not found (lib/e2b/nextjs-route-sanitizer.ts is different) - verify `[dest=same-path, content-equal]` |
| `src/lib/ai/tools/scheduler/scheduler-tool.ts` | lib/ai | guess: staging scheduled-tasks tooling - verify `[dest=same-path, differs]` |
| `src/lib/ai/tools/video/video-generator.ts` | lib/ai | guess: staging video generation absent - port decision `[dest=same-path, content-equal]` |
| `src/lib/ai/tools/workflow.ts` | lib/ai | guess: staging workflow tools under app/api/workflow/tools + components/workflow - verify `[dest=same-path, differs]` |
| `src/lib/ai/workflow/examples/baby-research.ts` | lib/ai | guess: staging lib/ai/workflow has no examples/ dir - port decision `[dest=same-path, content-equal]` |
| `src/lib/ai/workflow/examples/code-review.ts` | lib/ai | guess: staging lib/ai/workflow has no examples/ dir - port decision `[dest=same-path, content-equal]` |
| `src/lib/ai/workflow/examples/get-weather.ts` | lib/ai | guess: staging lib/ai/workflow has no examples/ dir - port decision `[dest=same-path, content-equal]` |
| `src/lib/ai/workflow/examples/index.ts` | lib/ai | guess: staging lib/ai/workflow has no examples/ dir - port decision `[dest=same-path, content-equal]` |
| `src/lib/ai/workflow/examples/summarize.ts` | lib/ai | guess: staging lib/ai/workflow has no examples/ dir - port decision `[dest=same-path, content-equal]` |
| `src/lib/ai/workflow/examples/translate.ts` | lib/ai | guess: staging lib/ai/workflow has no examples/ dir - port decision `[dest=same-path, content-equal]` |
| `src/lib/ai/workflow/executor/extract-node-dependency-schema.ts` | lib/ai | guess: staging lib/ai/workflow/executor lacks this file - verify `[dest=same-path, content-equal]` |
| `src/lib/ai/workflow/executor/node-executor.test.ts` | lib/ai | guess: staging lib/ai/workflow/executor/node-executor.ts exists with own tests - port test semantics `[dest=same-path, differs]` |
| `src/lib/auth/org-hooks.test.ts` | lib/auth | guess: destination org extensions (org-hooks/scoped-where); staging lib/auth has organization-permissions.ts - verify `[dest=same-path, content-equal]` |
| `src/lib/auth/org-hooks.ts` | lib/auth | guess: destination org extensions (org-hooks/scoped-where); staging lib/auth has organization-permissions.ts - verify `[dest=same-path, content-equal]` |
| `src/lib/auth/scoped-where.test.ts` | lib/auth | guess: destination org extensions (org-hooks/scoped-where); staging lib/auth has organization-permissions.ts - verify `[dest=same-path, content-equal]` |
| `src/lib/auth/scoped-where.ts` | lib/auth | guess: destination org extensions (org-hooks/scoped-where); staging lib/auth has organization-permissions.ts - verify `[dest=same-path, content-equal]` |
| `src/lib/cache/upstash-rest-cache.test.ts` | lib/cache | guess: staging has src/lib/cache/upstash-rest-cache.ts at same path; only this test file is missing - port test `[dest=same-path, content-equal]` |
| `src/lib/chat/fork-thread.test.ts` | lib/chat | guess: A08 destination fork feature; no staging counterpart `[dest=same-path, content-equal]` |
| `src/lib/chat/fork-thread.ts` | lib/chat | guess: A08 destination fork feature; no staging counterpart `[dest=same-path, content-equal]` |
| `src/lib/community/client.ts` | lib/community | guess: staging community is staging-native (0077_void_agent_community.sql, app/api/community, app/(chat)/community; C39) - zip client/server helpers may be redundant; verify `[dest=same-path, content-equal]` |
| `src/lib/community/server.ts` | lib/community | guess: staging community is staging-native (0077_void_agent_community.sql, app/api/community, app/(chat)/community; C39) - zip client/server helpers may be redundant; verify `[dest=same-path, content-equal]` |
| `src/lib/connectors/credentials.ts` | lib/connectors | guess: staging connector creds/oauth via lib/ai/tools/connectors + browser-credential-repository.pg.ts + app/api/connectors/[provider]/callback - verify `[dest=same-path, differs]` |
| `src/lib/connectors/oauth-callback-page.ts` | lib/connectors | guess: staging connector creds/oauth via lib/ai/tools/connectors + browser-credential-repository.pg.ts + app/api/connectors/[provider]/callback - verify `[dest=same-path, content-equal]` |
| `src/lib/connectors/refresh.ts` | lib/connectors | guess: staging connector creds/oauth via lib/ai/tools/connectors + browser-credential-repository.pg.ts + app/api/connectors/[provider]/callback - verify `[dest=same-path, differs]` |
| `src/lib/db/migrations/pg/0015_user_connector.sql` | lib/db | guess: user_connector table; staging C42 connector schema is renumbered (browser-credential/connections repos) - verify schema coverage `[dest=same-path, content-equal]` |
| `src/lib/db/migrations/pg/0015_wild_morlun.sql` | lib/db | guess: user_memory + user_connector tables; staging memory = 0069_void_agent_gallery_memory.sql, connectors renumbered - verify `[dest=same-path, content-equal]` |
| `src/lib/db/migrations/pg/0016_curious_tier.sql` | lib/db | guess: ALTER TABLE user (tier); staging has user-tier-selection-dialog.tsx + own user migrations - verify `[dest=same-path, content-equal]` |
| `src/lib/db/migrations/pg/0017_free_tier_default.sql` | lib/db | guess: ALTER TABLE user (free-tier default); staging budget/tier handling differs - verify `[dest=same-path, content-equal]` |
| `src/lib/db/migrations/pg/0018_build_jobs.sql` | lib/db | guess: build_job table; staging C43 = 0080_void_agent_app_builder.sql (app_build) supersedes - verify `[dest=same-path, content-equal]` |
| `src/lib/db/migrations/pg/0019_drop_build_jobs.sql` | lib/db | guess: DROP build_job (reversed by 0032); staging 0080 app_build supersedes - no port needed (verify) `[dest=same-path, content-equal]` |
| `src/lib/db/migrations/pg/0020_dodo_payments.sql` | lib/db | guess: staging 0074_void_agent_dodo_payments.sql supersedes - verify column parity `[dest=same-path, content-equal]` |
| `src/lib/db/migrations/pg/0021_lucky_nekra.sql` | lib/db | guess: dodo_payment/dodo_subscription/dodo_webhook_event/security_event; staging 0074 (dodo) + 0075 (security_events) supersede - verify `[dest=same-path, content-equal]` |
| `src/lib/db/migrations/pg/0021_lucky_nekra.sql.bak` | lib/db | guess: backup artifact; exclude from any port `[dest=none]` |
| `src/lib/db/migrations/pg/0022_cheerful_next_avengers.sql` | lib/db | guess: bug_report/bug_report_comment/collection tables; staging 0081_void_agent_bug_bounty.sql + app/api/collections supersede - verify `[dest=same-path, content-equal]` |
| `src/lib/db/migrations/pg/0023_silent_sentinel.sql` | lib/db | guess: scheduled_job/scheduled_run/inbound_endpoint; staging 0045_scheduled_task.sql + 0073 + app/api/inbound supersede - verify `[dest=same-path, content-equal]` |
| `src/lib/db/migrations/pg/0024_webhook_signing_secret.sql` | lib/db | guess: webhook_subscription signing secret; staging has same-path webhook-subscription API + webhook-repository.pg.ts - find staging journal counterpart `[dest=same-path, content-equal]` |
| `src/lib/db/migrations/pg/0025_amber_assembly.sql` | lib/db | guess: mcp_server ALTERs; staging MCP migrations (0071/0072 + install tables) supersede - verify `[dest=same-path, content-equal]` |
| `src/lib/db/migrations/pg/0026_verdant_gatekeeper.sql` | lib/db | guess: embed_session table; staging has embed-session-repository.pg.ts + app/api/embed - find staging journal counterpart `[dest=same-path, content-equal]` |
| `src/lib/db/migrations/pg/0027_connector_pause.sql` | lib/db | guess: user_connector pause column; staging C42 has pause/resume connector actions - verify `[dest=same-path, differs]` |
| `src/lib/db/migrations/pg/0028_scheduler_assistant_jobs.sql` | lib/db | guess: scheduled_job.agent_id nullable; staging 0045/0073 scheduled-task schema - verify `[dest=same-path, content-equal]` |
| `src/lib/db/migrations/pg/0029_expand_connectors.sql` | lib/db | guess: connector catalog expansion; staging C42 registry - verify `[dest=same-path, content-equal]` |
| `src/lib/db/migrations/pg/0030_rename_dodo_billing_columns.sql` | lib/db | guess: no staging counterpart found at same or sibling path - destination carries implementation `[dest=same-path, content-equal]` |
| `src/lib/db/migrations/pg/0031_canvas_export.sql` | lib/db | guess: canvas_export table; staging 0076_void_agent_ecanvas_exports.sql (ecanvas) supersedes - verify `[dest=same-path, content-equal]` |
| `src/lib/db/migrations/pg/0032_build_jobs_restore.sql` | lib/db | guess: build_job restored + sandbox_id; staging C43 0080 app_build - verify `[dest=same-path, content-equal]` |
| `src/lib/db/migrations/pg/meta/0015_snapshot.json` | lib/db | guess: zip-main drizzle snapshot file; staging journal has own meta snapshots - no direct counterpart `[dest=same-path, content-equal]` |
| `src/lib/db/migrations/pg/meta/0021_snapshot.json` | lib/db | guess: zip-main drizzle snapshot file; staging journal has own meta snapshots - no direct counterpart `[dest=same-path, content-equal]` |
| `src/lib/db/migrations/pg/meta/0022_snapshot.json` | lib/db | guess: zip-main drizzle snapshot file; staging journal has own meta snapshots - no direct counterpart `[dest=same-path, content-equal]` |
| `src/lib/db/pg/repositories/admin-respository.pg.ts` | lib/db | guess: staging lib/db/pg/repositories/admin-repository.pg.ts exists (zip filename typo fixed) - verify API parity `[dest=same-path, content-equal]` |
| `src/lib/db/pg/repositories/agent-view-repository.pg.ts` | lib/db | guess: staging published-page-repository.pg.ts / agent-install-repository.pg.ts likely cover view/install counts - verify `[dest=same-path, content-equal]` |
| `src/lib/db/pg/repositories/archive-repository.pg.ts` | lib/db | guess: staging archives are staging-native (0078, app/(chat)/archives, hooks/queries/use-archives.ts) with no dedicated repo file - locate logic (likely chat-repository.pg.ts) `[dest=same-path, content-equal]` |
| `src/lib/db/pg/repositories/build-job-repository.pg.ts` | lib/db | guess: staging app-build-repository.pg.ts (C43 rename) - verify schema `[dest=same-path, content-equal]` |
| `src/lib/db/pg/repositories/chat-repository.update-thread-insights.test.ts` | lib/db | guess: staging thread-insights-repository.pg.ts + chat-repository.pg.ts (C41) - port test semantics `[dest=same-path, content-equal]` |
| `src/lib/db/pg/repositories/collection-repository.pg.ts` | lib/db | guess: staging app/api/collections + bookmark-repository.pg.ts - verify `[dest=same-path, differs]` |
| `src/lib/db/pg/repositories/scheduler-repository.pg.ts` | lib/db | guess: staging scheduled-tasks subsystem (0045_scheduled_task.sql, 0073, app/api/scheduled-tasks, lib/inngest) replaces zip scheduler - verify `[dest=same-path, differs]` |
| `src/lib/db/pg/repositories/subscription-repository.pg.ts` | lib/db | guess: staging dodo-payments-repository.pg.ts covers subscriptions - verify `[dest=same-path, content-equal]` |
| `src/lib/db/pg/repositories/team-repository.pg.ts` | lib/db | guess: staging upstream uses organizations (lib/auth/organization-permissions.ts); teams may be destination-only - verify `[dest=same-path, differs]` |
| `src/lib/email/admin-triggers.ts` | lib/email | guess: staging lib/email has only email-body-format.ts; resend/templates/admin-triggers are destination-only - port decision `[dest=same-path, content-equal]` |
| `src/lib/email/resend.ts` | lib/email | guess: staging lib/email has only email-body-format.ts; resend/templates/admin-triggers are destination-only - port decision `[dest=same-path, content-equal]` |
| `src/lib/email/templates.ts` | lib/email | guess: staging lib/email has only email-body-format.ts; resend/templates/admin-triggers are destination-only - port decision `[dest=same-path, differs]` |
| `src/lib/file-storage/local-file-storage.ts` | lib/file-storage | guess: staging storage = file-storage.interface + s3 + supabase + storage-utils.ts; local-file-storage/vercel-blob are destination backends - port decision `[dest=same-path, differs]` |
| `src/lib/file-storage/storage-utils.test.ts` | lib/file-storage | guess: staging storage = file-storage.interface + s3 + supabase + storage-utils.ts; local-file-storage/vercel-blob are destination backends - port decision `[dest=same-path, differs]` |
| `src/lib/file-storage/vercel-blob-storage.ts` | lib/file-storage | guess: staging storage = file-storage.interface + s3 + supabase + storage-utils.ts; local-file-storage/vercel-blob are destination backends - port decision `[dest=same-path, differs]` |
| `src/lib/payments/dodo.get-subscription.test.ts` | lib/payments | guess: staging lib/payments has dodo-config/dodo-webhook-signature (+tests) - port test semantics `[dest=same-path, content-equal]` |
| `src/lib/payments/dodo.test.ts` | lib/payments | guess: staging lib/payments has dodo-config/dodo-webhook-signature (+tests) - port test semantics `[dest=same-path, content-equal]` |
| `src/lib/payments/pricing-features.ts` | lib/payments | guess: staging plan/pricing metadata location TBD (lib/payments/dodo-config.ts) - verify `[dest=same-path, content-equal]` |
| `src/lib/payments/stripe.test.ts` | lib/payments | guess: staging dropped Stripe billing (Dodo-only lib/payments/dodo*); upstream cockpit has lib/cockpit/providers/stripe.ts (different purpose) - port decision `[dest=same-path, content-equal]` |
| `src/lib/rag/chunk.test.ts` | lib/rag | guess: staging RAG = lib/ai/rag/{embed-rag,embedding-models,ingest,search}.ts + lib/project-brain - map split `[dest=same-path, content-equal]` |
| `src/lib/rag/chunk.ts` | lib/rag | guess: staging RAG = lib/ai/rag/{embed-rag,embedding-models,ingest,search}.ts + lib/project-brain - map split `[dest=same-path, content-equal]` |
| `src/lib/rag/format.test.ts` | lib/rag | guess: staging RAG = lib/ai/rag/{embed-rag,embedding-models,ingest,search}.ts + lib/project-brain - map split `[dest=same-path, differs]` |
| `src/lib/rag/format.ts` | lib/rag | guess: staging RAG = lib/ai/rag/{embed-rag,embedding-models,ingest,search}.ts + lib/project-brain - map split `[dest=same-path, differs]` |
| `src/lib/rag/parse.ts` | lib/rag | guess: staging RAG = lib/ai/rag/{embed-rag,embedding-models,ingest,search}.ts + lib/project-brain - map split `[dest=same-path, differs]` |
| `src/lib/rag/retrieve.test.ts` | lib/rag | guess: staging RAG = lib/ai/rag/{embed-rag,embedding-models,ingest,search}.ts + lib/project-brain - map split `[dest=same-path, differs]` |
| `src/lib/rag/retrieve.ts` | lib/rag | guess: staging RAG = lib/ai/rag/{embed-rag,embedding-models,ingest,search}.ts + lib/project-brain - map split `[dest=same-path, differs]` |
| `src/lib/rate-limit/free-tier-usage.ts` | lib/rate-limit | guess: staging lib/rate-limit/api-rate-limit.ts; free-tier Upstash counters are destination-only - verify `[dest=same-path, content-equal]` |
| `src/lib/sandbox/build-events.ts` | lib/sandbox | guess: C43: staging app-builder = lib/ai/app-build-runner.ts + app-builder.ts + e2b tools; zip vibesdk sandbox module (@cf-vibesdk/sdk) - port decision `[dest=same-path, content-equal]` |
| `src/lib/sandbox/client.ts` | lib/sandbox | guess: C43: staging app-builder = lib/ai/app-build-runner.ts + app-builder.ts + e2b tools; zip vibesdk sandbox module (@cf-vibesdk/sdk) - port decision `[dest=same-path, content-equal]` |
| `src/lib/sandbox/inventory.ts` | lib/sandbox | guess: C43: staging app-builder = lib/ai/app-build-runner.ts + app-builder.ts + e2b tools; zip vibesdk sandbox module (@cf-vibesdk/sdk) - port decision `[dest=same-path, content-equal]` |
| `src/lib/sandbox/templates.ts` | lib/sandbox | guess: C43: staging app-builder = lib/ai/app-build-runner.ts + app-builder.ts + e2b tools; zip vibesdk sandbox module (@cf-vibesdk/sdk) - port decision `[dest=same-path, content-equal]` |
| `src/lib/sandbox/vibesdk.ts` | lib/sandbox | guess: C43: staging app-builder = lib/ai/app-build-runner.ts + app-builder.ts + e2b tools; zip vibesdk sandbox module (@cf-vibesdk/sdk) - port decision `[dest=same-path, content-equal]` |
| `src/lib/scheduler/cron-parser.test.ts` | lib/scheduler | guess: zip scheduler subsystem (cron-parser/jobs/leader/outbox-worker); staging equivalent = app/api/scheduled-tasks + lib/inngest functions + 0045/0073 migrations - port decision `[dest=same-path, differs]` |
| `src/lib/scheduler/cron-parser.ts` | lib/scheduler | guess: zip scheduler subsystem (cron-parser/jobs/leader/outbox-worker); staging equivalent = app/api/scheduled-tasks + lib/inngest functions + 0045/0073 migrations - port decision `[dest=same-path, differs]` |
| `src/lib/scheduler/index.ts` | lib/scheduler | guess: zip scheduler subsystem (cron-parser/jobs/leader/outbox-worker); staging equivalent = app/api/scheduled-tasks + lib/inngest functions + 0045/0073 migrations - port decision `[dest=same-path, content-equal]` |
| `src/lib/scheduler/jobs.test.ts` | lib/scheduler | guess: zip scheduler subsystem (cron-parser/jobs/leader/outbox-worker); staging equivalent = app/api/scheduled-tasks + lib/inngest functions + 0045/0073 migrations - port decision `[dest=same-path, differs]` |
| `src/lib/scheduler/jobs.ts` | lib/scheduler | guess: zip scheduler subsystem (cron-parser/jobs/leader/outbox-worker); staging equivalent = app/api/scheduled-tasks + lib/inngest functions + 0045/0073 migrations - port decision `[dest=same-path, differs]` |
| `src/lib/scheduler/leader.test.ts` | lib/scheduler | guess: zip scheduler subsystem (cron-parser/jobs/leader/outbox-worker); staging equivalent = app/api/scheduled-tasks + lib/inngest functions + 0045/0073 migrations - port decision `[dest=same-path, content-equal]` |
| `src/lib/scheduler/leader.ts` | lib/scheduler | guess: zip scheduler subsystem (cron-parser/jobs/leader/outbox-worker); staging equivalent = app/api/scheduled-tasks + lib/inngest functions + 0045/0073 migrations - port decision `[dest=same-path, content-equal]` |
| `src/lib/scheduler/outbox-worker.test.ts` | lib/scheduler | guess: zip scheduler subsystem (cron-parser/jobs/leader/outbox-worker); staging equivalent = app/api/scheduled-tasks + lib/inngest functions + 0045/0073 migrations - port decision `[dest=same-path, content-equal]` |
| `src/lib/scheduler/outbox-worker.ts` | lib/scheduler | guess: zip scheduler subsystem (cron-parser/jobs/leader/outbox-worker); staging equivalent = app/api/scheduled-tasks + lib/inngest functions + 0045/0073 migrations - port decision `[dest=same-path, content-equal]` |
| `src/lib/validations/payment.ts` | lib/validations | guess: staging lib/validations/password.ts + app/api/user/validations.ts; payment schema likely in lib/payments/dodo-config.ts - map `[dest=same-path, content-equal]` |
| `src/lib/validations/user-name.test.ts` | lib/validations | guess: staging lib/validations/password.ts + app/api/user/validations.ts; payment schema likely in lib/payments/dodo-config.ts - map `[dest=same-path, content-equal]` |
| `src/lib/validations/user-name.ts` | lib/validations | guess: staging lib/validations/password.ts + app/api/user/validations.ts; payment schema likely in lib/payments/dodo-config.ts - map `[dest=same-path, content-equal]` |
| `src/types/admin-config.ts` | types | guess: destination admin-config types; staging site-config types differ - verify `[dest=same-path, differs]` |
| `src/worker/index.ts` | worker | guess: destination standalone worker entry (scheduler outbox); staging uses inngest - port decision `[dest=same-path, content-equal]` |

## (c) Family summary (unmatched only)

| family | count |
|---|---|
| lib/ai | 96 |
| components/ui | 56 |
| lib/db | 32 |
| app/(chat) | 25 |
| components/landing | 24 |
| components/admin | 14 |
| app/(public) | 13 |
| components | 11 |
| app/api/connectors | 9 |
| lib/scheduler | 9 |
| components/payments | 7 |
| components/tool-invocation | 7 |
| lib/rag | 7 |
| components/user | 6 |
| lib/sandbox | 5 |
| app/api/admin | 4 |
| app/api/agent | 4 |
| lib | 4 |
| lib/auth | 4 |
| lib/payments | 4 |
| components/auth | 3 |
| hooks/queries | 3 |
| lib/connectors | 3 |
| lib/email | 3 |
| lib/file-storage | 3 |
| lib/validations | 3 |
| app/api/export | 2 |
| app/api/scheduler | 2 |
| app/api/thread | 2 |
| app/api/voice | 2 |
| components/canvas | 2 |
| components/layouts | 2 |
| components/workflow | 2 |
| hooks | 2 |
| lib/admin | 2 |
| lib/chat | 2 |
| lib/community | 2 |
| app/(auth) | 1 |
| app/api/archive | 1 |
| app/api/chat | 1 |
| app/api/cron | 1 |
| app/api/files | 1 |
| app/api/health | 1 |
| app/api/mcp | 1 |
| app/api/sentry-example-api | 1 |
| app/api/user | 1 |
| app/api/workflow | 1 |
| app/apple-touch-icon.webp | 1 |
| app/favicon-16x16.webp | 1 |
| app/favicon-32x32.webp | 1 |
| app/favicon-96x96.png | 1 |
| app/favicon-96x96.webp | 1 |
| app/favicon.svg | 1 |
| app/global-error.tsx | 1 |
| app/page.tsx | 1 |
| app/robots.ts | 1 |
| app/sentry-example-page | 1 |
| app/sitemap.ts | 1 |
| app/web-app-manifest-192x192.png | 1 |
| app/web-app-manifest-192x192.webp | 1 |
| app/web-app-manifest-512x512.png | 1 |
| app/web-app-manifest-512x512.webp | 1 |
| components/chat | 1 |
| components/gallery | 1 |
| components/pwa | 1 |
| components/sandbox | 1 |
| lib/cache | 1 |
| lib/rate-limit | 1 |
| types | 1 |
| worker | 1 |

## Basename matches (129)

zip-main path -> staging path (found under a different path; identical-path matches are not listed here).

| zip-main path | staging path | basis |
|---|---|---|
| `src/app/(chat)/(admin)/admin/settings/community/page.tsx` | `src/app/(chat)/community/page.tsx` | parent-dir match |
| `src/app/(chat)/(admin)/admin/settings/email/page.tsx` | `src/app/(auth)/sign-up/email/page.tsx` | parent-dir match |
| `src/app/(chat)/(admin)/admin/settings/mcp/page.tsx` | `src/app/(chat)/mcp/page.tsx` | parent-dir match |
| `src/app/(chat)/(admin)/admin/settings/payments/page.tsx` | `src/app/(chat)/admin/payments/page.tsx` | parent-dir match |
| `src/app/(chat)/(admin)/admin/settings/security/page.tsx` | `src/app/(chat)/admin/security/page.tsx` | parent-dir match |
| `src/app/(chat)/(admin)/admin/users/[id]/loading.tsx` | `src/app/(chat)/agent/[id]/loading.tsx` | parent-dir match |
| `src/app/(chat)/(admin)/admin/users/[id]/page.tsx` | `src/app/(chat)/agent/[id]/page.tsx` | parent-dir match |
| `src/app/(chat)/archive/[id]/page.tsx` | `src/app/(chat)/agent/[id]/page.tsx` | parent-dir match |
| `src/app/(chat)/canvas/[canvasId]/page.tsx` | `src/app/(chat)/ecanvas/[canvasId]/page.tsx` | parent-dir match |
| `src/app/(chat)/settings/connectors/page.tsx` | `src/app/(chat)/connectors/page.tsx` | parent-dir match |
| `src/app/(chat)/swr-config.tsx` | `src/components/layouts/swr-config.tsx` | unique basename |
| `src/app/(public)/canvas/export/[id]/page.tsx` | `src/app/(public)/ecanvas/export/[id]/page.tsx` | parent-dir match |
| `src/app/api/admin/config/route.ts` | `src/app/api/user/local-models/config/route.ts` | parent-dir match |
| `src/app/api/admin/tools/route.ts` | `src/app/api/projects/[id]/tools/route.ts` | parent-dir match |
| `src/app/api/agent/[id]/install/route.test.ts` | `src/app/api/mcp/[id]/install/route.test.ts` | parent-dir match |
| `src/app/api/agent/[id]/install/route.ts` | `src/app/api/mcp/[id]/install/route.ts` | parent-dir match |
| `src/app/api/agent/installed/route.test.ts` | `src/app/api/mcp/installed/route.test.ts` | parent-dir match |
| `src/app/api/agent/installed/route.ts` | `src/app/api/mcp/installed/route.ts` | parent-dir match |
| `src/app/api/build/[id]/stream/route.ts` | `src/app/api/chat/[id]/stream/route.ts` | parent-dir match |
| `src/app/api/build/agents/route.ts` | `src/app/api/projects/[id]/agents/route.ts` | parent-dir match |
| `src/app/api/canvas/ppt/export/route.ts` | `src/app/api/chat/export/route.ts` | parent-dir match |
| `src/app/api/connectors/[provider]/disconnect/route.ts` | `src/app/api/connections/disconnect/route.ts` | parent-dir match |
| `src/app/api/connectors/[provider]/pause/route.ts` | `src/app/api/sandbox/[sbxId]/pause/route.ts` | parent-dir match |
| `src/app/api/connectors/[provider]/resume/route.ts` | `src/app/api/build/[id]/resume/route.ts` | parent-dir match |
| `src/app/api/connectors/airtable/authorize/route.ts` | `src/app/api/connectors/[provider]/authorize/route.ts` | parent-dir match |
| `src/app/api/connectors/airtable/callback/route.ts` | `src/app/api/connectors/[provider]/callback/route.ts` | parent-dir match |
| `src/app/api/connectors/asana/authorize/route.ts` | `src/app/api/connectors/[provider]/authorize/route.ts` | parent-dir match |
| `src/app/api/connectors/asana/callback/route.ts` | `src/app/api/connectors/[provider]/callback/route.ts` | parent-dir match |
| `src/app/api/connectors/bitbucket/authorize/route.ts` | `src/app/api/connectors/[provider]/authorize/route.ts` | parent-dir match |
| `src/app/api/connectors/bitbucket/callback/route.ts` | `src/app/api/connectors/[provider]/callback/route.ts` | parent-dir match |
| `src/app/api/connectors/clickup/authorize/route.ts` | `src/app/api/connectors/[provider]/authorize/route.ts` | parent-dir match |
| `src/app/api/connectors/clickup/callback/route.ts` | `src/app/api/connectors/[provider]/callback/route.ts` | parent-dir match |
| `src/app/api/connectors/coda/authorize/route.ts` | `src/app/api/connectors/[provider]/authorize/route.ts` | parent-dir match |
| `src/app/api/connectors/coda/callback/route.ts` | `src/app/api/connectors/[provider]/callback/route.ts` | parent-dir match |
| `src/app/api/connectors/confluence/authorize/route.ts` | `src/app/api/connectors/[provider]/authorize/route.ts` | parent-dir match |
| `src/app/api/connectors/confluence/callback/route.ts` | `src/app/api/connectors/[provider]/callback/route.ts` | parent-dir match |
| `src/app/api/connectors/discord/authorize/route.ts` | `src/app/api/connectors/[provider]/authorize/route.ts` | parent-dir match |
| `src/app/api/connectors/discord/callback/route.ts` | `src/app/api/connectors/[provider]/callback/route.ts` | parent-dir match |
| `src/app/api/connectors/dropbox/authorize/route.ts` | `src/app/api/connectors/[provider]/authorize/route.ts` | parent-dir match |
| `src/app/api/connectors/dropbox/callback/route.ts` | `src/app/api/connectors/[provider]/callback/route.ts` | parent-dir match |
| `src/app/api/connectors/egnyte/authorize/route.ts` | `src/app/api/connectors/[provider]/authorize/route.ts` | parent-dir match |
| `src/app/api/connectors/egnyte/callback/route.ts` | `src/app/api/connectors/[provider]/callback/route.ts` | parent-dir match |
| `src/app/api/connectors/freshdesk/authorize/route.ts` | `src/app/api/connectors/[provider]/authorize/route.ts` | parent-dir match |
| `src/app/api/connectors/freshdesk/callback/route.ts` | `src/app/api/connectors/[provider]/callback/route.ts` | parent-dir match |
| `src/app/api/connectors/github/authorize/route.ts` | `src/app/api/connectors/[provider]/authorize/route.ts` | parent-dir match |
| `src/app/api/connectors/github/callback/route.ts` | `src/app/api/connectors/[provider]/callback/route.ts` | parent-dir match |
| `src/app/api/connectors/github/disconnect/route.ts` | `src/app/api/connections/disconnect/route.ts` | parent-dir match |
| `src/app/api/connectors/gitlab/authorize/route.ts` | `src/app/api/connectors/[provider]/authorize/route.ts` | parent-dir match |
| `src/app/api/connectors/gitlab/callback/route.ts` | `src/app/api/connectors/[provider]/callback/route.ts` | parent-dir match |
| `src/app/api/connectors/gmail/authorize/route.ts` | `src/app/api/connectors/[provider]/authorize/route.ts` | parent-dir match |
| `src/app/api/connectors/gmail/callback/route.ts` | `src/app/api/connectors/[provider]/callback/route.ts` | parent-dir match |
| `src/app/api/connectors/gmail/disconnect/route.ts` | `src/app/api/connections/disconnect/route.ts` | parent-dir match |
| `src/app/api/connectors/gong/authorize/route.ts` | `src/app/api/connectors/[provider]/authorize/route.ts` | parent-dir match |
| `src/app/api/connectors/gong/callback/route.ts` | `src/app/api/connectors/[provider]/callback/route.ts` | parent-dir match |
| `src/app/api/connectors/google-calendar/authorize/route.ts` | `src/app/api/connectors/[provider]/authorize/route.ts` | parent-dir match |
| `src/app/api/connectors/google-calendar/callback/route.ts` | `src/app/api/connectors/[provider]/callback/route.ts` | parent-dir match |
| `src/app/api/connectors/google-calendar/disconnect/route.ts` | `src/app/api/connections/disconnect/route.ts` | parent-dir match |
| `src/app/api/connectors/google-docs/authorize/route.ts` | `src/app/api/connectors/[provider]/authorize/route.ts` | parent-dir match |
| `src/app/api/connectors/google-docs/callback/route.ts` | `src/app/api/connectors/[provider]/callback/route.ts` | parent-dir match |
| `src/app/api/connectors/google-drive/authorize/route.ts` | `src/app/api/connectors/[provider]/authorize/route.ts` | parent-dir match |
| `src/app/api/connectors/google-drive/callback/route.ts` | `src/app/api/connectors/[provider]/callback/route.ts` | parent-dir match |
| `src/app/api/connectors/google-drive/disconnect/route.ts` | `src/app/api/connections/disconnect/route.ts` | parent-dir match |
| `src/app/api/connectors/google-forms/authorize/route.ts` | `src/app/api/connectors/[provider]/authorize/route.ts` | parent-dir match |
| `src/app/api/connectors/google-forms/callback/route.ts` | `src/app/api/connectors/[provider]/callback/route.ts` | parent-dir match |
| `src/app/api/connectors/google-keep/authorize/route.ts` | `src/app/api/connectors/[provider]/authorize/route.ts` | parent-dir match |
| `src/app/api/connectors/google-keep/callback/route.ts` | `src/app/api/connectors/[provider]/callback/route.ts` | parent-dir match |
| `src/app/api/connectors/google-meet/authorize/route.ts` | `src/app/api/connectors/[provider]/authorize/route.ts` | parent-dir match |
| `src/app/api/connectors/google-meet/callback/route.ts` | `src/app/api/connectors/[provider]/callback/route.ts` | parent-dir match |
| `src/app/api/connectors/google-sheets/authorize/route.ts` | `src/app/api/connectors/[provider]/authorize/route.ts` | parent-dir match |
| `src/app/api/connectors/google-sheets/callback/route.ts` | `src/app/api/connectors/[provider]/callback/route.ts` | parent-dir match |
| `src/app/api/connectors/google-slides/authorize/route.ts` | `src/app/api/connectors/[provider]/authorize/route.ts` | parent-dir match |
| `src/app/api/connectors/google-slides/callback/route.ts` | `src/app/api/connectors/[provider]/callback/route.ts` | parent-dir match |
| `src/app/api/connectors/google-tasks/authorize/route.ts` | `src/app/api/connectors/[provider]/authorize/route.ts` | parent-dir match |
| `src/app/api/connectors/google-tasks/callback/route.ts` | `src/app/api/connectors/[provider]/callback/route.ts` | parent-dir match |
| `src/app/api/connectors/guru/authorize/route.ts` | `src/app/api/connectors/[provider]/authorize/route.ts` | parent-dir match |
| `src/app/api/connectors/guru/callback/route.ts` | `src/app/api/connectors/[provider]/callback/route.ts` | parent-dir match |
| `src/app/api/connectors/highspot/authorize/route.ts` | `src/app/api/connectors/[provider]/authorize/route.ts` | parent-dir match |
| `src/app/api/connectors/highspot/callback/route.ts` | `src/app/api/connectors/[provider]/callback/route.ts` | parent-dir match |
| `src/app/api/connectors/hubspot/authorize/route.ts` | `src/app/api/connectors/[provider]/authorize/route.ts` | parent-dir match |
| `src/app/api/connectors/hubspot/callback/route.ts` | `src/app/api/connectors/[provider]/callback/route.ts` | parent-dir match |
| `src/app/api/connectors/jira/authorize/route.ts` | `src/app/api/connectors/[provider]/authorize/route.ts` | parent-dir match |
| `src/app/api/connectors/jira/callback/route.ts` | `src/app/api/connectors/[provider]/callback/route.ts` | parent-dir match |
| `src/app/api/connectors/linear/authorize/route.ts` | `src/app/api/connectors/[provider]/authorize/route.ts` | parent-dir match |
| `src/app/api/connectors/linear/callback/route.ts` | `src/app/api/connectors/[provider]/callback/route.ts` | parent-dir match |
| `src/app/api/connectors/notion/authorize/route.ts` | `src/app/api/connectors/[provider]/authorize/route.ts` | parent-dir match |
| `src/app/api/connectors/notion/callback/route.ts` | `src/app/api/connectors/[provider]/callback/route.ts` | parent-dir match |
| `src/app/api/connectors/notion/disconnect/route.ts` | `src/app/api/connections/disconnect/route.ts` | parent-dir match |
| `src/app/api/connectors/outline/authorize/route.ts` | `src/app/api/connectors/[provider]/authorize/route.ts` | parent-dir match |
| `src/app/api/connectors/outline/callback/route.ts` | `src/app/api/connectors/[provider]/callback/route.ts` | parent-dir match |
| `src/app/api/connectors/outlook/authorize/route.ts` | `src/app/api/connectors/[provider]/authorize/route.ts` | parent-dir match |
| `src/app/api/connectors/outlook/callback/route.ts` | `src/app/api/connectors/[provider]/callback/route.ts` | parent-dir match |
| `src/app/api/connectors/outlook/disconnect/route.ts` | `src/app/api/connections/disconnect/route.ts` | parent-dir match |
| `src/app/api/connectors/productboard/authorize/route.ts` | `src/app/api/connectors/[provider]/authorize/route.ts` | parent-dir match |
| `src/app/api/connectors/productboard/callback/route.ts` | `src/app/api/connectors/[provider]/callback/route.ts` | parent-dir match |
| `src/app/api/connectors/salesforce/authorize/route.ts` | `src/app/api/connectors/[provider]/authorize/route.ts` | parent-dir match |
| `src/app/api/connectors/salesforce/callback/route.ts` | `src/app/api/connectors/[provider]/callback/route.ts` | parent-dir match |
| `src/app/api/connectors/slab/authorize/route.ts` | `src/app/api/connectors/[provider]/authorize/route.ts` | parent-dir match |
| `src/app/api/connectors/slab/callback/route.ts` | `src/app/api/connectors/[provider]/callback/route.ts` | parent-dir match |
| `src/app/api/connectors/slack/authorize/route.ts` | `src/app/api/connectors/[provider]/authorize/route.ts` | parent-dir match |
| `src/app/api/connectors/slack/callback/route.ts` | `src/app/api/connectors/[provider]/callback/route.ts` | parent-dir match |
| `src/app/api/connectors/slack/disconnect/route.ts` | `src/app/api/connections/disconnect/route.ts` | parent-dir match |
| `src/app/api/connectors/teams/authorize/route.ts` | `src/app/api/connectors/[provider]/authorize/route.ts` | parent-dir match |
| `src/app/api/connectors/teams/callback/route.ts` | `src/app/api/connectors/[provider]/callback/route.ts` | parent-dir match |
| `src/app/api/connectors/youtube/authorize/route.ts` | `src/app/api/connectors/[provider]/authorize/route.ts` | parent-dir match |
| `src/app/api/connectors/youtube/callback/route.ts` | `src/app/api/connectors/[provider]/callback/route.ts` | parent-dir match |
| `src/app/api/connectors/zendesk/authorize/route.ts` | `src/app/api/connectors/[provider]/authorize/route.ts` | parent-dir match |
| `src/app/api/connectors/zendesk/callback/route.ts` | `src/app/api/connectors/[provider]/callback/route.ts` | parent-dir match |
| `src/app/api/images/edit/route.ts` | `src/app/api/documents/[id]/edit/route.ts` | parent-dir match |
| `src/app/api/sandbox/[id]/route.ts` | `src/app/api/agent/[id]/route.ts` | parent-dir match |
| `src/app/api/skills/generate/route.ts` | `src/app/api/ecanvas/[canvasId]/generate/route.ts` | parent-dir match |
| `src/app/api/stripe/checkout/route.ts` | `src/app/api/payments/dodo/checkout/route.ts` | parent-dir match |
| `src/app/api/stripe/portal/route.ts` | `src/app/api/payments/dodo/portal/route.ts` | parent-dir match |
| `src/app/api/stripe/webhook/route.test.ts` | `src/app/api/payments/dodo/webhook/route.test.ts` | parent-dir match |
| `src/app/api/stripe/webhook/route.ts` | `src/app/api/payments/dodo/webhook/route.ts` | parent-dir match |
| `src/app/api/user/usage/route.ts` | `src/app/api/api-key/[id]/usage/route.ts` | parent-dir match |
| `src/app/api/voice/groq-konvo/chat/route.ts` | `src/app/api/chat/route.ts` | parent-dir match |
| `src/app/api/voice/groq-konvo/session/route.ts` | `src/app/api/embed/session/route.ts` | parent-dir match |
| `src/app/api/voice/kimi-elevenlabs/session/route.ts` | `src/app/api/embed/session/route.ts` | parent-dir match |
| `src/app/gallery/agents/page.tsx` | `src/app/(chat)/agents/page.tsx` | parent-dir match |
| `src/components/agents-list.tsx` | `src/components/agent/agents-list.tsx` | unique basename |
| `src/components/archive-dialog.tsx` | `src/components/archives/archive-dialog.tsx` | unique basename |
| `src/components/landing/ui/button.tsx` | `src/components/ui/button.tsx` | dir-suffix 1 |
| `src/lib/ai/tools/toolkit-catalog.ts` | `src/lib/composio/toolkit-catalog.ts` | unique basename |
| `src/lib/payments/stripe.ts` | `src/lib/cockpit/providers/stripe.ts` | unique basename |
| `src/lib/rag/ingest.ts` | `src/lib/ai/rag/ingest.ts` | dir-suffix 1 |
| `src/lib/sandbox/agents.ts` | `src/lib/navigator-tools/tools/agents.ts` | unique basename |
| `src/lib/sandbox/runner.ts` | `src/lib/scheduled-tasks/runner.ts` | unique basename |
| `src/lib/sandbox/session.ts` | `src/lib/kernel/session.ts` | unique basename |
| `src/lib/scheduler/worker.ts` | `src/lib/code-runner/worker.ts` | unique basename |

## Appendix A: same-path DIFFERENT files (366)

Same path exists in staging but content differs (after EOL normalization) - the main porting-diff surface. Grouped by family.

### app/(auth) (4)

- `src/app/(auth)/layout.tsx`
- `src/app/(auth)/sign-in/page.tsx`
- `src/app/(auth)/sign-up/email/page.tsx`
- `src/app/(auth)/sign-up/page.tsx`
### app/(chat) (16)

- `src/app/(chat)/agent/[id]/page.tsx`
- `src/app/(chat)/agents/page.tsx`
- `src/app/(chat)/build/[id]/page.tsx`
- `src/app/(chat)/build/page.tsx`
- `src/app/(chat)/chat/[thread]/page.tsx`
- `src/app/(chat)/community/page.tsx`
- `src/app/(chat)/ecanvas/[canvasId]/page.tsx`
- `src/app/(chat)/ecanvas/page.tsx`
- `src/app/(chat)/knowledge/[id]/page.tsx`
- `src/app/(chat)/knowledge/page.tsx`
- `src/app/(chat)/layout.tsx`
- `src/app/(chat)/mcp/modify/[id]/page.tsx`
- `src/app/(chat)/mcp/page.tsx`
- `src/app/(chat)/mcp/test/[id]/page.tsx`
- `src/app/(chat)/workflow/[id]/page.tsx`
- `src/app/(chat)/workflow/page.tsx`
### app/(public) (2)

- `src/app/(public)/ecanvas/export/[id]/page.tsx`
- `src/app/(public)/export/[id]/page.tsx`
### app/api/admin (5)

- `src/app/api/admin/actions.ts`
- `src/app/api/admin/payments/dodo/route.ts`
- `src/app/api/admin/providers/discover/route.ts`
- `src/app/api/admin/providers/route.ts`
- `src/app/api/admin/providers/test/route.ts`
### app/api/agent (3)

- `src/app/api/agent/[id]/route.ts`
- `src/app/api/agent/ai/route.ts`
- `src/app/api/agent/route.ts`
### app/api/archive (4)

- `src/app/api/archive/[id]/items/[itemId]/route.ts`
- `src/app/api/archive/[id]/items/route.ts`
- `src/app/api/archive/[id]/route.ts`
- `src/app/api/archive/route.ts`
### app/api/auth (2)

- `src/app/api/auth/[...all]/route.ts`
- `src/app/api/auth/actions.ts`
### app/api/bookmark (1)

- `src/app/api/bookmark/route.ts`
### app/api/bug-bounty (4)

- `src/app/api/bug-bounty/program/route.ts`
- `src/app/api/bug-bounty/reports/[id]/comments/route.ts`
- `src/app/api/bug-bounty/reports/[id]/route.ts`
- `src/app/api/bug-bounty/reports/route.ts`
### app/api/build (4)

- `src/app/api/build/[id]/resume/route.ts`
- `src/app/api/build/[id]/route.ts`
- `src/app/api/build/clarify/route.ts`
- `src/app/api/build/route.ts`
### app/api/chat (9)

- `src/app/api/chat/actions.ts`
- `src/app/api/chat/challenge/route.ts`
- `src/app/api/chat/export/route.ts`
- `src/app/api/chat/models/route.ts`
- `src/app/api/chat/openai-realtime/route.ts`
- `src/app/api/chat/route.ts`
- `src/app/api/chat/shared.chat.ts`
- `src/app/api/chat/temporary/route.ts`
- `src/app/api/chat/title/route.ts`
### app/api/collections (3)

- `src/app/api/collections/[id]/items/route.ts`
- `src/app/api/collections/[id]/route.ts`
- `src/app/api/collections/route.ts`
### app/api/community (5)

- `src/app/api/community/feed/route.ts`
- `src/app/api/community/media/route.ts`
- `src/app/api/community/posts/[id]/reactions/route.ts`
- `src/app/api/community/posts/route.ts`
- `src/app/api/community/stream/route.ts`
### app/api/connectors (1)

- `src/app/api/connectors/route.ts`
### app/api/ecanvas (5)

- `src/app/api/ecanvas/[canvasId]/content/route.ts`
- `src/app/api/ecanvas/[canvasId]/generate/route.ts`
- `src/app/api/ecanvas/export/[id]/route.ts`
- `src/app/api/ecanvas/export/[id]/zip/route.ts`
- `src/app/api/ecanvas/export/route.ts`
### app/api/embed (2)

- `src/app/api/embed/session/route.test.ts`
- `src/app/api/embed/session/route.ts`
### app/api/export (4)

- `src/app/api/export/[id]/comments/[commentId]/route.ts`
- `src/app/api/export/[id]/comments/route.ts`
- `src/app/api/export/[id]/route.ts`
- `src/app/api/export/route.ts`
### app/api/inbound (1)

- `src/app/api/inbound/[token]/route.ts`
### app/api/mcp (14)

- `src/app/api/mcp/[id]/install/route.test.ts`
- `src/app/api/mcp/[id]/install/route.ts`
- `src/app/api/mcp/[id]/route.ts`
- `src/app/api/mcp/actions.ts`
- `src/app/api/mcp/curated/route.test.ts`
- `src/app/api/mcp/curated/route.ts`
- `src/app/api/mcp/installed/route.test.ts`
- `src/app/api/mcp/installed/route.ts`
- `src/app/api/mcp/list/route.ts`
- `src/app/api/mcp/oauth/callback/route.ts`
- `src/app/api/mcp/route.ts`
- `src/app/api/mcp/server-customizations/[server]/route.ts`
- `src/app/api/mcp/tool-customizations/[server]/[tool]/route.ts`
- `src/app/api/mcp/tool-customizations/[server]/route.ts`
### app/api/n8n (1)

- `src/app/api/n8n/embed/[id]/route.ts`
### app/api/payments (4)

- `src/app/api/payments/dodo/checkout/route.ts`
- `src/app/api/payments/dodo/reconcile/route.ts`
- `src/app/api/payments/dodo/subscription/route.ts`
- `src/app/api/payments/dodo/webhook/route.ts`
### app/api/sandbox (1)

- `src/app/api/sandbox/route.ts`
### app/api/skills (1)

- `src/app/api/skills/route.ts`
### app/api/storage (5)

- `src/app/api/storage/actions.test.ts`
- `src/app/api/storage/actions.ts`
- `src/app/api/storage/ingest/route.ts`
- `src/app/api/storage/upload-url/route.ts`
- `src/app/api/storage/upload/route.ts`
### app/api/thread (2)

- `src/app/api/thread/[id]/insights/route.ts`
- `src/app/api/thread/route.ts`
### app/api/user (7)

- `src/app/api/user/actions.ts`
- `src/app/api/user/details/[id]/route.ts`
- `src/app/api/user/details/route.ts`
- `src/app/api/user/notes/route.ts`
- `src/app/api/user/preferences/route.ts`
- `src/app/api/user/validations.test.ts`
- `src/app/api/user/validations.ts`
### app/api/v1 (1)

- `src/app/api/v1/threads/[id]/messages/route.ts`
### app/api/workflow (5)

- `src/app/api/workflow/[id]/execute/route.ts`
- `src/app/api/workflow/[id]/route.ts`
- `src/app/api/workflow/[id]/structure/route.ts`
- `src/app/api/workflow/route.ts`
- `src/app/api/workflow/tools/route.ts`
### app/apple-touch-icon.png (1)

- `src/app/apple-touch-icon.png`
### app/bug-bounty (3)

- `src/app/bug-bounty/reports/[id]/page.tsx`
- `src/app/bug-bounty/reports/page.tsx`
- `src/app/bug-bounty/submit/page.tsx`
### app/favicon-16x16.png (1)

- `src/app/favicon-16x16.png`
### app/favicon-32x32.png (1)

- `src/app/favicon-32x32.png`
### app/favicon.ico (1)

- `src/app/favicon.ico`
### app/globals.css (1)

- `src/app/globals.css`
### app/layout.tsx (1)

- `src/app/layout.tsx`
### app/marketplace (1)

- `src/app/marketplace/mcp/page.tsx`
### app/store (1)

- `src/app/store/index.ts`
### components (20)

- `src/components/chat-bot-temporary.tsx`
- `src/components/chat-bot-voice.tsx`
- `src/components/chat-bot.tsx`
- `src/components/chat-mention-input.tsx`
- `src/components/chat-preferences-content.tsx`
- `src/components/chat-preferences-popup.tsx`
- `src/components/edit-json-schema-field-popup.tsx`
- `src/components/markdown.tsx`
- `src/components/mcp-dashboard.tsx`
- `src/components/mcp-editor.tsx`
- `src/components/mcp-marketplace.tsx`
- `src/components/mention-input.tsx`
- `src/components/message.tsx`
- `src/components/pre-block.tsx`
- `src/components/prompt-input.tsx`
- `src/components/select-model.tsx`
- `src/components/shareable-card.tsx`
- `src/components/thread-dropdown.tsx`
- `src/components/tool-mode-dropdown.tsx`
- `src/components/tool-select-dropdown.tsx`
### components/agent (4)

- `src/components/agent/agent-dropdown.tsx`
- `src/components/agent/agent-tool-selector.tsx`
- `src/components/agent/agents-list.tsx`
- `src/components/agent/edit-agent.tsx`
### components/auth (4)

- `src/components/auth/auth-intro-decoration.tsx`
- `src/components/auth/email-sign-up.tsx`
- `src/components/auth/sign-in.tsx`
- `src/components/auth/sign-up.tsx`
### components/build (2)

- `src/components/build/build-dashboard.tsx`
- `src/components/build/build-detail.tsx`
### components/canvas (7)

- `src/components/canvas/ecanvas/App.tsx`
- `src/components/canvas/ecanvas/components/FramePicker.tsx`
- `src/components/canvas/ecanvas/components/Preview.tsx`
- `src/components/canvas/ecanvas/components/ProviderModal.tsx`
- `src/components/canvas/ecanvas/components/StreamOverlay.tsx`
- `src/components/canvas/ecanvas/lib/export.ts`
- `src/components/canvas/ecanvas/lib/providers.ts`
### components/chat (1)

- `src/components/chat/thread-insights-panel.tsx`
### components/export (2)

- `src/components/export/chat-export-popup.tsx`
- `src/components/export/chat-preview.tsx`
### components/layouts (9)

- `src/components/layouts/app-header.tsx`
- `src/components/layouts/app-popup-provider.tsx`
- `src/components/layouts/app-sidebar-menu-admin.tsx`
- `src/components/layouts/app-sidebar-menus.tsx`
- `src/components/layouts/app-sidebar-threads.tsx`
- `src/components/layouts/app-sidebar-user.tsx`
- `src/components/layouts/app-sidebar.tsx`
- `src/components/layouts/sidebar-header.tsx`
- `src/components/layouts/theme-provider.tsx`
### components/marketplace (1)

- `src/components/marketplace/my-installs-panel.tsx`
### components/tool-invocation (8)

- `src/components/tool-invocation/bar-chart.tsx`
- `src/components/tool-invocation/code-executor.tsx`
- `src/components/tool-invocation/image-generator.tsx`
- `src/components/tool-invocation/line-chart.tsx`
- `src/components/tool-invocation/pie-chart.tsx`
- `src/components/tool-invocation/shared.tool-invocation.ts`
- `src/components/tool-invocation/web-search.tsx`
- `src/components/tool-invocation/workflow-invocation.tsx`
### components/ui (10)

- `src/components/ui/accordion.tsx`
- `src/components/ui/button.tsx`
- `src/components/ui/chart.tsx`
- `src/components/ui/CodeBlock.tsx`
- `src/components/ui/dialog.tsx`
- `src/components/ui/dropdown-menu.tsx`
- `src/components/ui/input.tsx`
- `src/components/ui/popover.tsx`
- `src/components/ui/sonner.tsx`
- `src/components/ui/switch.tsx`
### components/user (12)

- `src/components/user/user-detail/default-avatar-dialog.tsx`
- `src/components/user/user-detail/generate-avatar-dialog.tsx`
- `src/components/user/user-detail/memory-settings-card.tsx`
- `src/components/user/user-detail/user-avatar-upload.tsx`
- `src/components/user/user-detail/user-delete-dialog.tsx`
- `src/components/user/user-detail/user-detail-form-card.tsx`
- `src/components/user/user-detail/user-detail.tsx`
- `src/components/user/user-detail/user-role-selection-dialog.tsx`
- `src/components/user/user-detail/user-settings-popup.tsx`
- `src/components/user/user-detail/user-statistics-card.tsx`
- `src/components/user/user-detail/user-status-badge.tsx`
- `src/components/user/user-detail/user-update-password-dialog.tsx`
### components/workflow (6)

- `src/components/workflow/edit-workflow-popup.tsx`
- `src/components/workflow/n8n-workflow-embed.tsx`
- `src/components/workflow/node-config/execute-tab.tsx`
- `src/components/workflow/node-config/tool-node-config.tsx`
- `src/components/workflow/workflow-panel.tsx`
- `src/components/workflow/workflow.tsx`
### hooks (3)

- `src/hooks/use-presigned-upload.ts`
- `src/hooks/use-theme-style.tsx`
- `src/hooks/use-thread-file-uploader.ts`
### hooks/queries (4)

- `src/hooks/queries/use-chat-models.ts`
- `src/hooks/queries/use-collections.ts`
- `src/hooks/queries/use-generate-thread-title.ts`
- `src/hooks/queries/use-mcp-list.ts`
### instrumentation-client.ts (1)

- `src/instrumentation-client.ts`
### instrumentation.ts (1)

- `src/instrumentation.ts`
### lib (9)

- `src/lib/const.ts`
- `src/lib/equal.ts`
- `src/lib/errors.ts`
- `src/lib/load-env.ts`
- `src/lib/logger.ts`
- `src/lib/notes.ts`
- `src/lib/tag.ts`
- `src/lib/utils.test.ts`
- `src/lib/utils.ts`
### lib/admin (2)

- `src/lib/admin/server.test.ts`
- `src/lib/admin/server.ts`
### lib/ai (56)

- `src/lib/ai/create-openai-compatiable.test.ts`
- `src/lib/ai/create-openai-compatiable.ts`
- `src/lib/ai/file-support.test.ts`
- `src/lib/ai/file-support.ts`
- `src/lib/ai/image/generate-image.ts`
- `src/lib/ai/mcp/config-path.ts`
- `src/lib/ai/mcp/create-mcp-client.ts`
- `src/lib/ai/mcp/create-mcp-clients-manager.test.ts`
- `src/lib/ai/mcp/create-mcp-clients-manager.ts`
- `src/lib/ai/mcp/db-mcp-config-storage.test.ts`
- `src/lib/ai/mcp/db-mcp-config-storage.ts`
- `src/lib/ai/mcp/fb-mcp-config-storage.ts`
- `src/lib/ai/mcp/is-mcp-config.ts`
- `src/lib/ai/mcp/mcp-manager.ts`
- `src/lib/ai/mcp/mcp-tool-id.ts`
- `src/lib/ai/mcp/memory-mcp-config-storage.ts`
- `src/lib/ai/mcp/pg-oauth-provider.ts`
- `src/lib/ai/models.test.ts`
- `src/lib/ai/models.ts`
- `src/lib/ai/prompts.test.ts`
- `src/lib/ai/prompts.ts`
- `src/lib/ai/speech/index.ts`
- `src/lib/ai/speech/open-ai/use-voice-chat.openai.ts`
- `src/lib/ai/tools/build/build-tool.ts`
- `src/lib/ai/tools/code/js-run-tool.ts`
- `src/lib/ai/tools/code/python-run-tool.ts`
- `src/lib/ai/tools/connectors/asana-tool.ts`
- `src/lib/ai/tools/connectors/calendar-tool.ts`
- `src/lib/ai/tools/connectors/clickup-tool.ts`
- `src/lib/ai/tools/connectors/connectors-list-tool.ts`
- `src/lib/ai/tools/connectors/drive-tool.ts`
- `src/lib/ai/tools/connectors/freshdesk-tool.ts`
- `src/lib/ai/tools/connectors/github-tool.ts`
- `src/lib/ai/tools/connectors/gmail-tool.ts`
- `src/lib/ai/tools/connectors/jira-tool.ts`
- `src/lib/ai/tools/connectors/linear-tool.ts`
- `src/lib/ai/tools/connectors/notion-tool.ts`
- `src/lib/ai/tools/connectors/outlook-tool.ts`
- `src/lib/ai/tools/connectors/productboard-tool.ts`
- `src/lib/ai/tools/connectors/slack-tool.ts`
- `src/lib/ai/tools/connectors/teams-tool.ts`
- `src/lib/ai/tools/connectors/zendesk-tool.ts`
- `src/lib/ai/tools/connectors/zulip-tool.ts`
- `src/lib/ai/tools/http/fetch.ts`
- `src/lib/ai/tools/image/index.ts`
- `src/lib/ai/tools/index.ts`
- `src/lib/ai/tools/tool-kit.ts`
- `src/lib/ai/tools/visualization/create-bar-chart.ts`
- `src/lib/ai/tools/visualization/create-line-chart.ts`
- `src/lib/ai/tools/visualization/create-pie-chart.ts`
- `src/lib/ai/tools/web/web-search.ts`
- `src/lib/ai/workflow/executor/graph-store.ts`
- `src/lib/ai/workflow/executor/node-executor.ts`
- `src/lib/ai/workflow/executor/workflow-executor.test.ts`
- `src/lib/ai/workflow/executor/workflow-executor.ts`
- `src/lib/ai/workflow/shared.workflow.ts`
### lib/auth (8)

- `src/lib/auth/api-key.ts`
- `src/lib/auth/auth-instance.ts`
- `src/lib/auth/client-permissions.ts`
- `src/lib/auth/client.ts`
- `src/lib/auth/config.ts`
- `src/lib/auth/permissions.test.ts`
- `src/lib/auth/permissions.ts`
- `src/lib/auth/server.ts`
### lib/cache (6)

- `src/lib/cache/cache-keys.ts`
- `src/lib/cache/cache.interface.ts`
- `src/lib/cache/memory-cache.ts`
- `src/lib/cache/redis-cache.ts`
- `src/lib/cache/safe-redis-cache.ts`
- `src/lib/cache/upstash-rest-cache.ts`
### lib/code-runner (2)

- `src/lib/code-runner/call-worker.ts`
- `src/lib/code-runner/code-runner.interface.ts`
### lib/connectors (1)

- `src/lib/connectors/providers-list.ts`
### lib/db (19)

- `src/lib/db/migrations/pg/meta/_journal.json`
- `src/lib/db/pg/db.pg.ts`
- `src/lib/db/pg/migrate.pg.ts`
- `src/lib/db/pg/repositories/agent-install-repository.pg.ts`
- `src/lib/db/pg/repositories/agent-repository.pg.ts`
- `src/lib/db/pg/repositories/api-key-repository.pg.ts`
- `src/lib/db/pg/repositories/canvas-export-repository.pg.ts`
- `src/lib/db/pg/repositories/chat-export-repository.pg.ts`
- `src/lib/db/pg/repositories/chat-repository.pg.ts`
- `src/lib/db/pg/repositories/dodo-payments-repository.pg.ts`
- `src/lib/db/pg/repositories/mcp-install-repository.pg.ts`
- `src/lib/db/pg/repositories/mcp-oauth-repository.pg.ts`
- `src/lib/db/pg/repositories/mcp-repository.pg.ts`
- `src/lib/db/pg/repositories/n8n-user-repository.pg.ts`
- `src/lib/db/pg/repositories/site-config-repository.pg.ts`
- `src/lib/db/pg/repositories/user-repository.pg.ts`
- `src/lib/db/pg/repositories/workflow-repository.pg.ts`
- `src/lib/db/pg/schema.pg.ts`
- `src/lib/db/repository.ts`
### lib/ecanvas (1)

- `src/lib/ecanvas/content-store.ts`
### lib/file-ingest (2)

- `src/lib/file-ingest/csv.test.ts`
- `src/lib/file-ingest/csv.ts`
### lib/file-storage (5)

- `src/lib/file-storage/file-storage.interface.ts`
- `src/lib/file-storage/index.ts`
- `src/lib/file-storage/s3-file-storage.test.ts`
- `src/lib/file-storage/s3-file-storage.ts`
- `src/lib/file-storage/storage-utils.ts`
### lib/inbound (3)

- `src/lib/inbound/index.ts`
- `src/lib/inbound/slack.test.ts`
- `src/lib/inbound/slack.ts`
### lib/n8n (2)

- `src/lib/n8n/client.ts`
- `src/lib/n8n/provision.ts`
### lib/payments (3)

- `src/lib/payments/dodo.ts`
- `src/lib/payments/upgrade-token.test.ts`
- `src/lib/payments/upgrade-token.ts`
### lib/security (5)

- `src/lib/security/chat-request-guard.client.ts`
- `src/lib/security/chat-request-guard.server.ts`
- `src/lib/security/index.ts`
- `src/lib/security/request-metadata.ts`
- `src/lib/security/security-events.ts`
### lib/user (3)

- `src/lib/user/server.ts`
- `src/lib/user/utils.test.ts`
- `src/lib/user/utils.ts`
### lib/validations (1)

- `src/lib/validations/password.ts`
### lib/webhooks (4)

- `src/lib/webhooks/deliver.test.ts`
- `src/lib/webhooks/deliver.ts`
- `src/lib/webhooks/url-guard.test.ts`
- `src/lib/webhooks/url-guard.ts`
### middleware.ts (1)

- `src/middleware.ts`
### types (11)

- `src/types/agent.ts`
- `src/types/archive.ts`
- `src/types/canvas-export.ts`
- `src/types/chat-export.ts`
- `src/types/chat.ts`
- `src/types/community.ts`
- `src/types/global.d.ts`
- `src/types/mcp.ts`
- `src/types/user.ts`
- `src/types/util.ts`
- `src/types/workflow.ts`

## Appendix B: non-src top-level inventory

zip-main top-level entries: `.claude .dodo-bootstrap .env.example .gemini .github .husky .vscode AGENTS.md agents.md CHANGELOG.md CLAUDE.md CONTRIBUTING.md Imagemodels.md LICENSE README.md Refund Policy.md SEO-Preactices.md biome.json components.json context.md cookiespolicy.md custom-mcp-server deploy diclaimer.md docker docs drizzle.config.ts e2e-final.mjs ecosystem.config.cjs email-tems flarenewlogo.png imageedits.md legal-consent logo.html logos mcp-logo-dev-server.js messages nb-pro-image edit next.config.ts package.json package-lock.json playwright.config.ts pnpm-lock.yaml postcss.config.mjs privacypolicy.md probe.mjs public railway.toml render.yaml reports req.js sarvam-proxy-final.zip scripts sentry.edge.config.ts sentry.server.config.ts skills src summary.md test-admin.mjs tests tos.md tsconfig.json tmp-upstream-mcp-list-route.error.txt update_terms.cjs vercel.json vitest.config.ts voiceagents.md` (495 non-src tracked files total).

Notables: `package-lock.json` committed alongside `pnpm-lock.yaml`; stray artifacts (`sarvam-proxy-final.zip`, `tmp-upstream-mcp-list-route.error.txt`, `probe.mjs`, `req.js`, `test-admin.mjs`, `nb-pro-image edit`); duplicated `AGENTS.md`/`agents.md`; legal markdowns duplicated with in-app pages. Staging monorepo keeps `custom-mcp-server/ deploy/ docker/ email-tems/ legal-consent/ scripts/` at root and adds `apps/ packages/ servers/ e2b/`.

### package.json: zip-main vs staging `apps/web/package.json`

- zip-main deps (deps+dev): 129; staging apps/web: 148; version mismatches: 60.
- Only in zip-main (34): @ai-sdk/anthropic, @ai-sdk/google, @ai-sdk/openai, @ai-sdk/xai, @cf-vibesdk/sdk, @cloudflare/codemode, @elevenlabs/client, @google/genai, @llamaindex/liteparse, @openrouter/ai-sdk-provider, @radix-ui/react-toggle, @react-email/components, @vercel/analytics, @vercel/blob, @vercel/speed-insights, bcrypt-ts, e2b, firebase, lenis, pg, playwright, pptxgenjs, resend, sharp, stripe, @better-auth-kit/seed, @biomejs/biome, @playwright/test, @types/pg, dotenv-cli, husky, lint-staged, tsx, vite.
- Only in staging (53): @ai-sdk/gateway, @better-auth/api-key, @composio/vercel, @e2b/code-interpreter, @iconify-json/logos, @keinsaas/auth-contracts, @keinsaas/mcp-core, @keinsaas/mcp-router, @keinsaas/mcp-types, @modelcontextprotocol/server, @napi-rs/canvas, @octokit/auth-app, @octokit/rest, @onkernel/ai-sdk, @onkernel/sdk, @opentelemetry/* (8 pkgs), @react-three/drei, @react-three/fiber, @supabase/supabase-js, @superlog/otel-helpers, @vercel/otel, agentset, cron-parser, d3-force, exceljs, fast-xml-parser, hls.js, inngest, mcp-handler, n8nac, nodemailer, and more.

## Register-row cross-references (from docs/feature-work-register.md, 2026-11-11)

- C39 community: staging-native (0077, app/api/community, app/(chat)/community). Zip lib/community matched to it only by basename - semantic verify.
- C40 archives: staging-native (0078, app/(chat)/archives, hooks/queries/use-archives.ts).
- C41 thread insights: staging-native (0079, thread-insights-repository.pg.ts).
- C42 connectors: staging registry set (16 providers) vs zip catalog (29 tool files) - largest semantic merge surface in this map.
- C43 app builder: staging 0080 app_build + lib/ai/app-build-runner.ts; zip build-jobs/sandbox/vibesdk paths map here.
- C44 bug bounty: register says NOT IMPLEMENTED, but staging already contains same-path bug-bounty routes/pages/repository AND `0081_void_agent_bug_bounty.sql` - register row appears stale (ported 2026-11-11); verify, then update register.
- C45 chat challenge: staging app/api/chat/challenge present (same-path match) - register NEEDS-SECURITY-WORK row should be re-evidenced.
- B20 browser execution: stays blocked; zip browser stack (cloak/steel/browser-agent) must not be promoted as-is.

## Caveats

- Content equality is after CRLF->LF normalization (37 files are EOL-only identical).
- Basename matches are structural, not semantic; verify each before promotion claims.
- Guesses referencing register rows (C39-C45) inherit those rows' own unverified status.
- zip-main commit date/context: the original evolved into the destination; where destination and staging both exist and differ, the destination copy is NOT the staging target.
