# zip-main → staging triage: API / DB / scheduler / connectors (WP6b-T3)

Date: 2026-11-11. Feeds the PROMOTION GATE defined in `docs/zip-main-parity-map.md`.

- ORIGINAL: zip-main @ `aa9fce0f545afb18b9a191724be092887f83630b` (read via `git show` / `git ls-tree`; no repo mutations).
- STAGING: `Void-Agent-integration-staging/apps/web` (working tree; small ports written, nothing committed).
- Method: for every assigned unmatched path, located the staging equivalent by capability (repository/table/route/tool) and read both sides. Dispositions: `EQUIVALENT-AT` (staging path covers the capability), `PORTED-NOW` (ported this session), `EXCLUDED` (justification; `EXCLUDED-FOR-NOW` = excluded pending a spelled-out migration/effort).
- Constraints honored: no edits to `lib/security/**`, `app/api/chat/**`, `app/api/bug-bounty/**`, app-builder files, `lib/ai/tools/connectors/*` (WP4's directory — productboard/zulip files untouched), `messages/*.json`, `package.json`, `schema.pg.ts`, migrations. Read-only `git show`/`ls-tree` only. No `.env` reads.

## 0. Summary

| outcome | count |
|---|---|
| assigned paths triaged | 177 |
| EQUIVALENT-AT | 64 |
| PORTED-NOW (8 zip paths; 11 staging files written/edited incl. 6 test files, 32 tests green) | 8 |
| EXCLUDED (incl. 29 EXCLUDED-FOR-NOW with migration/effort note) | 105 |
| out-of-scope notes (lib/sandbox → C43 app-builder owner; `lib/ai/tools/connectors/*` not written to) | documented inline |

Path totals by family: lib/db 32, lib/scheduler 9 + worker 1 + app/api/cron 1 + app/api/scheduler 2, app/api/connectors 9, lib/connectors 3, connector tool files 44, lib/rag 7, lib/auth 4, lib/file-storage 3, app/api/admin 4, app/api/agent 4, app/api/archive 1, app/api/chat 1, app/api/export 2, app/api/files 1, app/api/health 1, app/api/mcp 1, app/api/thread 2, app/api/user 1, app/api/voice 2, app/api/workflow 1, app/api/sentry-example-api 1, app/sentry-example-page 1, app/(auth) 1, app/global-error 1, app/page 1, app/robots 1, app/sitemap 1, app icon assets 10, hooks 2, hooks/queries 3, lib 4, lib/admin 2, lib/cache 1, lib/chat 2, lib/community 2, lib/email 3, lib/validations 3, lib/rate-limit 1, types 1.

## 1. lib/db (32)

Staging journal runs 0000–0081 with its own lineage. Zip migrations 0015–0032 map onto staging migrations as below; no zip migration needs re-playing against staging.

| zip-main path | disposition | evidence / justification |
|---|---|---|
| `migrations/pg/0015_user_connector.sql` | EQUIVALENT-AT | `lib/db/migrations/pg/0067_void_agent_custom_public_surfaces.sql` creates `user_connector` (line 176) incl. indexes |
| `migrations/pg/0015_wild_morlun.sql` | EQUIVALENT-AT | `user_memory` → staging 0069_void_agent_gallery_memory.sql; `user_connector` → 0067 |
| `migrations/pg/0016_curious_tier.sql` | EQUIVALENT-AT | staging 0068_void_agent_site_config.sql line 25: `user.tier` default `'free'` |
| `migrations/pg/0017_free_tier_default.sql` | EQUIVALENT-AT | same column already defaults to `'free'` in staging 0068 (two-step zip migration collapsed) |
| `migrations/pg/0018_build_jobs.sql` | EQUIVALENT-AT | superseded by 0080_void_agent_app_builder.sql (`app_build`, C43) |
| `migrations/pg/0019_drop_build_jobs.sql` | EXCLUDED | no-op housekeeping (reversed by zip 0032); staging never had `build_job` |
| `migrations/pg/0020_dodo_payments.sql` | EQUIVALENT-AT | 0074_void_agent_dodo_payments.sql (dodo_subscription/dodo_payment) |
| `migrations/pg/0021_lucky_nekra.sql` | EQUIVALENT-AT | split: 0074 (dodo tables) + 0075_void_agent_security_events.sql (security_event) |
| `migrations/pg/0021_lucky_nekra.sql.bak` | EXCLUDED | backup artifact, never a migration |
| `migrations/pg/0022_cheerful_next_avengers.sql` | EQUIVALENT-AT | bug_report/bug_report_comment → 0081_void_agent_bug_bounty.sql; collection/document/document_chunk RAG store → staging `knowledge_base` (0040) + `document`/`document_chunk`/`document_embedding` (0023_agentset_document_and_brain.sql) |
| `migrations/pg/0023_silent_sentinel.sql` | EQUIVALENT-AT | split: scheduled_task → 0045_scheduled_task.sql, manual runs → 0073, inbound_endpoint/inbound_delivery → 0067 |
| `migrations/pg/0024_webhook_signing_secret.sql` | EQUIVALENT-AT | staging 0067 creates `webhook_subscription` **with** `signing_secret` (line 65) |
| `migrations/pg/0025_amber_assembly.sql` | EQUIVALENT-AT | MCP installs → 0072_void_agent_mcp_installs.sql; agent gallery → 0044_published_page.sql + `agent_install`; gap: `agent_view` analytics table (see agent-view-repository row) |
| `migrations/pg/0026_verdant_gatekeeper.sql` | EQUIVALENT-AT | staging 0067 creates `embed_session` (line 151, incl. rate_limit_tier) |
| `migrations/pg/0027_connector_pause.sql` | EQUIVALENT-AT | staging 0067 `user_connector.is_paused` (line 186); honored by `provider-api.getConnectorAccessToken` |
| `migrations/pg/0028_scheduler_assistant_jobs.sql` | EQUIVALENT-AT (with caveat) | staging 0045 makes `scheduled_task.agent_id NOT NULL` (agent-only tasks) — deliberate staging design; zip's assistant-mode jobs are excluded (see scheduler section) |
| `migrations/pg/0029_expand_connectors.sql` | EXCLUDED | zip expands a `connector_provider` PG enum; staging `user_connector.provider` is free `text` + code-side catalog (`lib/connectors/providers-list.ts`) — no enum to expand |
| `migrations/pg/0030_rename_dodo_billing_columns.sql` | EQUIVALENT-AT | staging 0074 creates the columns directly under the renamed names (`previous_billing_date`, `next_billing_date`, `cancel_at_next_billing_date`) |
| `migrations/pg/0031_canvas_export.sql` | EQUIVALENT-AT | 0076_void_agent_ecanvas_exports.sql |
| `migrations/pg/0032_build_jobs_restore.sql` | EQUIVALENT-AT | 0080 app_build supersedes |
| `migrations/pg/meta/0015_snapshot.json` | EXCLUDED | zip drizzle journal snapshot; staging journal has its own meta |
| `migrations/pg/meta/0021_snapshot.json` | EXCLUDED | same |
| `migrations/pg/meta/0022_snapshot.json` | EXCLUDED | same |
| `pg/repositories/admin-respository.pg.ts` | EQUIVALENT-AT | `lib/db/pg/repositories/admin-repository.pg.ts` (typo fixed): same `getUsers`/`suspendUsers`/`deleteUsers` API |
| `pg/repositories/agent-view-repository.pg.ts` | EXCLUDED-FOR-NOW | staging has no `agent_view` table (published_page/agent_install cover installs, not view analytics). Migration spec: journal idx 0082 — `CREATE TABLE agent_view (id uuid pk default random, agent_id uuid NOT NULL REFERENCES agent(id) ON DELETE CASCADE, viewer_user_id uuid NULL, viewed_at timestamptz NOT NULL DEFAULT now(), index (agent_id, viewed_at))`; pairs with `app/api/agent/[id]/view` routes |
| `pg/repositories/archive-repository.pg.ts` | EQUIVALENT-AT | staging archives are staging-native (0078, C40): `app/api/archive/route.ts` + `app/api/archive/[id]` + archive logic in `chat-repository.pg.ts` |
| `pg/repositories/build-job-repository.pg.ts` | EQUIVALENT-AT | `lib/db/pg/repositories/app-build-repository.pg.ts` (C43): create/get/list/update/cancel/resume + capacity admission |
| `pg/repositories/chat-repository.update-thread-insights.test.ts` | EXCLUDED | written against zip's `pgChatRepository.updateThreadInsights`; staging moved insights to `thread-insights-repository.pg.ts` (0079, C41) with a different API (`loadTranscriptForOwner`/`readForOwner`/`saveForOwnerIfTranscriptCurrent`). Capability covered; test needs a rewrite against the new repo, not a port |
| `pg/repositories/collection-repository.pg.ts` | EQUIVALENT-AT | capability reimplemented: `lib/collections/collection-service.ts` (collections API shape over `KnowledgeBaseTable`) + `lib/ai/rag/ingest.ts` + staging `document`/`document_chunk` tables; not a drop-in (different API), no migration needed |
| `pg/repositories/scheduler-repository.pg.ts` | EXCLUDED | superseded by the staging scheduled-tasks subsystem: `lib/scheduled-tasks/*` (checker/runner/manual-run-requests), `ScheduledTaskTable` (0045) + `scheduled_task_manual_run_request` (0073), evidence C09/C10/C11 |
| `pg/repositories/subscription-repository.pg.ts` | EXCLUDED | Stripe-based (`getSubscriptionByStripeId`); staging dropped Stripe billing — Dodo-only via `dodo-payments-repository.pg.ts` (0074), which also syncs `user.tier` |
| `pg/repositories/team-repository.pg.ts` | EXCLUDED-FOR-NOW | destination teams feature (C27/C28/C29 evidence is destination-side). Staging uses better-auth `organization`/`member`/`invitation` tables (schema line 652). Port needs: `team`, `team_member`, `team_invitation` tables + `session.active_team_id` (C29) — journal idx 0082+. Recommendation: reuse the existing better-auth organization tables instead of importing the destination team model |

## 2. Scheduler capability comparison (deliberate decision)

zip: `lib/scheduler` (cron-parser / jobs / leader / outbox-worker / worker tick) + standalone `src/worker/index.ts` (60s loop: scheduler tick, outbox tick, E2B sandbox reap) + `app/api/cron/tick` (Vercel cron, Bearer `CRON_SECRET`) + `/api/scheduler/jobs` CRUD + chat scheduler tool.
staging: `lib/inngest` (client + functions) + `lib/scheduled-tasks/*` (checker/due-detection/runner/manual-run-requests/trigger/schedule-validation) + `/api/scheduled-tasks` (CRUD, `[id]`, `trigger`, `run`, `cron`, `diagnostics`) + migrations 0045/0073. Evidence: C09/C10/C11.

| capability | zip-main | staging | verdict |
|---|---|---|---|
| Recurring cron jobs | inline 5-field parser (`* , - /`), UTC only | `cronExpression` + `timezone` via `cron-parser` npm pkg, validated at write (`isValidCron`), next-run computed per task | staging covers, stronger (timezones) |
| One-shot schedules (`runAt` / `delay` / NL "in 5 minutes …") | first-class (`scheduleType:"once"`, auto-disable after run) | none — `ScheduledTaskCreateSchema` is `taskType:"agent"` + required cron; manual "Run now" exists but no future one-shot | zip-only; see gap A |
| Assistant-mode jobs (no agent, plain prompt run) | `executionMode: "assistant"` | `taskType: z.literal("agent")`, `agent_id NOT NULL` | zip-only; see gap A |
| Multi-instance safety | PG advisory leader lock (50s TTL) | Inngest deterministic event ids (24h dedupe) + per-slot claim (`claimScheduledSlot`) + throttle 30/min + concurrency caps (plan ceiling, per-user 2) | staging covers, stronger |
| Retry / timeout | none in tick (single attempt, failure recorded, next-run rolled) | Inngest `retries: 3` with backoff; manual run `maxDuration` 300s | staging covers, stronger |
| Manual runs + idempotent replay | none (no manual endpoint) | `POST [id]/trigger` (event) + `POST [id]/run` (synchronous, `Idempotency-Key`, `claimManualTaskRun`, replay, conflict errors) | staging exceeds zip (C11) |
| Run history + diagnostics | `scheduled_run` rows | `recordScheduledRunResult` + `/api/scheduled-tasks/diagnostics` (safe failure categories, C10) | staging covers |
| CRUD API | `/api/scheduler/jobs` (+`[jobId]` GET/PATCH/DELETE) | `/api/scheduled-tasks` GET/POST + `[id]` + trigger/run | staging covers |
| Chat tool (create/list/pause/resume/delete from chat) | `lib/ai/tools/scheduler/scheduler-tool.ts` (155 lines) wired into `[AppDefaultToolkit.Scheduler]` | toolkit registered but **empty** (`{}` in `lib/ai/tools/tool-kit.ts`) — dashboard-only creation | zip-only; see gap A |
| Webhook outbox delivery | `outbox-worker.ts`: claim 25 due events → per-subscription delivery rows → sign + POST (10s) → backoff/attempt cap | tables + repository claim/mark methods + `lib/webhooks` (sign/deliver/backoff/url-guard) exist; **no driver** — inbound route enqueued events that were never delivered | GAP — PORTED-NOW (see §7) |
| Sandbox reaping | worker loop `reapSandboxes()` | inngest `reap-idle-sandboxes` | staging covers |
| Minute cron entrypoint | `/api/cron/tick` (Bearer secret) | inngest `scheduled-task-cron-checker` (`* * * * *`) + `/api/scheduled-tasks/cron` fallback route | staging covers |

**Decision.** Staging's scheduler supersedes zip's for everything except two zip-only capabilities, both blocked on schema:

- **Gap A — chat scheduler tool + one-shot/assistant job types.** Porting the 155-line chat tool requires `ScheduledTaskCreateSchema` to accept one-shot/assistant tasks; that needs `scheduled_task.agent_id` nullable + a task-type/payload representation + auto-disable semantics in the checker → migration + checker/runner changes → **EXCLUDED-FOR-NOW** (effort: ~1 migration (journal idx 0082/0083) + schedule-validation/checker/runner edits + tool file + toolkit wiring; recommend keeping staging agent-only unless chat-created reminders are a product requirement).
- **Gap B — webhook outbox driver.** Small, zero-deps, no migration → **PORTED-NOW** (§7).

Per-path outcomes (13 paths):

| zip path | disposition |
|---|---|
| `lib/scheduler/index.ts` | EXCLUDED — 7-line re-export shim; superseded |
| `lib/scheduler/cron-parser.ts` (+ `.test.ts`) | EXCLUDED — superseded by `cron-parser` npm + `schedule-validation.ts` (timezone-aware) |
| `lib/scheduler/jobs.ts` (+ `.test.ts`) | EXCLUDED — superseded by `schedule-validation.ts` + `/api/scheduled-tasks`; one-shot/NL/assistant semantics = Gap A |
| `lib/scheduler/leader.ts` (+ `.test.ts`) | EXCLUDED — superseded by Inngest dedupe/slot claims |
| `lib/scheduler/outbox-worker.ts` (+ `.test.ts`) | PORTED-NOW → `lib/inngest/functions/webhook-outbox.ts` |
| `worker/index.ts` | EXCLUDED — standalone loop superseded; its three jobs: checker ✓ inngest, reap ✓ inngest, outbox = ported |
| `app/api/cron/tick/route.ts` | EXCLUDED — superseded (inngest cron checker + `/api/scheduled-tasks/cron`) |
| `app/api/scheduler/jobs/route.ts`, `app/api/scheduler/jobs/[jobId]/route.ts` | EXCLUDED — superseded by `/api/scheduled-tasks` CRUD |

## 3. Connectors

### 3a. Registry coverage (zip 44 provider tool files vs staging 16)

Staging `lib/ai/tools/connectors/registry.ts` registers 16 provider tools (gmail, google-drive, google-calendar, github, outlook, slack, notion, teams, asana, clickup, linear, jira, zendesk, freshdesk, productboard, zulip) + `connectors-list`. **Those 16 zip tool files are EQUIVALENT-AT** (staging rewrites use `callConnectorApi` with pinned origins, 12s timeout, 512 KiB response caps, encrypted per-user tokens, and exact-action approval for writes — evidence C12/C13; WP4 landed productboard/zulip, untouched here).

Note: staging's `CONNECTOR_PROVIDER_CATALOG` (`providers-list.ts`, 51 ids) already lists every zip provider, but `connectionFlow: "not-integrated"` — catalog presence is not tool parity. 28 zip provider tools have **no staging implementation** and, critically, **no connection path** (see per-provider verdicts).

### 3b. Per-provider dispositions (all 44 listed, no gaps)

EQUIVALENT-AT (16): the 16 staging-registered providers map from these zip tool files: `gmail`, `drive`, `calendar`, `github`, `outlook`, `slack`, `notion`, `teams`, `asana`, `clickup`, `linear`, `jira`, `zendesk`, `freshdesk`, `productboard`, `zulip` → all **EQUIVALENT-AT** `lib/ai/tools/connectors/<name>-tool.ts` + `registry.ts`.

EXCLUDED (28) — with the shared gating facts first:
- (i) **OAuth-mode providers** (17): staging has no `OAUTH_PROVIDER_CONFIG` entry, no authorize/callback wiring and no env contract for them; `callConnectorApi` also has no pinned `API_ORIGINS` entry, so even a ported read tool could never authenticate or fetch (it would always fail "not connected / Connector API is unavailable"). Porting = OAuth vendor app + config entry + origin pinning + tool + registry/test wiring (WP4's directory), i.e. connection-onboarding work, not a read-tool drop-in.
- (ii) **Server-token providers** (10) + wikipedia: zip used ONE server-wide env token shared by all users (`lib/connectors/credentials.ts` admin-config/env model) with a per-user opt-in row (`/api/connectors/[provider]/token-connect`). Staging has no server-token onboarding route (only per-user freshdesk/zulip api-key credential routes). Porting needs that route first (EXCLUDED-FOR-NOW, §3c).
- (iii) `lib/ai/tools/connectors/*` is WP4's active directory — new files there are out of my write scope by constraint.

| zip tool file | lines | disposition + one-line justification |
|---|---|---|
| gmail/drive/calendar/github/outlook/slack/notion/teams/asana/clickup/linear/jira/zendesk/freshdesk/productboard/zulip | — | EQUIVALENT-AT staging registry (16) |
| `confluence-tool.ts` | 193 | EXCLUDED — Atlassian OAuth not configured in staging (jira config exists but no confluence entry/scopes); needs config + scope addition before any tool port |
| `gitlab-tool.ts` | 118 | EXCLUDED (i) — no OAuth config/origin; read tool itself ~90 lines |
| `bitbucket-tool.ts` | 115 | EXCLUDED (i) — no OAuth config/origin |
| `dropbox-tool.ts` | 106 | EXCLUDED (i) — no OAuth config/origin |
| `airtable-tool.ts` | 123 | EXCLUDED (i) — no OAuth config/origin; cheapest future port (plain bearer REST) |
| `hubspot-tool.ts` | 122 | EXCLUDED (i) — no OAuth config/origin |
| `salesforce-tool.ts` | 138 | EXCLUDED (i) — no OAuth config; org-limited Salesforce OAuth is heavier than per-user framework |
| `discord-tool.ts` | 109 | EXCLUDED — zip contract requires a **Bot token** (not user OAuth); no secure user-authorized token model in staging (matches register C42 note) |
| `egnyte-tool.ts` | 99 | EXCLUDED (i) — no OAuth config/origin |
| `gong-tool.ts` | 100 | EXCLUDED (i) — no OAuth config/origin |
| `highspot-tool.ts` | 98 | EXCLUDED (i) — no OAuth config/origin |
| `document360-tool.ts` | 108 | EXCLUDED (i) — no OAuth config/origin |
| `coda-tool.ts` | 113 | EXCLUDED (i) — no OAuth config/origin |
| `outline-tool.ts` | 111 | EXCLUDED (i) — no OAuth config/origin |
| `slab-tool.ts` | 98 | EXCLUDED (i) — no OAuth config/origin |
| `guru-tool.ts` | 90 | EXCLUDED (i) — no OAuth config/origin |
| `axero-tool.ts` | 110 | EXCLUDED (ii) — server-token onboarding route missing in staging |
| `bookstack-tool.ts` | 130 | EXCLUDED (ii) — server-token onboarding missing |
| `canvas-lms-tool.ts` | 124 | EXCLUDED (ii) — staging id `canvas`; server-token onboarding missing |
| `discourse-tool.ts` | 127 | EXCLUDED (ii) — server-token onboarding missing |
| `drupal-wiki-tool.ts` | 116 | EXCLUDED (ii) — server-token onboarding missing |
| `mediawiki-tool.ts` | 127 | EXCLUDED (ii) — server-token onboarding missing |
| `loopio-tool.ts` | 98 | EXCLUDED (ii) — server-token onboarding missing |
| `xenforo-tool.ts` | 108 | EXCLUDED (ii) — server-token onboarding missing |
| `fireflies-tool.ts` | 121 | EXCLUDED (ii) — server-token onboarding missing |
| `gitbook-tool.ts` | 96 | EXCLUDED (ii) — server-token onboarding missing |
| `testrail-tool.ts` | 136 | EXCLUDED (ii) — server-token onboarding missing |
| `wikipedia-tool.ts` | 104 | EXCLUDED (ii) — no-auth provider, but staging has no "connect = record row" path (connectors GET/DELETE only); needs the token-connect route generalized for `authMode: "none"` |

### 3c. lib/connectors (3) + app/api/connectors (9)

| zip path | disposition | evidence / justification |
|---|---|---|
| `lib/connectors/credentials.ts` | EXCLUDED | admin-config/env credential resolution + server-token model superseded by staging `oauth-providers.ts` (env-based OAuth client config) + per-user encrypted tokens (`oauth-flow.ts` encrypt/decrypt) + freshdesk/zulip per-user credentials routes |
| `lib/connectors/refresh.ts` | EXCLUDED | 564-line token refresh chain superseded by `provider-api.ts` single-flight `refreshExpiredToken` (in-flight dedupe, 30s-early refresh) |
| `lib/connectors/oauth-callback-page.ts` | EQUIVALENT-AT | staging `[provider]/callback/route.ts` renders its own (simpler inline) HTML success/failure page with postMessage close handling — cosmetic difference only |
| `app/api/connectors/github|gmail|google-calendar|google-drive|notion|outlook|slack/route.ts` (7 per-provider authorize routes) | EQUIVALENT-AT | staging generic `app/api/connectors/[provider]/authorize` + `/callback` cover every `OAUTH_PROVIDER_CONFIG` provider; all 7 are configured (gmail, google-calendar, google-drive, github, outlook, slack, notion) |
| `app/api/connectors/[provider]/delete/route.ts` | EQUIVALENT-AT | staging `DELETE /api/connectors?provider=` → `disconnectConnector` (owner-scoped, best-effort revocation + token cleanup — richer than zip's raw row delete) |
| `app/api/connectors/[provider]/token-connect/route.ts` | EXCLUDED-FOR-NOW | server-token opt-in route missing in staging; this is the gate for the 10 token providers + wikipedia. Effort: one route (validate provider ∈ TOKEN_PROVIDERS, create/update owner's `user_connector` row with metadata, no secret stored per-user) + env contract per provider; no migration needed |

## 4. lib/rag (7), lib/auth (4), lib/file-storage (3)

### lib/rag (zip) → staging `lib/ai/rag` + `lib/project-brain`

| zip path | disposition | evidence |
|---|---|---|
| `lib/rag/chunk.ts` | EQUIVALENT-AT | `lib/project-brain/chunk.ts` (`chunkText`, window+overlap) + `lib/ai/rag/ingest.ts`. Caveat for the project-brain owner: zip's chunker is paragraph-aware (splits on `\n\n`, merges small paragraphs); staging's is a naive fixed window — improvement candidate, not a parity gap |
| `lib/rag/chunk.test.ts` | EXCLUDED | asserts zip's paragraph-aware semantics; would fail against staging's simpler splitter; porting the algorithm changes ingest behavior (project-brain owner's call) |
| `lib/rag/parse.ts` | EQUIVALENT-AT | `lib/ai/ingest/{formats.ts, readers/pdf.ts, readers/document.ts, limits.ts}` (bounded readers, B04 lineage) |
| `lib/rag/retrieve.ts` | EQUIVALENT-AT | `lib/ai/rag/search.ts` (`searchDocumentEmbeddings` + relaxed variant + index counts) + `lib/project-brain/search-local.ts` |
| `lib/rag/retrieve.test.ts` | EXCLUDED | written against zip's `retrieveRelevantChunks`/db shape; staging search API differs (rewrite, not port) |
| `lib/rag/format.ts` | EXCLUDED | builds an injected `<retrieved_context>` prompt section; staging surfaces RAG hits as **tool results** (`search-knowledge-base` tool) — no injected-section consumer exists; port would be dead code. B07's hardened XML-escaping lives in the destination fork, not zip |
| `lib/rag/format.test.ts` | EXCLUDED | same |

### lib/auth (4) — destination team extensions

| zip path | disposition | justification |
|---|---|---|
| `lib/auth/org-hooks.ts` | EXCLUDED-FOR-NOW | personal-team-on-signup hook over zip's `team` tables; staging uses better-auth organizations. Blocked with team-repository migration spec (§1) |
| `lib/auth/org-hooks.test.ts` | EXCLUDED-FOR-NOW | same |
| `lib/auth/scoped-where.ts` | EXCLUDED-FOR-NOW | org-scoped WHERE builder over `TeamMemberTable`; staging equivalent is `lib/auth/organization-permissions.ts` + `org-scope.test.ts`. Blocked on team model decision (§1) |
| `lib/auth/scoped-where.test.ts` | EXCLUDED-FOR-NOW | same |

### lib/file-storage (3)

| zip path | disposition | justification |
|---|---|---|
| `storage-utils.test.ts` | PORTED-NOW | 3 tests pass verbatim against staging's hardened `storageKeyFromUrl` (all three zip cases behave identically) |
| `local-file-storage.ts` | EXCLUDED-FOR-NOW | on-disk backend is coupled to zip's **unauthenticated** `GET /api/files/[...path]` public-serving route, which bypasses staging's storage-ownership model (`storage-ownership.test.ts`, per-user prefixes). Porting needs an ownership-aware (or signed-URL) serving route + backend registration + env (`FILE_STORAGE_LOCAL_DIR`) — ~350 lines, no migration; genuinely useful for the systemd deployment, but a security-reviewed design is required first |
| `vercel-blob-storage.ts` | EXCLUDED | requires `@vercel/blob` dep absent from staging (zero-new-deps violated); capability duplicated by staging S3/Supabase backends |

## 5. API route buckets + root app files

| zip path | disposition | evidence / justification |
|---|---|---|
| `app/api/admin/audit/route.ts` | EQUIVALENT-AT | staging security events: 0075 + `app/api/admin/security-settings/route.ts` + `components/admin/security-events-settings.tsx` |
| `app/api/admin/dashboard/stats/route.ts` | EXCLUDED-FOR-NOW | admin console stats aggregation; staging has no admin console shell (destination admin pages belong to the app/(chat)/components/admin workstreams). Effort: route ~160 lines + a consumer |
| `app/api/admin/health/route.ts` | EXCLUDED | destination-only ops diagnostics (DB/cache/encryption probes); no staging counterpart by design |
| `app/api/admin/users/route.ts` | EQUIVALENT-AT | staging `app/api/admin/actions.ts` server actions (`updateUserRolesAction`, `updateUserBanStatusAction`, `updateUserTierAction`) + `components/admin/users-table.tsx` |
| `app/api/agent/[id]/view/route.ts` (+ test) | EXCLUDED-FOR-NOW | needs `agent_view` table (migration spec §1); pairs with agent-view-repository |
| `app/api/agent/published/route.ts` (+ test) | EQUIVALENT-AT | staging `app/api/published-page/route.ts` + `published-page-repository.pg.ts` (0044) |
| `app/api/archive/actions.ts` | EQUIVALENT-AT | staging-native archives (C40, 0078): `app/api/archive/route.ts` + `[id]/items` |
| `app/api/chat/export/actions.ts` | EQUIVALENT-AT | comment-creation server action → staging REST `app/api/export/[id]/comments/route.ts` (`chatExportRepository.insertComment`) |
| `app/api/cron/tick/route.ts` | EXCLUDED | superseded — see §2 |
| `app/api/export/[id]/og-image/route.ts` + `template.tsx` | PORTED-NOW | staging serves public exports (`app/(public)/export/[id]` with `isExpired`) but had no OG preview; `next/og` is built into Next; `chatExportRepository.selectByIdWithUser/isExpired` already exist; branding aligned to Void-Agent |
| `app/api/files/[...path]/route.ts` | EXCLUDED-FOR-NOW | zip route is an unauthenticated public file read — incompatible with staging storage-ownership model; port only together with a security-reviewed local-storage serving design (§4) |
| `app/api/health/route.ts` | EXCLUDED-FOR-NOW | trivial diagnostics (59 lines); no admin console to surface it; port if ops dashboards land |
| `app/api/mcp/composio/route.ts` | EQUIVALENT-AT | staging `lib/composio/{client,config,scoped-tools,toolkit-catalog,toolkit-connections}.ts` + `app/api/mcp/*` supersede the zip route |
| `app/api/scheduler/jobs/*` (2) | EXCLUDED | superseded — see §2 |
| `app/api/sentry-example-api/route.ts`, `app/sentry-example-page/page.tsx` | EXCLUDED | Sentry SDK example scaffolding (verify-alert plumbing), not product code; staging keeps `sentry.edge/server.config.ts` only |
| `app/api/thread/[id]/fork/route.ts` (+ test) | EXCLUDED-FOR-NOW | A08 destination feature; needs `lib/chat/fork-thread` port + a fork/copy path in `chat-repository.pg.ts` + route wiring (A08 is a separate workstream; not a small port) |
| `app/api/user/memory/route.ts` | PORTED-NOW | staging's `components/user/user-detail/memory-settings-card.tsx` already calls `/api/user/memory` (GET/POST/PUT/DELETE) but the route never existed — dead endpoint; ported against `memoryRepository` (0069) + new `lib/ai/memory/memory-source.ts` |
| `app/api/voice/groq-konvo/stt/route.ts`, `tts/route.ts` | EXCLUDED-FOR-NOW | Konvo/Groq speech stack (169+156 lines) belongs to the destination voice workstream (B14–B25); staging voice = xiaozhi/sessions/devices/inbox. Effort: Groq provider wiring + env + B-row alignment |
| `app/api/workflow/actions.ts` | EQUIVALENT-AT | staging `app/api/workflow/tools/route.ts` calls the same `workflowRepository.selectExecuteAbility` |
| `app/(auth)/auth/page.tsx` | EQUIVALENT-AT | staging auth at `app/(auth)/sign-in` + `sign-up` (+ forgot/reset password flows, captcha via `lib/auth/captcha*`) |
| `app/global-error.tsx` | EXCLUDED-FOR-NOW | staging has only `app/(chat)/error.tsx`; a root boundary is a 1-file port but must be re-verified against staging's root layout/fonts (different shell) |
| `app/page.tsx` | EXCLUDED | product decision: staging root is chat-first; a landing entry belongs to the app/(public)/landing product decision |
| `app/robots.ts`, `app/sitemap.ts` | EXCLUDED-FOR-NOW | SEO entries enumerate the destination's public marketing pages (about/plans/policies) which staging does not have; port after the app/(public) decision |
| `app/apple-touch-icon.webp`, `favicon-16x16.webp`, `favicon-32x32.webp`, `favicon-96x96.png`, `favicon-96x96.webp`, `favicon.svg`, `web-app-manifest-192x192.png/.webp`, `web-app-manifest-512x512.png/.webp` (10) | EXCLUDED | asset decision: staging ships its own brand set (`favicon.ico`, `favicon-16x16.png`, `favicon-32x32.png`, `apple-touch-icon.png`, `android-chrome-192/512.png`) |

## 6. hooks, lib misc, types, worker

| zip path | disposition | evidence / justification |
|---|---|---|
| `hooks/use-state-with-browserstorage.ts` | EXCLUDED | destination-only hook; consumers are destination components (components/* families, not in scope) |
| `hooks/use-unsaved-changes.ts` | EXCLUDED | same |
| `hooks/queries/use-archives.tsx` | EQUIVALENT-AT | staging `hooks/queries/use-archives.ts` (C40) |
| `hooks/queries/use-builds.ts` | EQUIVALENT-AT | staging `hooks/queries/use-app-builds.ts` (C43 rename) |
| `hooks/queries/use-sandboxes.ts` | EXCLUDED-FOR-NOW | staging has `use-sandbox-keepalive.ts` only; a sandbox list/query hook belongs with the sandbox dashboard UI (components/sandbox family) |
| `lib/browser-stroage.ts` | EXCLUDED | destination-only helper (filename typo included); no staging consumer |
| `lib/const.test.ts` | PORTED-NOW | ported verbatim + added zip's `getRequiredBaseUrl` helper to staging `lib/const.ts` (getBaseUrl candidate list is identical; 4/4 tests pass) |
| `lib/site-config.ts`, `lib/site-config-runtime.ts` | EXCLUDED-FOR-NOW | destination admin-console config layer (models/canvas/tools/general tabs contract); staging persists `site_config` (0068) via `site-config-repository.pg.ts` with an upstream shape. Merge decision owned by the admin-console workstream |
| `lib/admin/site-config-defaults.ts`, `lib/admin/site-config-reader.ts` | EXCLUDED-FOR-NOW | same layer |
| `lib/cache/upstash-rest-cache.test.ts` | PORTED-NOW | staging impl is behaviorally identical (path-style REST URLs, `Upstash error*` messages); 3/3 pass |
| `lib/chat/fork-thread.ts` (+ test) | EXCLUDED-FOR-NOW | A08 fork engine (81 lines) — needs chat-repository fork path + routes; part of the A08 workstream with `app/api/thread/[id]/fork` |
| `lib/community/client.ts`, `server.ts` | EQUIVALENT-AT | staging-native community (C39, 0077): `app/api/community`, `app/(chat)/community` |
| `lib/email/resend.ts`, `admin-triggers.ts`, `templates.ts` | EXCLUDED | destination email layer (Resend dep absent from staging — zero-new-deps violated); staging `lib/email` keeps only `email-body-format.ts`; adding email infra is a product decision |
| `lib/validations/payment.ts` | EXCLUDED | Stripe-era payment schema; staging billing is Dodo (0074 + `lib/payments/dodo-config.ts`) |
| `lib/validations/user-name.ts` (+ test) | EQUIVALENT-AT | already present in staging at the same path (landed concurrently; `user-name.ts` byte-identical, test extended, 6/6 pass; consumed by `app/api/user/validations.ts`) |
| `lib/rate-limit/free-tier-usage.ts` | EXCLUDED | zip free-tier Upstash counters (414 lines); staging meters via Dodo tiers (`user.tier`, `SUBSCRIPTION_TIER_VALUES`) + `lib/rate-limit/api-rate-limit.ts` + team budget reservation (C02/C29) |
| `types/admin-config.ts` | EXCLUDED-FOR-NOW | destination admin-console config types; pairs with `lib/site-config*` (§ above) |
| `worker/index.ts` | EXCLUDED | standalone worker superseded by Inngest; outbox job ported (§7), reap + checker already inngest |

## 7. PORTED-NOW — files written to staging + test results

**New/ported files (11):**

1. `apps/web/src/lib/inngest/functions/webhook-outbox.ts` — webhook outbox delivery tick (zip `outbox-worker.ts` ported into the Inngest scheduler; the one scheduler capability staging lacked). Cron `* * * * *`, `throttle 1/1m` (replaces zip's PG leader lock), claim 10 pending events → per-subscription delivery rows → HMAC sign (`t.v1` envelope per `lib/webhooks/receiver-docs.ts`) → pinned-IP delivery (10s) → delivered / backoff / terminal-fail. Deviations documented in-file: retries **reuse** existing delivery rows (zip re-inserted, which violates the UNIQUE (event_id, subscription_id) constraint and poisoned its retry path); malformed/exhausted events reach terminal `failed` (zip looped forever); envelope keys `eventType`/`payload` per staging's documented receiver contract; updates subscription health counters via existing `updateWebhookSubscriptionStats`.
2. `apps/web/src/app/api/inngest/route.ts` — registered `webhookOutboxTick`.
3. `apps/web/src/lib/db/pg/repositories/webhook-repository.pg.ts` — added `failOutboxEvent(eventId, error, nextAttemptAt | null, attempts?)` (terminal `failed` vs pending-with-backoff; the schema's status check already allows `'failed'`).
4. `apps/web/src/app/api/user/memory/route.ts` — GET/POST/PUT/DELETE memory CRUD (zip route ported to staging `withAuth` + `memoryRepository`; content/category bounds added). Fixes staging's memory settings card calling a dead endpoint.
5. `apps/web/src/lib/ai/memory/memory-source.ts` — `enrichMemoriesWithSource` (owner-scoped batched join memory → source message; `MemoryWithSource` shape the UI mirrors).
6. `apps/web/src/app/api/export/[id]/og-image/route.ts` + `template.tsx` — OG share image for public exports (built-in `next/og`, existing repo methods, Void-Agent branding).
7. `apps/web/src/lib/const.ts` — added zip's `getRequiredBaseUrl(featureName)`.
8. Test ports: `apps/web/src/lib/file-storage/storage-utils.test.ts` (verbatim), `apps/web/src/lib/cache/upstash-rest-cache.test.ts` (verbatim), `apps/web/src/lib/const.test.ts` (verbatim).
9. New tests: `apps/web/src/lib/inngest/functions/webhook-outbox.test.ts`, `apps/web/src/app/api/user/memory/route.test.ts`, `apps/web/src/app/api/export/[id]/og-image/route.test.ts`.

**Validation (focused vitest from `apps/web`):**

```
pnpm exec vitest run src/lib/inngest/functions/webhook-outbox.test.ts \
  src/app/api/user/memory/route.test.ts "src/app/api/export/[id]/og-image/route.test.ts" \
  src/lib/file-storage/storage-utils.test.ts src/lib/cache/upstash-rest-cache.test.ts \
  src/lib/const.test.ts src/lib/webhooks
→ 9 files passed, 64 tests passed, 0 failed
```

Breakdown: new/ported tests 6 files / 32 tests (outbox 8, memory route 10, og-image 4, storage-utils 3, cache 3, const 4); regression re-run of the touched-area suites: `lib/webhooks` url-guard 13 + sign 9 + deliver 10 = 32 green. Also green: `src/lib/validations/user-name.test.ts` (6/6, concurrent agent's file). No full typecheck/build per instructions; imports verified against staging aliases/exports (`lib/db/repository`, `lib/webhooks`, `@/components/...`, `auth/route-guard`).

## 8. Migration specs to reserve (none applied)

- **0082 `agent_view`** — analytics table for `agent-view-repository` + `app/api/agent/[id]/view` (spec in §1).
- **0082/0083 team model decision** — either adopt better-auth organization tables (recommended; tables already exist) or create `team`/`team_member`/`team_invitation` + `session.active_team_id` per C28/C29 (spec in §1). Unblocks: team-repository, org-hooks, scoped-where, and the destination team UIs (C27–C29).
- **0082/0083 scheduled-task one-shot/assistant** (only if Gap A is wanted): `ALTER TABLE scheduled_task ALTER COLUMN agent_id DROP NOT NULL;` + `ADD COLUMN task_type text NOT NULL DEFAULT 'agent'` (check `('agent','assistant')`) + `ADD COLUMN payload jsonb NULL` for one-shot `runAt` + checker auto-disable for `task_type='once'`.
- No migration needed for: webhook outbox driver (ported), token-connect route (uses existing `user_connector`), memory route (0069 exists), og-image (0079/0044 lineage exists).

## 9. Caveats

- Staging is being modified concurrently (user-name validation landed mid-triage); existence was re-verified 2026-11-11 ~04:15 IST before writing dispositions.
- The parity map's basename match `src/lib/scheduler/worker.ts → src/lib/code-runner/worker.ts` is a FALSE match (different capability: chat code-execution worker vs scheduler tick); the real zip `worker.ts` (scheduler tick) is covered under §2.
- Zip's outbox-worker has two latent bugs (attempts never incremented → max-attempt branch dead; retry re-insert violates the delivery unique constraint) — the port fixes both; documented in-file and §7.
- `lib/ai/tools/connectors/*` was not written to (WP4's directory). If WP4 later wants the 28 provider read tools, the gate is connection onboarding (OAuth config entries / token-connect route), then ≤120-line read tools against `callConnectorApi` with a pinned `API_ORIGINS` entry each.
