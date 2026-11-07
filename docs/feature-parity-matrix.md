# Feature parity matrix ? reviewed capability families

This checkpoint reviews capability families below; the surface census is broader. EXISTING means source implementation located, not a fresh end-to-end certification. PARTIAL includes equivalence still requiring detailed review. MISSING means no equivalent found in this pass, not proof of exhaustive absence. Feature counts are not derived from route counts. No full-parity claim.

### Current family classification (2026-11-07)

- For the original F001-F036 rows, current primary row classifications are: 11 EXISTING, 20 PARTIAL, 2 EXCLUDED, 2 OPTIONAL, and 1 DEPRECATED. Each family is counted once by its primary category; F030 is OPTIONAL and separately states that family parity is PARTIAL.
- No F001-F036 family row is classified COMPLETE. A completion percentage is not available: EXISTING records located source, not verified end-to-end behavior, and the broad family rows are not a complete feature-level denominator.
- F037 project document originals was added later and remains PARTIAL. It is separate from the historical F001-F036 denominator.
- The initial-triage distribution (12 EXISTING, 10 PARTIAL, 9 MISSING, 4 OPTIONAL, 1 DEPRECATED) remains documented as a historical snapshot in `docs/integration-progress.md`; it is not the current distribution.

## F001 ? Chat CRUD and persistence

- Category/status/priority: EXISTING, P0.
- Reference evidence: `chat/actions.ts` under `apps/web/src` unless prefixed `apps/` or `.github/`; resolve full paths through the source census.
- Primary evidence: `src/app/api/chat/actions.ts`.
- Implementation and missing components: Keep current repository ownership guards; verify every mutation.
- Strategy: retain and verify.
- Dependencies: Existing auth/user scoping, current database and AI SDK 5 contracts; additional requirements must be justified per implementation batch.
- API/backend changes: None authorized by this row alone; define scoped contracts and failure paths before implementation.
- Database changes: No schema copied or applied; append-only migration design required where persistence changes.
- Frontend changes: Preserve current navigation, design and providers; add only missing affordances.
- Security: Enforce per-user/team ownership, validate untrusted input, redact secrets and bound external execution.
- Complexity/performance: Not estimated until per-surface semantic review; benchmark DB reads, stream work or job concurrency as applicable.
- Verification: Unit failure cases plus integration/authorization tests and relevant existing journeys. Environment-dependent delivery/model calls remain explicitly unverified.

## F002 ? Streaming chat and stop generation

- Category/status/priority: EXISTING, P0.
- Reference evidence: `chat/route.ts` under `apps/web/src` unless prefixed `apps/` or `.github/`; resolve full paths through the source census.
- Primary evidence: `src/app/api/chat/route.ts`.
- Implementation and missing components: Retain AI SDK 5 stream contract; do not import AI SDK 7 parts.
- Strategy: retain and verify.
- Dependencies: Existing auth/user scoping, current database and AI SDK 5 contracts; additional requirements must be justified per implementation batch.
- API/backend changes: None authorized by this row alone; define scoped contracts and failure paths before implementation.
- Database changes: No schema copied or applied; append-only migration design required where persistence changes.
- Frontend changes: Preserve current navigation, design and providers; add only missing affordances.
- Security: Enforce per-user/team ownership, validate untrusted input, redact secrets and bound external execution.
- Complexity/performance: Not estimated until per-surface semantic review; benchmark DB reads, stream work or job concurrency as applicable.
- Verification: Unit failure cases plus integration/authorization tests and relevant existing journeys. Environment-dependent delivery/model calls remain explicitly unverified.

## F003 ? Bounded message reads and older-message pagination

- Category/status/priority: PARTIAL, P0.
- Reference evidence: `chat-repository.pg.ts` under `apps/web/src` unless prefixed `apps/` or `.github/`; resolve full paths through the source census.
- Primary evidence: `src/lib/db/pg/repositories/chat-repository.pg.ts`.
- Implementation: Thread pages fetch the newest 50 rows and provide an authenticated load-older action. Repository cursor comparison stays inside PostgreSQL, is thread scoped, and orders by createdAt plus id. Page size is bounded; invalid limits return no rows. Export, insight, and API callers still use complete unbounded history.
- Status remains PARTIAL until the paged database workflow is exercised end to end against Postgres; repository behavior has focused mock coverage.
- Strategy: architectural adaptation.
- Dependencies: Existing auth/user scoping, current database and AI SDK 5 contracts; additional requirements must be justified per implementation batch.
- API/backend changes: Added `loadOlderThreadMessagesAction`; it requires a session and verifies thread ownership before reading.
- Database changes: No schema copied or applied; append-only migration design required where persistence changes.
- Frontend changes: Added a loading-aware load-older control and prepend behavior with scroll anchoring in `ChatBot`.
- Security: Enforce per-user/team ownership, validate untrusted input, redact secrets and bound external execution.
- Complexity/performance: Not estimated until per-surface semantic review; benchmark DB reads, stream work or job concurrency as applicable.
- Verification: Unit failure cases plus integration/authorization tests and relevant existing journeys. Environment-dependent delivery/model calls remain explicitly unverified.

## F004 ? Post-login destination preservation

Integration checkpoint: implemented in the original architecture; focused tests and live redirect pass, interactive callback and production-build gate pending. Baseline status below is retained for traceability.

- Category/status/priority: PARTIAL, P0.
- Reference evidence: `lib/auth/callback-url.ts` under `apps/web/src` unless prefixed `apps/` or `.github/`; resolve full paths through the source census.
- Primary evidence: `src/components/auth/sign-in.tsx`.
- Implementation and missing components: Adapt same-origin callbacks to existing dashboard and signup flow.
- Strategy: independent/adapted implementation.
- Dependencies: Existing auth/user scoping, current database and AI SDK 5 contracts; additional requirements must be justified per implementation batch.
- API/backend changes: None authorized by this row alone; define scoped contracts and failure paths before implementation.
- Database changes: No schema copied or applied; append-only migration design required where persistence changes.
- Frontend changes: Preserve current navigation, design and providers; add only missing affordances.
- Security: Enforce per-user/team ownership, validate untrusted input, redact secrets and bound external execution.
- Complexity/performance: Low for destination preservation; no network/dependency overhead.
- Verification: Unit failure cases plus integration/authorization tests and relevant existing journeys. Environment-dependent delivery/model calls remain explicitly unverified.

## F005 ? OAuth session-cookie isolation

- Category/status/priority: EXISTING, P0.
- Reference evidence: `middleware.ts` under `apps/web/src` unless prefixed `apps/` or `.github/`; resolve full paths through the source census.
- Primary evidence: `src/middleware.ts`.
- Implementation and missing components: Preserve prior cookie-prefix fix; do not redo auth.
- Strategy: retain and verify.
- Dependencies: Existing auth/user scoping, current database and AI SDK 5 contracts; additional requirements must be justified per implementation batch.
- API/backend changes: None authorized by this row alone; define scoped contracts and failure paths before implementation.
- Database changes: No schema copied or applied; append-only migration design required where persistence changes.
- Frontend changes: Preserve current navigation, design and providers; add only missing affordances.
- Security: Enforce per-user/team ownership, validate untrusted input, redact secrets and bound external execution.
- Complexity/performance: Not estimated until per-surface semantic review; benchmark DB reads, stream work or job concurrency as applicable.
- Verification: Unit failure cases plus integration/authorization tests and relevant existing journeys. Environment-dependent delivery/model calls remain explicitly unverified.

## F006 ? Static model selection and runtime fallback

- Category/status/priority: EXISTING, P1.
- Reference evidence: `lib/ai/models.ts` under `apps/web/src` unless prefixed `apps/` or `.github/`; resolve full paths through the source census.
- Primary evidence: `src/lib/ai/models.ts`.
- Implementation and missing components: Keep provider display-name and encrypted admin-key contracts.
- Strategy: retain and verify.
- Dependencies: Existing auth/user scoping, current database and AI SDK 5 contracts; additional requirements must be justified per implementation batch.
- API/backend changes: None authorized by this row alone; define scoped contracts and failure paths before implementation.
- Database changes: No schema copied or applied; append-only migration design required where persistence changes.
- Frontend changes: Preserve current navigation, design and providers; add only missing affordances.
- Security: Enforce per-user/team ownership, validate untrusted input, redact secrets and bound external execution.
- Complexity/performance: Not estimated until per-surface semantic review; benchmark DB reads, stream work or job concurrency as applicable.
- Verification: Unit failure cases plus integration/authorization tests and relevant existing journeys. Environment-dependent delivery/model calls remain explicitly unverified.

## F007 ? Database model catalog and task routing

- Category/status/priority: PARTIAL, P1.
- Reference evidence: `lib/db/pg/schema.pg.ts` under `apps/web/src` unless prefixed `apps/` or `.github/`; resolve full paths through the source census.
- Primary evidence: `src/lib/ai/models.ts`.
- Implementation and missing components: Extend current site_config; do not replace provider registry.
- Strategy: architectural adaptation.
- Dependencies: Existing auth/user scoping, current database and AI SDK 5 contracts; additional requirements must be justified per implementation batch.
- API/backend changes: None authorized by this row alone; define scoped contracts and failure paths before implementation.
- Database changes: No schema copied or applied; append-only migration design required where persistence changes.
- Frontend changes: Preserve current navigation, design and providers; add only missing affordances.
- Security: Enforce per-user/team ownership, validate untrusted input, redact secrets and bound external execution.
- Complexity/performance: Not estimated until per-surface semantic review; benchmark DB reads, stream work or job concurrency as applicable.
- Verification: Unit failure cases plus integration/authorization tests and relevant existing journeys. Environment-dependent delivery/model calls remain explicitly unverified.

## F008 ? Organization/member model budgets

- Category/status/priority: PARTIAL, P1.
- Reference evidence: `Void-Agent-V2/apps/web/src/lib/ai/routing/budget.ts`, `apps/web/src/lib/db/pg/schema.pg.ts`, `apps/web/src/lib/auth/auth-instance.ts`, and `apps/web/src/app/api/chat/route.ts`. Reference seeds a €15/month hard cap for non-owner organization members, estimates input plus 4096 output tokens, reserves atomically, finalizes actual cost, and releases on abort/error.
- Primary evidence: `src/lib/ai/team-member-ai-budget.ts`, `src/lib/ai/team-member-ai-budget-core.ts`, `src/lib/ai/model-pricing.ts`, `src/lib/ai/model-pricing.server.ts`, `src/app/api/chat/route.ts`, `src/app/api/admin/config/route.ts`, `src/lib/db/pg/schema.pg.ts`, and `src/lib/db/pg/repositories/team-repository.pg.ts`.
  - Implementation: Added per-team-seat policy, monthly usage period, and idempotent reservation records in append-only migration `0062_team_member_ai_budget.sql`. Existing and new non-owner members receive the reference €15 hard cap; personal/team owners remain uncapped. Reservations serialize on a Postgres transaction advisory lock, recheck current membership/policy, count concurrent reservations, expire abandoned reservations after 15 minutes, and settle or release exactly once. Enforcement is explicitly opt-in: `models.teamMemberBudgetsEnabled` defaults to `false`; existing chats retain their prior behavior until an admin enables it.
  - Pricing: Added admin-managed `models.modelPricing` entries keyed by `provider/model`, with explicit input/output EUR micros per million tokens. No provider prices are invented or defaulted. Admin config POST validates the map and rollout flag and merges partial model-section updates so older settings clients cannot erase either. Configure trusted prices before setting `teamMemberBudgetsEnabled: true`. Once enabled, a capped member selecting an unpriced model fails closed before generation; uncapped users retain existing provider/fallback behavior. Capped requests run the selected priced model directly so fallback cannot silently use a different rate. With the flag absent/false, chat performs no budget policy/pricing lookup or reservation.
- Enforcement: Main `/api/chat` applies the cap only to authenticated team-scoped threads/projects, derives team scope from the persisted thread/project, and rechecks user membership in the budget service. It reserves before generation, finalizes with reported input/output token usage (estimate fallback if the provider omits breakdown), and releases on cancellation/errors. Existing per-user daily limits remain in force.
- Explicitly outside current enforcement: `/api/chat/temporary` has its existing per-user free-tier token reservation only; `/api/chat/title`, `/api/agent/ai`, `/api/embed/session`, agent/skill generation APIs, canvas/artifact/browser subcalls, tabular-review model calls, and direct image generation are not charged to this team monthly cost ledger. These routes do not currently resolve a trusted team member budget plus priced model usage. They require separate route-by-route adaptations before claiming whole-product model-cost parity.
- Security/limitations: Team policy cannot be bypassed by client-supplied prices or team IDs; prices come from admin-only config and membership is checked against `team_member`. Admins can configure rates and explicitly enable the default-off rollout in the Models settings page. The reference seeds a fixed €15 member cap and has no per-member cap editing API/UI, so no custom cap editor was added. A live PostgreSQL concurrency/migration journey was unavailable; migration 0062 is local and unapplied. F008 remains PARTIAL pending live DB verification and coverage for other model routes.
- Verification: `src/lib/ai/model-pricing.test.ts` and `src/lib/ai/team-member-ai-budget.test.ts` passed 8/8; scoped Biome passed; `pnpm check-types` passed with a 6 GB Node heap. Concurrent-cap behavior and authorization decision logic have unit coverage; no PostgreSQL test URL was configured.

## F009 ? Project-scoped documents and threads

- Current primary status: PARTIAL. Existing user-owned collections, document ingestion and RAG retrieval are reused; this batch adds per-thread collection scoping, not the reference project-brain graph, extraction jobs, contradiction resolution, or project CRUD. Evidence: `src/lib/db/pg/repositories/collection-repository.pg.ts`, `src/lib/rag/retrieve.ts`, `src/app/api/chat/route.ts`, `src/components/chat-bot.tsx`.
- Scope semantics: `NULL` means legacy/all user collections, `[]` means none, and a non-empty UUID array means only those collections. New-thread IDs are ownership checked; saved-thread scope comes from the database, not the request body. User changes are persisted by an authenticated owner-checked server action.
- Schema: append-only migration `0033_chat_thread_knowledge_collections.sql`; migration was authored locally but not applied to any database.
- Verification: retrieval tests assert explicit-empty scope short-circuits embedding; end-to-end Postgres verification is pending. Project-brain parity remains incomplete.

- Category/status/priority: PARTIAL, P1.
- Reference evidence: `lib/db/pg/schema.pg.ts` under `apps/web/src` unless prefixed `apps/` or `.github/`; resolve full paths through the source census.
- Primary evidence: `src/lib/db/pg/schema.pg.ts`.
- Implementation and missing components: Adapt collections and archives without deleting either.
- Strategy: architectural adaptation.
- Dependencies: Existing auth/user scoping, current database and AI SDK 5 contracts; additional requirements must be justified per implementation batch.
- API/backend changes: None authorized by this row alone; define scoped contracts and failure paths before implementation.
- Database changes: No schema copied or applied; append-only migration design required where persistence changes.
- Frontend changes: Preserve current navigation, design and providers; add only missing affordances.
- Security: Enforce per-user/team ownership, validate untrusted input, redact secrets and bound external execution.
- Complexity/performance: Not estimated until per-surface semantic review; benchmark DB reads, stream work or job concurrency as applicable.
- Verification: Unit failure cases plus integration/authorization tests and relevant existing journeys. Environment-dependent delivery/model calls remain explicitly unverified.

## F010 ? Project brain source ingestion

- Category/status/priority: PARTIAL, P1.
- Reference evidence: `lib/project-brain/run-pipeline.ts` under `apps/web/src` unless prefixed `apps/` or `.github/`; resolve full paths through the source census.
- Primary evidence: `src/lib/ai/memory`.
- Implementation and missing components: Reuse existing extraction/embedding modules; add scoped source ownership.
- Strategy: independent/adapted implementation.
- Dependencies: Existing auth/user scoping, current database and AI SDK 5 contracts; additional requirements must be justified per implementation batch.
- API/backend changes: None authorized by this row alone; define scoped contracts and failure paths before implementation.
- Database changes: No schema copied or applied; append-only migration design required where persistence changes.
- Frontend changes: Preserve current navigation, design and providers; add only missing affordances.
- Security: Enforce per-user/team ownership, validate untrusted input, redact secrets and bound external execution.
- Complexity/performance: Not estimated until per-surface semantic review; benchmark DB reads, stream work or job concurrency as applicable.
- Verification: Unit failure cases plus integration/authorization tests and relevant existing journeys. Environment-dependent delivery/model calls remain explicitly unverified.

## F011 ? Project brain inline job fallback

- Category/status/priority: PARTIAL, P1.
- Reference evidence: `lib/project-brain/run-inline.ts` under `apps/web/src` unless prefixed `apps/` or `.github/`; resolve full paths through the source census.
- Primary evidence: `src/lib/scheduler`.
- Implementation and missing components: Use current scheduler and durable run state rather than adding Inngest.
- Strategy: independent/adapted implementation.
- Dependencies: Existing auth/user scoping, current database and AI SDK 5 contracts; additional requirements must be justified per implementation batch.
- API/backend changes: None authorized by this row alone; define scoped contracts and failure paths before implementation.
- Database changes: No schema copied or applied; append-only migration design required where persistence changes.
- Frontend changes: Preserve current navigation, design and providers; add only missing affordances.
- Security: Enforce per-user/team ownership, validate untrusted input, redact secrets and bound external execution.
- Complexity/performance: Not estimated until per-surface semantic review; benchmark DB reads, stream work or job concurrency as applicable.
- Verification: Unit failure cases plus integration/authorization tests and relevant existing journeys. Environment-dependent delivery/model calls remain explicitly unverified.

## F012 ? Project brain contradiction tracking

- Category/status/priority: PARTIAL, P2.
- Reference evidence: `lib/db/pg/schema.pg.ts` under `apps/web/src` unless prefixed `apps/` or `.github/`; resolve full paths through the source census.
- Primary evidence: `src/lib/ai/memory`.
- Implementation and missing components: Add explicit facts/evidence/versioning after project ownership groundwork.
- Strategy: independent/adapted implementation.
- Dependencies: Existing auth/user scoping, current database and AI SDK 5 contracts; additional requirements must be justified per implementation batch.
- API/backend changes: None authorized by this row alone; define scoped contracts and failure paths before implementation.
- Database changes: No schema copied or applied; append-only migration design required where persistence changes.
- Frontend changes: Preserve current navigation, design and providers; add only missing affordances.
- Security: Enforce per-user/team ownership, validate untrusted input, redact secrets and bound external execution.
- Complexity/performance: Not estimated until per-surface semantic review; benchmark DB reads, stream work or job concurrency as applicable.
- Verification: Unit failure cases plus integration/authorization tests and relevant existing journeys. Environment-dependent delivery/model calls remain explicitly unverified.

## F013 ? Project graph visualization

- Category/status/priority: PARTIAL, P2.
- Reference evidence: `lib/project-brain` under `apps/web/src` unless prefixed `apps/` or `.github/`; resolve full paths through the source census.
- Primary evidence: `src/components`.
- Implementation and missing components: Depends on evidence graph and accessible list alternative.
- Strategy: independent/adapted implementation.
- Dependencies: Existing auth/user scoping, current database and AI SDK 5 contracts; additional requirements must be justified per implementation batch.
- API/backend changes: None authorized by this row alone; define scoped contracts and failure paths before implementation.
- Database changes: No schema copied or applied; append-only migration design required where persistence changes.
- Frontend changes: Preserve current navigation, design and providers; add only missing affordances.
- Security: Enforce per-user/team ownership, validate untrusted input, redact secrets and bound external execution.
- Complexity/performance: Not estimated until per-surface semantic review; benchmark DB reads, stream work or job concurrency as applicable.
- Verification: Unit failure cases plus integration/authorization tests and relevant existing journeys. Environment-dependent delivery/model calls remain explicitly unverified.

## F014 ? Tabular multi-document reviews

- Category/status/priority: PARTIAL, P2.
- Reference evidence: `Void-Agent-V2/apps/web/src/lib/db/pg/schema.pg.ts` (`TabularReviewTable`, `TabularReviewDocumentTable`, `TabularCellTable`); `apps/web/src/lib/ai/tools/tabular/create-tabular-review-tool.ts` and `create-tabular-tool.ts`; `apps/web/src/app/api/tabular-review/[id]/generate/route.ts` and `/export/route.ts`; `apps/web/src/components/tool-invocation/tabular-review.tsx`. The reference creates reviews from an AI tool call, persists per-document/per-column cells, streams model results, resumes answered cells, and exports XLSX.
- Primary evidence: `src/lib/db/pg/schema.pg.ts` (`CollectionItemTable`/`DocumentTable` and new tabular review rows); `src/lib/rag/ingest`; new `/api/tabular-reviews` routes and `/tabular-reviews` UI.
- Implemented behavior: Authenticated users can ask in chat to compare available documents; the chat tool receives a bounded list of ready sources scoped to owned collections or the authorized project's attached collections that the caller owns, revalidates selected IDs, creates the review, and returns an in-chat review card. The dedicated UI also lets users select up to 20 ready documents, choose up to 8 preset/custom fields, create a durable review, generate cells from extracted text with no more than 3 simultaneous model calls, see streaming updates, retry unfinished or individually selected cells, correct results, revisit recent reviews, delete reviews, and download XLSX.
- Security: Review creation checks collection ownership and ready ingestion state; every read, delete, generation, and export checks review ownership. Prompts frame bounded source text as untrusted; request/cell/output sizes and per-user rates are capped; generated workbook strings are XML-escaped inline strings.
- Database: Append-only `0037_tabular_reviews.sql` adds private reviews, item rows and unique per-cell rows; journaled but unapplied. Existing extracted text is reused; uploaded bytes are not re-read.
- Follow-up: Review owners can edit a cell (maximum 4,000 characters) while generation is idle, or regenerate one selected cell. Both operations validate review/source/column membership server-side. Single-cell regeneration recalculates aggregate review state instead of marking unrelated pending/error cells complete. Request JSON is streamed with an 8 KiB cap.
- Remaining parity: Both reference and primary store reviews privately under the creating user; shared team reviews are not part of the observed reference path. The reference citation type also emits model-generated inline [N] markers and a textual <CITATIONS> block; it does not store/validate source offsets. Void-Agent now matches that format, but neither implementation establishes independently verified citation anchors. A live browser/Postgres journey is still unverified, so keep PARTIAL.
- Verification: Follow-up focused suites pass 9/9; type checking and targeted Biome pass. PostgreSQL execution and live provider calls were not available.

## F015 ? Published page lifecycle

- Category/status/priority: PARTIAL, P2.
- Reference evidence: `lib/db/pg/schema.pg.ts` under `apps/web/src` unless prefixed `apps/` or `.github/`; resolve full paths through the source census.
- Primary evidence: `src/app/api/ecanvas`.
- Implementation and missing components: Adapt existing share/export revocation; enforce sandbox and private visibility.
- Strategy: architectural adaptation.
- Dependencies: Existing auth/user scoping, current database and AI SDK 5 contracts; additional requirements must be justified per implementation batch.
- API/backend changes: None authorized by this row alone; define scoped contracts and failure paths before implementation.
- Database changes: No schema copied or applied; append-only migration design required where persistence changes.
- Frontend changes: Preserve current navigation, design and providers; add only missing affordances.
- Security: Enforce per-user/team ownership, validate untrusted input, redact secrets and bound external execution.
- Complexity/performance: Not estimated until per-surface semantic review; benchmark DB reads, stream work or job concurrency as applicable.
- Verification: Unit failure cases plus integration/authorization tests and relevant existing journeys. Environment-dependent delivery/model calls remain explicitly unverified.

## F016 ? Memory extraction and retrieval

