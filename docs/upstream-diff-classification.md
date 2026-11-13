# Upstream Diff Classification (WP5) — Better Chatbot `6f4183566bc48616303cb84055f11f79578c82fe` vs Integration Staging

Status: promotion-gate artifact. Generated 2026-11-11. Classification of every content difference between the pinned upstream snapshot and `C:\Users\Ikra\Desktop\Void Agent-integration-staging`.

## 1. Method

1. Enumerated all upstream tracked paths: `git -C better-chatbot-upstream-git ls-files` → **1,768 paths** at commit `6f4183566bc48616303cb84055f11f79578c82fe` (HEAD verified).
2. Helper scripts (`compare.sh`, `gen-diffs.sh`, `gen-diffs2.sh`, `staging-only.sh`) were written to `C:\Users\Ikra\AppData\Local\Temp\wp5-diff\` (outside both repos) and run with repo paths as arguments. Neither repo was modified; no git state was changed; staging `.env` files were never read.
3. Per-path comparison used byte-exact SHA-256. Every differing file got a unified diff, then a second diff with `--strip-trailing-cr` to separate real content changes from CRLF noise.
4. Each differing file's diff was reviewed. Ambiguous files were cross-checked against the destination tree (`Void Agent` root `src/`) — staging files byte-identical to destination originals prove deliberate carry-over (verified for `create-table.ts`, `resizable.tsx`; near-identical for `xiaozhi/ota/route.ts`).
5. Staging-only paths (no upstream counterpart) were enumerated and are summarized in aggregate in section 5.

## 2. Counts

| Result | Count |
| --- | --- |
| Upstream tracked paths | 1,768 |
| Identical (SHA-256 equal) | **1,609** |
| Different (content or EOL) | **159** |
| Missing in staging | **0** |
| Differing by EOL only (`--strip-trailing-cr` empty diff) | 1 (`apps/web/src/lib/ai/__snapshots__/prompts.test.ts.snap`) |

Prior audit figures (1,609 / 159 / 0) were independently re-derived and confirmed exactly.

### Category counts

| Category | Count |
| --- | --- |
| INTENTIONAL_CUSTOM | **146** |
| REQUIRED_UPSTREAM_CUSTOMIZATION | **6** |
| MISSING_UPSTREAM_FUNCTIONALITY | **2** |
| ACCIDENTAL | **5** |
| UNRESOLVED | **0** |

## 3. Classification table (all 159 differing files)

Categories: `IC` = INTENTIONAL_CUSTOM, `RUC` = REQUIRED_UPSTREAM_CUSTOMIZATION, `MUF` = MISSING_UPSTREAM_FUNCTIONALITY, `ACC` = ACCIDENTAL. Files marked **[WP1/WP3 in-flight]** are under concurrent edit; classified on current content.

| Path | Cat | Evidence | Recommended action |
| --- | --- | --- | --- |
| .env.example | IC | C45 guard env vars (guard secret, allowed origins, Turnstile) documented | none |
| .github/FUNDING.yml | IC | Funding account `cgoinglove` → `Void Agent-Labs` (rebrand) | none |
| .gitignore | RUC | Adds Void Agent local-only/artifact ignore entries; upstream entries intact | none |
| CHANGELOG.md | IC | Adds pointer to preserved pre-sync changelog in docs/upstream | none |
| CONTRIBUTING.md | IC | db:check guidance, no-Docker deploy note, pre-sync guide pointer | none |
| LICENSE | IC | Adds `Void Agent` copyright line; MIT text preserved | none |
| README.md | IC | Replaced with Void Agent README; upstream README archived at docs/upstream | none |
| apps/desktop/package.json | RUC | Pins `ipaddr.js`/`undici` for pinned remote transport | none |
| apps/desktop/src/main/auto-updater.ts | IC | Secure update feed validation; destroyed-window guard; upstream behavior kept | none |
| apps/desktop/src/main/index.ts | IC | Trusted IPC wiring; dev-only local HTTP; upstream lifecycle kept | none |
| apps/desktop/src/main/mcp-ipc.ts | IC | Trusted-window MCP consent/IPC, bounded payloads (documented desktop merge) | none |
| apps/desktop/src/main/mcp-spawner.ts | IC | Pinned remote transports, bounded results/timeouts | none |
| apps/desktop/src/main/menu.ts | IC | DevTools gated to dev; updater-log menu item added | none |
| apps/desktop/src/main/notification-ipc.ts | IC | Trusted sender assertion on all notification handlers | none |
| apps/desktop/src/main/notifications.ts | IC | Trusted origin + parsed payloads; notify returns boolean | none |
| apps/desktop/src/main/server-config.test.ts | IC | Tests for `allowLocalHttp` parameter | none |
| apps/desktop/src/main/server-config.ts | IC | `allowLocalHttp` param (dev-only) on URL normalization | none |
| apps/desktop/src/main/server-picker-page.test.ts | IC | Picker policy tests | none |
| apps/desktop/src/main/server-picker-page.ts | IC | `allowLocalHttp` plumbed into picker page | none |
| apps/desktop/src/main/server-picker.ts | IC | Health-check policy (same-origin, bounded body, manual redirect) | none |
| apps/desktop/src/main/updater-log.ts | IC | URL-redacting, bounded updater log formatter | none |
| apps/desktop/src/preload/index.ts | IC | Typed `choose` payload; notify returns `Promise<boolean>` | none |
| apps/web/messages/de.json | IC | Destination-only keys merged; upstream text kept on collision | none |
| apps/web/messages/en.json | IC | Destination keys merged (+79) | Fix 1 double-encoded merged value (L2056) |
| apps/web/messages/es.json | IC | Destination keys merged (+50) | Fix 1 double-encoded merged value (L655) |
| apps/web/messages/fr.json | IC | Destination keys merged (+49) | none |
| apps/web/messages/ja.json | ACC | ~1,199 values double-encoded UTF-8 (mojibake) from merge; destination keys also added | Restore upstream ja strings; re-merge destination keys as UTF-8 |
| apps/web/messages/ko.json | ACC | ~1,329 values double-encoded UTF-8 (mojibake) | Restore upstream ko strings; re-merge destination keys as UTF-8 |
| apps/web/messages/pt.json | IC | Destination keys merged (+18) | Fix 1 double-encoded merged value (L2007) |
| apps/web/messages/zh.json | ACC | ~1,147 values double-encoded UTF-8 (mojibake) | Restore upstream zh strings; re-merge destination keys as UTF-8 |
| apps/web/next.config.ts | IC | Security headers (CSP/HSTS/frame), embed headers, Sentry, sw.js headers; upstream config preserved | none |
| apps/web/package.json | RUC | Adds deps (excalidraw, sentry, dompurify, html2canvas, etc.); nothing removed | none |
| apps/web/public/manifest.json | IC | Void Agent PWA manifest (icons, theme, shortcuts) | none |
| apps/web/public/sw.js | IC | Same-origin notification-click validation, bounded push payload (documented merge) | none |
| apps/web/src/app/(auth)/layout.tsx | IC | Void Agent logo/branding, AuthIntroDecoration, noindex metadata | none |
| apps/web/src/app/(chat)/chat/[thread]/page.tsx | IC | ThreadInsightsPanel added; upstream page intact | none |
| apps/web/src/app/(public)/export/[id]/page.tsx | IC | Share-token-gated public export + OG metadata; legacy share disabled by default, legacy path kept | Confirm legacy-share default is the intended promote behavior |
| apps/web/src/app/api/admin/actions.ts | IC | `updateUserTierAction` added; upstream actions intact | none |
| apps/web/src/app/api/admin/validations.ts | IC | Subscription-tier schema added | none |
| apps/web/src/app/api/auth/[...all]/route.ts | IC | Handler wrapped with error logging; same GET/POST semantics | none |
| apps/web/src/app/api/auth/error/page.tsx | IC | LightRays backdrop removed; file byte-identical to destination original | none |
| apps/web/src/app/api/chat/chat/load-app-default-tools.test.ts | IC | App-builder binding tests added | none |
| apps/web/src/app/api/chat/chat/tool-loading.ts | IC | Per-user connector + build tools bound; upstream flow preserved | none |
| apps/web/src/app/api/chat/chat/workflow-tools.ts | IC | Workflow run tool now requires `proposeWorkflowRun` one-use approval token | Confirm approval-gated run replaces upstream direct run deliberately |
| apps/web/src/app/api/chat/models/route.ts | IC | Dynamic providers hydrated before modelsInfo reply | none |
| apps/web/src/app/api/chat/route-helpers.test.ts | IC | Run-deadline tests added | none |
| apps/web/src/app/api/chat/route-helpers.ts | IC | Adds `createChatRunDeadline` + grace constant; upstream helpers intact | none |
| apps/web/src/app/api/chat/route.ts **[WP1/WP3 in-flight]** | IC | C45 challenge guard (non-headless) + A01 run-claim/atomic first message/deadline/recovery; upstream flow preserved as superset | Re-verify guard wiring after WP1/WP3 settle |
| apps/web/src/app/api/push/test/route.ts | IC | Push test title rebranded to Void Agent | none |
| apps/web/src/app/api/scheduled-tasks/[id]/run/route.ts | IC | Idempotent, claim-fenced manual runs; same-origin check; upstream trigger preserved | none |
| apps/web/src/app/api/user/preferences/route.ts | IC | Preferences merged with existing values; 400 on invalid body | none |
| apps/web/src/app/api/voice/xiaozhi/ota/route.ts | IC | Void Agent REST OTA protocol replaces upstream xiaozhi websocket OTA for new registrations; rate-limited; activate route keeps xiaozhi flow | Confirm dropping websocket OTA config for authed devices is intended |
| apps/web/src/app/layout.tsx | IC | Void Agent title/description metadata | none |
| apps/web/src/components/admin/users-table.tsx | IC | Bulk suspend/delete, role filter; row-click nav replaced by details action | none |
| apps/web/src/components/auth/social-providers.tsx | IC | `disabled` prop added to social buttons (challenge gate) | none |
| apps/web/src/components/chat-bot.tsx **[WP1/WP3 in-flight]** | IC | C45 client guard + Turnstile + transport fetch (URL rewrite moved post-success); upstream composer flow preserved | Re-verify after WP1/WP3 settle |
| apps/web/src/components/chat-preferences-content.tsx | IC | SavedNotes section + branding placeholder; upstream tabs intact | none |
| apps/web/src/components/chat-preferences-popup.tsx | IC | SavedNotes tab added | none |
| apps/web/src/components/default-tool-icon.tsx | IC | Connector tool icon mappings added | none |
| apps/web/src/components/export/chat-preview.tsx | IC | Share-token preview; comments optional; upstream preview preserved | none |
| apps/web/src/components/layouts/app-sidebar-agents.tsx | IC | `router.push("/")` → `/dashboard` (route structure) | none |
| apps/web/src/components/layouts/app-sidebar-menu-admin.tsx | IC | Admin menu links restored (upstream community build renders null) | none |
| apps/web/src/components/layouts/app-sidebar-menus.tsx | IC | Canvas/Collections nav added; upstream items intact | none |
| apps/web/src/components/layouts/app-sidebar-threads.tsx | IC | `/` → `/dashboard` redirects after bulk deletes | none |
| apps/web/src/components/layouts/app-sidebar.tsx | IC | Branding + AppSidebarArchives section added | none |
| apps/web/src/components/layouts/sidebar-header.tsx | IC | Collapsed-logo expand, logo image; mobile toggle testid preserved | none |
| apps/web/src/components/layouts/swr-config.tsx | IC | Console banner rebranded | none |
| apps/web/src/components/mcp-dashboard.tsx | IC | MCP Marketplace link added | none |
| apps/web/src/components/mermaid-diagram.tsx | IC | `securityLevel: strict` + DOMPurify sanitization | Note: strict level disables some interactive diagram features |
| apps/web/src/components/message-parts/assist-part.tsx | IC | Save-to-notes action with citation normalization; upstream actions intact | none |
| apps/web/src/components/message-parts/tool-part.tsx | IC | Connector/workflow approval review cards added | none |
| apps/web/src/components/onboarding/AutomationOverviewStep.tsx | IC | Branding | none |
| apps/web/src/components/onboarding/OnboardingWizard.tsx | IC | Branding | none |
| apps/web/src/components/scheduled-tasks/schedule-status.tsx | IC | Idempotency-Key header for manual runs | none |
| apps/web/src/components/select-model.tsx | IC | `disabled` prop (workflow read-only) | none |
| apps/web/src/components/thread-dropdown.tsx | IC | Archive dialog item added | none |
| apps/web/src/components/tool-invocation/image-generator.tsx | IC | Download-original button, layout tweaks | none |
| apps/web/src/components/tool-invocation/workflow-invocation.tsx | IC | Pending-effect approve/reject decision UI | none |
| apps/web/src/components/tools/hitl-tool-labels.ts | IC | `proposeWorkflowRun` label added | none |
| apps/web/src/components/ui/resizable.tsx | IC | Destination forwardRef variant (adds ref support; byte-identical to destination) | none |
| apps/web/src/components/ui/sonner.tsx | IC | `resolvedTheme` + explicit light theme | none |
| apps/web/src/components/user/user-detail/user-access-card.tsx | IC | Tier selector + usage fetch added | none |
| apps/web/src/components/user/user-detail/user-detail.tsx | IC | Memory settings + Dodo billing cards added | none |
| apps/web/src/components/user/user-detail/user-statistics-card.tsx | IC | Generated-images stat added | none |
| apps/web/src/components/user/user-detail/user-stats-card-loader.tsx | IC | Loader skeleton updated to match | none |
| apps/web/src/components/workflow/edit-workflow-popup.tsx | IC | saved-workflows endpoint support; upstream default path unchanged | none |
| apps/web/src/components/workflow/node-config/llm-node-config.tsx | IC | Model select disabled when node not editable | none |
| apps/web/src/components/workflow/node-config/tool-node-config.tsx | IC | YouTube search/transcript tools in workflow nodes | none |
| apps/web/src/components/workflow/workflow-panel.tsx | IC | savedDraftMode endpoint switch; upstream `/api/workflow` default kept | none |
| apps/web/src/components/workflow/workflow.tsx | IC | savedDraftMode endpoint switch; upstream default kept | none |
| apps/web/src/hooks/use-thread-file-uploader.ts | IC | Uploads via authenticated `/api/storage/upload`; limit 50 MB → 15 MiB | Confirm 15 MiB attachment limit is intended promote behavior |
| apps/web/src/instrumentation.ts | IC | Optional Sentry init + `onRequestError`; upstream observability kept | none |
| apps/web/src/lib/admin/server.test.ts | IC | Query-normalization tests added | none |
| apps/web/src/lib/admin/server.ts | IC | Whitelist/normalize admin user queries; redundant `getSession` removed | none |
| apps/web/src/lib/ai/__snapshots__/prompts.test.ts.snap | ACC | EOL-only difference (CRLF vs LF); no content change | Restore upstream bytes to keep tree hash-clean |
| apps/web/src/lib/ai/create-openai-compatiable.test.ts | MUF | Azure apiVersion tests deleted alongside implementation removal | Restore upstream Azure tests after restoring implementation |
| apps/web/src/lib/ai/create-openai-compatiable.ts | MUF | Azure OpenAI branch (`apiVersion` via azure client) removed; `azure-openai-compatible.ts` now unreferenced; custom headers added | Restore upstream Azure branch from 6f41835, keep custom headers support |
| apps/web/src/lib/ai/mcp/fb-mcp-config-storage.test.ts | IC | mcpServers wrapper-format test added | none |
| apps/web/src/lib/ai/mcp/fb-mcp-config-storage.ts | IC | Safe JSON parse + normalize + marketplace column coercion | none |
| apps/web/src/lib/ai/models.ts | IC | Admin dynamic providers hydrated from site_config; upstream static catalog authoritative; TensorX direct resolution kept | none |
| apps/web/src/lib/ai/prompts.test.ts | IC | Memory-prompt tests added | none |
| apps/web/src/lib/ai/prompts.ts | IC | Branding, memory section, model identity, workflow approval prompt; upstream prompts preserved | none |
| apps/web/src/lib/ai/tools/browser/browser-automation-tool.ts | IC | Fail-closed egress-isolation gate (B20 posture) | none |
| apps/web/src/lib/ai/tools/hitl/load-hitl-tools.ts | IC | `proposeWorkflowRun` added; upstream 4 HITL tools kept | none |
| apps/web/src/lib/ai/tools/http/fetch.ts | IC | Free-form fetch replaced by approval-gated, public-host, DNS-pinned HTTPS tool | Confirm approval gate replaces upstream direct fetch deliberately |
| apps/web/src/lib/ai/tools/index.ts | IC | Destination toolkit/tool-name enums extended | none |
| apps/web/src/lib/ai/tools/tool-kit.ts | IC | Connectors bucket + explicit empty capability buckets | none |
| apps/web/src/lib/ai/tools/visualization/create-table.ts | IC | Schema loosened (nullable→optional, rows `z.any()`); byte-identical to destination | Note: upstream input validation weakened by design; keep or tighten |
| apps/web/src/lib/ai/workflow/executor/graph-store.test.ts | IC | Test fixture renamed `cgoing`→`void-agent` | none |
| apps/web/src/lib/ai/workflow/executor/node-executor.ts | IC | External-effect approval hooks; public HTTP via pinned resolver; upstream executors kept | none |
| apps/web/src/lib/ai/workflow/executor/tool-node-executor.test.ts | IC | Approval-gate ordering/fail-closed tests | none |
| apps/web/src/lib/ai/workflow/executor/workflow-executor.test.ts | IC | Checkpoint replay + effect approval tests; mock model relabeled | none |
| apps/web/src/lib/ai/workflow/executor/workflow-executor.ts | IC | Durable node checkpoints, serialized execution; upstream graph engine kept | none |
| apps/web/src/lib/ai/workflow/shared.workflow.ts | IC | TipTap bulletList/listItem rendering added; upstream conversion kept | none |
| apps/web/src/lib/auth/auth-instance.ts | IC | Env-configurable session TTL (default 1 day vs upstream 7), rate limits, security events, cookie prefix; password bounds kept | Confirm 1-day default session TTL is intended |
| apps/web/src/lib/cache/cache.interface.ts | IC | `setNX`/`isDistributed` added | none |
| apps/web/src/lib/cache/index.ts | IC | SafeRedisCache/Upstash enabled (upstream had them commented out); dev memory default kept | none |
| apps/web/src/lib/cache/memory-cache.ts | IC | setNX implementation | none |
| apps/web/src/lib/cache/redis-cache.ts | IC | setNX + isDistributed | none |
| apps/web/src/lib/cache/safe-redis-cache.test.ts | IC | Mock refactor + setNX coverage | none |
| apps/web/src/lib/cache/safe-redis-cache.ts | IC | Awaited reconnect fix + setNX passthrough | none |
| apps/web/src/lib/chat/browser-tool-gate.test.ts | IC | Egress gate tests | none |
| apps/web/src/lib/chat/browser-tool-gate.ts | IC | Global egress-isolation gate prepended to upstream suppression reasons | none |
| apps/web/src/lib/code-runner/safe-js-run.ts | IC | Sandbox drops fetch/setTimeout/setInterval (documented exfiltration/escape risk) | Confirm upstream sandbox capability reduction is intended |
| apps/web/src/lib/const.ts | RUC | VOIDAGENT_AUTH_URL/NEXT_PUBLIC_BASE_URL precedence + getBaseUrl helper; upstream BASE_URL fallbacks intact | none |
| apps/web/src/lib/db/migrations/pg/meta/_journal.json | IC | 15 void_agent migrations (0067–0081) appended; upstream entries intact | Run db:check after schema settles |
| apps/web/src/lib/db/pg/repositories/admin-repository.pg.ts | IC | Bulk suspendUsers/deleteUsers added | none |
| apps/web/src/lib/db/pg/repositories/chat-export-repository.pg.ts | IC | Share-token create/revoke/lookup; upstream queries kept | none |
| apps/web/src/lib/db/pg/repositories/chat-repository.pg.ts | IC | insertThreadWithFirstMessage, claim/finalize/fail run, collision errors; upstream API kept | none |
| apps/web/src/lib/db/pg/repositories/user-repository.pg.ts | IC | generatedImageCount stat added | none |
| apps/web/src/lib/db/pg/repositories/voice-device-repository.pg.ts | IC | Strict device-type validation on all reads/writes | none |
| apps/web/src/lib/db/pg/schema.pg.ts | IC | Insights/gallery/install/marketplace/tier columns + custom tables; chat_export rebuilt with share tokens; deviceType DB enum moved to app validation | Verify migration 0067–0081 coverage matches schema before promote |
| apps/web/src/lib/db/repository.ts | IC | Destination repositories registered; every upstream export preserved | none |
| apps/web/src/lib/file-storage/file-storage.interface.ts | IC | ownerId + downloadLimited added | none |
| apps/web/src/lib/file-storage/s3-file-storage.test.ts | IC | Mock rewrite; private-mode + owner-scope tests | none |
| apps/web/src/lib/file-storage/s3-file-storage.ts | IC | Owner-scoped keys, private mode, limited download; public mode default preserved | none |
| apps/web/src/lib/file-storage/storage-utils.ts | IC | Strict `storageKeyFromUrl` (traversal/protocol guards) + owner validation | none |
| apps/web/src/lib/file-storage/supabase-storage.ts | IC | Owner scoping, origin-pinned limited download | none |
| apps/web/src/lib/json-schema-to-zod.test.ts | IC | Null/undefined robustness tests | none |
| apps/web/src/lib/json-schema-to-zod.ts | IC | z.any() guard for malformed schemas; upstream behavior kept for valid input | none |
| apps/web/src/lib/kernel/playwright-execute-tool.ts | IC | Egress-isolation fail-closed gate | none |
| apps/web/src/lib/kernel/session.ts | IC | Egress-isolation fail-closed gate | none |
| apps/web/src/lib/updates/workflow.test.ts | RUC | EOL normalization so upstream test passes on Windows checkouts | none |
| apps/web/src/lib/user/server.test.ts | IC | Admin-access tests updated | none |
| apps/web/src/lib/user/server.ts | IC | Admin permission check on cross-user access; generatedImageCount in stats | none |
| apps/web/src/lib/user/utils.test.ts | IC | Tests updated for parseRoleString admin model | none |
| apps/web/src/lib/user/utils.ts | IC | Admin detection via parseRoleString (provider-prefixed roles); comma-list no longer admin | Confirm role-format change is intended; upstream comma-list format dropped |
| apps/web/src/lib/voice/device-token.ts | IC | Domain-separated hash + voice aliases; upstream functions kept | none |
| apps/web/src/middleware.test.ts | IC | Public-surface boundary, cookie prefix, Sentry tunnel tests | none |
| apps/web/src/middleware.ts | IC | Public-surface allowlists, cookie prefix, Sentry tunnel; all upstream exemptions preserved in `isTokenAuthenticatedPublicEndpoint` | none |
| apps/web/src/types/admin.ts | IC | Filter/sort constants, tier, bulk-op types | none |
| apps/web/src/types/chat-export.ts | IC | Share-token + legacy-share types | none |
| apps/web/src/types/chat.ts **[WP1/WP3 in-flight]** | IC | ChatRequestSecuritySchema + runAttemptId + claim/finalize/fail repo contract; upstream types intact | Re-verify after WP1/WP3 settle |
| apps/web/src/types/global.d.ts | IC | notify returns `Promise<boolean>` | none |
| apps/web/src/types/user.ts | IC | SavedNote types + preferences extension | none |
| apps/web/src/types/voice-device.ts | IC | `isVoiceDeviceType` guard added | none |
| apps/web/src/types/workflow.ts | IC | pendingEffect + awaiting_approval/effect_uncertain/cancelled statuses | none |
| package.json (root) | ACC | Intended: rename to `Void Agent` + void:desktop scripts; unintended: whole file re-serialized with stray-indent JSON style; no content lost | Re-serialize in upstream formatting (biome format), keep name/scripts |
| pnpm-lock.yaml | RUC | Regenerated for added deps (@sentry, @babel chain, excalidraw, dompurify, html2canvas, turnstile, ipaddr/undici) + peer churn; no upstream package dropped | Re-run lockfile install/verify before promote |

## 4. Per-category notes

### MISSING_UPSTREAM_FUNCTIONALITY (2) — promote-fix required
1. `apps/web/src/lib/ai/create-openai-compatiable.ts` — upstream's Azure OpenAI handling for dynamic providers (per-model `apiVersion` through `createAzureOpenAICompatible`) was removed; the destination never had it. `apps/web/src/lib/ai/azure-openai-compatible.ts` still exists in staging but is no longer referenced by the dynamic-provider loader, so configured "Azure OpenAI" providers would silently lose API-version handling. **Action:** restore the upstream Azure branch (and the `apiVersion` schema field) inside `createOpenAICompatibleModels` while retaining staging's custom `headers` support.
2. `apps/web/src/lib/ai/create-openai-compatiable.test.ts` — the Azure coverage deleted with the implementation. **Action:** restore the two upstream Azure test cases after the implementation fix.

### ACCIDENTAL (5) — promote-fix required
1. `apps/web/messages/ja.json` — ~1,199 values are double-encoded UTF-8 (e.g. `成功` → `æˆåŠŸ`), interleaved with intact values; introduced by the locale merge, not by translation work.
2. `apps/web/messages/ko.json` — same corruption pattern, ~1,329 values (e.g. `업데이트` → `ì—…ëì´íŠ¸`).
3. `apps/web/messages/zh.json` — same corruption pattern, ~1,147 values.
   **Shared action (1–3):** restore the upstream translations for corrupted keys and re-merge the destination-only keys with correct UTF-8 handling; add a JSON parse + encoding sanity check to the locale-merge step.
4. `package.json` (root) — intended edits are only `name: "Void Agent"` and six `void:desktop:*` scripts, but the whole file was re-serialized with an inconsistent stray-indent JSON style, changing all 131 lines. **Action:** re-serialize in upstream formatting (biome format) keeping the intended edits.
5. `apps/web/src/lib/ai/__snapshots__/prompts.test.ts.snap` — EOL-only (CRLF) difference; semantically identical. **Action:** restore upstream bytes.

Additionally, `apps/web/messages/en.json`, `es.json`, `pt.json` (classified INTENTIONAL_CUSTOM) each contain 1 double-encoded merged value (en L2056, es L655, pt L2007) — fix the strings during the same locale-correction pass.

### REQUIRED_UPSTREAM_CUSTOMIZATION (6)
`.gitignore`, `apps/desktop/package.json`, `apps/web/package.json`, `apps/web/src/lib/const.ts`, `apps/web/src/lib/updates/workflow.test.ts`, `pnpm-lock.yaml` — all preserve upstream content/behavior and add necessary plumbing (ignore entries, dependency pins/additions, env-precedence helpers, Windows EOL tolerance, regenerated lockfile). No action needed beyond normal install verification.

## 5. Staging-only areas (no upstream counterpart) — aggregate

Staging contains ~870 files with no upstream tracked counterpart. Solely in aggregate: `apps/web` carries the destination integration — 267 added `public/` assets; custom API route families (voice devices/OTA, n8n, admin extras, Dodo payments, eCanvas, community, connectors OAuth/tools, collections, bug-bounty, archives, thread insights, workflow executions/approvals, manual scheduled runs, webhook subscriptions, public `/api/v1`, MCP marketplace/installs, app builder, REST API keys, inbound triggers, embed sessions); custom libs (chat-request guard `chat-request-guard.*` [WP1/WP3 in-flight], workflow run-approval/execution-state, http-request-approval, connector registry, notes, community/archives/insights/collections services, site-config, memory, Dodo, security/same-origin/rate-limit helpers, `browser-egress-capability`, `limited-download`, `upstash-rest-cache`, `mcp-config-parser`, webhooks URL guard, sentry configs); custom components (canvas, archives, bug-bounty, collections, community, connectors, build, marketplace, payments, API keys, embed chat, voice dashboards); and additive migrations `0067`–`0081`. `apps/desktop` adds its security/transport modules (`mcp-policy`, `pinned-remote-fetch`, `secure-update-feed`, `server-picker-policy`, `bounded-json`) with tests. `apps/Void Agent-desktop` (52 files) is the temporary comparison desktop copy — **excluded from promotion** per project decisions. Non-app trees: `docs/upstream/` archived upstream docs + `docs/chat-request-security.md`, `deploy/` (void-agent.service + install script), `email-tems/` (5 templates), `legal-consent/` (3 policy pages), `custom-mcp-server/`, root `void-agentai-*-spec.md`, generated `openai-compatible.config.ts`, and `tsconfig.tsbuildinfo` build artifact. Secrets `​.env` (root), `docker/.env`, and `apps/web/.env` exist in staging and must never be promoted or copied (contents not read).

## 6. In-flight work annotation

`apps/web/src/app/api/chat/route.ts`, `apps/web/src/components/chat-bot.tsx`, and `apps/web/src/types/chat.ts` are being concurrently edited (C45 chat-request guard wiring, WP1/WP3). They are classified INTENTIONAL_CUSTOM on their current content; re-run this classification for those three files after the guard work settles. Related in-flight modules (`lib/security/chat-request-guard.*`, `app/api/chat/challenge/**`) are staging-only files and appear in section 5, not in the diff table.

## Independent post-promotion re-audit — 2026-11-11 (verification Agent 3)

An independent re-derivation against the PROMOTED destination (upstream pinned 6f41835, byte-level SHA-256, 1:1 path mapping): **1,768 upstream paths — 1,595 identical, 172 different (+1 EOL-only), 0 missing**; classification: 160 INTENTIONAL_CUSTOM, 12 REQUIRED_CUSTOMIZATION, 1 ACCIDENTAL (EOL-only `prompts.test.ts.snap`), **0 MISSING_UPSTREAM_FUNCTIONALITY, 0 UNRESOLVED**. This section supersedes the pre-promotion counts above (1,609/159) for current state — the deltas come from this session's ports landing during promotion.

**All five repairs recorded above are CONFIRMED landed in the promoted tree:** ja/ko/zh (and en/es/pt) have **0 double-encoded values** (strict latin-extended-before-CJK scan: 0 hits across all 8 locale files; upstream keys all present, +60 destination keys each, only deliberate rebrand values differ); the **Azure OpenAI branch is byte-identical to upstream** with its two tests present; root package.json is a minimal clean edit in upstream formatting. The classification rows above that marked ja/ko/zh/package.json ACCIDENTAL and create-openai-compatiable* MISSING_UPSTREAM_FUNCTIONALITY are therefore historical to the pre-repair checkpoint.

Residuals found by the re-audit (both cosmetic, both resolved or accepted): the stale `apps/Void Agent-desktop` importer in pnpm-lock.yaml — **removed by a lockfile regen on 2026-11-11** (verified 0 references; desktop 22 files/132 tests and the C45 guard suite re-passed after regen); a UTF-8 BOM at the start of destination README.md — accepted as-is (cosmetic). Spot-checks of 15+ intentional classifications AGREE with this doc; the verified full tables live with the audit record.
