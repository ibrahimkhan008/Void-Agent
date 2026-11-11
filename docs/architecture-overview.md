# Void-Agent architecture and baseline

> **Repository roles corrected 2026-11-09:** Canonical upstream is [`keinsaasforever/better-chatbot`](https://github.com/keinsaasforever/better-chatbot) `main`; customized destination is [`ibrahimkhan008/Void-Agent`](https://github.com/ibrahimkhan008/Void-Agent). Earlier `Void-Agent-V2` references below describe a historical local checkout or prior audit evidence, not the canonical upstream identity. For current ports, compare the live upstream branch with the destination and preserve Void-Agent customizations. The current instruction is to keep changes local: no commit, push, or deployment.

Current destination: `C:/Users/Ikra/Desktop/Void-Agent`; canonical upstream: `keinsaasforever/better-chatbot` at `6f4183566bc48616303cb84055f11f79578c82fe`. The sibling `Void-Agent-V2` paths and architecture notes below are historical evidence from the earlier audit, not the current source of truth.

**Promoted state (2026-11-11):** the destination is the integrated monorepo — `apps/web` (Next.js / React 19 / AI SDK 7, TypeScript, pnpm, Tailwind/Radix, Zustand/SWR, Better Auth, Drizzle with node-postgres and PostgreSQL/pgvector), `apps/desktop` (Electron shell carrying the merged destination security modules: MCP consent/IPC, pinned remote transport, secure updater, notification IPC, server-picker, application menu, desktop handoff), `packages/*` (audit, auth-contracts, channel-contracts, mcp-core, mcp-router, mcp-types), `servers/mcp-stdio`, root `e2b/` template infrastructure, Turbo orchestration, and an Inngest-powered scheduler with a webhook outbox delivery driver. Local development remains port 3000; do not introduce Docker deployment. The pre-promotion single-app description in the historical sections below is retained as evidence only.

Primary subsystem evidence (all under `apps/web/src` unless noted): `app/api/chat` (+ `app/api/chat/chat/tool-loading.ts` request-scoped tool loaders binding Build and Memory toolkits), `lib/ai/models.ts`, `lib/ai/mcp`, `lib/ai/workflow`, `lib/ai/memory`, `lib/inngest` (+ `functions/webhook-outbox.ts`), `lib/db/pg/schema.pg.ts` + `lib/db/pg/repositories/*`, `lib/security` (chat-request-guard.{shared,client,server}, chat-payload-obfuscation, encryption), `lib/auth`, `lib/ai/tools/connectors` + HITL approval modules, `app/api/admin` (config, tools, providers, api-keys, security-settings, payments/dodo), `lib/bug-bounty.ts` + `app/api/bug-bounty/*`, `components/admin`, `lib/sandbox`/`lib/ai/app-builder*` (app builder), `apps/desktop/src/main/*` (desktop security). Existing integrations include encrypted dynamic providers, local/RAG documents, connectors, scheduler/outbox, teams, Dodo billing and sandbox/build jobs. External credentials and every live journey remain unverified; keep the existing saved display-name provider contract.

Baseline working-copy changes predate this directive: OAuth cookie-prefix fixes,
middleware regression tests, credential ignore rule and legacy lockfile repair.
Preserve these changes. The source still contains historical Flare identifiers;
do not mass-rename provider IDs, environment variables or migration history.

## Conversation history loading

Chat thread pages fetch the newest 50 messages. Older messages are requested through an authenticated, ownership-checked server action and prepended by the client with scroll anchoring. The repository supports optional bounded keyset reads while keeping the no-options path unbounded for exports, insights, and existing API consumers.

## Human-in-the-loop decisions

The chat route conditionally provides no-execute tools for plan approval, bounded user questions, and editable email draft review. Dedicated chat cards return decisions through the existing AI SDK tool-result mechanism. These decisions guide model behavior and do not replace the connected tool's server-side authorization. User answers are persisted in chat history; the input workflow is explicitly not for secrets.

## F037 project document originals (2026-11-06)
- Better Chatbot/V2 has project upload, list, download, per-document analysis, deletion, and tracked DOCX edit workflows. Void-Agent now supports project-member listing and authenticated download of original bytes for project documents uploaded into an already attached writable knowledge collection. Upload reuses the existing parser/RAG/embedding path and records a project-to-item link.
- Original bytes are uploaded with the authenticated uploader as storage owner; only the opaque storage key is stored on the collection item. Project members retrieve by project/item IDs through an authorized no-store proxy; user-supplied keys/URLs are never accepted. Collection item listing removes storageKey from returned JSON.
- Upload is editor-only, same-origin, rate-limited, bounded to 20 MiB (plus request framing), parser-allowlisted, active-content blocked, and rechecks project/collection authorization after parsing/indexing before linking. Failed storage/RAG work cleans the stored blob; failed RAG clears the stored key from the failed item.
- Tests: 11 focused tests passed across project upload/download, RAG ingest and collection repository; `pnpm db:check`, whole-project typecheck, scoped Biome and production build passed (192/192 pages).
- F037 remains PARTIAL: files must be placed in a collection already attached to the project; project-independent file spaces, remove/delete UI, per-document cited analysis endpoint, tracked DOCX edits, live database/storage/browser verification remain. Migration 0058 is journaled but unapplied.

## F037 project document capability follow-up (2026-11-06 22:36:29 +05:30)
- Added a cited, per-document analysis workflow for ready project documents. The endpoint checks current project membership, attached collection, and source-owner scope; treats document text as untrusted; returns only exact substring citations; and does not expose storage keys.
- Added project unlink semantics for authorized editors. Removing a document from a project deletes only the project mapping; the underlying collection source and original remain available in the collection.
- Hardened upload and analysis body parsing with a streaming byte cap that applies when Content-Length is absent or inaccurate. Original document uploads now fail closed unless storage is local or explicitly configured private (Vercel Blob private mode or S3 private mode).
- Improved ingestion rollback by carrying failed collection item IDs to the upload route; fixed parse-error handling, bounded multipart and JSON tests, and UI states for writable collections, load retry, status, accessible disclosures, and stale analysis responses.
- Verification: focused project-document/RAG/body-limit tests passed (22 tests across 5 files); pnpm check-types passed with NODE_OPTIONS=--max-old-space-size=6144; pnpm db:check passed; scoped Biome passed. Production build and live PostgreSQL/object-storage/browser journeys are pending. Migration 0058 remains unapplied.
- F037 remains PARTIAL: documents must be uploaded into an attached writable collection; unlinking preserves the collection source rather than deleting it; persistent object cleanup on collection deletion/storage deletion failure is not implemented; tracked DOCX edits and live service verification remain outstanding.
- Correction to the earlier 2026-11-06 22:12 context entry: migration 0058 is at src/lib/db/migrations/pg/0058_project_document_files.sql, not src/lib/db/pg/migrations/pg/0058_project_document_files.sql.

## Verification addendum (2026-11-06 22:45:46 +05:30)
- The production build completed successfully and generated all 192 static pages. Existing warnings remain: dynamic headers() session access during static collection, E2B dynamic equire, unpdf import.meta, <img> lint warnings, SSL mode compatibility notice, and absent optional Redis/E2B environment configuration.
- The tabular-review generator now checks requested cell membership before setting the review to generating; invalid targets return 404 without issuing the status update. Focused regression test passed (1/1), and focused Biome passed.
- Combined focused verification is 23 passing tests across 6 files (22 project-document/RAG tests plus 1 tabular-review test). Standalone pnpm check-types passed with a 6GB Node heap. pnpm db:check, scoped Biome, and git diff --check passed; Git only reported existing LF/CRLF conversion notices.
- No full test suite, live PostgreSQL migration/application, real cloud object-storage journey, or browser/provider journey was run in this addendum. Migration 0058 is still unapplied.

## Parallel migration batch verification (2026-11-06 23:14:00 +05:30)
- **Background chat alerts:** Added an opt-in Customize setting and generic hidden-tab browser notifications for completion, errors, pending review tools, and requestInput. Permission is requested only from the user action; alert text contains no prompt/response details. Browser closed-tab delivery and Electron native alerts are not implemented.
- **Provider discovery:** Changed model discovery to bounded same-origin POST JSON so API keys do not appear in URL history; added admin authorization, per-admin rate limiting, public-HTTPS URL validation, DNS-pinned HTTPS, no redirect following, 10-second timeout, and 64 KB response cap. Local/private model endpoints are intentionally unavailable through discovery in production; provider runtime endpoint restrictions need separate review.
- **Voice preview:** Added opt-in classification-only preview for an owned, saved voice-device transcript. It is rate-limited, tool-free, writes no records, returns unknown on model failure, and preserves the existing explicit Cancel/Send-to-chat decision before normal chat approvals.
- **Tabular reviews:** Invalid targeted-cell requests now validate before reserving the review as generating; regression coverage confirms no status update on 404.
- **Tests:** Full pnpm test passed: 1,598 tests across 268 files. Focused tests for this work passed (48 tests across 13 files). pnpm check-types passed with a 6 GB Node heap; pnpm db:check, scoped Biome lint/import check, formatting checks for new files, and git diff --check passed.
- **Build:** The latest production build after these parallel slices is pending. A preceding build passed 192/192 pages before the provider/notification/voice changes; do not use that earlier build as current verification.
- **Known gaps:** No live PostgreSQL/migration application or browser/device/provider service journey was run. Migration 0058 remains unapplied. Overall migration, F037 document workflows, CreateAgent feature parity, project-specific collaboration, per-user local models, and other remaining matrix entries are still incomplete.


> Current repository identities, pinned source snapshots, desktop provenance, and staging status are maintained in [current-source-roles.md](current-source-roles.md). Historical Void-Agent-V2 references in this file are retained as prior audit evidence and do not identify the current canonical sources.

## Staged architecture additions — 2026-11-11

The separate integration workspace adds destination-specific modules under `apps/web` while retaining the Better Chatbot monorepo baseline: community repository/media validation (migration 0077), namespaced archive persistence/APIs (0078), and thread-insights generation/repository (0079). Direct provider OAuth/tools are implemented as owner-bound services and approval-gated write actions; the desktop changes remain within upstream `apps/desktop`. A01 chat run guards and recovery remain in the upstream app's chat route/repository, with a success-gated transport wrapper in the staged ChatBot. These are staging changes only; they have not been copied into the primary repository. Current database metadata checks do not apply these migrations to PostgreSQL.

## 2026-11-11 connector/security/app-builder integration strategy

- For direct OAuth connector tools, preserve owner-bound encrypted credentials and fixed-origin bounded transports. Every mutation consumes a short-lived one-use approval bound to the exact canonical payload immediately before the provider call. Do not substitute an upstream generic write tool or treat a provider catalog entry as a workflow.
- For C45, port the request challenge only if its replay/rate controls work across the actual deployment cache topology. Authenticate first, verify before persistence/provider/tool effects, and preserve a narrow scheduler skip.
- For the original prompt-to-app builder, reuse the secure staged E2B lifecycle instead of the source's unconstrained shell assumptions. Use allowlisted image/template, fixed setup/start commands, owner-scoped persistent job state, strict path/file validation, resource/time caps and guaranteed cleanup. Keep generic code execution separate.
- Bug bounty uses a later additive migration only after AI builder migration 0080 is released.

### Connector scope correction — 2026-11-11
Require exact one-use approval for every provider write. Mock-tested writes now cover Gmail, Drive, Teams, Asana, ClickUp, Linear, Jira, Zendesk. Productboard needs workspace-derived schema/relationship; Freshdesk needs encrypted per-user API-key/subdomain setup; Discord requires a Bot token (not the current user OAuth model); Zulip requires per-user realm/token and pinned-host controls. Do not enable any of these until the credential boundary and approval path are implemented and tested.

### C45 intermediate implementation note — 2026-11-11
The cryptographic challenge port is in progress. Initial shared/client/server modules and a bounded authenticated challenge route are being added. Replay consumption uses atomic `setNX`; the implementation checks for process-local cache and fails closed rather than claim cross-instance safety. The allowed origin derives from configured deployment origins instead of copying old Flare hard-coded domains. Route/client integration and adversarial tests are not yet complete; current typecheck pass predates these latest edits.

### AI app builder in-progress — 2026-11-11
An additive `app_build` table/migration 0080 and initial repository/runner are underway. Maintain one owner-scoped lifecycle per build, owner/thread integrity in PostgreSQL, allowlisted templates and fixed commands, no arbitrary shell input, bounded file path/content/output, and cleanup on failure/cancel. `db:check` passed but no actual DB application, API/UI, or end-to-end verification is complete.

### Provider contract integration update — 2026-11-11
Freshdesk uses owner-bound encrypted API-key credentials, a server-configured validated tenant subdomain, fixed API host construction and exact-payload approval for both supported writes. Productboard v2 requires runtime configuration and a Component parent; adapt the workflow to discover components/config and bind the chosen component/fields into approval. Do not reuse the source's productId as a component. Discord and Zulip require separate credential/host models and remain disabled until safely supported.

## 2026-11-11 00:37 IST — app builder implementation progress

The staging app now has a standalone build create/detail UI and APIs, owner-scoped persistence (migration 0080), bounded plan generation and E2B runner, cancellation/cleanup path, and tests (2 files / 11 tests passed). Database schema enforces owner/thread relation, active-build cap and sandbox uniqueness. The build tool is currently not registered in chat; route integration is being coordinated with the C45 owner. Resume/cleanup edge tests and combined typecheck/db:check/Biome are still pending. No real PostgreSQL, E2B credentials, or browser E2E.


## Current integration boundary — 2026-11-11 01:05 IST

The upstream-based application remains in C:/Users/Ikra/Desktop/Void-Agent-integration-staging, without Git metadata and not promoted. Destination remains at 589fa48f3c323d049e51d566f3b8ddff95d59bc5 with 61 dirty/untracked entries and no apps/web directory. Staging has 159 upstream content differences and unresolved custom equivalence. Current overall/implementation/verified estimates: 44% / 58% / 31%. Do not treat staging as deployed or fully validated.