- Category/status/priority: EXISTING, P1.
- Reference evidence: `lib/project-brain` under `apps/web/src` unless prefixed `apps/` or `.github/`; resolve full paths through the source census.
- Primary evidence: `src/lib/ai/memory`.
- Implementation and missing components: Do not duplicate memory under a new product name.
- Strategy: retain and verify.
- Dependencies: Existing auth/user scoping, current database and AI SDK 5 contracts; additional requirements must be justified per implementation batch.
- API/backend changes: None authorized by this row alone; define scoped contracts and failure paths before implementation.
- Database changes: No schema copied or applied; append-only migration design required where persistence changes.
- Frontend changes: Preserve current navigation, design and providers; add only missing affordances.
- Security: Enforce per-user/team ownership, validate untrusted input, redact secrets and bound external execution.
- Complexity/performance: Not estimated until per-surface semantic review; benchmark DB reads, stream work or job concurrency as applicable.
- Verification: Unit failure cases plus integration/authorization tests and relevant existing journeys. Environment-dependent delivery/model calls remain explicitly unverified.

## F017 ? Knowledge base ingestion

- Category/status/priority: EXISTING, P1.
- Reference evidence: `lib/agentset` under `apps/web/src` unless prefixed `apps/` or `.github/`; resolve full paths through the source census.
- Primary evidence: `src/lib/db/pg/repositories`.
- Implementation and missing components: Retain current collection/document ownership and pgvector path.
- Strategy: retain and verify.
- Dependencies: Existing auth/user scoping, current database and AI SDK 5 contracts; additional requirements must be justified per implementation batch.
- API/backend changes: None authorized by this row alone; define scoped contracts and failure paths before implementation.
- Database changes: No schema copied or applied; append-only migration design required where persistence changes.
- Frontend changes: Preserve current navigation, design and providers; add only missing affordances.
- Security: Enforce per-user/team ownership, validate untrusted input, redact secrets and bound external execution.
- Complexity/performance: Not estimated until per-surface semantic review; benchmark DB reads, stream work or job concurrency as applicable.
- Verification: Unit failure cases plus integration/authorization tests and relevant existing journeys. Environment-dependent delivery/model calls remain explicitly unverified.

## F018 ? File uploads and document processing

- Category/status/priority: PARTIAL, P1.
- Reference evidence: `lib/file-storage` under `apps/web/src` unless prefixed `apps/` or `.github/`; resolve full paths through the source census.
- Primary evidence: `src/hooks/use-thread-file-uploader.ts`.
- Implementation and missing components: Compare vision PDF/audio paths individually; retain local storage.
- Strategy: architectural adaptation.
- Dependencies: Existing auth/user scoping, current database and AI SDK 5 contracts; additional requirements must be justified per implementation batch.
- API/backend changes: None authorized by this row alone; define scoped contracts and failure paths before implementation.
- Database changes: No schema copied or applied; append-only migration design required where persistence changes.
- Frontend changes: Preserve current navigation, design and providers; add only missing affordances.
- Security: Enforce per-user/team ownership, validate untrusted input, redact secrets and bound external execution.
- Complexity/performance: Not estimated until per-surface semantic review; benchmark DB reads, stream work or job concurrency as applicable.
- Verification: Unit failure cases plus integration/authorization tests and relevant existing journeys. Environment-dependent delivery/model calls remain explicitly unverified.

## F019 ? Persistent resumable streaming

- Category/status/priority: PARTIAL, P1.
- Reference evidence: `lib/ai` under `apps/web/src` unless prefixed `apps/` or `.github/`; resolve full paths through the source census.
- Primary evidence: `src/app/api/chat/route.ts`.
- Implementation and missing components: Requires resumable transport contract and multi-instance cancellation; inspect Redis semantics first.
- Strategy: independent/adapted implementation.
- Dependencies: Existing auth/user scoping, current database and AI SDK 5 contracts; additional requirements must be justified per implementation batch.
- API/backend changes: None authorized by this row alone; define scoped contracts and failure paths before implementation.
- Database changes: No schema copied or applied; append-only migration design required where persistence changes.
- Frontend changes: Preserve current navigation, design and providers; add only missing affordances.
- Security: Enforce per-user/team ownership, validate untrusted input, redact secrets and bound external execution.
- Complexity/performance: Not estimated until per-surface semantic review; benchmark DB reads, stream work or job concurrency as applicable.
- Verification: Unit failure cases plus integration/authorization tests and relevant existing journeys. Environment-dependent delivery/model calls remain explicitly unverified.

## F020 ? MCP tool discovery and execution

- Category/status/priority: EXISTING, P1.
- Reference evidence: `lib/ai/mcp` under `apps/web/src` unless prefixed `apps/` or `.github/`; resolve full paths through the source census.
- Primary evidence: `src/lib/ai/mcp`.
- Implementation and missing components: Retain per-user server registration and OAuth fixes.
- Strategy: retain and verify.
- Dependencies: Existing auth/user scoping, current database and AI SDK 5 contracts; additional requirements must be justified per implementation batch.
- API/backend changes: None authorized by this row alone; define scoped contracts and failure paths before implementation.
- Database changes: No schema copied or applied; append-only migration design required where persistence changes.
- Frontend changes: Preserve current navigation, design and providers; add only missing affordances.
- Security: Enforce per-user/team ownership, validate untrusted input, redact secrets and bound external execution.
- Complexity/performance: Not estimated until per-surface semantic review; benchmark DB reads, stream work or job concurrency as applicable.
- Verification: Unit failure cases plus integration/authorization tests and relevant existing journeys. Environment-dependent delivery/model calls remain explicitly unverified.

## F021 ? Desktop shell and local MCP bridge

- Category/status/priority: PARTIAL, P3.
- Reference evidence: `Void-Agent-V2/apps/desktop/src/main/mcp-spawner.ts`, `mcp-ipc.ts`, Electron main/preload code and `apps/desktop/package.json`. The desktop shell owns local process spawning/IPC; the web app alone cannot start a process on a user's machine.
- Primary evidence: `src/lib/ai/mcp` supports web-side MCP client/server connections but no Electron shell or local process bridge.
- Implementation and missing components: A separate Void-Agent desktop companion would be required, using a narrowly scoped local MCP process manager and explicit user-granted server configuration.
- Strategy: separate companion package, preserve the web product and existing MCP interfaces.
- Dependencies: Existing auth/user scoping, current database and AI SDK 5 contracts; additional requirements must be justified per implementation batch.
- API/backend changes: None authorized by this row alone; define scoped contracts and failure paths before implementation.
- Database changes: No schema copied or applied; append-only migration design required where persistence changes.
- Frontend changes: Preserve current navigation, design and providers; add only missing affordances.
- Security: Enforce per-user/team ownership, validate untrusted input, redact secrets and bound external execution.
- Complexity/performance: Not estimated until per-surface semantic review; benchmark DB reads, stream work or job concurrency as applicable.
- Verification: Unit failure cases plus integration/authorization tests and relevant existing journeys. Environment-dependent delivery/model calls remain explicitly unverified.

## F022 ? Workflow graph execution

- Category/status/priority: EXISTING, P1.
- Reference evidence: `lib/ai/workflow` under `apps/web/src` unless prefixed `apps/` or `.github/`; resolve full paths through the source census.
- Primary evidence: `src/lib/ai/workflow`.
- Implementation and missing components: Compare node-level semantics rather than copying workflow UI.
- Strategy: retain and verify.
- Dependencies: Existing auth/user scoping, current database and AI SDK 5 contracts; additional requirements must be justified per implementation batch.
- API/backend changes: None authorized by this row alone; define scoped contracts and failure paths before implementation.
- Database changes: No schema copied or applied; append-only migration design required where persistence changes.
- Frontend changes: Preserve current navigation, design and providers; add only missing affordances.
- Security: Enforce per-user/team ownership, validate untrusted input, redact secrets and bound external execution.
- Complexity/performance: Not estimated until per-surface semantic review; benchmark DB reads, stream work or job concurrency as applicable.
- Verification: Unit failure cases plus integration/authorization tests and relevant existing journeys. Environment-dependent delivery/model calls remain explicitly unverified.

## F023 ? Connected workflow generation/dashboard

- Category/status/priority: EXCLUDED for managed source-to-container generation and dashboard hosting, P2. Standard workflow CRUD/editor/execution is tracked separately and is implemented in both projects.
- Reference evidence: `lib/navigator-workflows` under `apps/web/src` unless prefixed `apps/` or `.github/`; resolve full paths through the source census.
- Primary evidence: `src/lib/n8n`.
- Implementation and missing components: Retain current n8n integration; require reversible credential handling.
- Strategy: architectural adaptation.
- Dependencies: Existing auth/user scoping, current database and AI SDK 5 contracts; additional requirements must be justified per implementation batch.
- API/backend changes: None authorized by this row alone; define scoped contracts and failure paths before implementation.
- Database changes: No schema copied or applied; append-only migration design required where persistence changes.
- Frontend changes: Preserve current navigation, design and providers; add only missing affordances.
- Security: Enforce per-user/team ownership, validate untrusted input, redact secrets and bound external execution.
- Complexity/performance: Not estimated until per-surface semantic review; benchmark DB reads, stream work or job concurrency as applicable.
- Verification: Unit failure cases plus integration/authorization tests and relevant existing journeys. Environment-dependent delivery/model calls remain explicitly unverified.

### F023 source-completeness adjudication (2026-11-07)
- The V2 checkout has no executable managed generator or dashboard route, page, worker, or UI. `apps/web/src/lib/voice/workflow-draft.ts` explicitly identifies drafting as hosted-only and always returns `null`; `apps/web/src/lib/navigator-tools/tools/workflows.ts` reports that unavailable result to callers. `dashboard_url` and `workflow_db_name` occur in the `navigator_workflows` schema and migration `0064_navigator_workflows_dashboard.sql`, but no dashboard-session route, provisioning code, or dashboard UI exists in the repository.
- Therefore managed source-to-container generation and dashboard hosting are EXCLUDED as source-incomplete/hosted-only; implementing the fields alone would create an ungrounded system with no reusable behavior. Do not count this as standard workflow parity being absent.
- Executable equivalent evidence for standard workflows: V2 and primary both have authenticated workflow list/create/editor/structure-save/execute paths (`apps/web/src/app/(chat)/workflow`, `apps/web/src/app/api/workflow`; primary `src/app/(chat)/workflow`, `src/app/api/workflow`). Primary also retains n8n list/create/embed/run support and now reviews app Run actions, but that separate integration is not a substitute for the missing hosted generator/dashboard.
- Verification is source-level only. No managed deployment or dashboard journey could be run because those features are not implemented in this checkout. The reference remains unchanged.

## F024 ? Scheduling and outbox

- Category/status/priority: EXISTING, P1.
- Reference evidence: `lib/inngest` under `apps/web/src` unless prefixed `apps/` or `.github/`; resolve full paths through the source census.
- Primary evidence: `src/lib/scheduler`.
- Implementation and missing components: Preserve current leader election, retries and webhook outbox.
- Strategy: retain and verify.
- Dependencies: Existing auth/user scoping, current database and AI SDK 5 contracts; additional requirements must be justified per implementation batch.
- API/backend changes: None authorized by this row alone; define scoped contracts and failure paths before implementation.
- Database changes: No schema copied or applied; append-only migration design required where persistence changes.
- Frontend changes: Preserve current navigation, design and providers; add only missing affordances.
- Security: Enforce per-user/team ownership, validate untrusted input, redact secrets and bound external execution.
- Complexity/performance: Not estimated until per-surface semantic review; benchmark DB reads, stream work or job concurrency as applicable.
- Verification: Unit failure cases plus integration/authorization tests and relevant existing journeys. Environment-dependent delivery/model calls remain explicitly unverified.

## F025 ? Human tool approvals

- Category/status/priority: PARTIAL, P0.
- Reference evidence: `lib/ai` under `apps/web/src` unless prefixed `apps/` or `.github/`; resolve full paths through the source census.
- Primary evidence: `src/lib/ai`.
- Implementation: Void-Agent retains generic manual approve/reject controls and now exposes `askForPlanApproval`, `requestInput`, `proposeEmail`, and `createAgent` with bounded schemas and dedicated review cards. Agent writes occur only after the user confirms and go through the existing authenticated, permission-checked `/api/agent` route. Plan/input/email/agent results return through the AI SDK chat result path; no browser-authenticated journey has been verified end to end.
- Strategy: architectural adaptation.
- Dependencies: Existing auth/user scoping, current database and AI SDK 5 contracts; additional requirements must be justified per implementation batch.
- API/backend changes: Added four no-execute HITL tools to the chat tool registry only when tool calls are allowed; prompt guidance explicitly prohibits requesting secrets and says approval cards do not bypass tool permissions. Agent creation reuses the existing `/api/agent` API with a user-scoped idempotency key and payload-hash conflict detection.
- Database changes: Added append-only migration `0034_agent_approval_idempotency.sql`; creates a private replay table with unique `(user_id, request_key)` and an `agent_id` FK using `ON DELETE SET NULL`. Not applied to a database.
- Frontend changes: Added editable plan, email and agent cards, user-question collection, and settled result views.
- Security: Tool schemas bound input sizes/counts; requestInput refuses secret collection in guidance; these client result cards are UX approval, not a durable authorization token. Agent writes inherit route session and `canCreateAgent` checks. Retries by the same user/key and exact payload return the prior agent; a changed payload conflicts, and deleting the agent leaves a replay tombstone. Review connector-side authorization separately.
- Complexity/performance: Not estimated until per-surface semantic review; benchmark DB reads, stream work or job concurrency as applicable.
- Verification: Schema bounds, route authorization/idempotency behavior, and cursor SQL have unit coverage; 27 focused tests, type check, Drizzle migration journal check and targeted Biome pass. Browser workflow and Postgres-backed concurrency tests remain pending. Status PARTIAL.

## F026 ? Voice transcription pipeline

- Category/status/priority: PARTIAL, P2.
- Reference evidence: `Void-Agent-V2/apps/web/src/lib/voice/session-thread.ts`, `session-thread-contract.ts`, `session-thread-client.ts`, `apps/web/src/app/api/voice/session-thread/route.ts`, and the OpenAI realtime speech hook. Completed voice turns are debounced, upserted into an owned chat thread, capped, and linked from the voice UI.
- Primary evidence: `src/lib/voice/session-thread-contract.ts`, `session-thread-client.ts`, `src/app/api/voice/session-thread/route.ts`, and `src/components/chat-bot-voice.tsx`; existing OpenAI Realtime and KonvO hooks provide completed user/assistant messages.
- Implemented: Both browser voice providers now persist capped completed turns to a chat thread after the user speaks; the thread title derives from user speech; retries upsert idempotently; the UI exposes an Open saved conversation link. Requests are capped at 600 KB, each turn payload at 24,000 serialized characters, batches at 20 turns, and writes are rate-limited.
- Remaining: Physical voice device pairing, audio gateway sessions/segments, transcript commands/inbox, AssemblyAI/browser-run path parity, and real provider/browser verification. F026 remains PARTIAL.
- Strategy: adapt the reference browser session-to-thread behavior to Void-Agent's chat repository and ownership model; keep device/gateway transport as a separate follow-up.
- Dependencies: Existing auth/user scoping, current database and AI SDK 5 contracts; additional requirements must be justified per implementation batch.
- API/backend changes: None authorized by this row alone; define scoped contracts and failure paths before implementation.
- Database changes: No schema copied or applied; append-only migration design required where persistence changes.
- Frontend changes: Preserve current navigation, design and providers; add only missing affordances.
- Security: Enforce per-user/team ownership, validate untrusted input, redact secrets and bound external execution.
- Complexity/performance: Not estimated until per-surface semantic review; benchmark DB reads, stream work or job concurrency as applicable.
- Verification: Contract and route tests cover completed-turn filtering, changed-turn retries, payload truncation/bounds, title derivation, authentication, foreign-thread rejection and idempotent upserts. Full suite 1,024 tests and type check pass; production build is recorded in the testing report. Live voice provider, browser and PostgreSQL journeys remain unverified.

## F027 â€” Physical voice device pairing

- Category/status/priority: PARTIAL, P3.
- Reference evidence: `Void-Agent-V2/apps/web/src/app/api/voice/devices/**`, `apps/web/src/lib/voice/device-token.ts`, `device-auth.ts`, `xiaozhi-protocol.ts`, and `apps/web/src/components/voice-device-settings-dialog.tsx`. Pair codes and bearer tokens are pepper-hashed; device flows cover claim, registration, token delivery, history, revocation and setup status.
- Reference runtime limitation: `apps/web/src/app/api/voice/devices/ws/route.ts` deliberately returns HTTP 426 and requires an external websocket bridge. Root `package.json` points `voice:bridge` to `scripts/voice-device-bridge.ts`, but that script is absent in the inspected checkout. Thus the reference's source checkout does not include its required audio transport implementation.
- Primary evidence: `src/app/api/voice/devices/**`, `src/lib/voice/device-token.ts`, `device-auth.ts`, `src/lib/db/pg/repositories/voice-device-repository.pg.ts`, migration `0039_voice_device_pairing.sql` and `src/components/voice-devices-dashboard.tsx`.
- Implemented: authenticated 10-minute pairing codes, atomic single-use code consumption and device creation, pepper-hashed 256-bit bearer tokens, per-IP and per-code attempt limits, owner-scoped device listing/revocation, and active-token lookup that updates last-seen. UI exposes pairing and revocation.
- Implementation and missing components: Pairing and transcript ingestion are implemented. Authenticated enrolled devices can submit bounded, idempotent transcripts into an owner-controlled chat thread. Transcript intent is saved for user review; it does not execute commands. Audio-command processing, gateway session/history, firmware registration bootstrap and a separate websocket/audio gateway remain required; the Next.js route cannot itself provide the device websocket upgrade. A real hardware/gateway journey has not been tested.
- Strategy: implement as a companion Node gateway/device workflow after establishing its protocol and runtime; do not claim parity from browser voice.
- Dependencies: Existing auth/user scoping, current database and AI SDK 5 contracts; additional requirements must be justified per implementation batch.
- API/backend changes: `GET/POST /api/voice/devices`, public `POST /api/voice/devices/pair`, owner-scoped `DELETE /api/voice/devices/[id]`, authenticated device `POST /api/voice/transcript`, and a reusable bearer-token auth helper.
- Database changes: New device and pairing-code tables; migration 0039 is authored and unapplied.
- Frontend changes: New Voice devices page with one-time code display and owner-controlled revocation.
- Security: Pairing codes and bearer tokens are only stored as peppered SHA-256 digests; code consumption is atomic; plaintext bearer token is returned once; user ownership is enforced; revocation disables tokens. `VOICE_DEVICE_TOKEN_PEPPER` must be a secret of at least 32 characters.
- Complexity/performance: Not estimated until per-surface semantic review; benchmark DB reads, stream work or job concurrency as applicable.
- Verification: Device transcript schema/route tests cover auth, per-device throttling, input bounds, deterministic IDs, persistence and foreign-owner rejection; PostgreSQL-backed concurrency, transcript/audio hardware, gateway, deployment and user-visible chat journey are unverified.

## F028 ? Slack channel subscriptions and agent tasks

- Category/status/priority: EXCLUDED (reference implementation incomplete), P2.
- Reference evidence: `lib/db/pg/schema.pg.ts` under `apps/web/src` unless prefixed `apps/` or `.github/`; resolve full paths through the source census.
- Primary evidence: `src/lib/ai/tools/connectors`.
- Reference behavior audit: the reference contains `slack_workspace_connection`, `slack_channel_subscription`, and `slack_agent_task` schema/migration definitions and an integration settings page. A repository-wide search found no API routes, task consumer, event handler, delivery implementation, or references to these tables outside their schema/migration declarations. The settings page calls `/api/slack`, `/api/slack/channels`, `/api/slack/sync`, and `/api/slack/connect`, which are absent from the inspected `apps/web/src/app/api` tree.
- Primary implementation: Void-Agent has an authenticated read-only Slack connector (`list_channels`, `list_messages`) and OAuth connect/disconnect, but no inbound Slack event subscription system.
- Decision: do not port orphan schema/UI as if it were a working feature. Mark this upstream candidate EXCLUDED until the reference gains executable routes and worker behavior; Void-Agent's inbound subscription parity remains absent. This is an evidence-based upstream-incomplete exclusion, not a claim that Void-Agent has equivalent behavior.
- Security/verification: there is no reference event contract to adapt or test for signature, replay, tenant scoping, authorization, or tool side effects. Revisit only after a complete upstream execution path is found.

## F029 â€” Notifications and web push

- Category/status/priority: PARTIAL, P2.
- Reference evidence: `Void-Agent-V2/apps/web/src/app/api/push/subscribe/route.ts`, `push/test/route.ts`, `api/notifications/route.ts`, `api/notifications/read/route.ts`, `lib/push/*`, notification bell/settings UI and `public/sw.js`. It persists per-user notifications/subscriptions, supports mark-read, VAPID delivery and expired endpoint cleanup.
- Primary evidence: New `src/app/api/{notifications,push/subscribe}` routes, `src/lib/notifications/*`, `NotificationTable`/`PushSubscriptionTable`, and scheduler worker run outcomes.
- Implemented: Authenticated user-scoped listing/read APIs; persistent deduped scheduled-run completion/failure notifications; Web Push subscription registration/removal with encrypted key material; HTTPS/public-DNS endpoint checks; expired endpoint cleanup; service-worker push/click handling; notification center and header unread indicator.
- Security: Server egress validates public HTTPS endpoints both at registration and immediately before delivery; subscription keys use existing AES-GCM master key; all data access scopes by session user; navigation targets are local paths; request fields and read batches are bounded.
- Remaining: PostgreSQL-backed verification, browser permission flow and real endpoint delivery remain unverified. Configure `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, and `ENCRYPTION_MASTER_KEY`; migration 0038 is authored but unapplied. F029 remains PARTIAL.
- Verification: Contract tests cover malformed/oversized keys, HTTP endpoint rejection, read batch caps and local-only hrefs; type/lint/focused/full suite pending.

## F030 — Cockpit external service connections

- Category/status/priority: OPTIONAL, P3; **PARTIAL** (one complete Stripe provider slice; family parity is not complete).
- Reference evidence: `Void-Agent-V2/apps/web/src/lib/cockpit/providers/stripe.ts`, `providers/schemas.ts`, `connections.ts`, `feeds.ts`, `finance.ts`, `data.ts`; routes `apps/web/src/app/api/cockpit/connections/route.ts`, `connections/test/route.ts`; UI `apps/web/src/components/cockpit/finance-console.tsx` and `connect-console.tsx`.
- Primary implementation: `src/lib/cockpit/stripe.ts`, `access.ts`; `/api/cockpit/stripe/connection`, `/connection/test`, `/summary`; `src/components/cockpit/stripe-dashboard.tsx` and `/cockpit` navigation.
- Integrated slice: user-owned personal connections and team-shared connections; team members can read financial data while owners/editors manage credentials. Secret is encrypted with the existing AES-256-GCM utility and never appears in API projections. Stripe requests use a fixed HTTPS host and GET-only endpoints for balance, active subscriptions, charges, and payouts. Pagination is capped at 10×100 per list; response bodies are streamed and capped at 2 MiB before JSON parsing; API requests are authenticated, mutation same-origin, bounded, and rate-limited. Summary includes balance, normalized MRR, successful 30-day payments, recent failed charges, and upcoming payout.
- Database: additive migration `0063_cockpit_connections.sql`, with per-user and per-team unique partial indexes. Migration is authored and journaled but unapplied; no database was contacted.
- Security: Team membership is verified before team reads; only owner/editor roles can manage, test, or delete team credentials. No Stripe write methods are exposed. Provider response bodies and exceptions are not returned to clients.
- Verification: Focused Stripe, scope, and connection API tests pass 17/17; scoped Biome lint and Drizzle `pnpm db:check` pass; whole-project typecheck is reported separately in the F030 context entry. No PostgreSQL-backed migration, browser-authenticated journey, or live Stripe test was run.
- Remaining: the wider Cockpit provider set and combined finance console are not integrated; team DB authorization and migration application require PostgreSQL verification, and the UI journey needs browser verification. Keep F030 PARTIAL.

## F031 - Problem reports

- Category/status/priority: PARTIAL, P2.
- Reference evidence: `app/api/problem-report` under `apps/web/src` unless prefixed `apps/` or `.github/`; resolve full paths through the source census.
- Primary evidence: `src/lib/db/pg/schema.pg.ts`, `src/app/api/problem-report/route.ts`, `src/app/api/admin/problem-reports/route.ts`, `src/app/api/admin/problem-reports/[id]/route.ts`, and `src/components/admin/problem-report-admin-page.tsx`.
- Implementation: Users can submit and list their own reports. Staff triage has an admin-layout-protected page, a session/admin-checked list endpoint with bounded pagination and status filtering, and a same-origin status-only update endpoint. Admin listing is limited to 60 requests/minute per admin; status updates to 30/minute, with `Retry-After` on throttling.
- Privacy/security: Existing user reads remain owner-scoped. Admin listing returns screenshot name, MIME type, and size only, never storage keys or object URLs; diagnostic context is allowlisted and URL query/fragment are removed. No screenshot download/preview route is provided to staff in this slice. Do not inherit an upstream notification recipient.
- Database changes: No schema change for admin triage; existing migration state is unchanged.
- Remaining: No notification workflow and no real PostgreSQL/browser end-to-end verification. F031 remains PARTIAL until those gaps and the existing user-facing submission/history workflow are verified as a whole.
- Verification: User report tests and admin authorization, pagination/status, rate-limit, screenshot-key-redaction tests pass; scoped Biome passes. Live persistence/status refresh remains unverified.

## F032 ? Streaming markdown performance

- Category/status/priority: PARTIAL pending integrated typecheck and production build, P1.
- Reference evidence: `apps/web/src/components/markdown.tsx`, `markdown-streaming-context.ts`, `pre-block.tsx`, and `apps/web/src/lib/markdown-blocks.ts`.
- Primary evidence: `src/components/markdown.tsx`, `markdown-streaming-context.ts`, `pre-block.tsx`, `message-parts.tsx`, and `src/lib/markdown-blocks.ts`.
- Implemented: Split markdown at stable top-level blank-line boundaries while protecting fenced code and display math; memoize each rendered block; mark only the active final assistant/reasoning block as streaming; skip word splitting and Shiki highlighting on settled blocks and defer highlighting of the streaming code tail until it settles. Existing GFM, remark-math/KaTeX, code/mermaid/JSON, table, citation/link rendering remain wired. Raw HTML remains disabled and ReactMarkdown's default unsafe-protocol URL filtering is unchanged.
- Strategy: architectural adaptation; preserve Void-Agent's renderer components and default URL sanitizer while applying the reference's block-level memoization and streaming context.
- Dependencies: Added `jsdom` as a development dependency for the component-level React render behavior test. No runtime dependencies, API/backend changes, database changes, or migration.
- Security: The optimization does not enable raw HTML or add a URL transform; ReactMarkdown default protocol filtering remains active. Existing external links retain `target=_blank` with `rel=noreferrer`.
- Complexity/performance: Parsing work inside ReactMarkdown is now limited to the changed tail block per token; earlier stable blocks bail out via `React.memo`. Markdown splitting still scans the accumulated text on each update.
- Verification: Focused parser and mounted-component tests pass (9/9). The component test asserts settled ReactMarkdown blocks are not called again as the tail grows, and the tail is rendered once more when streaming ends. A 50,000-line blank-run case verifies loose-list separation is preserved without spread/argument amplification. Scoped Biome and `git diff --check` pass. Integrated typecheck/build are pending; keep family PARTIAL until they pass.

## F033 ? Password/session/account management

- Category/status/priority: EXISTING, P0.
- Reference evidence: `lib/auth` under `apps/web/src` unless prefixed `apps/` or `.github/`; resolve full paths through the source census.
- Primary evidence: `src/lib/auth`.
- Implementation and missing components: Keep Better Auth and existing role/team semantics.
- Strategy: retain and verify.
- Dependencies: Existing auth/user scoping, current database and AI SDK 5 contracts; additional requirements must be justified per implementation batch.
- API/backend changes: None authorized by this row alone; define scoped contracts and failure paths before implementation.
- Database changes: No schema copied or applied; append-only migration design required where persistence changes.
- Frontend changes: Preserve current navigation, design and providers; add only missing affordances.
- Security: Enforce per-user/team ownership, validate untrusted input, redact secrets and bound external execution.
- Complexity/performance: Not estimated until per-surface semantic review; benchmark DB reads, stream work or job concurrency as applicable.
- Verification: Unit failure cases plus integration/authorization tests and relevant existing journeys. Environment-dependent delivery/model calls remain explicitly unverified.

## F034 ? Themes, shortcuts and responsive chat

- Category/status/priority: EXISTING, P2.
- Reference evidence: `components/layouts` under `apps/web/src` unless prefixed `apps/` or `.github/`; resolve full paths through the source census.
- Primary evidence: `src/components/layouts`.
- Implementation and missing components: Only adapt demonstrated gaps; do not replace original UI.
- Strategy: retain and verify.
- Dependencies: Existing auth/user scoping, current database and AI SDK 5 contracts; additional requirements must be justified per implementation batch.
- API/backend changes: None authorized by this row alone; define scoped contracts and failure paths before implementation.
- Database changes: No schema copied or applied; append-only migration design required where persistence changes.
- Frontend changes: Preserve current navigation, design and providers; add only missing affordances.
- Security: Enforce per-user/team ownership, validate untrusted input, redact secrets and bound external execution.
- Complexity/performance: Not estimated until per-surface semantic review; benchmark DB reads, stream work or job concurrency as applicable.
- Verification: Unit failure cases plus integration/authorization tests and relevant existing journeys. Environment-dependent delivery/model calls remain explicitly unverified.

## F035 ? Telemetry and observability

- Category/status/priority: OPTIONAL, P3.
- Reference evidence: `lib/observability` under `apps/web/src` unless prefixed `apps/` or `.github/`; resolve full paths through the source census.
- Primary evidence: `src/lib/logger.ts`.
- Implementation and missing components: Opt-in configuration, redaction and no upstream recipient defaults.
- Strategy: deferred integration.
- Dependencies: Existing auth/user scoping, current database and AI SDK 5 contracts; additional requirements must be justified per implementation batch.
- API/backend changes: None authorized by this row alone; define scoped contracts and failure paths before implementation.
- Database changes: No schema copied or applied; append-only migration design required where persistence changes.
- Frontend changes: Preserve current navigation, design and providers; add only missing affordances.
- Security: Enforce per-user/team ownership, validate untrusted input, redact secrets and bound external execution.
- Complexity/performance: Not estimated until per-surface semantic review; benchmark DB reads, stream work or job concurrency as applicable.
- Verification: Unit failure cases plus integration/authorization tests and relevant existing journeys. Environment-dependent delivery/model calls remain explicitly unverified.

## F036 ? Automatic upstream update workflow

- Category/status/priority: DEPRECATED, P3.
- Reference evidence: `.github/workflows/update-from-upstream.yml` under `apps/web/src` unless prefixed `apps/` or `.github/`; resolve full paths through the source census.
- Primary evidence: `.github/workflows`.
- Implementation and missing components: Do not import automatic replacement workflows into independent Void-Agent.
- Strategy: deferred integration.
- Dependencies: Existing auth/user scoping, current database and AI SDK 5 contracts; additional requirements must be justified per implementation batch.
- API/backend changes: None authorized by this row alone; define scoped contracts and failure paths before implementation.
- Database changes: No schema copied or applied; append-only migration design required where persistence changes.
- Frontend changes: Preserve current navigation, design and providers; add only missing affordances.
- Security: Enforce per-user/team ownership, validate untrusted input, redact secrets and bound external execution.
- Complexity/performance: Not estimated until per-surface semantic review; benchmark DB reads, stream work or job concurrency as applicable.
- Verification: Unit failure cases plus integration/authorization tests and relevant existing journeys. Environment-dependent delivery/model calls remain explicitly unverified.


## F009 workspace implementation addendum (2026-11-05)
- Status remains PARTIAL. Added personal/team project CRUD, project goal/instructions and attached knowledge collections, chat association, project prompt context, and project collection retrieval scope.
- Evidence: `src/app/api/projects/route.ts`, `src/app/api/projects/[id]/route.ts`, `src/lib/projects/access.ts`, `src/lib/projects/policy.ts`, `src/app/api/chat/route.ts`, `src/app/api/chat/actions.ts`, `src/components/projects-dashboard.tsx`, `src/components/chat-bot.tsx`.
- Security: membership is checked on every access; removed team members lose access (even if they created the project); viewers cannot create/edit; retrieval is restricted to collections attached to the project.
- Migration `0035_project_workspaces.sql` is append-only and journaled, but unapplied. Tests cover role policy and attached collection scope. Brain graph, source ingestion, runs, facts, contradictions and browser/Postgres journeys remain incomplete.

## F009 team workspace UI follow-up
Added authenticated `GET /api/projects/teams` listing only teams the caller owns or belongs to, and a workspace selector on project creation. Team membership role is returned without exposing unrelated teams; viewers are omitted from create choices and the create API independently rejects them. Existing team projects display their workspace where visible.

## F010 project brain source analysis addendum (2026-11-05)
- Status: PARTIAL. Added a source analysis UI over documents in project-attached collections, persisted run state with a project/source-content fingerprint, duplicate request reuse, stale-run/failed-run recovery, model extraction of bounded claims, and an explicit accept/reject review workflow.
- Evidence: `src/app/api/projects/[id]/brain/route.ts`, `src/app/api/projects/[id]/brain/facts/[factId]/route.ts`, `src/lib/projects/brain-schema.ts`, `src/components/project-brain-panel.tsx`, `src/lib/db/pg/schema.pg.ts`.
- Migration `0036_project_brain_facts.sql` is append-only and journaled, but unapplied. Source content is bounded to 60,000 characters; requests are authenticated, project-role checked, rate-limited, and limited to ready documents in attached collections owned by current project members. The prompt treats document text as untrusted; extracted claims require human review.
- This does not yet provide automatic ingestion triggers, durable background processing, entity/relationship graph materialization, contradiction detection, or consolidation. No Postgres/browser provider journey has been verified.

## F012 fact review addendum
- Status: PARTIAL. Proposed facts retain source/run linkage and support member acceptance/dismissal. Contradiction detection, fact version history, and cross-source evidence consolidation remain missing.

## F012 contradiction and fact-history follow-up (2026-11-05)
- Status: PARTIAL. Facts are persisted with source/run provenance and review state. A bounded derived check groups active facts by normalized subject/predicate and surfaces different values as *potential* conflicts (it does not assert they are contradictions). Project editors can atomically keep one value and reject the alternative through a project-scoped, row-locked transaction.
- Evidence: `src/lib/projects/brain-graph.ts`, `src/app/api/projects/[id]/brain/graph/route.ts`, `src/app/api/projects/[id]/brain/contradictions/route.ts`, `src/components/project-brain-panel.tsx`.
- Still missing: durable contradiction records, temporal/version-aware comparison, source-level review, and conflict audit history.

## F013 project graph follow-up (2026-11-05)
- Status: PARTIAL. A graph is derived from up to 500 accepted/proposed project facts and rendered with React Flow; each edge maps back to a fact and source, and the UI includes an accessible fact list. This is not the reference's materialized entity/alias graph or node detail system.
- Evidence: `src/lib/projects/brain-graph.ts`, `src/app/api/projects/[id]/brain/graph/route.ts`, `src/components/project-brain-panel.tsx`.

### F027 voice device audio follow-up
- POST /api/voice/audio-command accepts raw WAV from an active device token; a 1 MB stream cap is enforced before body buffering, content type and RIFF/WAVE signatures are checked, session/event headers are strictly bounded, and each device is rate-limited.
- Transcription uses the pre-existing server-side Sarvam proxy credentials. Raw audio is not persisted; the text is stored idempotently in the device owner's chat thread and returned with action: saved_for_review. Spoken requests never bypass approval or authorization.
- Remaining: actual firmware registration and device history/session APIs, gateway/WebSocket transport, audio hardware validation, PostgreSQL-backed auth/persistence, and any approved-action response protocol. F027 remains PARTIAL.

## F021 desktop companion status update (2026-11-05)
- Current status: PARTIAL. The earlier MISSING assessment is superseded for desktop MCP test-screen capability only.
- Primary implementation evidence: `apps/desktop/src/main/index.ts` (sandboxed BrowserWindow and origin-bound navigation), `mcp-ipc.ts` (sender/frame/path checks, native consent, audit), `mcp-policy.ts` (strict bounded inputs/default-deny tool names), `mcp-spawner.ts` (stdio process lifecycle/timeouts/result caps), preload, `src/lib/ai/mcp/desktop-bridge.ts`, and the MCP test page callsite.
- Auth evidence: system-browser provider selection, random state, safe return path, and one-time-token handoff are implemented in desktop auth modules and the `/desktop/auth/complete` route. This behavior is type/build checked but not live OAuth tested.
- Remaining: no agent/chat desktop tool invocation, hardware desktop integration, signed distributables, auto-update, real consent/tool journey, or PostgreSQL-backed auth verification. These are not counted complete.
- Validation in this checkpoint: 11 focused tests passed; desktop typecheck and bundle passed; root typecheck and targeted Biome passed; production Next build status pending at time of update.

## F025 status update â€” Gmail send/reply (2026-11-05)
- Added an explicit approval token exchange to the existing review card and `/api/approvals/email` endpoint. Payloads are bounded and owner-bound. Issuance is same-origin/rate-limited and uses a random 256-bit token; only its SHA-256 digest and the canonical draft hash are persisted in Better Auth's existing verification table for ten minutes.
- Gmail send and reply now fail closed without a valid single-use token. Atomic deletion binds the token to the owner and exact action/recipient/subject/body/message ID. Reply checks the original message subject before sending. Header newlines and raw path interpolation are constrained.
- Reference send/reply semantics now require the user-reviewed card for the built-in Gmail tool. Other external mutating tools remain outside this gate, so the family remains PARTIAL.
- Verification: new route, token contract/repository, Gmail side-effect gate and prior agent-approval tests; full test suite 1,064/1,064; typecheck and focused Biome passed. PostgreSQL/provider/live browser workflows remain unverified; production build is in progress.

- F025 build follow-up (2026-11-05): pnpm build passed with 192/192 static pages and /api/approvals/email emitted; no live Gmail/PostgreSQL verification. See testing report for environment warnings.


## F013/F017 project graph retrieval in chat (2026-11-05)
- Status remains PARTIAL. Project chats now have a `searchProjectKnowledgeGraph` tool that searches accepted, source-backed project facts and returns bounded evidence/citation labels. Existing RAG still handles unstructured chunk retrieval.
- Authorization is rechecked at tool execution; collection IDs are intersected with current project attachments, and queries require current membership, current project collection-owner IDs, and ready source items. The database scan is bounded to 500 facts and response to 12 matches.
- Tests: focused project graph/tool tests passed 6/6; root typecheck passed; new tool modules pass Biome; chat route passes import/lint Biome with formatting disabled; production build passed all 192/192 pages.
- Remaining parity: reference graph traversal, alias/entity resolution, graph node detail, broader semantic knowledge-base search, and Postgres-backed/browser chat verification are not implemented or verified. No migration was applied.

- Hardening follow-up: each returned row is checked again in application code for accepted status, ready source, attached collection, and current project collection owner. Final build passed 192/192 pages; live DB/browser journey remains pending.


## F026 AssemblyAI chat dictation update (2026-11-06)
Void-Agent now optionally adds a microphone dictation control to the chat composer when `ASSEMBLYAI_API_KEY` is configured. The authenticated API issues a maximum-10-minute AssemblyAI streaming token and never returns/stores the account key. Browser PCM is streamed directly to AssemblyAI over WSS; only finalized bounded transcript turns are appended to the user's draft. Dictation never sends the message or runs a command, and raw audio is not persisted. The control hides itself when the service is not configured.
- Evidence: `/api/assemblyai/token`, `src/lib/voice/assemblyai-stream.ts`, `src/hooks/use-assemblyai-dictation.ts`, `src/components/assemblyai-dictation-button.tsx`, `src/components/prompt-input.tsx`.
- Focused token/audio contract tests: 7/7 passed; `pnpm check-types`, targeted Biome, and `git diff --check` passed. Final production `pnpm build` passed and generated all 192/192 pages, including `/api/assemblyai/token`.
- F026 remains PARTIAL: no AssemblyAI key/provider/browser microphone session was available for live verification; not all reference voice modes, device gateway, long-capture workflow, or full voice-agent behavior are integrated. `ASSEMBLYAI_API_KEY` is an optional blank entry in `.env.example`.

## F010/F011 durable queue follow-up (2026-11-05)
- Manual source analysis now creates an idempotent `queued` run and returns `202`; it no longer holds the user's request open while model inference runs. The existing authenticated cron/scheduler worker atomically claims one oldest queued run per tick with `FOR UPDATE SKIP LOCKED`, reclaims runs stale for five minutes, and records succeeded/failed state with proposed facts in one transaction.
- The run records the requesting user. At execution time, the worker rechecks current project editor access, attached collections, collection ownership, source readiness, and a source-content fingerprint before model use. Source is treated as untrusted and extracted facts remain proposals.
- Evidence: `src/lib/projects/brain-queue.ts`, `src/app/api/projects/[id]/brain/route.ts`, `src/lib/scheduler/worker.ts`, `src/components/project-brain-panel.tsx`, append-only migration `0040_project_brain_queue.sql`.
- F010/F011 advance but remain PARTIAL: this queues manually requested document analysis only; automatic ingestion triggers, multi-step resumable processing, consolidation, entity/alias graph behavior, and real Postgres/browser/provider journeys are not done. Migration 0040 is local and unapplied.
- Verification: focused project-brain/API suite 8/8; full Vitest 1,076/1,076 across 134 files; `pnpm check-types`, `pnpm exec drizzle-kit check`, focused Biome, `git diff --check`, and exact-source `pnpm build` passed. Build generated 192/192 pages; existing workspace/dependency/dynamic-session/image/optional-service warnings remain.

## F025 connector action approvals â€” Google Calendar (2026-11-05)
- Added user-reviewed Google Calendar event create, update, and delete actions to Void-Agent's existing Calendar connector. Read/list/get remain direct. Mutating tool calls fail closed without an authenticated, same-origin, rate-limited approval token bound to the canonical exact action and fields; tokens are random, short-lived, single-use, and persisted as hashes in the existing Better Auth verification table.
- The review card displays the complete event details and requires explicit confirmation. Time values are normalized to ISO instants. Update uses PATCH to avoid replacing unrelated attendee/reminder fields and applies the fetched event ETag when available. Delete first verifies the live title/start/end still match the reviewed target and then conditionally deletes with its ETag.
- Evidence: `src/lib/ai/tools/hitl/calendar-approval.ts`, `src/app/api/approvals/calendar/route.ts`, `src/lib/db/pg/repositories/calendar-approval-repository.pg.ts`, `src/lib/ai/tools/connectors/calendar-tool.ts`, `src/components/tool-invocation/hitl-tool-cards.tsx`, `src/components/message-parts.tsx`.
- F025 remains PARTIAL: approval enforcement is now covered for Gmail send/reply, agent creation, and Google Calendar event mutations, but other mutating connectors, MCP, workflows, and provider live calls remain. All-day calendar events are not yet supported; no browser/Postgres/Google account journey was available.
- Verification: calendar approval/connector tests 14/14; full suite 1,086/1,086 across 137 files; root typecheck, focused Biome, `git diff --check`, and production build passed (192/192 pages). No schema migration or dependency was added.

## F010/F011 automatic ingestion trigger and queue guard (2026-11-05)
- Successful collection text/file/URL ingestion now enqueues source analysis for attached editable projects when the source collection is owned by an eligible project member. A source is fingerprinted and idempotently queued; the existing scheduler handles bounded inference.
- Queue failure never turns a successful knowledge ingest into a failed request. The response reports queued count and whether the project enumeration/auto-enqueue limit was reached. Processing is throttled to 30 ingestion-triggered queue attempts per user per hour using the shared API rate-limit repository; manual project-brain requests retain their existing separate protection.
- Evidence: `src/app/api/collections/[id]/items/route.ts`, its route test, and `src/lib/projects/brain-queue.ts` / `brain-schema.ts`.
- F010/F011 remain PARTIAL: no live PostgreSQL worker or browser journey, no resumable multi-stage pipeline, project-wide consolidation, or full graph parity. Migration 0040 remains unapplied.
- Verification: focused source queue/ingestion suite 11/11; full Vitest 1,089/1,089 across 138 files; `pnpm check-types`, Drizzle journal check, focused Biome, and `git diff --check` passed. Production build passed and generated 192/192 pages. Build retains the previously documented optional-service/dependency/image/SSL/dynamic-render warnings.

## F025 Linear issue creation approval slice (2026-11-06)
- Linear `create_issue` now requires an explicit review card and a short-lived single-use approval bound to the exact team UUID, title, and optional description. Read actions remain direct.
- Evidence: `src/lib/ai/tools/hitl/linear-approval.ts`, `src/app/api/approvals/linear/route.ts`, `src/lib/db/pg/repositories/linear-approval-repository.pg.ts`, `src/lib/ai/tools/connectors/linear-tool.ts`, and `src/components/tool-invocation/hitl-tool-cards.tsx`.
- Linear `list_issues` now sends state as a GraphQL variable rather than interpolating it into a query string.
- F025 remains PARTIAL: this covers Linear issue creation, not all of the other mutating connectors, MCP servers, workflows, or external actions. PostgreSQL token replay race and live Linear/browser interaction are not verified; no migration was added.
- Verification: focused Linear/HITL tests 11/11; full Vitest 1,095/1,095 across 140 files; `pnpm check-types`, focused Biome with formatting disabled for unrelated existing formatting, `git diff --check`, and exact-source production build passed (192/192 pages). Existing optional-service, dependency-analysis, image, SSL-mode, and dynamic-render warnings remain.

## F025 Slack message posting approval slice (2026-11-06)
- Slack now supports posting a channel message in addition to its read/list actions. The review card lets the user confirm/edit the exact channel ID and text before server token issuance.
- `/api/approvals/slack` issues a rate-limited, same-origin, ten-minute approval; the connector atomically consumes the current-user exact-payload token before calling Slack `chat.postMessage`. Missing, altered, expired, or replayed approvals fail closed.
- Evidence: `src/lib/ai/tools/hitl/slack-approval.ts`, `src/app/api/approvals/slack/route.ts`, `src/lib/db/pg/repositories/slack-approval-repository.pg.ts`, `src/lib/ai/tools/connectors/slack-tool.ts`, and `src/components/tool-invocation/hitl-tool-cards.tsx`. OAuth already requests the `chat:write` scope.
- F025 remains PARTIAL: many other write-capable connector actions and all MCP/workflow effect paths still need individual inventory, adaptation, and tests. Live Slack/PostgreSQL/browser verification is pending; no migration was added.
- Verification: Slack-focused suite 12/12; full Vitest 1,101/1,101 across 142 files; typecheck passed after the Slack implementation; focused Biome and `git diff --check` passed; exact-source production build passed (192/192 pages). Existing build/runtime-probe warnings remain.

## F010/F011 structured project-brain extraction follow-up (2026-11-06)
- The queued worker now asks for typed project entities, aliases, bounded attributes, explicit entity relations, and direct claims. It adapts all of these to Void-Agent's existing reviewable subject/predicate/object fact model, preserving current acceptance/rejection controls and graph UI without a competing page/alias database.
- The schema drops malformed array items, duplicate entity IDs, self-links, and dangling relations. Before persistence, each resulting triple is kept only if its evidence quote occurs in the source after case and whitespace normalization. The source remains untrusted; all extracted facts remain proposals for human review.
- Evidence: `src/lib/projects/brain-schema.ts`, `src/lib/projects/brain-queue.ts`, and `src/components/project-brain-panel.tsx` (existing review/graph path).
- F010/F011 remain PARTIAL: this adaptation does not persist typed entity pages/aliases separately, version raw sources, compile page truth, consolidate project status/todos, or provide the complete reference graph query/retrieval system. No DB schema migration was needed.
- Verification: focused project-brain suite 16/16; full Vitest 1,103/1,103 across 142 files; `pnpm check-types`, focused Biome, `git diff --check`, and exact-source production build passed with 192/192 pages. Existing environment/dependency/image/SSL/dynamic-render warnings remain.

## F010/F011 immutable source revision lineage (2026-11-06)
Project-brain runs now reference a deduplicated source-version metadata row keyed by project, item and source fingerprint. The record contains only content length and creation time; source text remains in the existing knowledge document store. Existing runs are backfilled with length `0` to denote unknown historical length, and newly queued work checks the current fingerprint plus recorded length before model execution. API listing exposes only revision ID, item ID, length and timestamp after current project/collection-owner filtering. `0041_project_brain_source_versions.sql` is append-only and local/unapplied. This records lineage metadata; it does not archive old source bytes or enable analysis against historical content. F010/F011 remain PARTIAL.
- Evidence: `schema.pg.ts`, migration `0041`, `source-versions.ts`, `brain-queue.ts`, brain route GET/POST, and `project-brain-panel.tsx`.
- Focused API/helper suites: 7/7; full Vitest: 1,106/1,106 across 143 files; typecheck, Drizzle journal check, targeted Biome and `git diff --check` passed. Production build is still running at the time of this note; append its final result separately.
- No live PostgreSQL migration/worker or browser workflow was available. No DB migration applied, no push or deploy.

## F010/F011 graph entity detail retrieval (2026-11-06)
The existing fact-backed graph now supports selecting a node and loading its direct detail: display label, extracted aliases, bounded neighboring claims, review state, evidence, and source links. The new route rechecks project access, attached collection IDs, current collection owners, and ready source status; it excludes rejected facts, validates/bounds identifiers, caps returned rows, and sends `Cache-Control: no-store`. This adapts the reference entity-detail workflow over Void-Agent's reviewed-fact store. The reference's typed page metadata, merged-page history, evidence-current links, recursive traversal, shortest path, expert routing, and consolidation are still missing. Keep F010/F011 PARTIAL.
- Evidence: `src/app/api/projects/[id]/brain/graph/nodes/[nodeId]/route.ts`, `src/lib/projects/brain-graph.ts`, `src/components/project-brain-panel.tsx`.
- Verification: graph helper and API tests 7/7; full Vitest 1,110/1,110 across 144 files; typecheck and focused Biome passed. The production build initially caught two unescaped apostrophes; after fixing them, a fresh `pnpm build` succeeded, generated 192/192 pages, and the app-path manifest contains the graph node endpoint. Existing dynamic-page, optional Redis/E2B, SSL-mode, dependency-analysis and image warnings remain documented. No live PostgreSQL/browser workflow.

## F010/F011 focused graph traversal and alias-aware retrieval (2026-11-06)
The project graph endpoint now supports reference-style `?focus=<node>&depth=<1-3>` neighborhoods over Void-Agent's existing triples. Breadth-first traversal is undirected like the reference and hard-capped at 200 returned nodes; default graph behavior remains intact. Both full/focused graph reads now verify current project access, attached collection IDs, current collection owners, and ready source items, and return no-store responses. Project chat knowledge search also resolves accepted alias claims to their canonical subject and fetches a bounded set of accepted facts incident to those canonical names, applying the same live collection/source policy on both queries. No parallel graph schema was introduced. F010/F011 remain PARTIAL: typed page IDs/types, historical merge lineage, graph shortest-path/expert routing, consolidation/dream cycles, and full multi-stage source processing remain absent.
- Evidence: `src/lib/projects/brain-graph.ts`; graph and node APIs; `src/lib/ai/tools/project-knowledge.ts`; `src/components/project-brain-panel.tsx`.
- Validation: full Vitest 1,115/1,115 across 145 files; typecheck, Drizzle journal check, focused formatter-disabled Biome and `git diff --check` passed. Latest `pnpm build` succeeded with all 192/192 pages; app-path manifest contains the graph API. Build emitted existing Next workspace-root, dynamic-page, dependency-analysis, `<img>`, optional Redis/E2B and PostgreSQL SSL-mode warnings. No live Postgres/query-plan/browser verification.
- No DB schema/migration change in this graph slice; source-version migration `0041` remains local/unapplied. No push or deploy.

## F025 Zendesk ticket comment approval slice (2026-11-06)
- Zendesk `add_comment` was verified as a ticket mutation (`PUT /tickets/{id}.json`). It now requires an authenticated user's editable review and a short-lived one-use token bound to the exact ticket ID and comment, consumed before the provider call.
- Zendesk list/get/search remain read actions. Ticket IDs are restricted to positive decimal identifiers; write input is strict and bounded.
- Evidence: `src/lib/ai/tools/connectors/zendesk-tool.ts`, `src/app/api/approvals/zendesk/route.ts`, `src/lib/db/pg/repositories/zendesk-approval-repository.pg.ts`, HITL card, and focused tests.
- F025 remains PARTIAL: other connector mutations and MCP/workflow write paths remain unreviewed or unprotected; live Zendesk/Postgres/browser verification is pending.
## F025 Freshdesk ticket effects approval slice (2026-11-06)
- Freshdesk `create_ticket` and `add_reply` are now gated by editable user review and one-use exact-payload approval. Create review includes requester name/email, subject/description, status and priority; reply review includes ticket ID and full reply. The previous hardcoded requester identity was removed.
- The authenticated issuance endpoint is same-origin, rate-limited, request-bounded, and no-store. The server stores token/payload digests; connector consumes a current-user exact token before either provider write. List/get remain read actions.
- Focused Freshdesk tests passed 16/16; root typecheck, focused Biome, and diff check passed. Full suite passed 1,140 tests across 156 files. Fresh final build pending.
- F025 remains PARTIAL because more connector, MCP, and workflow mutation paths need individual audit/approval.
## F025 external messaging approval system (2026-11-06)
- Added a shared, exact-payload approval contract for outbound Microsoft Teams, Discord, and Zulip messages. The review binds provider, destination, content, and Zulip topic. Discord IDs and 2,000-character message maximum are validated; other message text is bounded to 4,000 characters.
- Authenticated same-origin rate-limited issuance stores only digests and returns a no-store one-use token. Each connector consumes the current user's token before network mutation; read actions stay unchanged. Existing Slack uses its previously implemented provider-specific approval.
- Focused tests passed 16/16; full suite passed 1,148 tests across 160 files; targeted Biome and diff check passed. Typecheck rerun with larger heap completed without diagnostics; production build pending.
- F025 remains PARTIAL: more mutating connector, MCP, and workflow surfaces remain.
## F025 Asana and ClickUp task creation approval slice (2026-11-06)
- Asana `create_task` and ClickUp `create_task` now require explicit review of provider, numeric project/list ID, task name and notes/description, followed by server-issued one-use exact-payload approval. Their read/list operations remain unchanged.
- Approval issuance is authenticated, same-origin, rate-limited, body-bounded, strict, and no-store; tokens are stored only as hashes and consumed before external writes.
- Focused task-creation tests passed 16/16; full suite passed 1,156 tests across 164 files. Larger-heap typecheck completed without diagnostics; targeted Biome and `git diff --check` passed. Fresh production build pending.
- F025 remains PARTIAL; more connector/MCP/workflow writes still require review.
## F025 Productboard feature creation approval slice (2026-11-06)
- Productboard `create_feature` now requires explicit user review through the existing task/item proposal card and the shared authenticated, same-origin, rate-limited issuance route. The approval binds provider, Productboard product ID, feature name, and full description; connector consumes the current user's one-use digest-backed token before POST.
- Productboard IDs are restricted to bounded URL-safe identifiers. Missing, changed, stale, or replayed approval prevents mutation. The review card labels this action as feature creation.
- Evidence: `src/lib/ai/tools/connectors/productboard-tool.ts`, `productboard-tool.approval.test.ts`, shared task creation approval schema/repository, `/api/approvals/task-creation`, and HITL card.
- Verification: Productboard/task approval cases pass; full suite and production build passed for this source state. No live Productboard/PostgreSQL/browser flow; F025 remains PARTIAL because MCP/workflow effects and all provider writes have not been exhaustively live-verified.

## F021 desktop MCP local execution audit (2026-11-06)
- Inspected the primary desktop companion and read-only reference implementation. Primary has trusted main-frame/origin/test-page IPC checks, bounded stdio config and argument schemas, native per-config launch consent and per-call consent, a default-deny read-style tool allowlist enforced both at listing and call time, bounded result serialization, timeouts, minimal child environment, and hash-only local audit records.
- Evidence: `apps/desktop/src/main/mcp-ipc.ts`, `mcp-policy.ts`, `mcp-spawner.ts`, `src/lib/ai/mcp/desktop-bridge.ts`, and `src/app/(chat)/mcp/test/[id]/page.tsx`.
- Desktop companion typecheck/build passed; allowlist/config tests passed. No manual native consent, OAuth, or live local MCP server journey was available. Do not expose the local stdio bridge to cloud chat/agent execution. F021 remains PARTIAL pending that end-to-end check and release signing/update work.
## F010/F013 accepted-claim shortest relationship path (2026-11-06)
- The project brain UI now queries a shortest relationship path between two named entities. API source visibility checks run before the query; traversal uses accepted claims only, is undirected, and is capped at six hops/200 nodes. Proposed or rejected claims are not presented as established relationship paths.
- Evidence: `src/lib/projects/brain-graph.ts`, `brain-graph.test.ts`, `/api/projects/[id]/brain/graph` route and tests, `src/components/project-brain-panel.tsx`.
- Verification: focused graph/helper/API tests 11/11; root typecheck, targeted Biome and diff check passed; full Vitest 1,170/1,170 across 169 files; production build passed with 192/192 static pages. PostgreSQL/browser behavior remains unverified. F010/F013 remain PARTIAL; graph pathfinding alone does not provide typed pages, merge history, expert routing, or consolidation.
## F010 reference page identity/merge audit (2026-11-06)
- Reference evidence inspected: `apps/web/src/lib/project-brain/merge-pages.ts`, `dedupe-pages.ts`, `graph.ts`, graph API, and `ProjectBrainPageTable`/alias/fact/version/chunk schema in `apps/web/src/lib/db/pg/schema.pg.ts`.
- Reference behavior: merge folds duplicate facts and links into a survivor; repoints aliases, events, versions, and contradictions; removes duplicate/self links and orphaned loser chunks; archives the loser with `mergedIntoPageId`; recompiles survivor truth; snapshots page versions. Dedupe scans bounded same-type candidates, honors `notSameAs`, model-judges pairs, merges confirmed pairs transactionally, then re-embeds the survivor.
- Void-Agent equivalent: no canonical typed page identity; current graph nodes are normalized subject/object strings over reviewed triples. Existing source-version metadata is not page history or merged-page lineage. Status remains PARTIAL. Safe adaptation needs an append-only page/alias schema and transaction compatibility review; this audit did not copy/apply the reference schema or enable automatic model merges.
## F010/F013 expert routing addendum (2026-11-06)
- Reference surface: project-brain whoKnows topic lookup resolves aliases, finds typed person pages linked to matched topics, ranks graph relationships, and returns evidence.
- Void-Agent equivalent: project graph API `?whoKnows=` and Project Brain panel route using accepted `entity type=person`, alias, and relationship facts; return bounded source-backed evidence; require all normalized query terms to match (with simple plural normalization).
- Security/data boundary: authenticated project access plus attached collection, current owner, and ready-source filters precede routing; only accepted facts establish person/topic links; response is no-store. UI says a connection does not verify expertise.
- Evidence: `src/lib/projects/brain-graph.ts`, helper tests, graph route/tests, and `src/components/project-brain-panel.tsx`.
- Status: PARTIAL. Adapted workflow exists, but has mock/API unit verification only and lacks reference typed-page identity, broader graph ranking, and live PostgreSQL/browser verification.

## F025 configured automation execution approval (2026-11-06)
- Audited the app-default Windmill/Activepieces workflow tool and found that `run` sent model-supplied target/payload directly to external automation services without a user approval gate.
- Added a review-card issuance flow and server enforcement. Approval binds platform, exact target, and canonicalized JSON payload; the token is user-scoped, stored as a digest, expires after ten minutes, and is consumed once before the external request. `list_scripts`/`list_flows` remain read-only.
- Evidence: `src/lib/ai/tools/workflow.ts`, `workflow-run-approval.ts`, approval repository and API, HITL card and tests.
- Status: COMPLETE for the app-default Windmill/Activepieces run action under mock/API verification. F025 overall remains PARTIAL: saved workflow MCP nodes and arbitrary chat MCP tool calls still need complete effect/approval review.

## F021/F025 remote MCP tool approval (2026-11-06)
- Direct chat MCP tool execution is now wrapped with an approval-token property and server-side exact-call gate. Approval binds MCP server UUID/name, exact tool name, and canonicalized complete JSON arguments. The token is current-user-scoped, digest-only, short-lived, one-use, and consumed before the MCP manager call.
- Manual tool confirmation issues an equivalent token and calls through the same execution gate. The review card exposes editable server/tool/arguments; tool schemas require the token, and the HITL proposal tells the model to request review first.
- Evidence: `src/app/api/chat/shared.chat.ts`, MCP approval schema/repository/API, `execute-approved-mcp-tool.ts`, review card and focused tests.
- Status: COMPLETE for direct remote MCP tool calls in the chat tool loader under mock/API verification. Overall F021/F025 remain PARTIAL: saved workflow tools with embedded MCP nodes, voice MCP execution, and the MCP test page's explicit run flow need separate access/effect review; live remote server approval was not verified.

## Saved chat workflow MCP approval boundary (2026-11-06)
- Chat-exposed saved workflows now require an exact, user-bound one-use approval token before graph loading/execution. Tool schema reserves a collision-free token field; approval binds published workflow UUID/name, exact JSON payload, and token-field name.
- Execution rechecks current user execute access, current name and publication state, then atomically consumes the approval before returning the graph to the executor. The issuance API also checks current execute access.
- Evidence: `src/app/api/chat/shared.chat.ts`, `src/app/api/chat/route.ts`, `src/lib/ai/workflow/load-approved-workflow.ts`, `src/app/api/approvals/workflow-run/route.ts`, HITL card and focused tests.
- Status: saved workflow input/access gate is implemented, but F025 remains PARTIAL. The approval card does not yet expose a user-readable internal side-effect manifest; graph-definition changes are not fingerprint-bound; voice MCP and standalone MCP test flows remain separate.

## Voice and MCP test action approval path (2026-11-06)
- OpenAI Realtime, Groq/Konvo, and ElevenLabs voice MCP invocations now pause for an explicit browser review of server, tool, and exact arguments. Approval is issued through `/api/approvals/mcp-tool`; dispatch uses the server ID/name mapping and consumes the current user's exact one-use approval before calling the MCP manager.
- Voice-provider tool definitions omit the internal approval-token field. Provider-visible schemas preserve the actual MCP arguments; the browser cannot rely on a model-generated token.
- Approval issuance now rechecks that the MCP server exists, its current name matches the reviewed identity, and the signed-in user owns it, can access it publicly, or is an admin.
- The standalone remote MCP test UI also requires explicit review/token issuance before calling its authenticated server action. Local desktop stdio tests remain behind the desktop bridge's native consent flow.
- Evidence: voice session APIs and hooks; `mcp-voice-approval.ts`; `/api/approvals/mcp-tool`; `callMcpToolAction`/`callApprovedMcpToolAction`; MCP test page; focused tests.
- Status: automated voice MCP and standalone remote test calls are now approval-gated in code and mock tests. F021/F025 remain PARTIAL pending a live browser/provider/PostgreSQL run and remaining workflow graph effect-manifest/revision binding.

## Saved workflow review and HTTP destination hardening (2026-11-06 04:56 IST)
- Saved workflow approval card now requests a same-origin server preview showing only action type, HTTP method, destination host, and MCP server/tool labels. It intentionally excludes URL paths/query strings, request headers, bodies, and credentials.
- Approval issuance fingerprints the current node/edge graph; execution recomputes the fingerprint and consumes a token bound to it. A changed graph returns 409 and requires a fresh review.
- Workflow HTTP node execution now uses the HTTPS/public-address guard and rejects redirects. Shared IPv6 guard now handles hex-form IPv4-mapped and NAT64 addresses, multicast, malformed values, and reserved compatible addresses.
- Evidence: src/components/tool-invocation/hitl-tool-cards.tsx, src/app/api/approvals/workflow-run/route.ts, src/lib/ai/workflow/{workflow-review,load-approved-workflow}.ts, src/lib/ai/workflow/executor/node-executor.ts, src/lib/webhooks/url-guard.ts.
- Status: saved chat-workflow approval now binds and summarizes the reviewed graph in unit/API coverage. F025 remains PARTIAL pending live PostgreSQL/browser execution and coverage of workflow-editor/other execution entry points.

## n8n workflow execution boundary (2026-11-06 05:14 IST)
- `/api/workflow/[id]/execute` now requires a signed-in user, exact same-origin request, bounded workflow ID, and per-user rate allowance.
- It resolves the workflow through that user's n8n client before dispatch, so foreign/unshared workflow IDs are rejected by n8n authorization before execution. Results are `no-store`; errors do not echo upstream details.
- Evidence: `src/app/api/workflow/[id]/execute/route.ts` and `route.test.ts`.
- Status: security gate is covered by route mocks; actual n8n authorization/sharing semantics remain unverified against a live account. F025 is still partial overall.

## Saved workflow MCP access enforcement (2026-11-06 05:29 IST)
- Workflow preview, approval issuance, and approved execution now verify every MCP node against the caller's currently accessible MCP connections. Missing/private-to-another-user, disabled, or renamed connections fail closed before a token is issued/consumed or a tool is dispatched.
- This closes a server-side capability boundary for public saved workflows. F025 remains PARTIAL because exact MCP arguments are generated inside workflow execution and internal external-service side effects are not individually previewed.
- Evidence: `src/lib/ai/workflow/assert-workflow-mcp-access.ts`, workflow approval API, and `load-approved-workflow.ts` plus tests.
- Verification: helper/load/API tests 13/13; 4 GB TypeScript check passed; production build passed, 192/192 pages. No live Postgres, browser, or MCP server run.
## F010/F012 project-brain source visibility hardening (2026-11-06)

- Brain run and fact reads now join through source item and collection, limiting disclosure to ready sources in currently attached collections owned by current project members. Empty visibility returns no source-derived rows without querying those tables. The response is no-store.
- Conflict resolution applies the same live source boundary in its locked transaction before accepting/rejecting either claim. Detached or non-ready source facts are not actionable through this endpoint.
- Evidence: `src/app/api/projects/[id]/brain/route.ts`, `src/app/api/projects/[id]/brain/route.test.ts`, `src/app/api/projects/[id]/brain/contradictions/route.ts`, and its route tests.
- This closes a security gap; F010/F012 remain PARTIAL pending typed page identity/alias lifecycle, complete source history/consolidation, and live PostgreSQL/browser verification.
### Alias identity safety follow-up (2026-11-06)

Expert routing now resolves an alias only when accepted claims identify exactly one canonical entity. Ambiguous aliases remain unresolved instead of being assigned according to row order. This improves identity correctness but does not replace typed page IDs or reviewed merge history.
## F010 typed page identity foundation (2026-11-06)

- Added an additive project-scoped typed page/alias schema (`0042_project_brain_typed_pages.sql`) and backfilled only explicit entity-type claims. Existing facts remain the evidence and human-review source of truth.
- New queued extractions materialize pages only when a typed identity claim is grounded in source text. Fact links are attached only for explicit typed entities/relations or unique labels; ambiguous cross-type labels stay unlinked. Alias rows point to their source fact so status is inherited from review state.
- Added a current-source-scoped API and project-panel list for accepted typed pages/aliases. Pages are shown only when the accepted identity fact comes from a ready source in an attached collection owned by a current project member.
- Status remains PARTIAL: manual transactional merge/history mutation, graph ID migration, typed-page versions/consolidation, and live PostgreSQL verification are not implemented.
- Rollback: migration is additive; application rollback can leave the new tables/nullable columns and generated data in place. Do not drop or reverse them after data is written without an explicit export/backup plan. Migration is local and unapplied.
## F010 reviewed canonical page merge continuation (2026-11-06 06:33:01 +05:30)
- Added editor-authorized, same-origin, rate-limited same-type page merge. Both active page rows are locked in deterministic order inside one PostgreSQL transaction; current accepted identity evidence is checked against attached collections and present owners before any write.
- Merge history records the actor and both endpoint titles. Fact subject/object links and alias page IDs move to the survivor; the loser is archived with a redirect; survivor timestamps are refreshed. Repeated requests are idempotent when the same loser already redirects to the chosen survivor. No automatic/model-driven dedupe was enabled.
- Evidence: src/lib/projects/merge-brain-pages.ts, src/app/api/projects/[id]/brain/pages/route.ts POST, migration 0042_project_brain_typed_pages.sql, and the merge controls in src/components/project-brain-panel.tsx.
- Verification: focused project-brain graph/schema/pages/merge suites passed 36/36; targeted Biome passed; git diff --check passed (only existing line-ending notices). The production build passed before the final survivor updatedAt refresh; this last helper-only change is covered by the focused suite, but a fresh full typecheck/build remains due.
- Limitation: transaction behavior, lock races and rollback are mock-tested only; no live PostgreSQL instance is configured. Migration 0042 is additive and unapplied. F010 remains PARTIAL: graph reads/traversal still use normalized labels rather than canonical IDs, merge lineage is not exposed in detail views, and source-current page history/consolidation remain absent. No push, deploy, production DB or migration action.
## F010 canonical page IDs in graph and detail (2026-11-06 06:43:07 +05:30)
Typed project-brain page IDs now back graph node IDs wherever an accepted/source-grounded typed identity is linked. Related facts for a merged entity converge on the survivor ID; canonical page titles are loaded for graph display. Focused traversal accepts page IDs or a unique label/alias, shortest paths accept unique label lookup, and node detail can load a typed page by ID while preserving legacy label requests. Ambiguous labels do not resolve to an arbitrary page. Facts without typed identity retain normalized-label node IDs.
- Evidence: src/lib/projects/brain-graph.ts, graph route/tests, node detail route/tests, and the existing page merge route.
- Verification: 24/24 graph/detail/merge tests; focused Biome; pnpm build passed production compilation/type/lint checking and generated 192/192 pages. Build retains existing workspace-root, dynamic-rendering, dependency-analysis, optional Redis/E2B, SSL and image warnings.
- Limits: no live PostgreSQL or browser workflow; migration 0042 remains unapplied. Existing graph methods still use the bounded in-memory fact window; source-version snapshots, merged-from detail, consolidated truth/status/todo, and reference background dedupe remain incomplete. F010/F011/F013 remain PARTIAL.
## F027 owner-scoped voice device transcript history (2026-11-06 07:02:15 +05:30)
Added a bounded recent-history endpoint at /api/voice/devices/[id]/history and a per-device history view. It reads only user-role transcript messages explicitly tagged source=voice_device and the exact device ID, joins through both the owning device and owning chat thread, validates a 1â€“50 limit, applies per-user rate limiting, returns no-store responses, and exposes only text/language/timestamp/thread link. This reuses Void-Agent's existing transcript-as-reviewable-chat workflow rather than creating a competing transcript/action database.
- Evidence: src/lib/db/pg/repositories/voice-device-repository.pg.ts, new history route/tests, src/components/voice-devices-dashboard.tsx.
- Verification: focused history/device audio/transcript tests 7/7; focused Biome passed; root typecheck passed with NODE_OPTIONS=--max-old-space-size=4096 (default 2 GB process OOMed); fresh pnpm build passed and generated 192/192 pages. Existing nonfatal build warnings remain.
- Limits: no PostgreSQL-backed query, browser or hardware test; migration 0039 is unapplied. Firmware registration bootstrap and session/segment database, gateway/WebSocket transport and approved-action protocol are still absent. The reference checkout itself has no bridge script and its websocket route requires an external gateway. F027 remains PARTIAL.
## F027 device transcript history parity update (2026-11-06 07:02:36 +05:30)
The earlier F027 row listed device history as missing. The new authenticated history API and device-specific dashboard now cover recent transcript browsing from messages saved by the enrolled-device flow. This is not a dedicated event/action history: device audio sessions, registration bootstrap, firmware setup status and live WebSocket bridge are still incomplete. Treat the old row as superseded only for history browsing; F027 remains PARTIAL.
## F019 resumable chat streaming implementation update (2026-11-06)
- Status: PARTIAL (supersedes the initial MISSING row above). With `REDIS_URL` or `KV_URL`, chat responses are buffered via `resumable-stream`; authenticated owner-only HEAD/GET can resume the active thread stream. Cancellation is signaled through an authenticated, same-origin, rate-limited owner-only stop route and polled by the producing server. Without TCP Redis, the existing request-bound abort path remains active.
- Evidence: `src/lib/ai/chat-stream-context.ts`, `src/app/api/chat/route.ts`, `src/app/api/chat/[id]/stream/route.ts`, `src/app/api/chat/[id]/stop/route.ts`, `src/components/chat-bot.tsx`, and focused tests.
- Redis stop-signal write failures now return generic 503 instead of false success; the client warns that generation may still be running. `.env.example` distinguishes TCP Redis required for resumable chat from Upstash REST cache variables.
- Verification: focused stream context/resume/stop tests 10/10; targeted Biome clean; `pnpm check-types` passed with 4 GB heap; `git diff --check` passed (Git reports existing line-ending normalization warnings). Prior to the stop-failure handling refinement, a fresh production build passed 192/192 routes/pages; no build rerun after the UI/error-path refinement.
- Remaining: no live Redis, PostgreSQL, browser, multi-instance, or interruption/reconnect journey. Redis outages while a generation is already running can still prevent remote stop polling; status remains PARTIAL. No push, deploy, DB migration, or production access.
## F026/F027 voice command safety and current build verification (2026-11-06)
- Reference review: `apps/web/src/app/api/voice/audio-command/route.ts`, `lib/voice/audio-command.ts`, and `lib/voice/run-transcript-command.ts` transcribe device WAV and can classify/dispatch tasks, agents, schedules, workflows, or tools; the reference records action state in `voice_transcript` and has session/segment lifecycle tables.
- Void-Agent currently accepts bounded device WAV, validates WAV signature and device auth/rate limits, transcribes it, and persists the transcript as a user message in the device owner's chat, with idempotent event IDs and `saved_for_review` result. Existing normal chat flows and tool-approval controls are then available; no device transcript auto-runs tools or creates external side effects.
- Decision: retain this safer review-first policy instead of copying the reference's direct device-triggered execution. This excludes only automatic, unreviewed execution, not voice command support. Persistent voice session and segment lifecycle/history remain a significant parity gap; F026/F027 remain PARTIAL.
- Fresh post-F019-refinement `pnpm build` passed with 192/192 static pages generated and exit code 0. Build emitted existing warnings: workspace root/multiple lockfiles, dependency-analysis, dynamic route rendering attempts, optional Redis/Upstash/E2B configuration, PostgreSQL SSL semantics and `<img>` optimization.
## F026/F027 persistent voice-device session lifecycle (2026-11-06)
- Status: PARTIAL, advanced beyond prior device transcript-only support. Added additive tables for device-bound sessions and transcript segments, unique event and sequence constraints, a 500-segment/session limit, and owner/device foreign keys. Migration `0043_voice_device_sessions.sql` is local and unapplied.
- Added authenticated device-token endpoints to start/replay a session, append bounded transcript segments idempotently, and finalize the ordered transcript into the device owner's existing chat as `saved_for_review`. Segment retries with the same event, sequence, text, and language are accepted as replays; conflicting reuse returns 409. Finalization is row-locked and retryable, and does not execute actions.
- Evidence: `src/lib/db/pg/schema.pg.ts`, `src/lib/db/migrations/pg/0043_voice_device_sessions.sql`, voice-device repository, `/api/voice/devices/sessions` routes, `src/lib/voice/device-session.ts`, and focused route/contract tests.
- Verification: new session contract/API tests 9/9; existing audio/transcript/device history tests 10/10; 4 GB root typecheck passed; `pnpm db:check` passed; Biome passed across 10 changed implementation/test files; fresh `pnpm build` exited 0 with 192/192 pages. Build emitted existing dynamic-render/config/dependency/image warnings. No live PostgreSQL/device/gateway test; migration not applied. F026/F027 remain PARTIAL because no firmware/gateway transport in the checkout calls the new lifecycle and device UI exposes only saved transcript history.
## F026/F027 owner-facing persisted session history (2026-11-06)
- Added a user-session-authenticated, rate-limited, no-store owner API for recent voice-device sessions. Repository query scopes by device and owner and returns no more than 50 sessions with at most 24,000 transcript characters each.
- Device dashboard history now loads both saved reviewable chat transcripts and persisted audio sessions, showing session status, segment count, timestamps, and transcript text.
- Focused sessions/history route tests passed 5/5; focused Biome formatting completed. Full typecheck is running; no PostgreSQL/device/gateway/browser test. F026/F027 remain PARTIAL because firmware/gateway transport is not present and no live integration has been verified. No migration applied, push or deploy.

## F018 file and office-document ingestion (2026-11-06)
- Status: PARTIAL (supersedes earlier CSV/PDF-only notes): bounded text, Markdown, JSON, DOCX, XLSX, PPTX extraction is wired into chat; CSV, PDF and existing Konvo OCR paths are preserved.
- Security: all OOXML entries are inflated and checked under archive caps before parsers run; files/text/counts are bounded; privileged processing rejects managed keys outside the authenticated user's storage prefix. Upload writers now produce owner-prefixed keys where owner context exists.
- Verification: focused file-reader/storage tests 82/82 across 10 files; `pnpm check-types` passed; scoped Biome passed; `git diff --check` passed with line-ending warnings; `pnpm build` exited 0 and generated 192/192 pages.
- Remaining: old globally keyed objects cannot be owner-verified and are refused for AI ingestion; object ACL remains public per existing storage setup; no local PostgreSQL, real storage, browser upload, migration, or XLSX preview UI verification. Do not count F018 as complete.

## F010 source revision content snapshots (2026-11-06)
- Status: PARTIAL, advanced beyond metadata-only lineage. Immutable source text (up to 60,000 chars) is now stored with each new source version and queued analysis consumes that exact content even after the current document is replaced.
- Legacy handling: migration `0044_project_brain_content_snapshots.sql` leaves historical snapshots NULL. A legacy metadata row is populated only when the current source still hashes to the recorded fingerprint; changed source content fails closed.
- Security/retention: snapshots are scoped by project/source item, cascade with project/item deletion, bounded by application validation and a DB length check. Existing source and collection access is revalidated when a queued job runs; the snapshot is never returned by the version listing API.
- Evidence: `source-versions.ts`, `brain-queue.ts`, brain enqueue route, schema and migration 0044.
- Verification: focused source-version/brain API suites 13/13; `pnpm check-types`, `pnpm db:check`, scoped Biome and fresh production `pnpm build` passed; build generated 192/192 pages. No live PostgreSQL/queue concurrency/browser/provider journey. Migration 0044 remains local/unapplied; F010/F011 remain PARTIAL.

## F010 source revision history view (2026-11-06)
- Added owner/project-authorized, rate-limited no-store source revision detail API plus a source panel history viewer. The listing returns metadata/availability only; text loads on demand and is rechecked against project access, currently attached collection IDs, current owners, ready item status, max 60k length, and exact fingerprint.
- Legacy revisions without snapshots remain visible as historical metadata but cannot return fabricated text. Current collection/source access revocation blocks preview.
- Verification: revision detail + source-version + overview API suites 16/16; typecheck and scoped Biome passed; production build exited 0 with 192/192 pages. No live DB/browser test; migration 0044 stays unapplied. F010 remains PARTIAL.

## F021 desktop navigation and native download parity update (2026-11-06)
- Status remains PARTIAL. Primary's existing desktop companion now routes same-origin reference export endpoints through Electron's native download flow, requests a safe Save As path, displays completion/failure notifications, and handles HTTPS/mailto external links with default-deny navigation for other schemes.
- Evidence: apps/desktop/src/main/external-links.ts, download-paths.ts, downloads.ts, and index.ts. Query strings/fragments are omitted from logged download URLs; filenames are reduced to a sanitized basename.
- Verification: desktop navigation/download helper tests 6/6; desktop TypeScript check and bundle build passed; focused Biome check passed. No interactive Electron UI or actual export was exercised.
- Still missing: updater, signed/release distribution, server picker, expanded reference desktop features, and interactive/native download verification. Existing local MCP policy/consent was preserved without widening tool access.


## F014 citation column parity update (2026-11-06)
- The reference citation type requests inline [N] references plus a <CITATIONS> block. Void-Agent already accepted citation columns but its extraction prompt lacked this format. The prompt now requests numbered citations mapped to short exact quotations and explicitly forbids invented quotes/references.
- Evidence: src/lib/tabular/review-schema.ts and review-schema.test.ts; the stored/rendered cell value carries the formatted text. Verification: tabular schema/cell and API tests 10/10; focused Biome passed.
- F014 remains PARTIAL: citation formatting is model-produced text, without independently verified offsets or shared team review, and no live database/browser journey has been verified.


## F010/F011 source-grounded task extraction and review (2026-11-06)
- Added bounded task proposals to project-brain source analysis. Each proposal requires an exact evidence excerpt that must occur in the retained source revision; duplicate title/evidence pairs are removed. Due dates are accepted only as explicit ISO dates.
- Durable tasks link to project, analysis run, and source item. They begin proposed; project editors can accept/reject, and only accepted tasks can transition to completed. The task listing and mutations recheck current collection/source visibility and project role; no external task connector is invoked.
- Evidence: `src/lib/projects/brain-schema.ts`, `brain-queue.ts`, `ProjectBrainTodoTable`, migration `0045_project_brain_todos.sql`, project brain GET, the todo review route, and `project-brain-panel.tsx`.
- Verification: brain extraction/review route tests 19/19, Drizzle journal check passed, root typecheck passed, focused Biome passed, production build passed (192/192 pages). Migration 0045 remains unapplied and Postgres/browser/model runs were not exercised. F010 remains PARTIAL.


## F010 project-connected read-only MCP/Composio source sync gap (2026-11-06)
- Reference execution evidence: apps/web/src/app/api/projects/[id]/tools/route.ts attaches owner-bound Composio accounts or owner-bound MCP servers; `sync/route.ts` queues explicit sync; `lib/project-brain/run-source.ts` fetches only snapshotted read-only Composio actions or MCP tools whose server advertises `_readOnlyHint === true`, gathers bounded tool results, then persists them as brain source input. Tool detach clears open source-derived todos.
- Primary evidence: UserConnectorTable-backed per-user connector tools, MCP server manager and document-backed project brain queue exist, but there is no project-connected-tool table, project connector attachment/sync path, raw external-source lineage, or connector-sourced todo lifecycle.
- Status: MISSING for project-connected source sync, within otherwise advanced but PARTIAL F010. Do not count the regular user connector chat tools as parity; they are not project-bound or project-brain source ingestion.
- Security/adaptation required: explicit project editor attachment; credential owner must remain a current member; one provider account/server bound at attach time; allowlisted read-only actions; manual rate-limited sync; bounded untrusted outputs; raw source/version lineage and safe retry/detach behavior. External MCP write calls must never be used for sync. No project connector code has been copied or added in this audit.

## F010 project connector sync status revision (2026-11-06)
The earlier MISSING status for project-bound connector sync is superseded for the MCP subset by the local implementation described below. Overall F010 remains PARTIAL; Composio project sync, route/database/browser verification, revocation races and complete reference workflow equivalence remain open.
### Verification update (2026-11-06)
Route-level attach tests now cover editor role, cross-origin rejection, safe response fields, and excluding write-capable tools. Focused MCP tests total 34/34. Transactional content-fingerprint uniqueness also prevents concurrent duplicate source creation. Full typecheck, drizzle journal/schema check, targeted Biome and production build pass. PostgreSQL-backed sync/rollback and browser flow remain unverified; migration 0046 remains unapplied.

## F010 Composio project connector continuation (2026-11-06 10:35:36 +05:30)
Project-brain source sync now supports explicitly selected Composio read actions, building on the primary's existing Composio SDK and project-brain document/queue pipeline. Attach requires an editor, an active account owned by the caller, and an attached caller-owned collection; action slugs are filtered for read-like names and stored as an allowlist. Each sync rechecks project/editor access, credential-owner membership, collection attachment, current connected-account status, current action metadata and bounded arguments; owner-only calls are rate limited, idempotent and size/time bounded. Results become source-versioned collection documents and enter the existing brain queue; detach removes generated items.
- Evidence: src/lib/ai/composio.ts, src/lib/projects/mcp-sync.ts, src/app/api/projects/[id]/brain/composio, src/components/project-brain-panel.tsx, schema.pg.ts, migration 0047.
- Focused connector/MCP validation: 45/45 tests across six files; db:check passed; targeted Biome passed; full TypeScript check passed before the final timeout adjustment/new sync-route test, which are being included in the production build validation. Migration 0047 is local/unapplied; no live PostgreSQL, browser, or Composio credential test.
- Status F010/P025 connector source-sync parity: PARTIAL. Composio's slug-name read heuristic is conservative but not a semantic guarantee; explicit user selection, server checks, action schema validation, owner-only execution, text persistence bounds and review-first brain analysis reduce risk. Automated multi-step gathering, connector-source lifecycle verification, and live workflow remain outstanding. No push or deployment.

### F010 Composio sync verification update (2026-11-06 10:41:53 +05:30)
The four new Composio sync route tests now cover idempotency-key requirement, non-owner execution denial, replay without provider execution, and cross-origin rejection. Combined project connector/MCP tests passed 45/45 across six files. Full TypeScript check exited 0 after the sync-route test and bounded Composio timeouts were present; Drizzle check and targeted Biome passed. Fresh pnpm build exited 0 and generated all 192/192 static pages.
Build emitted existing warnings for workspace root/multiple lockfiles, dependency analysis, <img> optimization, dynamic authenticated-route prerender diagnostics, optional Redis/Upstash/E2B configuration, and PostgreSQL SSL mode. A broad Biome invocation over the entire projects route tree found 11 formatting issues in other project-brain files; scoped Composio/MCP files were clean. Migration 0047 remains unapplied; there was no live PostgreSQL, browser, Composio provider, push, or deployment verification.

### Pagination boundary review and final focused verification (2026-11-06 10:44:19 +05:30)
Reviewed the bounded chat-history query and action/UI path. The initial fetch is limited to 50 newest messages; load-older first checks the authenticated session and thread ownership. The cursor timestamp is selected inside SQL and constrained to the requested thread; ordering and keyset comparison use (created_at, id), preserving tied-timestamp page boundaries without converting to millisecond JS dates. Invalid page sizes return no rows, oversized limits clamp to the 50-message window, and an unknown/foreign-thread cursor yields no rows. Added SQL-shape coverage proving both timestamp and ID tie-break predicates are present.
- Combined pagination + project connector/MCP regression suites: 52/52 across seven files; focused Biome passed; git diff --check reported only existing CRLF normalization notices. Previous full TypeScript check and fresh production build passed after the Composio route implementation; the subsequent pagination change is test-only.
- No live Postgres query plan/browser scroll preservation test. Pagination is considered implementation-verified by SQL contract and ownership checks, not live-runtime verified.

## F010 project connector AI-assisted gather continuation (2026-11-06 10:55:03 +05:30)
- Reference behavior verified: the reference connector sync invokes a project-aware model with the stored read-action tool catalog, bounded multi-step execution, result classification, and raw-source persistence. Primary previously supported manual per-action JSON only.
- Implemented explicit owner/editor-initiated "Gather relevant data" for Composio project sources. It uses only the current stored read allowlist, revalidates action names and argument schema at each tool execution, binds calls to the credential owner's current connected account, passes cancellation, stops after five steps/70 seconds, and stores only successful bounded results through the existing source-version/brain queue.
- Added helper tests for allowlist filtering, source capture, and invalid argument rejection. Current focused suite: 54/54 across eight files; full TypeScript, Drizzle journal, and scoped Biome pass.
- Current phase: production build running. Migration 0047 remains local/unapplied. No PostgreSQL/provider/browser execution. Do not mark project connector sync COMPLETE until fresh build and live lifecycle checks; MCP/Composio remains PARTIAL.
- Next action: finish production build, record exact result, inspect the working diff/status and append-only verification update. Continue with the next major reference gap after this checkpoint; no GitHub push or deployment.

### F010 Composio multi-step gather verification (2026-11-06 11:00:15 +05:30)
- Reproduced the reference's core project connector behavior as an explicit user-triggered AI gather mode. The gather model can select among only the connector's saved and currently revalidated read-action allowlist; every call validates the current JSON schema, binds the owner's active account, passes cancellation and a bounded execution timeout, and uses a 5-step / 70-second model budget. Only successful tool outputs are persisted; source output is capped at 60,000 characters and enters the existing immutable source revision + brain analysis queue.
- UI exposes separate "Gather relevant data" and explicit single-action JSON sync controls; no background/periodic external execution was added.
- Verification after this change: focused project connector/MCP + chat pagination suites 54/54 across 8 files; full TypeScript check passed; Drizzle migration journal check passed; focused Biome passed; fresh pnpm build exited 0 and generated 192/192 pages. Build emitted the established nonfatal warnings.
- F010 project-connected-source sync parity advances but remains PARTIAL. Still unverified: live Postgres migration/transaction behavior, browser workflow, configured Composio account/provider calls, idempotent concurrency under a real DB, and multi-worker behavior. Migration 0047 is unapplied. The read-only classifier relies on action slug semantics plus explicit selection and is not provider-declared effect metadata. No push/deploy.

## F029 notification and web-push hardening (2026-11-06 11:03:30 +05:30)
Added same-origin checks to notification mark-read, push subscription add/remove, and push-test mutations. Fixed push test reporting: it no longer returns success or creates an in-app "sent" notification when delivery reaches zero endpoints. Added route tests for CSRF-origin rejection, owner-scoped read updates and actual-delivery reporting. F029 remains PARTIAL; provider delivery, browser permission/service-worker behavior, real PostgreSQL storage, and migration 0038 remain live-verification gaps.
- Focused notification contract/scheduled-run/read/push tests: 12/12 across four files; focused Biome passed.
- Current phase: full TypeScript check and production build pending. No database migration, push, or deployment.

### F029 post-hardening verification (2026-11-06 11:12:11 +05:30)
pnpm exec tsc --noEmit --pretty false --incremental false exited 0. Fresh pnpm build exited 0 and generated 192/192 pages; existing workspace, dependency, image, dynamic route, optional Redis/E2B and PostgreSQL SSL warnings remain. Notification contract/scheduled run/read API/push-test tests passed 12/12. F029 remains PARTIAL pending real browser permission, VAPID delivery, and PostgreSQL migration/runtime verification. No migration apply, push or deploy.

## F025 connector-effect audit continuation (2026-11-06 11:12:11 +05:30)
Static review of connector request verbs/actions found the direct outbound write paths (task/issue creation, calendar mutation, file creation, ticket effects, email send/reply and external message posting) are gated by one-use exact-payload approval contracts; read/search APIs that use HTTP POST remain reads (e.g. provider search/list endpoints). The action-specific schemas, approval API routes, token consumption and connector tests passed 57/57 across 23 test files. F025 remains PARTIAL pending full browser journeys, live provider behavior and continued coverage of any non-connector/custom execution surfaces discovered in the 206-surface audit; do not claim all agent effects are complete based on the connector subset.

## F012 persistence follow-up (2026-11-06 11:18:20 +05:30)
- Status: PARTIAL. Added an additive persistent project-scoped conflict table and transactional audit recording when an editor chooses the retained fact. The existing graph candidates remain heuristic (potential), and this batch does not provide upstream-style model adjudication or temporal fact versioning. Evidence: src/lib/db/pg/schema.pg.ts, migration 0048_project_brain_contradictions.sql, src/app/api/projects/[id]/brain/contradictions/route.ts. Focused tests: 13/13; Drizzle check passed; TypeScript pending at log time.


## F012 adjudicated conflict lifecycle continuation (2026-11-06 11:42:40 +05:30)
- Status: PARTIAL. Added bounded cross-source pair discovery (20 candidates/run) and a no-tool structured model judgment with strict candidate-index validation. Verdicts are contradiction/compatible/unknown; only confirmed contradictions are opened for editor review. Editor keep/dismiss decisions are stored atomically and dismissed/resolved pairs no longer reappear as heuristics. Graph API returns confirmed pairs only when both facts still come from attached, ready, member-owned sources.
- Evidence: src/lib/projects/brain-contradictions.ts, brain-queue.ts, brain graph/contradiction routes, project-brain-panel.tsx, tests, migration 0048.
- Validation: focused suites 27/27; TypeScript, scoped Biome, pnpm db:check, production build (192/192 pages) passed. Live provider/Postgres not verified; migration unapplied. Fact-version-aware comparison and history UI remain incomplete.


## F007 dynamic model registry completion slice (2026-11-06 12:04:47 +05:30)
- Status: PARTIAL for the overall model catalog family; dynamic provider runtime hydration is now reliable on production model call paths. Added awaited provider hydration before model resolution and before model catalog exposure; admin edits invalidate the hydration/site-config caches. Disabled/deleted providers are removed, stale in-flight reads cannot override invalidation, built-in/environment provider ID collisions are rejected, and dynamic key presence is reflected in authenticated model metadata.
- Evidence: src/lib/ai/models.ts, all async model call sites, /api/chat/models, /api/admin/providers, admin config/health, site config, user model stats. Tests cover first-use resolution, disabled models, and concurrent invalidation.
- Verification: full suite 211 files/1,373 tests passed; TypeScript, scoped Biome, and production build passed. No live dynamic provider credentials/network verification.


## F027 OTA physical voice-device enrollment (2026-11-06)
- Status: PARTIAL. Added firmware-initiated activation registration, signed-in owner claim, owner-scoped setup status, and one-time device credential delivery to the primary project.
- Evidence: `src/app/api/voice/xiaozhi/ota/route.ts`, `src/app/api/voice/devices/registrations/{claim,complete,status}/route.ts`, `src/lib/db/pg/repositories/voice-device-repository.pg.ts`, schema/migration 0049, `src/components/voice-devices-dashboard.tsx`.
- Security/behavior: activation codes and bootstrap proof are pepper-hashed in the database; device credential is AES-GCM encrypted at rest and consumed once; claim is transactional; status is owner scoped; abandoned claimed registrations expire and revoke the orphaned device. No token is returned to the browser.
- Verification: 50 voice tests, TypeScript, Drizzle journal and scoped Biome passed. Production build result pending at this doc append.
- Remaining: no firmware implementation/hardware run, no live PostgreSQL migration execution, no websocket audio bridge (upstream also returns 426 and lacks its bridge script), and no browser end-to-end pairing journey. Do not mark voice device parity COMPLETE.

### F027 final verification (2026-11-06)
Final post-adjustment validation: focused voice suite 50/50 across 19 test files; TypeScript passed; `pnpm db:check` and scoped Biome passed; fresh `pnpm build` exited 0 and generated 192/192 pages. Build retained existing warnings for multiple lockfiles/workspace inference, E2B/unpdf dependency analysis, existing `<img>` use, optional Redis/E2B configuration, PostgreSQL SSL-mode notice, and dynamic session routes. Migration 0049 remains unapplied; no live PostgreSQL, firmware, gateway, or browser test. F027 remains PARTIAL.

### F027 protocol fidelity and final build update (2026-11-06)
- OTA parsing now matches the reference's `device-id`/`client-id` hardware identifiers and firmware version from the final user-agent component (with bounded explicit-header override and fallback).
- Activation/completion secrets and setup status now use `Cache-Control: no-store`; credential decryption is verified inside the locked DB transaction before marking the one-time delivery complete.
- Final voice-focused verification: 19 files, 51 tests passed; full TypeScript and Drizzle journal checks passed; scoped Biome passed; fresh `pnpm build` exited 0 and generated 192/192 pages. Established workspace, dependency-analysis, `<img>`, optional Redis/E2B, PostgreSQL SSL-mode, and dynamic-route warnings remain.
- No live PostgreSQL/hardware/browser test; migration 0049 remains unapplied and websocket audio gateway remains unavailable.

## F018 authenticated attachment access and spreadsheet preview (2026-11-06)
- Added authenticated owner-scoped `/api/storage/download` and `/api/storage/sheet` routes. The download route applies per-user throttling, safe filenames, `no-store`, `nosniff`, restrictive CSP, and forces active/untrusted formats to attachment. Spreadsheet preview checks storage metadata before reading, rejects files over 5 MiB both before and after download, supports CSV/XLSX, and limits preview rows/columns.
- Thread file/image and source-url attachment UI now uses authenticated app routes for recognizable owner-prefixed upload keys; CSV/XLSX can be previewed in a bounded table/dialog. Existing non-owner-scoped legacy/external URLs retain their previous direct link behavior.
- XLSX preview now runs every OOXML archive entry through the existing ZIP entry/inflation/DOCTYPE defenses before ExcelJS materializes it.
- Verification: focused storage/CSV/XLSX/OOXML tests passed (36/36 across 5 files); TypeScript check still running at append time; `pnpm db:check` passed; scoped Biome passed. Build not rerun yet.
- Security limitation: storage upload providers still issue public object URLs (including Vercel Blob `access: public`), and legacy/external direct URLs can remain reachable outside this app route. The new route only gates route-mediated access; it does not revoke an already-public object URL. No live storage, browser, PostgreSQL, or public-ACL verification. F018 remains PARTIAL.
- Files changed: `src/app/api/storage/{download,sheet}/route.ts` and tests; `src/components/message-parts.tsx`; `src/lib/file-ingest/xlsx.ts`.

### F018 local file route ownership follow-up (2026-11-06)
- The legacy `/api/files/[...path]` handler previously served any known key anonymously. It now recognizes user-owned keys under the configured storage prefix and requires an authenticated matching owner, applies the existing per-user rate limiter, rejects path traversal, and sends `private, no-store`. Non-owner generated assets keep the existing public-cache behavior so generated image URLs continue to work.
- Focused file/storage/preview/OOXML suite: 39/39 tests across six files; scoped Biome clean. Full TypeScript and production build for this final route change are running. No live storage/PostgreSQL/browser or bucket ACL test. The providers' public object URLs remain an independent privacy limitation.

### F018 final verification (2026-11-06 13:18 +05:30)
The final storage/preview/local-file route suite passed 39/39 across 6 files; whole-project TypeScript passed; `pnpm db:check` passed; scoped Biome passed; `pnpm build` exited 0 and generated 192/192 static pages. Build emitted established warnings, including missing optional Redis/Upstash and E2B config, existing dynamic-route render diagnostics, dependency analysis, `<img>` optimization, and PostgreSQL SSL mode notice. This verifies compilation/build output, not live object-store ACL, real Postgres, browser upload/download, or multi-instance rate limiting. Owner-prefixed local route reads are now session/owner checked; Vercel/S3 direct public object URLs remain a separate limitation. F018 remains PARTIAL.

## F021 local desktop MCP bridge correction and execution verification (2026-11-06)
- The initial `F021 MISSING` assessment was inaccurate: Void-Agent already contains an Electron stdio bridge used by the MCP test screen (`src/lib/ai/mcp/desktop-bridge.ts`, `apps/desktop/src/main/{mcp-ipc,mcp-spawner,mcp-policy}.ts`, preload API). Local server launch requires a native OS consent; every individual call prompts again; only the configured trusted main frame and `/mcp/test/<id>` can invoke it. Config/input/result sizes and environment keys are bounded, child env is allowlisted, audit records hash payloads, and mutating tool names default-deny.
- Compared the reference `packages/mcp-core/src/mcp-tool-policy.ts`; added its allowed read-only metadata tool `list_tools` to the primary allowlist. Wrote an actual stdio child-process integration test that registers read_file/list_tools/write_file, confirms only the approved tools list, executes a read call, and confirms write_file is rejected before execution.
- Validation: desktop local MCP policy + child-process tests 4/4; desktop TypeScript passed; `pnpm desktop:build` passed; focused Biome passed. Root production build had passed after F018; desktop build verifies this desktop-only batch. No native Electron dialog/browser E2E or end-user process permission journey.
- Status correction: F021 local MCP execution is PARTIAL, not MISSING. Reference functionality includes a wider desktop shell/update/release surface; Void-Agent's local bridge is intentionally test-screen scoped, read-tool allowlist is name-based and not a proof of server behavior, and auto-update/package signing are absent. Do not claim full F021 parity.
- `.gitignore` now excludes generated `/apps/desktop/dist/` build output. No release packaging, publishing, deployment, or push.

## F021 desktop updater and packaging (2026-11-06)
- Added electron-updater lifecycle integration, renderer state notifications, update toast, manual “Check for Updates” menu action, HTTPS-only packaged feed parsing, and origin/main-frame-bound IPC. Update failures are generic in renderer state and do not reveal feed or filesystem details.
- Added Void-Agent-specific electron-builder packaging for NSIS, macOS dmg/zip, and Linux AppImage. Packaging validates HTTPS feed configuration and requires Windows/macOS signing configuration. Build scripts use no upstream identity or signing certificate values; no signing keys, package publication, or release operation occurred. Generated desktop `dist/` and `out/` are ignored.
- Evidence: `apps/desktop/src/main/auto-updater.ts`, updater policy/interop modules and tests, `src/lib/desktop/update-feed.ts`, toast, `apps/desktop/electron-builder.yml`, validation script and package scripts.
- Verification: focused desktop updater + MCP tests 19/19; desktop typecheck passed; desktop main/preload bundle passed; scoped Biome passed. Root production build was run for this integrated layout/UI change and result is tracked in the current checkpoint.
- Status remains PARTIAL: no signing credentials or configured release feed were provided, so signed packaging, platform installer artifacts, update signature validation on real artifacts, feed publication, and end-user update journey were not exercised. No GitHub push or deployment.

## F010/F012 active project-brain source revision (2026-11-06)
- Added additive migration `0050_project_brain_active_source_state.sql` and a `(project_id, source_item_id) -> source_version_id` active-revision pointer. Migration backfills the latest run revision for existing source pairs; each validated source-version enqueue/reactivation atomically updates the pointer with its analysis transaction.
- Current-state fact, typed-page, alias, graph detail, conflict review/classification, chat knowledge retrieval and todo reads now require the fact/task's project/item/run to match the active source version. Historical source snapshots/runs remain available through history; old claims no longer appear current after a newer revision is selected.
- Evidence: `src/lib/db/pg/schema.pg.ts`, migration/journal, `source-versions.ts`, `brain-source-state.ts`, brain overview/graph/page/fact/conflict routes, queue, merge identity validation, and project knowledge tool. SQL guard has focused compilation coverage.
- Verification: active-state/source-version/brain route/graph/page/conflict/merge/knowledge tests passed 44/44 across eight files; root TypeScript passed with 6 GB heap; `pnpm db:check` passed; scoped Biome passed; fresh production build passed and generated 192/192 pages.
- Migration `0050` is local and unapplied. No PostgreSQL transaction/backfill/browser test was possible. F010/F012 remain PARTIAL pending disposable PostgreSQL verification and broader version/history/consolidation behavior.

### F010/F012 source mutation freshness follow-up (2026-11-06 14:03 IST)
- The current-revision predicate now also requires the active pointer's `updated_at` to be at least as recent as the underlying `collection_item.updated_at`. When a source item changes/re-ingests before its next brain revision is activated, prior claims immediately stop appearing as current; history is retained.
- The guard uses a correlated item timestamp lookup, so all existing call sites gain freshness enforcement without trusting a caller-supplied timestamp.
- Validation: project-brain/version/queue/graph/overview/page/conflict/merge/knowledge tests 44/44 across 8 files; root TypeScript passed with 6 GB heap; `pnpm db:check` passed; scoped Biome passed; fresh production build passed with 192/192 static pages.
- Existing warning classes remain: dynamic authenticated-route prerender probes, optional Redis/Upstash/E2B configuration, dependency analysis, PostgreSQL SSL mode notice and `<img>` lint. No live PostgreSQL/browser test; migration `0050` remains unapplied. F010/F012 remain PARTIAL.

## F018 private Vercel Blob store support (2026-11-06)
- Added an explicit `VERCEL_BLOB_ACCESS=private` mode for the Vercel Blob driver. Server uploads and deletes use the configured access mode; private downloads use the SDK `get()` API with authenticated server credentials instead of fetching the private URL anonymously. The default remains public for existing stores.
- Storage diagnostics reject invalid access-mode configuration and explain that the connected store must match. Added setup/migration guidance; enabling the flag does not privatize existing objects.
- Evidence: `src/lib/file-storage/vercel-blob-storage.ts`, `src/lib/file-storage/vercel-blob-storage.test.ts`, `src/app/api/storage/actions.ts`, `docs/storage/vercel-private-storage.md`.
- Focused verification: 12 tests passed across Vercel Blob, storage URL utilities, and authenticated download route tests. Live Blob store, upload-token flow, browser preview, and model attachment fetch remain unverified. F018 remains PARTIAL pending staging migration/ACL verification and private S3 configuration.

## F018 private S3 owner URLs (2026-11-06)
- Added opt-in `FILE_STORAGE_S3_PRIVATE=true`. Owner-scoped S3 uploads now return Void-Agent's authenticated `/api/files/...` route from both the upload response and later source URL lookups; generated unowned assets keep their configured bucket/CDN URL.
- The app does not alter or inspect bucket policy. Private mode is safe only when bucket policy blocks anonymous reads and the server IAM identity retains required access. The existing authenticated file route enforces owner identity and private/no-store response handling.
- Added storage configuration validation and tests for private owner URLs, public generated URL compatibility, and invalid mode values. Focused storage suite now passes 31/31 across six files; whole-project TypeScript passes. Fresh build is running.
- No S3 bucket/account was available for live ACL or presigned upload/download testing. F018 remains PARTIAL pending staging validation.

## F025 generic outbound HTTP approval (2026-11-06 14:42 IST)
- The existing general-purpose httpFetch capability is preserved and now requires an authenticated user-scoped one-use approval bound to the exact URL, method, headers, body, and timeout.
- Added an editable review card, same-origin authenticated/rate-limited approval endpoint, hashed token/payload persistence using the existing verification table, and fail-closed execution. Static/userless tool construction cannot make requests.
- Execution checks HTTPS and public DNS addresses through the shared webhook guard, blocks redirects, bounds request input/timeout/response size, and rejects restricted header names. Focused tests: 22/22 across five files; whole-project TypeScript passed.
- F025 remains PARTIAL. No browser/provider/PostgreSQL journey was run. The hostname is validated immediately before native fetch, but DNS is resolved again by fetch; pinning the validated address at the connection layer remains a hardening follow-up.

Reference parity evidence: read-only inspection of ../Void-Agent-V2/apps/web/src/lib/ai/tools/http/fetch.ts confirms the same generic httpFetch capability accepts arbitrary URL/method/headers/body and invokes fetch directly without an approval or URL guard. Void-Agent retains this reference capability with stricter security controls. The reference checkout was not changed.

### F025 DNS-pinned outbound HTTP follow-up (2026-11-06 15:02 IST)
- Replaced the native fetch transport for this tool with Node HTTPS and a custom lookup callback pinned to an address returned by the URL guard. All DNS answers are validated; the connection uses one of those exact checked addresses while the URL hostname remains in place for TLS SNI and certificate verification. HTTPS client does not automatically follow redirects. DNS lookup is bounded to five seconds.
- Added an execution test that inspects the pinned lookup result and confirms a 302 response is returned without a second request. Shared URL-guard test now checks that validated addresses are returned for transport use.
- Verification: focused suites 24/24 across five files; whole-project TypeScript passed; production pnpm build passed and generated 192/192 pages. Established dependency-analysis, image, dynamic authenticated-route, optional Redis/E2B, and PostgreSQL SSL warnings remain.
- F025 remains PARTIAL pending browser approval flow, disposable PostgreSQL token-consumption behavior, and a safe live-provider test. No external HTTP request, production DB, push, deploy, or reference edit was performed.

## F010/F012 direct fact-to-source revision provenance (2026-11-06 15:03 IST)
- Added a required source_version_id on every project-brain fact. The extraction queue writes the exact revision used by its run; migration 0051 backfills historical facts from their run's immutable revision.
- Database composite FK requires source version, project, and source item identities to match; facts now have a direct revision index. Existing current-source visibility still uses the active-source predicate, preserving stale-source hiding.
- Verification so far: 38 focused tests across six project-brain files, pnpm db:check, and whole-project TypeScript pass. Migration 0051_project_brain_fact_source_versions.sql is local and unapplied. Production build is running.
- F010/F012 remain PARTIAL: live PostgreSQL migration/backfill, stale-vs-current contradiction journey, review-history retrieval, source mutation/browser flow and reference's remaining page-consolidation behavior remain open.

### F010/F012 contradiction decision history (2026-11-06)
- Added a read-only closed-decision history view with source revision provenance (revision ID/time, filename, and the evidence stored on each decision's facts). Existing source-content snapshots are not returned.
- Kept the reference-compatible GET contract: GET /brain/contradictions returns open contradiction candidates for currently active source revisions; GET /brain/contradictions?history=true returns closed decisions, including decisions whose source revisions are no longer current. Both flows enforce project access, attached collection and owner visibility, and ready source status. Existing PATCH decision flow was not changed.
- Focused project-brain API/helper suite: 23/23 passed across four files. Root TypeScript no-emit passed after the final route-contract change. Previous project-brain source-lineage DB journal check passed; no schema changed in this batch.
- A fresh production build reached static generation 192/192 and final tracing, but its process handle expired before an exit code was captured. Treat this build as UNVERIFIED; rerun a fresh build before reporting it as passing. No PostgreSQL/browser workflow or migration 0051 application was performed. F010/F012 remain PARTIAL.

### Current migration focus â€” project-brain dream cycle audit (2026-11-06)
- The reference's manual/nightly dream cycle consists of model-judged page deduplication, cross-source contradiction detection, salience recomputation, and stale-page archival; it records stage metrics and warnings and is separate from source extraction/consolidation.
- Void-Agent has source-version-aware facts, conflict review/history, graph reads, and an audited editor-driven same-type page merge. It does not yet have an equivalent project-wide dedupe/salience/archive scheduler or a verified end-to-end dream cycle. No work on this feature should overwrite user-reviewed fact decisions or auto-merge identities without evidence and review.
- Next action: implement compatible salience refresh and safe stale-page handling in Void-Agent's existing typed-page/fact schema, with project/source visibility checks, role/rate limiting, tests, and explicit UI trigger; then assess whether model-judged automatic dedupe is safe given its user-approved identity merge contract.

## F010 project-brain salience refresh (2026-11-06)
- Added project-brain page salience storage through append-only migration 0052_project_brain_page_salience.sql. A project editor can refresh graph ranking from accepted facts backed by the active source revision, ready items, currently attached collections, and live collection-owner scope. The refresh scores fact volume, recency, distinct sources, and accepted fact links; the panel displays the score and refresh control. It does not merge pages, change fact review decisions, or archive stale pages.
- Security boundary: same-origin POST, editor/owner authorization, per-user rate limit, attached-collection and owner predicates inside the SQL; the SQL revalidates current source revision and ready state. No client-supplied scope is accepted.
- Evidence: src/lib/projects/recompute-brain-salience.ts, route/API tests, src/app/api/projects/[id]/brain/pages/route.ts, src/components/project-brain-panel.tsx, schema, migration, and migration journal.
- Verification: brain route/helper regression suite 28/28 across six files; root typecheck passed with NODE_OPTIONS=--max-old-space-size=6144 (the default 2 GB run exhausted heap without diagnostics); pnpm db:check passed; scoped Biome and git diff --check passed; fresh production build exited 0 and generated 192/192 static pages. Existing dynamic-route, optional Redis/E2B, dependency-analysis, SSL-mode, workspace-root and <img> warnings remain.
- Limitation: no disposable PostgreSQL execution, interactive browser test, stale-page archival, model-judged page deduplication or scheduled/manual dream orchestration. Migration 0052 is not applied. F010/F012 remain PARTIAL.

### 2026-11-06 15:53:03 +05:30 â€” final exact-source verification update
The accepted project-brain entity page list now sorts by salience so the refreshed score affects the visible ranking. After that final UI/API source change, the focused pages/salience suites passed 10/10 and a fresh pnpm build exited 0 with all 192 static pages generated. Build still emits existing workspace-root, dependency-analysis, <img>, optional Redis/E2B, SSL-mode and authenticated dynamic-route diagnostics. Migration 0052 remains unapplied; no live PostgreSQL/browser run was done.

## F010 reviewable duplicate-identity discovery (2026-11-06)
- Added a bounded title-trigram and alias-based candidate finder for same-type, currently visible accepted entity pages. The endpoint returns at most 20 candidates and excludes page pairs that a project editor has already marked distinct. The UI clearly labels these as hints and routes â€œReview mergeâ€ through the existing explicit confirmation and transaction-audited merge; â€œNot duplicatesâ€ records an editor decision.
- Added append-only migration 0053_project_brain_page_pair_reviews.sql and a page-pair decision table. PATCH checks same-origin, editor/owner role, request bounds, per-user rate limit, same-project same-type page identities, current source revision, ready item, attached collection, and live owner scope. Pair IDs are normalized for durable deduplication; reads are bounded to 5,000 decisions. No identity is merged automatically.
- Evidence: brain-page-duplicate-candidates.ts and tests; src/app/api/projects/[id]/brain/pages/route.ts and tests; src/components/project-brain-panel.tsx; schema, migration 0053 and journal.
- Verification after final changes: 20/20 tests across five project-brain suites; pnpm db:check passed; scoped Biome passed; git diff --check passed; fresh pnpm build exited 0 and generated 192/192 static pages. Existing environment, dynamic-route and dependency warnings remain.
- Deliberate remaining gap: unlike the reference's model-judged dedupe worker, candidate ranking here is deterministic name/alias similarity and a human always makes the identity decision. No nightly/manual dream orchestration, stale archival, model verdict or PostgreSQL/browser journey has been verified. Migration 0053 remains unapplied; F010 remains PARTIAL.

## F010 stale-page lifecycle adaptation (2026-11-06)
- Added stale and restorable identity lists to the project pages API and UI. A page becomes an archival candidate only when it is at least 30 days old, not merged/already archived, has historical facts from currently attached ready collections and live owners, and has no accepted entity-type fact on the active source revision. Candidates are capped at 100.
- Editors can archive a candidate after a client confirmation. The single SQL UPDATE rechecks all eligibility predicates and updates archived_at only; facts are retained. Merged-page redirects are excluded. An archived page can be restored only after a current accepted identity fact returns; restore uses one conditional UPDATE with current revision and visibility predicates. A fresh extraction makes the page available in the restorable list; no fact/page content is deleted.
- Evidence: src/lib/projects/brain-page-archive.ts and tests; pages API and route tests; project brain panel. No new database schema or migration was needed; the existing archived_at and merged_into_page_id fields are used.
- Verification: 24/24 focused project-brain tests; root typecheck passed with 6 GB heap; pnpm db:check, scoped Biome and scoped diff checks passed; fresh production build exited 0 and generated 192/192 pages. Existing Next workspace/dependency, optional Redis/E2B, dynamic-route, SSL and image warnings remain.
- Limitations: no disposable PostgreSQL runtime or browser workflow; stale-page cycle is editor-triggered, not automatically scheduled; no full dream metrics or model-judged dedupe. F010/F012 remain PARTIAL.

### Advisory project-brain duplicate comparison (2026-11-06 16:32 +05:30)
- Implemented an on-demand AI comparison for deterministic same-type duplicate candidates. The API revalidates editor access, same-origin, rate limit, pair bounds, attached collection/current owner scope, ready sources, active revisions, accepted facts, and current candidate eligibility. Model inputs are bounded and treated as untrusted; no tools or page/fact mutation are available.
- The panel displays the result as advisory and retains the existing explicit review/confirmation step for merge. No automatic merge or identity mutation was added.
- Verification: focused project-brain suite 26/26 across five files; root typecheck with 6 GB heap passed; pnpm db:check and git diff --check passed. Scoped Biome passed. Fresh production build is in progress; record its final outcome separately.
- Limitations: no PostgreSQL runtime or interactive browser verification; model provider availability was mocked in tests. Stale-page handling remains manual; there is no scheduled dream-cycle orchestration. F010/F012 remain PARTIAL.

### F012 model-reviewed cross-source contradiction scan (2026-11-06 16:54 +05:30)
- Implemented an editor-triggered scan in the existing project-brain route. It compares up to 40 new cross-source claim pairs per run, caps candidates at three per page/predicate, and considers only accepted facts from active source revisions, ready items, attached collections and current collection owners. Same-source and same-page/key/value candidates are excluded by the candidate helper.
- Results are persisted once per canonical fact pair with onConflictDoNothing: genuine contradictions stay open for editor review; compatible/unknown results are stored as classified history. Existing decisions are never overwritten, and the scan never changes fact review status. Same-origin, editor authorization, per-user rate limit and bounded query/model inputs are enforced.
- UI adds a manual scan action and refreshes the graph and revision-aware history. Evidence: src/lib/projects/brain-contradictions.ts, its tests, src/app/api/projects/[id]/brain/contradictions/route.ts and tests, src/app/api/projects/[id]/brain/graph/route.ts, and src/components/project-brain-panel.tsx. Existing varchar fields were reused; no migration added.
- Verification: 25 focused contradiction helper/API/graph tests passed; whole-project typecheck passed with 6 GB heap; Drizzle journal check and scoped Biome passed; git diff --check passed. Exact-source production build is running; append its result after completion.
- F012 is now PARTIAL rather than missing: model classification is available on demand, but there is no automatic/nightly full dream-cycle orchestration. PostgreSQL-backed persistence, concurrent scans and browser/provider flow are not runtime-verified. Review decisions remain human-controlled.

### MCP/workflow approval audit and project-sync Origin hardening (2026-11-06 17:03 +05:30)
- Static call-path audit found direct interactive MCP execution is wrapped by exact-payload one-use approval, saved workflows consume an approval bound to the current graph revision and check MCP ownership/enabled state, and project brain sync revalidates a project-bound read-only tool allowlist plus argument schema and credential-owner permission. The reference saved-workflow executor directly runs configured MCP nodes; Void-Agent's outer graph approval is retained.
- Closed one CSRF edge in project brain MCP sync: requests with missing Origin now fail closed, matching its existing cross-origin rejection. This endpoint executes only explicitly allowlisted read-only tools, but it still uses the authenticated session and idempotency contract.
- Focused MCP approval, saved-workflow and project-sync tests passed 18/18; root TypeScript, git diff --check, and fresh production build passed (192/192 pages). Build emits existing workspace/dependency, image, optional Redis/E2B, SSL and caught dynamic-render diagnostics.
- F025 remains PARTIAL: static/unit evidence does not prove browser approval, PostgreSQL token replay race, provider semantics, or every custom execution path. No production DB, external MCP provider, push or deployment was used.

### F010/F012 on-demand project status synthesis (2026-11-06 17:25 +05:30)
- Added a read-only project status synthesis over accepted facts and accepted tasks from active source revisions. Inputs are scoped to attached collections, current collection owners and ready items; text is bounded and marked untrusted for the model. Snapshots include source item/version references and a SHA-256 fingerprint of current visible evidence, so GET only serves a summary when the caller's current evidence scope matches.
- Added authenticated project-member reads and same-origin, owner/editor-only, rate-limited generation. The model cannot call tools or change facts, tasks or review decisions. Added migration 0054 (unapplied), status card, helper tests and API tests.
- Verification: 8 focused helper/API tests passed; 6 GB whole-project TypeScript check passed; pnpm db:check and scoped Biome passed; git diff --check passed; fresh pnpm build exited 0 and generated 192/192 pages.
- Limitations: no PostgreSQL runtime or browser/provider verification; migration 0054 is unapplied. This is on-demand status synthesis only: automatic scheduling, resolved-task consolidation and notification workflows remain incomplete. F010/F012 remain PARTIAL.

### F010/F012 task transition visibility hardening (2026-11-06 17:35 +05:30)
- The source-proposal task PATCH route now rejects missing/cross-origin Origin headers and rechecks active source revision in both the visibility SELECT and conditional UPDATE. This prevents stale-source transitions and narrows the source-refresh race; existing editor authorization, attached collection/current-owner scope and ready-item checks remain.
- Verification: focused task route suite passed 4/4, including missing/cross-origin rejection and source-state SQL predicate; whole-project TypeScript with 6 GB heap, scoped Biome and git diff check passed. Fresh `pnpm build` exited 0 and generated 192/192 pages.
- No schema change or production database action. F010/F012 remain PARTIAL: source-level proposals are not yet consolidated into a provenance-aware project task lifecycle, and no PostgreSQL/browser runtime test was available.

### F010/F012 project task consolidation slice (2026-11-06 17:50 +05:30)
- Added a unified project task view derived from accepted/completed source proposals. Tasks group only when normalized title and detail match exactly; each group retains source task IDs and up to ten evidence excerpts, and the original proposals remain independently reviewed.
- Editors can complete the active accepted members of a group through a bounded same-origin PATCH. The API verifies every ID is visible, ready, attached, owned by a current project member, on the active source revision, accepted, and part of the same exact task identity. A single conditional update runs in a transaction; it returns conflict and rolls back if any member changed, detached, or became stale. Proposals still require individual accept/reject review.
- Verification: 17 focused tests across helper/API/route suites passed; 6 GB TypeScript, Drizzle journal check, scoped Biome and diff check passed; fresh production build exited 0 with 192/192 pages.
- This is deterministic evidence-backed consolidation, not model-generated fuzzy dedupe. No task is auto-closed because it disappeared from source; completion is an explicit editor action. No schema migration or live PostgreSQL/browser test was performed. Notifications, user dismissal of unified tasks, fuzzy merge review and full scheduled dream-cycle consolidation remain incomplete; F010/F012 remain PARTIAL.

### F010 unified-task UI evidence navigation (2026-11-06 18:00 +05:30)
- Restored the existing Open source link in each grouped evidence excerpt, so consolidating accepted tasks does not remove source navigation. The grouped card discloses when it displays only the ten most recent excerpts.
- Verification on the final UI source: helper + consolidated API focused suites 8/8; whole-project TypeScript (6 GB), scoped Biome and `git diff --check` passed; fresh `pnpm build` exited 0 and generated 192/192 pages.
- No database migration, runtime database, or browser workflow. Consolidation remains exact-match and explicit-review, not full model-generated todo lifecycle parity.


### F024 authenticated schedule management follow-up (2026-11-06)
- Reference behavior: owner-visible scheduled tasks include lifecycle controls, per-task run history, and diagnostic due/config state. Void-Agent already had owner-scoped schedule CRUD and a worker, but no schedules page or run-history endpoint.
- Added /schedules with owner-scoped list, pause/resume, delete, and recent run history. The new run endpoint checks session and job ownership before querying, bounds history to 1â€“100 (default 20), and returns lifecycle metadata only; stored output/error text is intentionally excluded.
- Evidence: src/components/scheduled-jobs-dashboard.tsx, src/app/(chat)/schedules/page.tsx, src/app/api/scheduler/jobs/[jobId]/runs/route.ts, focused route tests, and the sidebar link.
- Verification: route tests 4/4; pnpm check-types passed; scoped Biome passed; pnpm build exited 0 and generated 192/192 pages. Build retains existing workspace-root, dependency, image, dynamic-session, optional Redis/E2B and PG SSL warnings.
- Remaining: no schedule creation/edit form (creation remains through chat/API), run-now action, scheduler diagnostics page, browser journey or PostgreSQL runtime test. F024 remains PARTIAL.



### F024 schedule creation UI follow-up (2026-11-06)
- Extended the schedules dashboard with one-time and recurring schedule creation through the existing authenticated POST /api/scheduler/jobs contract. The UI validates required fields, converts the selected one-time clock value explicitly to UTC ISO, displays UTC semantics for recurring cron schedules, and refreshes after successful creation.
- F024 is still PARTIAL: schedule edit, timezone-aware recurring schedules, diagnostics and a safe manual run action remain. Final-source build and typecheck below cover this UI change.



### F024 diagnostics and schedule editing follow-up (2026-11-06)
- Added an authenticated diagnostics endpoint and dashboard panel showing per-user due state and configuration-presence booleans only; secrets and endpoint URLs are never returned. Diagnostics responses are private/no-store.
- Existing owner-scoped PATCH now supports editing prompt and recurring cron or one-time timestamp, recomputes nextRunAt, preserves agent/thread/createdFrom context, validates cron and 30-second one-shot lead time, and rejects missing/cross-origin Origin headers. Schedule creation and deletion now also enforce same-origin.
- Focused evidence: 5 suites / 25 tests; 6 GB whole-project TypeScript; scoped Biome; final-source production build exit 0, 192/192 pages.
- F024 still PARTIAL: timezone-aware recurrence/DST, safe explicit run-now semantics, browser workflow, and PostgreSQL runtime verification remain. No schema changes.


### F024 IANA timezone recurrence and DST support (2026-11-06 19:16:29 +05:30)
- Added additive local migration 0055 (scheduled_job.timezone, default UTC); migration journal check passes and the migration was not applied.
- Recurring schedules now validate IANA zones and compute next occurrences across DST with cron-parser. Dashboard creation/edit, the chat scheduler tool, and /schedule --timezone <IANA> all carry timezone metadata. Existing UTC recurrence retains Void-Agent's legacy AND behavior when both day-of-month and day-of-week are constrained; this behavior is tested for UTC and New York.
- Verification: scheduler/slash/API focused tests 53/53, whole-project pnpm check-types with 6 GB heap, pnpm db:check, and scoped Biome all passed. Production build was attempted but exited 1 after Webpack repeatedly failed to restore cache entries (UNKNOWN: unknown error, read) and ended with Cannot read properties of undefined (reading 'length'); no source-level compile error was reported. Build remains unverified pending a clean cache retry.
- No browser, PostgreSQL runtime, migration apply, push, deployment, or production DB action. F024 remains PARTIAL: atomic worker claiming/lease protection and safe manual-run semantics remain open.

### F024 durable job claim lease update
- Scheduler due-job claims now use a PostgreSQL transaction with `FOR UPDATE SKIP LOCKED`, persist a per-tick UUID claim token and expiry, heartbeat active work, and fence final schedule advancement/release by token. Expired claims are recoverable after worker termination; pause/reschedule clears the lease. Claim requests with non-positive or non-finite limits return no rows.
- Focused scheduler/API suites passed 51 tests across 7 files; TypeScript, `pnpm db:check`, and scoped Biome passed. PostgreSQL-backed concurrency and worker crash tests remain unavailable; migrations 0055/0056 are authored but unapplied. The system remains at-least-once if the process dies after causing the chat side effect but before persisting completion. Manual run remains unimplemented.


## F026 reviewed voice transcript handoff (2026-11-06)
- Added a user-selected handoff from enrolled-device transcript history into the saved conversation. The chat page loads the transcript from the database through an owner/thread/message/source-checked server action, then displays the exact transcript in a review card. Only a second explicit “Send to assistant” click creates a normal user chat message.
- Device audio/transcript routes remain side-effect-free. Any subsequent model tool call goes through normal chat authorization and the existing exact-payload approvals; no voice-triggered tool, agent, schedule, or workflow is executed directly.
- The transcript handoff accepts only `source: voice_device`, matching owner/thread/message, plain text only, capped at 24,000 characters. A forged URL query can only open the review card; it cannot submit the transcript automatically. The query is removed before loading.
- Evidence: `src/lib/voice/handoff.ts` and tests, `loadVoiceTranscriptForHandoffAction` in `src/app/api/chat/actions.ts`, the device dashboard handoff affordance, and the `processVoice` review flow in `src/components/chat-bot.tsx`.
- Verification: voice/chat regression set 23/23 across 8 files; handoff/audio/finalize subset 7/7; TypeScript passed with 6 GB heap; scoped Biome passed; production build passed and generated 192/192 static pages. Existing warnings remain for optional Redis/E2B configuration, multi-instance memory rate limiting, PostgreSQL SSL mode, dynamic session routes, E2B/unpdf dependencies, `<img>` use and workspace-root inference.
- F026 remains PARTIAL: no live device/audio provider, browser journey, or PostgreSQL test; the reference’s automated voice intent classifier and draft workflows are not yet replicated. Direct side-effect dispatch was intentionally not adopted because the reference invokes tools before history dedupe, allowing retries to repeat side effects. No schema migration, push, deploy or reference change.

### Final F026 interstitial build verification (2026-11-06)
- Final voice handoff behavior is review-only on page load: the `processVoice` URL marker retrieves an owner-checked transcript and renders an exact-text review card; a separate Send to assistant button submits it. This was added after the earlier voice validation run.
- Final `pnpm build` passed after this UI change and generated 192/192 static pages. Existing warnings remain: E2B/unpdf critical-dependency traces, `<img>` optimization warnings, dynamic-session prerender diagnostics, optional Redis/E2B config, memory-rate-limit multi-instance notice, PostgreSQL SSL-mode notice, and Next workspace root inferred from multiple lockfiles. Scoped voice tests 23/23, TypeScript and Biome passed. No live browser/device/PostgreSQL verification.

### F018 stored-document preview follow-up (2026-11-06 20:30:13 +05:30)
- F018 remains PARTIAL. Void-Agent now previews owner-scoped stored DOCX, PPTX, TXT, Markdown, and JSON attachments through /api/storage/document; presentation preview is explicitly text-only/partial. UI renders returned text as escaped React text in a bounded dialog.
- Evidence: src/app/api/storage/document/route.ts, tests, src/lib/file-ingest/document-preview-limits.ts, and SourceUrlMessagePart in src/components/message-parts.tsx. Endpoint accepts a storage key/known upload URL only to derive the key; it never fetches the submitted URL. It verifies user-prefix ownership before metadata/download, checks both stored and returned byte sizes (5 MiB), rate-limits 20 requests/minute/user, and sets private no-store. Text output is capped at 100,000 chars; DOCX uses existing archive guards; PPTX parser bounds slides and inflated XML.
- Remaining: no interactive browser/storage-provider test; no PDF/audio preview through this dialog; public object URL limitations and live object-store ACL remain as recorded in prior F018 entries.

### F018 fidelity and filename follow-up (2026-11-06 20:35:36 +05:30)
DOCX preview is now explicitly marked partial because raw-text extraction does not retain Word layout/tables/images. Attachment extension inference now uses the explicit title or a decoded URL pathname with query/fragment excluded, so signed legacy URLs can expose the correct preview action. F018 remains PARTIAL.

### F017 team-shared knowledge collections (2026-11-06 21:12:22 +05:30)
- Private/personal collection behavior remains available. Void-Agent now supports explicit team-scoped collections using the existing nullable collection.org_id; no active-organization session is assumed. New collections are personal by default; selecting a team shares the collection with that team.
- Owners/editors can ingest; viewers can read only. Team membership and role are resolved for every collection operation. Project attachments accept personal collections only in personal projects and same-team shared collections in team projects. Explicit chat scopes are revalidated; RAG SQL enforces both exact collection IDs and current team membership/ownership at query time.
- Evidence: src/lib/collections/access.ts, collection API routes and tests, src/lib/projects/access.ts, project API routes, chat route/actions, src/lib/rag/retrieve.ts, src/lib/rag/ingest.ts, and migration 0057_collection_org_scope_index.sql.
- Status: PARTIAL. No interactive browser or live PostgreSQL check; access roles cannot be edited per collection; team sharing is team-wide rather than configurable private/public; project-brain source/history queries still depend on current member owner IDs for documents inside a shared collection. Migration 0057 is local and unapplied.

### F017 project-brain shared-source scope follow-up (2026-11-06)
- Project-brain source owner resolution now includes the creators of team-shared collections only when those collections are explicitly attached to the authorized project and their `org_id` matches that project's team. Personal collections remain limited to current project owner/member IDs. All brain source queries retain the exact attached collection ID allowlist.
- The source-owner scope is separate from the active team-member owner list used to authorize connector credentials. Thus sharing collection content does not transfer OAuth/MCP credential authority.
- Queue enqueue now accepts an authorized project editor's item from an attached team collection even when another teammate created the collection; it still requires current editable project access, exact attached collection/item IDs, and a ready source.
- Focused project-brain route suites passed 72/72 across 14 files, including the new source-scope helper tests. Type checking, route-level connector/fact follow-ups and production build are pending for this batch.
- F017 remains PARTIAL: connector destination workflows and detached-fact mutation scope are being addressed separately; no live PostgreSQL or browser verification has been performed.

### F017 project-brain shared collection completion slice (2026-11-06 21:33 +05:30)
- Same-team collection creators are included in brain source-owner scope only for collections explicitly attached to the project and only when collection.orgId matches the project's team. Exact collection IDs and readiness/revision checks remain in place.
- Connector selection/attach/sync accepts attached same-team collections created by another member. Credential ownership remains actor-bound and requires current team/project membership; personal destinations remain owner-scoped.
- Fact review updates and conflict lookups now join the source item and collection, requiring ready status, exact attachment, team/personal collection scope, and the active source revision. Same-origin protection is enforced.
- Validation: 102 tests passed across 21 files (project-brain routes/helpers); TypeScript passed; scoped Biome passed for 43 files; `git diff --check` passed (only existing LF/CRLF notices); production build passed with 192/192 pages.
- Existing build warnings: inferred workspace root due multiple lockfiles; E2B/unpdf dynamic dependency warnings; existing `<img>` lint warnings; optional Redis/E2B configuration; dynamic-session prerender diagnostics; PostgreSQL SSL mode notice.
- F017 remains PARTIAL: no live PostgreSQL, browser, or external connector journey; migration 0057 remains unapplied. Queue worker deliberately rechecks the original requester, so revoking their project access fails the queued run.

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

## Verified migration and release checkpoint (2026-11-07 00:10 +05:30)

The current code checkpoint adds these independently verified workflows; the original family statuses remain PARTIAL where larger family work remains:

- **F001 / chat:** authenticated text-only conversation archive import/export at `/api/chat/archive`; bounded to 2 MiB, 1,000 messages, 40,000 chars/message, and 200-char titles. Ownership and same-origin are enforced; imported turns receive new IDs; partial imports roll back. Attachments, tool activity, and original timestamps are not preserved.
- **F007 / providers:** dynamic model resolution is restricted to the configured bounded catalog and configured `apiModelId`; unknown IDs fall back safely. Provider catalog/model management parity remains partial.
- **F009 / projects:** migration 0059 adds opt-in selected-member access while preserving default team-wide access. Owner mode switching, same-team member management, and viewer/editor roles are available through guarded APIs and project UI. Migration is journaled but unapplied; no live PostgreSQL/browser workflow.
- **F014 / table review:** generated citation mapping is checked against exact source passages; the chat tool card loads the persistent review, starts/follows cell generation, streams results, and links to editor/export. Full database/browser journey remains unverified.
- **F021 / desktop MCP:** tool execution now confirms the exact parsed command configuration before per-call approval and execution. Multi-server picker and native notification/checkout bridges remain absent; package signing/feed delivery is unverified.
- **F025 / approvals:** CreateAgent proposals can include up to 20 allowlisted built-in tools, reviewed in the approval UI and persisted via existing mention contracts. Broader approval parity remains partial.
- **F026/F027 / voice:** stale async transcript/preview results are bound to thread/message identity; finalized device sessions link to their conversation. An explicit owner-only, tool-free “Capture summary” is available for finalized transcripts. This does not implement reference `voice_command` or gateway mode parity.
- **F029 / notifications:** users can unsubscribe the current browser; agent `cockpit_push_update` creates deduplicated user-scoped inbox entries with best-effort push. Project mutation routes now require same-origin and bounded JSON; notification links reject backslash/control-character external-origin normalization. Broader event coverage and live push delivery remain partial.
- **Additional Void-Agent improvements:** user-scoped project docs, storage privacy, connector approvals, project brain/RAG, scheduling, file previews, and prior security patches are tracked in earlier entries and remain covered by this checkpoint's suite/build.

These additions do not imply the overall migration is complete. The 36-family matrix is not a per-surface 206-row behavioral inventory; every remaining PARTIAL/OPTIONAL/EXCLUDED/DEPRECATED family still requires evidence-based disposition.

## F024 CreateAgent recurring schedule approval (2026-11-07 00:30 IST)
- Reference CreateAgent proposes an optional `{cronExpression, timezone, inputPrompt}` and writes the schedule after the user reviews the agent configuration. Void-Agent now exposes an optional recurring schedule in its CreateAgent approval card and sends it only after the same explicit user approval that creates the agent.
- The agent remains created through the existing authenticated/idempotent `/api/agent` workflow. Schedule creation uses the existing authenticated, same-origin `/api/scheduler/jobs` endpoint and scheduler worker. When `agentId` is supplied, the API confirms that the current user owns that agent; public/read-only access is not enough.
- Schedule POST accepts an optional bounded `Idempotency-Key`. A durable `(user_id, request_key)` reservation with a canonical SHA-256 hash is committed transactionally with the schedule. Identical retries return the same job; changed payloads conflict; deletion leaves a null-job tombstone so replay cannot recreate a removed schedule. The card freezes an ambiguous attempted payload for safe retry.
- Evidence: `src/lib/ai/tools/hitl/index.ts`, `src/components/tool-invocation/hitl-tool-cards.tsx`, `src/app/api/scheduler/jobs/route.ts`, `src/lib/scheduler/jobs.ts`, `src/lib/db/pg/repositories/scheduler-repository.pg.ts`, `src/lib/db/pg/schema.pg.ts`, migration `0061_scheduled_job_creation_requests.sql`.
- Verification: 38 focused tests passed across 4 files, covering proposal bounds, stable recurring retry hashes, payload conflicts, deleted-schedule tombstones, and agent-owner enforcement. `pnpm db:check`, scoped Biome lint, and `git diff --check` passed. Whole-project typecheck currently reports two unrelated concurrent errors: `src/app/api/chat/route.ts:1830` (`ChatThread.orgId`) and `src/lib/ai/team-member-ai-budget.ts:13` (unused import). No build or live PostgreSQL run was performed; migration 0061 is authored/journaled but unapplied. F024 remains PARTIAL pending database/browser validation and other scheduler parity.

## F015 published page lifecycle implementation checkpoint (2026-11-07)
- Status remains PARTIAL. Migration 0060 adds versioned published page snapshots by slug. Owner-authenticated management supports publish/republish/revoke/list; an unlisted public reader serves the current live version under a restrictive sandbox CSP.
- Primary evidence: `src/app/api/published-page/route.ts`, `src/app/api/published-pages/route.ts`, `src/app/p/[slug]/route.ts`, `src/components/published-pages-dashboard.tsx`, `src/components/tool-invocation/published-page-tool.tsx`, `src/lib/published-page/*`, `src/lib/db/pg/repositories/published-page-repository.pg.ts`, and migration `0060_published_pages.sql`.
- Agent-reported focused verification: 20 tests across 7 files; Drizzle journal, scoped Biome, and diff whitespace checks passed. Integrated type/build and live Postgres/browser verification pending; 0060 unapplied. Public unlisted links are bearer capabilities and require revocation to disable.

## F025 CreateAgent model pinning (2026-11-07)
- Capability status: model-pin subfeature COMPLETE under focused mocked verification; CreateAgent family remains PARTIAL because reference file bindings and integrated type/build verification remain outstanding.
- The review card now offers only the authenticated endpoint's enabled, configured provider/model catalog, with an explicit inherit-current-chat option. The approval payload stores the reviewed selection in existing agent `instructions.model` JSON; no schema migration was required. Create/update APIs reject stale or disabled selections with HTTP 409.
- Runtime resolves the mentioned agent using the existing owner/public access-bound `rememberAgentAction` lookup. Only that authorized agent's pin can override the client-requested model; unauthorized/no-pin agents leave the requested model unchanged. A stale/disabled pin returns a clear 409 before model execution rather than falling back. Budget pricing/reservation receives the effective pinned model; ordinary unpinned chats preserve the prior selected-model path.
- Evidence: `src/lib/ai/agent/pinned-model.ts`, `src/app/api/agent/models/route.ts`, `src/app/api/chat/route.ts`, `src/components/tool-invocation/hitl-tool-cards.tsx`, `src/types/agent.ts`, `src/lib/ai/tools/hitl/index.ts`, and agent create/update routes.

### F015 storage quota and version retention addendum (2026-11-07)
- Publishing is now transactionally bounded without a schema migration: at most 50 stored snapshots per owner (2 MiB per snapshot, approximately 100 MiB maximum HTML storage) and at most 10 versions per slug. Owner advisory lock is acquired before slug lock so concurrent writes to distinct slugs share quota serialization.
- Republish prunes oldest same-slug snapshots first while retaining the newest 10. Creating a new slug at owner capacity reclaims oldest revoked snapshots; if the cap is still full of active pages, the API returns HTTP 409 with a snapshot quota message. Active pages are never automatically deleted. The publish tool returns the same clear quota reason.
- HTTPS images/fonts/media remain permitted because upstream page instructions explicitly require externally hosted HTTPS images. `no-referrer` is set and network fetch/XHR remains blocked, but asset hosts can still observe viewer requests/IPs; disclose this privacy behavior.
- Focused tests passed 17/17 across repository/quota/API/tool tests; scoped Biome and diff checks passed. No migration was applied or changed; live PostgreSQL concurrency remains unverified.

## Final integrated verification and family status (2026-11-07)
- **F032 markdown streaming:** renderer implementation and regression coverage are complete; focused parser/component tests, integrated typecheck, full suite, and clean 194/194-page build passed. The family can be marked COMPLETE for implemented/code-level behavior. A browser workload/performance benchmark has not been run; if that is required for the parity acceptance bar, keep the family PARTIAL until measured.
- **F008 team-member budget:** integrated typecheck, full suite and clean build passed. Keep PARTIAL: migration 0062 is unapplied, no PostgreSQL authorization/reservation concurrency journey was run, and budget enforcement remains narrower than the full app route/model surface.
- **CreateAgent (F025):** integrated checks pass; the reviewed model pin and optional schedule slices have focused evidence. Keep PARTIAL because reference file bindings and complete browser/live scheduler/database journeys are not yet verified.
- **F015 published pages:** integrated checks pass; keep PARTIAL because migration 0060 is unapplied and publish/republish/revoke/public-view behavior has not been exercised against PostgreSQL and a browser.
- Build evidence: two attempts failed at compile with `undefined.length` and no stack; failed `.next` output was preserved at ignored `.audit/next-failed-20261107-0130`. Clean build session 42765 passed, 194/194 pages. See `docs/testing-report.md` for non-fatal warnings and limits.

## F010/F014 verified parity addendum (2026-11-07)
- **F010 project brain:** `processProjectBrainQueue` now collects successfully processed, currently authorized project scopes and runs existing salience recomputation plus source-revision-aware stale-page archival once per unique project after the queue batch. Archive work remains capped at 20 pages per scope/pass. Errors are logged without converting a successful extraction to failure. Evidence: `src/lib/projects/brain-queue.ts`, `src/lib/projects/brain-maintenance.ts`, `src/lib/projects/brain-page-archive.ts`, `src/lib/projects/recompute-brain-salience.ts` and focused tests. This adapts post-ingest portions of upstream `project-brain-dream.ts`; full scheduled dream stages, background deduplication and live PostgreSQL execution remain incomplete. F010 stays PARTIAL.
- **F014 table review:** the manual dashboard now permits multiple custom extraction columns with text/date/boolean/list/score/citation types, bounded to eight total fields; labels/prompts are normalized and validated before posting. Citation type flows into existing schema and citation-validation behavior. Evidence: `src/components/tabular-reviews-dashboard.tsx`, `src/lib/tabular/review-columns.ts`, and focused component/helper tests. This augments, rather than replaces, the existing chat-driven review flow. Live PostgreSQL/browser/provider workflow is still unverified; F014 stays PARTIAL.
- Verification for this slice: 13 focused tests across 5 files; scoped Biome and TypeScript check passed. No database, deployment, or browser E2E action was performed.

## F027 finalized voice-device transcript review handoff (2026-11-07)
- Upstream evidence includes `voice_command` and `long_capture` session modes and an external-device WebSocket route that requires a separate gateway; the community checkout does not contain the gateway bridge implementation. Its voice-command finalizer dispatches tools, so Void-Agent preserves its stronger review/approval boundary.
- Primary now exposes the deterministic saved-message ID only for finalized, nonempty, owner-scoped device sessions and links the owner dashboard to the existing chat handoff preview. The user must explicitly choose to send the transcript; no device action or tool executes automatically. Evidence: `src/app/api/voice/devices/[id]/sessions/route.ts`, `src/components/voice-devices-dashboard.tsx`, `src/components/chat-bot.tsx`, and the owner-scoped `loadVoiceTranscriptForHandoffAction`.
- Verification: route tests passed 7/7, scoped Biome passed, and diff check passed. Full typecheck remains blocked by errors in the concurrent Cockpit schema/UI slice; no voice-file diagnostic was reported. No DB/gateway/hardware/browser run. F027 remains PARTIAL.

## F025 CreateAgent file-binding and sandbox staging addendum (2026-11-07)
- The reference stores file bindings in agent instructions, reuses existing user-owned upload keys, and stages those files into the sandbox at runtime. Void-Agent now validates client bindings against authenticated owner prefixes; a shared agent may retain an existing valid creator-owned binding without trusting client-supplied owner metadata. Filename and binding counts are normalized and bounded.
- At execution, the approved agent file bindings are passed through the existing sandbox-tool context and staged into the isolated workspace under safe unique basenames. A manifest makes retries idempotent and removal is limited to safe previously manifested names. Per-file staging is capped at 50 MiB and aggregate staging at 100 MiB.
- Resource security: new `FileStorage.downloadLimited` preflights local stat/S3 HEAD/Vercel Blob metadata and applies a hard stream-byte cap to cover incorrect metadata or object replacement. Existing `download()` semantics remain unchanged for other callers. Never accept owner IDs or storage keys as trusted grants from the client.
- Evidence: `src/lib/ai/agent/agent-files.ts`, `src/lib/sandbox/agent-files.ts`, `src/lib/file-storage/limited-download.ts`, `src/lib/file-storage/{local-file-storage,s3-file-storage,vercel-blob-storage}.ts`, CreateAgent routes, `src/app/api/chat/route.ts`, `src/app/api/chat/shared.chat.ts`, and sandbox tool-kit wiring.
- Focused storage/agent tests passed 35/35 across 6 files; broader related route tests passed in the root 70-test batch. Scoped Biome passed. Current 6 GB whole-project typecheck was reported passing by the Cockpit integration agent after its fixes; root will rerun after all concurrent changes settle. No live object-storage/E2B/browser journey. CreateAgent remains PARTIAL.

## F021 desktop server selection and origin rebinding (2026-11-07)
- Reference audit: `Void-Agent-V2/apps/desktop/src/main/server-picker.ts`, `server-picker-page.ts`, `server-config.ts`, `menu.ts`, `preload/index.ts`, and `main/index.ts` implement a new-install server picker and a Change Server menu. `packages/mcp-core/src/mcp-tool-policy.ts` separately keeps desktop MCP tools on a default-deny read-style allowlist; `apps/desktop/src/main/mcp-spawner.ts` and `mcp-ipc.ts` handle local process calls. The server picker is distinct from local MCP execution.
- Void-Agent gap: prior `apps/desktop/src/main/index.ts` used one build-time `VOID_AGENT_WEB_URL` and had no way to select a self-hosted instance or change the deployment. It already had the isolated Electron shell, system-browser auth, local consent-gated MCP, update, notification, and download bridges.
- Implemented: new installs show an isolated server chooser; existing profiles with browser data continue at the configured cloud origin and keep their cookie store. Explicit selection of a custom HTTPS Void-Agent origin persists the canonical origin in `server.json` (0600 on creation) and relaunches the process. A fresh process reinitializes auth, updater, navigation, downloads, notifications and MCP against the selected origin. Dev builds alone may choose loopback HTTP; production ignores stored HTTP origins.
- Server identity adaptation: upstream's `/api/auth/ok` probe is absent from primary. The chooser checks primary's actual `/api/health` response (`service: "flare-ai"`, `status: "ok"` on 200 or `status: "degraded"` on 503). Probe uses GET without credentials, manual redirect handling, 6-second timeout and an 8 KiB response cap. A degraded dependency status is allowed so optional cache failure does not make a valid server unselectable.
- Security boundaries: dedicated picker preload exposes only `serverPicker.choose`; IPC requires the current picker window's main frame and self-contained `data:` URL. Picker navigation and new windows are blocked; inline page has CSP `default-src 'none'`. Server URLs reject credentials/non-HTTPS origins (except dev loopback); probe does not follow redirects. Main-window target, OAuth callback origin, navigation allowlist, and local MCP trusted origin are reconstructed only after process relaunch. Existing MCP consent, tool allowlist, audit, and process policy are unchanged.
- Evidence: `apps/desktop/src/main/{server-config,server-picker,server-picker-page,server-picker-policy}.ts`, `apps/desktop/src/preload/server-picker.ts`, `apps/desktop/src/main/index.ts`, and `apps/desktop/scripts/build-main.mjs`.
- Verification: server config/health identity/picker page/trust tests pass 16/16; desktop TypeScript check, desktop main/preload build, scoped Biome pass. No interactive Electron, live self-hosted health probe, OAuth/device login, or packaged installation test was run. Release signing/feed credentials remain unavailable and are not required by this slice.
- Status: F021 remains PARTIAL pending Electron runtime/manual new-install and server-switch journeys, signed package/update verification, and other reference desktop features. This implementation chooses one server per profile (matching reference), not simultaneous multi-origin windows.


## F030 Vercel Cockpit vertical slice (2026-11-07)
- Reference evidence: `Void-Agent-V2/apps/web/src/lib/cockpit/providers/vercel.ts`, provider schemas, connection/data/feed helpers, and finance/connect console. It supports up to six configured projects, optional team scope discovery, production deployment reads, latest deployment status/URL/date, and ERROR count over the prior seven days; it has no spend/margin source.
- Primary implementation: `src/lib/cockpit/vercel.ts`, `/api/cockpit/vercel/{connection,connection/test,deployments}`, `src/components/cockpit/vercel-dashboard.tsx`, and `/cockpit/vercel`. The UI labels the failure metric as a count over seven days and reports production deployment timestamps; no inferred billing units are shown.
- Migration 0063 remains unapplied and is additive: Stripe legacy `secret_encrypted` remains supported; Vercel token/team/project config is one AES-GCM `config_encrypted` payload. API projections expose only `tokenSet`, team ID, and project metadata. Personal/team scopes use existing unique constraints and role checks.
- Egress is fixed `https://api.vercel.com`, GET-only, redirect-rejecting, 20-second timeout, max 20 team results, six projects, 20 deployments per project, and a 2 MiB streamed body cap before JSON parse. Generic errors omit upstream bodies; no mutation endpoints are called.
- Verification: focused Cockpit tests 28/28 across five files; scoped Biome lint passed on 15 files; `pnpm db:check` passed. Whole-project typecheck reports only the unrelated concurrent project-brain error at `src/app/api/projects/[id]/brain/status/route.ts:172`; no Vercel diagnostic remains. No migration apply, live Vercel request, authenticated browser workflow, or PostgreSQL team authorization test.
- Remaining: website, Revolut, Superlog, SEO, unified finance composition/controls, and live workflow verification remain. F030 is PARTIAL.

## F029 project health transition implementation addendum (2026-11-07 06:41:22 +05:30)
- Added a generic, deduplicated notification after a project-brain health snapshot is persisted and a known health transition is detected. Recipient resolution follows current personal/team/selected-project access and excludes former team/project members; text contains only the health transition, not project names, summaries, blockers, source content, or model output.
- Reference-equivalent project-consolidation todo digest remains absent; this is an additional health-transition producer, not full notification parity. F029 remains PARTIAL pending the consolidation pipeline, PostgreSQL-backed recipient/persistence checks, browser permission flow, and real VAPID delivery.
- Focused route/helper/generation tests passed 19/19 across 4 files; scoped Biome passed; full suite, whole-project typecheck, db journal check, and production build results are in docs/testing-report.md.

## F030 Vercel integration addendum (2026-11-07 06:41:22 +05:30)
- In addition to the verified Stripe slice, Void-Agent now has a read-only Vercel production-deployment panel for up to six configured projects, with latest status/date/URL and seven-day deployment error counts. Vercel config/token are encrypted as a single payload; migration 0063 remains additive and Stripe's existing secret column remains compatible.
- Egress is fixed-host HTTPS GET-only with redirect rejection, bounded response/time/team/project/deployment limits, rate/origin/body guards, and role-scoped team access. Focused Vercel tests passed 28/28 with scoped Biome and db journal checks.
- Website, Revolut, Superlog, SEO, unified multi-provider finance controls, live database, live provider, and browser workflows remain. F030 remains PARTIAL.

## Verified implementation addendum — 2026-11-07

- **F008 PARTIAL:** title generation request bounded and team billing derives only from an owner-authorized persisted thread/project. Agent generation rejects arbitrary team fields and is authenticated/rate limited; it has no authoritative persisted team scope yet.
- **F010/F011 PARTIAL:** durable dream-cycle stages are enqueued and processed through scheduler, revalidate current attached-source and owner scopes, and only produce review suggestions/classifications. Never auto-merges or resolves facts.
- **F014 PARTIAL:** write routes now enforce same-origin and bounded bodies/rate controls; feature needs real database/provider/browser journey verification.
- **F020 PARTIAL:** approved remote MCP call results are capped at 1 MiB; invalid/oversized values become safe protocol errors.
- **F021 PARTIAL:** desktop audit viewer is restricted to the trusted MCP test page and returns validated event metadata plus hashes, not commands, arguments, results or env values.
- **F022 PARTIAL:** saved-workflow approval previews effects and blocks dynamic/unknown effects; one-use authorization remains bound to graph revision and exact payload and is checked again before execution.
- **F026/F028 PARTIAL:** voice transcript creates a user-triggered draft handoff; Slack connector ownership must match inbound endpoint ownership before signed event processing.
- **F029 PARTIAL:** a persisted project-brain health transition creates a generic, deduplicated notification to current authorized project recipients.
- **F030 PARTIAL:** Stripe, Vercel and Website provider slices use encrypted config, role gates, fixed-host read-only fetches and response bounds; other reference providers/console behavior remain.
- **F031 PARTIAL:** report history/submission is private to the user; screenshot keys must be in their own storage namespace and page context is same-origin sanitized.

No family is marked COMPLETE on the basis of route/component presence; environment-dependent end-to-end verification remains open.

## F030 Revolut Business provider addendum (2026-11-07)
- Implemented an encrypted Revolut Business OAuth connection with transient authorization-code exchange, server-side RS256 assertions and refresh-token exchange, personal/team owner/editor management, team-member reads, connection test/status/remove routes, and an account dashboard.
- Data requests use only fixed production/sandbox Revolut hosts and read-only GET calls for active balances and a maximum of 1,000 transactions over 30 days. Response streams are capped at 2 MiB; API calls reject redirects and have a 15-second timeout. Access tokens are hashed-key cached and concurrent refreshes are coalesced.
- Focused tests passed 6/6 across provider and connection API tests; scoped Biome lint and `pnpm db:check` passed. Whole-project typecheck was started but stopped at parent request to avoid contention with concurrent F023 work; status is inconclusive, not a pass.
- Migration 0063 provider allowlist now includes Revolut and remains unapplied. No live Revolut/PostgreSQL request, browser workflow, or production build was performed for this slice. Superlog, SEO, unified finance console, and live verification remain. F030 stays PARTIAL.

## F030 Superlog read-only provider addendum (2026-11-07)
- Reference behavior: `Void-Agent-V2/apps/web/src/lib/cockpit/providers/superlog.ts` uses a Superlog MCP personal token to read `search_incidents`, `list_alerts`, and `query_logs`, filtering arguments to declared tool properties and producing bounded incident/service summaries.
- Primary adaptation: `src/lib/cockpit/superlog.ts`, `/api/cockpit/superlog/*`, and `/cockpit/superlog` now provide encrypted PAT storage and summary views. The endpoint is fixed to `https://api.superlog.sh/mcp`, redirects are rejected, external response streams are capped at 1 MiB, calls time out after 6 seconds, and only bounded aggregate fields are exposed. Team reads require membership; writes/tests/removal require owner/editor access.
- Database: migration 0063 provider allowlist includes `superlog`; it is still unapplied. No database was contacted.
- Verification: focused provider and connection-route tests passed 8/8; scoped Biome and `git diff --check` passed. Integrated typecheck/build are pending root verification; no live Superlog, PostgreSQL, or browser journey was run.
- Remaining: SEO provider, unified finance/connect console, broader data/alert integrations, and live provider/DB/browser verification. F030 remains PARTIAL.
## F010/F011 durable dream status stage (2026-11-07)
- Added a final `status` stage after dedupe, contradiction classification, salience refresh, and stale-page archive. It reuses Void-Agent's status synthesizer and snapshots; it revalidates current project/editor/source scope after inference, discards stale-fingerprint output, reuses an exact-fingerprint snapshot on retry, and calls the existing health-transition notifier.
- Evidence: `src/lib/projects/brain-dream.ts`, `src/lib/projects/brain-dream-state.ts`, `src/lib/db/migrations/pg/0066_project_brain_dream_status_stage.sql`; focused stage-state tests 5/5 and `pnpm db:check` passed.
- Migration 0066 is local and unapplied; no PostgreSQL-backed stage transaction or browser workflow was run. F010/F011 remain PARTIAL.

## F025 approval and execution hardening (2026-11-07)
- Internal saved-workflow execution continues to require a server-computed effect review and one-use approval bound to current graph revision and exact runtime input. Review rejects dynamic HTTP values, model-generated tool arguments, runtime LLM data, unsupported nodes, and excessive effect lists.
- HTTP review now omits and rejects opaque, oversized, or too-complex request bodies; credential-like URL userinfo/query keys, header keys, and nested JSON body keys are redacted and suppress approval. Approval route regressions verify no token is issued for unreviewable/secret-bearing effects.
- Standalone cloud MCP test and OpenAI Realtime/Konvo/ElevenLabs voice calls use the exact-payload user-bound approval helper and current MCP access checks. Desktop stdio MCP consent now displays the complete bounded argument JSON; cancellation prevents execution and records denial.
- Evidence: `src/lib/ai/workflow/workflow-review.ts`, `src/app/api/approvals/workflow-run/route.ts`, `src/app/api/chat/shared.chat.ts`, `src/app/api/mcp/actions.ts`, `apps/desktop/src/main/mcp-ipc.ts`; focused approval/review/MCP tests passed (16/16 workflow review/approval; 15/15 desktop/voice/MCP API slices).
- No live provider, PostgreSQL replay race, browser voice session, or Electron GUI was available. F025/F021 remain PARTIAL.

## F023 saved-workflow draft editor compile repair (2026-11-07)
- Kept draft editor graph writes isolated to `/api/saved-workflows/[id]/structure`; it accepts converter payloads but overwrites client workflow IDs with the authenticated owner-authorized path ID. Database node/edge timestamps and nullable descriptions now satisfy repository types. Metadata PATCH preserves required existing fields and reports non-2xx failures.
- Focused APIs/component tests pass 10/10 after root type fixes; draft routes remain private/unpublished and do not establish publish/run/team-sharing parity. F023 remains PARTIAL.

## F030 additional Superlog provider (2026-11-07)
- Added an encrypted PAT-backed, fixed-host Superlog MCP connection and read-only incident/alert/error dashboard with declared-argument filtering, redirect rejection, a six-second timeout and 1 MiB streamed response cap. Team reads require membership; credential changes require owner/editor.
- Focused provider/API tests pass 8/8; migration 0063 remains unapplied. SEO and unified console controls/live checks remain missing; F030 remains PARTIAL.

### F028 recheck — reference channel lifecycle remains EXCLUDED (2026-11-07 09:20 IST)
- Evidence: reference schema `Void-Agent-V2/apps/web/src/lib/db/pg/schema.pg.ts` (`SlackChannelSubscriptionTable`, `SlackAgentTaskTable`) and migration `Void-Agent-V2/apps/web/src/lib/db/migrations/pg/0030_slack_navigator_bot.sql`; settings UI `Void-Agent-V2/apps/web/src/components/slack/slack-integration-settings.tsx` calls `/api/slack`, `/api/slack/channels`, `/api/slack/sync`, `/api/slack/connect`.
- No reference `apps/web/src/app/api/slack` handlers or repository consumers were found for the subscription/task tables, signed event/replay processing, task execution, or response delivery. These UI/schema declarations do not establish executable lifecycle behavior and are excluded on that source-completeness basis.
- Void-Agent signed inbound event processing remains EXISTING/PARTIAL: endpoint-owner binding, HMAC verification, and queue delivery are present, but do not constitute parity with the reference's non-executable channel lifecycle. Focused verification: `pnpm vitest run 'src/app/api/inbound/[token]/route.test.ts' src/lib/inbound/slack.test.ts` — 8/8 passed. F028 remains PARTIAL overall.
## F030 SEO provider slice (2026-11-07)
- Status remains PARTIAL. Primary DataForSEO behavior is implemented at `src/lib/cockpit/seo.ts`, `src/app/api/cockpit/seo/**`, and `src/components/cockpit/seo-dashboard.tsx`; it stores login/password/domain/market config in encrypted Cockpit config and scopes personal/team reads with membership and team writes to owner/editor.
- Provider tools are fetched only from fixed `https://mcp.dataforseo.com/v3/mcp`; redirects and alternate hosts/paths are rejected, response size is bounded, sessions time out, only schema-declared arguments are sent, and summary rows are capped. API mutations enforce same-origin, bounded JSON, rate limits, and ACLs.
- Evidence: `src/lib/cockpit/seo.test.ts` and `src/app/api/cockpit/seo/connection/route.test.ts` passed 7/7; together with focused Superlog tests, 15/15 tests passed. Scoped `pnpm db:check` passed; migration 0063 is unapplied. No live DataForSEO/PostgreSQL/authenticated browser check. OpenSEO's connected-Navigator OAuth workflow and unified Cockpit console are outstanding.
### F030 SEO verification update (2026-11-07)
- Final focused run after adding rate-limit-store failure regression coverage: SEO + Superlog connection/provider tests passed 16/16 across 4 files. This supersedes earlier 15/15 totals and the SEO route count is now 8/8 with the new fail-closed test.

## F025 n8n approval subfeature update (2026-11-07)
- The n8n approval subfeature now provides an exact bounded preview for literal HTTP request method, URL, and parameters; configured credentials are shown by type without secret data. Dynamic/unknown/unreviewable effects are rejected both during preview and before token issuance. Coverage includes JSON-string and header name/value credential redaction; 13/13 focused tests passed.
- F025 remains PARTIAL: non-HTTP integration adapters, live n8n workflow verification, and broader CreateAgent/MCP approval capabilities remain.
## F008 project-brain status budget slice (2026-11-07)
- Project status generation now reuses a snapshot for an unchanged evidence fingerprint, derives team scope from persisted project access, chooses an enabled configured model on the server, reserves before inference, settles reported usage (or the conservative estimate when usage metadata is absent), disables provider retries for the pinned billable call, and rechecks user role/team/evidence before persistence.
- A ledger settlement failure after successful inference no longer releases the reservation as if the call had aborted. The failed settlement is surfaced as a safe server error and the reservation remains for reconciliation; the route does not persist or return status from that request.
- Evidence: `src/app/api/projects/[id]/brain/status/route.ts`, `src/lib/projects/project-brain-status.ts`, and their route/service/budget tests. Focused tests pass 25/25 across three files; integrated typecheck passed.
- F008 remains PARTIAL: migration 0062 is unapplied, no PostgreSQL-backed reservation/access concurrency journey was run, and team-cost enforcement is still limited to covered routes/models.
## F030 unified Cockpit provider-status overview (2026-11-07)
- `/cockpit` now presents personal/team connection status for Stripe, Website analytics, Vercel, Revolut Business, Superlog, and DataForSEO SEO. The page reads each provider's existing authenticated connection-status endpoint concurrently and validates only the shared `connected`, `lastTestedAt`, `lastTestOk`, and `canManage` fields before rendering; other response fields are discarded.
- The overview does not call provider summary APIs and makes no live business-data aggregation claim. It links to each provider dashboard. The existing Stripe finance dashboard is preserved at `/cockpit/stripe`; provider navigation targets were updated accordingly.
- Focused helper/component tests pass 4/4 across two files; scoped Biome check passes for nine formatted files, and SEO dashboard lint passes. F030 remains PARTIAL: OpenSEO/Navigator OAuth, unified metrics/alert composition, and live provider/PostgreSQL/browser journeys remain outstanding.
## F037 permission-safe project unlink update (2026-11-07 10:22 IST)
- The existing project-document Remove action is an unlink operation: it deletes only the `(project_id, collection_item_id)` row in `project_document`. It never deletes `collection_item`, parsed document/chunks, or the storage object, so the same source remains available to its knowledge collection and other projects.
- Before unlinking, the route now resolves the source through the attached collection and currently eligible collection owners, then rechecks live project access, editor role, attachment, and collection-owner scope immediately before mutation. Revoked access, role downgrade, detached collection, or removed owner scope fail without changing data.
- Focused unlink API tests pass 4/4; scoped Biome and diff checks pass. No schema change or live PostgreSQL journey was needed/run.
- Correction to older F037 gap notes: a project unlink API and UI already exist; only destructive source deletion/object cleanup and other listed capabilities remain. This batch does not claim collection item deletion or storage garbage collection parity. F037 remains PARTIAL.
## F010 nightly dream-run project coverage (2026-11-07)
- Nightly dream-cycle discovery now pages successful source-ingest runs using a stable project cursor and no longer requires an accepted-fact row to exist. Successful zero-fact ingest runs therefore remain eligible for the existing daily idempotent dream run; the previous first-100 project cap is removed.
- Current project/source access checks and daily deduplication remain in place. Regression test covers 102 projects, an empty-fact success shape, cursor paging, and an unauthorized first project.
- Evidence: `src/lib/projects/brain-dream.ts`, `src/lib/projects/brain-dream.test.ts`. F010 remains PARTIAL: no live PostgreSQL scheduler/worker run, model deduplication remains human-reviewed, and broader dream-stage parity remains.