# Testing report ? checkpoint 1

- Focused auth/config: 36/36 pass.
- Storage/CSP/auth affected suites: 21/21 pass after baseline fixes.
- Payment canonical encoding plus affected suites: 31/31 pass.
- Full unit suite: **103 files, 976 tests pass**, using
  `pnpm test --maxWorkers=2 --testTimeout=30000`.
- TypeScript: `pnpm check-types` passed after callback and storage refactor.
- All 16 changed source/test files pass targeted Biome lint; whitespace check passes.
- Whole-project Next lint had existing image warnings; initial Biome found two
  pre-existing unused bindings, now corrected. Final `pnpm lint` passed (existing Next image warnings only).
- Live unauthenticated /chat/integration-probe?mode=tools returned 307 with
  callbackUrl preserved exactly in the sign-in location. First sign-in SSR request
  timed out during dev compilation; final retry returned HTTP 200 and rendered
  the exact requested callback. Interactive Google/email completion and
  signup continuity are implemented but not certified end-to-end this checkpoint.
- Production build: **not run**; required remaining gate. The live original server
  owns .next, so build must use isolated output or a coordinated stop/restart.
- No external model, device, push, cloud upload or delivery tests fabricated.

## Failure classification and remediation

Initial full suite: 972 pass / 3 fail. S3 diagnostic initialization threw before
validation (baseline bug fixed by driver module extraction); stale CSP assertion
(baseline test fixed without changing the policy); cold module import timeout
(environment/load). Next run exposed a nondeterministic existing payment-signature
alias acceptance; fixed canonical encoding with deterministic regression. Final
full suite passes with limited workers and explicit 30s timeout. Initial full lint
unused bindings were baseline findings, now corrected. No ignored failure remains
in the recorded final full unit invocation.

## Checkpoint 2 � bounded history

- `src/lib/db/pg/repositories/chat-repository.pagination.test.ts`: 2/2 pass.
- `pnpm check-types`: pass after normalizing the thread-decision JSON write shape to the database `{text, at}` representation.
- Targeted Biome check: implementation files pass; pagination test formatted and checked. `git diff --check` passes (Git reports expected CRLF normalization notes).
- Postgres-backed load-older workflow and production build: not run in this batch.

## Checkpoint 3 - history and HITL system

- Pagination and HITL schema tests: 9/9 pass across 2 files.
- The pagination test compiles the generated Drizzle predicate with `PgDialect` and checks thread scoping, cursor subquery, and chronological page reversal.
- `pnpm check-types`: pass. Targeted Biome: pass. `git diff --check`: pass.
- Postgres-backed chat workflow, browser-driven HITL journeys, live email send, full unit suite, lint, and production build: not run in this batch.

## Checkpoint 4 - knowledge scope

- Focused suites for RAG retrieval, bounded history and HITL: 20/20 passed.
- `pnpm check-types`: first run found `null` incompatible with the optional array request contract; changed the legacy/all payload to omit the field. Final type check and formatting checks pending.
- Schema migration is authored but unapplied. No Postgres-backed selector/persistence/retrieval journey or production build has run.
Final checkpoint 4 verification: focused tests passed 20/20; `pnpm check-types` passed; `biome check --formatter-enabled=false` passed on the 9 touched implementation/test files; `git diff --check` passed (Git only reported line-ending normalization notices). Full Biome formatting mode still reports formatter diffs in the large existing `src/lib/rag/retrieve.ts` and `src/lib/db/pg/schema.pg.ts`; they were not mass-reformatted to avoid unrelated churn. No database, production build, full suite or push performed.
## Checkpoint 5 - create-agent approval

- `src/lib/ai/tools/hitl/index.test.ts` plus RAG and history regressions: 21/21 passed.
- `pnpm check-types`: passed.
- Formatter-disabled Biome checks passed for HITL tool/card/message integration; the new HITL files were formatted. No browser-authenticated create/deny journey or POST failure/idempotency test was run.
## Checkpoint 6 - agent approval idempotency

- Focused RAG/history/HITL and agent route suites: 27/27 passed.
- `pnpm check-types`: passed.
- `pnpm exec drizzle-kit check`: passed (migration journal consistency only; did not connect to a database).
- Formatter-disabled targeted Biome: passed on 10 touched code/test files; focused new files were formatted. `git diff --check` passed with line-ending normalization notices.
- No Postgres concurrency test, production build, full suite, browser auth flow, or migration application was run.
## Project workspace checkpoint
- `policy.test.ts` plus existing agent/HITL/RAG/history focused tests: 30/30 pass.
- `pnpm check-types`: passed.
- Formatter-disabled targeted Biome: passed after import sorting.
- `pnpm exec drizzle-kit check`: passed (journal consistency only; no DB connection).
- `git diff --check`: passed; Git reports line-ending normalization notices on preexisting modified files.
- Production build, local Postgres migration/integration, and browser journey: not run.

Production build after project workspace integration: `pnpm build` exited 0 and generated `/projects`. Compilation and static generation succeeded. Existing warnings include Next workspace-root inference from `C:\Users\Ikra\package-lock.json` versus this repo's `pnpm-lock.yaml`, dynamic server usage notices during static probing, upstream dependency warnings, and existing `<img>` lint warnings. Build used local `.env` files, did not apply migrations, and performed no explicit database write. Postgres-backed feature verification is still pending.

Full regression follow-up: the complete Vitest suite passed 996 tests across 108 files after Checkpoint 7. Expected tests intentionally log simulated provider/database failures; the suite exit code was 0. Production build passed separately.

Team workspace selector follow-up after the full regression/build checkpoint: `pnpm check-types` passed, formatter-disabled targeted Biome passed, and `policy.test.ts` passed 3/3. Full suite/build were not repeated after this small UI/API listing addition.

## Project brain source-analysis checkpoint
- Full Vitest suite: 999 passed across 109 test files (exit 0; expected mocked failures appear in logs).
- Focused project policy/schema tests: 6/6 passed.
- `pnpm check-types`: pass.
- Targeted formatter-disabled Biome: pass.
- `pnpm exec drizzle-kit check`: pass (migration journal consistency, no database connection).
- `pnpm build`: pass; `/projects` route built. Existing Next workspace-root, dependency, dynamic rendering, and `<img>` warnings remain non-fatal.
- `git diff --check`: pass with line-ending normalization notices.
- Not verified: production/local PostgreSQL application, authenticated browser workflow, live model provider behavior, asynchronous job semantics (not implemented).

## Graph/conflict verification follow-up
- Full Vitest: 1,002 tests passed across 110 files.
- Focused project brain/policy suites: 9/9 passed.
- TypeScript and formatter-disabled targeted Biome passed.
- Production build passed, including `/projects` with React Flow; existing warnings remain non-fatal.
- No Postgres-backed lock/concurrency or browser conflict-resolution journey was run.

## Tabular review verification
- Focused tabular schema/routes and chat pagination tests: 12/12 pass.
- `pnpm check-types`: pass.
- `pnpm exec drizzle-kit check`: pass (journal/schema consistency only; no database connection).
- Focused formatter-disabled Biome and `git diff --check`: pass.
- `pnpm build`: pass; new `/tabular-reviews` and `/tabular-reviews/[id]` routes emitted. Existing workspace-root, dependency, dynamic-render and `<img>` warnings remain.
- Not verified: migration 0037 applied to PostgreSQL, row-lock concurrency, live AI provider completion, authenticated browser journey, or real client disconnect handling.- Full regression after the tabular review batch: `pnpm test` passed 1,014 tests across 114 files (exit 0; expected mocked failure-path logs were emitted).
## Cell edit and targeted regeneration verification (2026-11-05)
- Focused tests: 9 passed across three files; the full Vitest suite passed 1,017 tests across 115 files.
- pnpm check-types, focused formatter-disabled Biome, git diff --check, and production pnpm build passed. The build emitted the existing workspace-root, dependency dynamic-import, dynamic-route, img, and optional Redis/E2B configuration warnings.
- Cell input is size-capped and ownership/scope checked; no Postgres-backed route or live AI provider journey was verified because migrations are unapplied and provider execution was not configured.
## Browser voice transcript persistence verification (2026-11-05)
- Focused voice contract and authenticated route tests passed 7/7; full Vitest passed 1,024 tests across 117 files.
- TypeScript and focused formatter-disabled Biome passed.
- First production build attempt failed while prerendering / with a webpack runtime undefined-call error. A clean rerun passed compilation, type/lint, all 189 static pages, trace collection, and emitted /api/voice/session-thread. No code/config change was made between attempts.
- Build warnings include existing workspace-root inference, dynamic dependency analysis (e2b/unpdf), dynamic server route probes, <img>, missing optional Redis/E2B configuration, and PostgreSQL SSL-mode future semantics.
- No PostgreSQL-backed ownership verification, authenticated browser session, live voice provider, or hardware gateway was exercised.
## Notifications and web-push batch (2026-11-05)
- Focused notification/scheduler contract tests passed 7/7; focused cross-feature checks passed 25/25. Full Vitest passed 1,031 tests across 119 files.
- `pnpm check-types`, `pnpm exec drizzle-kit check`, `git diff --check`, and focused formatter-disabled Biome passed.
- Production build is running at checkpoint time. VAPID delivery, PostgreSQL-backed constraints/authorization, browser permission and push receipt were not exercised; migration 0038 remains unapplied.
- Production build attempt 1 compiled and passed type/lint checks but failed prerendering `/` with the intermittent webpack-runtime `undefined.call` error already observed on the voice checkpoint. With no source change between attempts, a second `pnpm build` completed successfully, generated 191/191 static pages, finalized traces and emitted `/notifications`, `/api/notifications`, `/api/push/subscribe`, and `/api/push/test`.
- Build warnings remain for workspace-root inference, existing E2B/unpdf dynamic dependencies, user-session dynamic probes, optional Redis/E2B configuration, PostgreSQL SSL-mode future semantics and existing `<img>` usage. No new notification-specific build warning was observed.

## Physical voice-device pairing foundation (2026-11-05)
- Focused credential, device-schema and notification tests passed 11/11; full suite passed 1,035 tests across 121 files.
- `pnpm check-types`, targeted formatter-disabled Biome, `pnpm exec drizzle-kit check`, and `git diff --check` passed.
- `pnpm build` passed, generated 192/192 static pages and emitted `/voice-devices`. Warnings remain for workspace-root inference, existing e2b/unpdf dynamic imports, session-dependent static probes, optional Redis/E2B configuration, PostgreSQL SSL-mode future semantics and existing `<img>` usage.
- Migration 0039 remains unapplied. No PostgreSQL transaction race, real device, gateway, transcript or audio workflow was exercised.

## Voice device transcript delivery (2026-11-05)
- Focused contract and route tests passed 6/6, covering active-device authentication, per-device throttling, strict bounds/unknown-field rejection, owner-thread persistence, and foreign-owner collision rejection.
- Initial `pnpm check-types` found a type mismatch because ChatMetadata only allowed browser voice as a source. Expanded its metadata type for the device source and scoped identifiers; rerun type check and Biome are in progress.
- Not verified yet: PostgreSQL uniqueness/ownership behavior, audio capture/STT, gateway connectivity, authenticated browser chat display, production build, or hardware.
- Final local validation: `pnpm check-types` passed; targeted formatter-disabled Biome passed for all five touched source/type files; focused device transcript tests passed 6/6. Production build remains the next gate.
- Production build subsequently passed: `pnpm build` compiled, passed lint/type checks, generated all 192/192 static pages, and emitted `/api/voice/transcript`. Existing dependency analysis warnings (`e2b`/`unpdf`), `<img>` warnings, dynamic-session prerender probes, and missing optional Redis/E2B warnings remain. The transcript route was not called against PostgreSQL because migration 0039 is unapplied.

## Voice device audio command batch (2026-11-05)
- Focused transcript/audio schema and route suite passed 13/13.
- pnpm check-types passed. Targeted formatter-disabled Biome passed across 10 affected source/type/test files; git diff --check passed with the repository's existing line-ending notices.
- Production build after adding /api/voice/audio-command is pending. No live Sarvam proxy, PostgreSQL migration, authenticated device or physical hardware was tested.
- Full regression after the audio ingress batch passed: 1,048 tests across 125 files. This includes the added stable-ID separator-ambiguity case. Production build had passed immediately before that final deterministic-hash serialization refinement; a build against the final source state is in progress.
- Production `pnpm build` passed against the audio endpoint and final idempotency encoding; all 192 static pages generated and `/api/voice/audio-command` was included. Existing dependency/dynamic-session/image/optional-service warnings remain. No Postgres, Sarvam, hardware, or gateway was exercised.

## Desktop companion checkpoint (2026-11-05)
- `pnpm --dir apps/desktop typecheck`: passed.
- `pnpm --dir apps/desktop build`: passed (main and preload esbuild bundles).
- Electron v35.7.5 install/binary check: passed after allowing the Electron package install script in the standalone desktop package config.
- Focused Vitest: 11/11 across desktop MCP policy, desktop auth handoff, and chat pagination tests.
- `pnpm check-types`: passed.
- Targeted `pnpm exec biome check --formatter-enabled=false ...`: passed after import-order corrections.
- `pnpm build`: running; record final result when process completes.
- No PostgreSQL-backed auth, OAuth, native MCP server, live consent, hardware, deployment or GitHub push was performed.
- Final production verification update: `pnpm build` retry passed after the first attempt failed during `/` prerender with the known intermittent `webpack-runtime` `undefined.call` error. The retry compiled successfully, passed Next lint/type checks, generated 192/192 pages, and emitted `/desktop/auth/complete` plus `/mcp/test/[id]`. Existing non-blocking dependency-analysis, image, workspace-root, dynamic-session probe, optional Redis/E2B, and PostgreSQL SSL-mode warnings remain. No DB-backed auth or desktop OAuth/MCP journey was run.

## F025 Gmail approval verification (2026-11-05)
- Focused email/agent approval tests: 19 passed across six files after mocking the server-only boundary for the repository unit test.
- Full `pnpm test`: 1,064 tests passed across 131 files.
- `pnpm check-types`: passed.
- Focused formatter-disabled Biome: 10 files checked, no findings after import ordering.
- `git diff --check`: passed; only pre-existing LF/CRLF normalization notices.
- `pnpm build`: in progress for the updated approval code. No PostgreSQL-backed token race, live Gmail provider, or browser end-to-end run; no production data, deploy, or push.

- Final source-state build for F025: `pnpm build` exited 0, passed Next compile/lint/type checks, generated all 192/192 static pages and emitted `/api/approvals/email` plus the Gmail tool runtime. Build shows pre-existing optional Redis/E2B and SSL-mode warnings and dynamic-session prerender probe logs; no DB-backed or live Gmail workflow ran.

- Project knowledge graph chat tool: focused tests passed 6/6 (tool + existing graph logic); `pnpm check-types` passed; new modules passed Biome; `src/app/api/chat/route.ts` passed Biome with formatter disabled to avoid unrelated pre-existing formatting changes; `git diff --check` passed.
- Project knowledge graph source-state `pnpm build`: passed, including 192/192 pages; existing optional service/configuration and dynamic-route warnings remain. No Postgres-backed/browser/provider journey was available.

- Project graph hardening follow-up: added a second in-process result filter for accepted facts, ready sources, currently attached collection IDs, and current collection owners, in addition to the database predicates. Focused tests (6/6) and root typecheck passed after this change; the final `pnpm build` passed and generated 192/192 pages. No Postgres/browser workflow was run.

- AssemblyAI dictation: focused route/contract tests 7/7; root `pnpm check-types` passed; focused Biome and prompt-input import/lint check passed; `git diff --check` passed with existing line-ending warnings.
- Final source-state `pnpm build` passed (exit 0), generated 192/192 pages, and emitted `/api/assemblyai/token`. Existing dependency-analysis, image, missing optional Redis/E2B config, PostgreSQL SSL-mode, and dynamic-session prerender probe warnings remain. No real AssemblyAI API key/browser microphone flow was exercised.

## Project-brain durable queue verification (2026-11-05)
- Focused project-brain/API suite: 8/8. Full Vitest: 1,076 tests across 134 files.
- `pnpm check-types`, `pnpm exec drizzle-kit check`, focused formatter-disabled Biome, `git diff --check`, and exact-source `pnpm build` passed. Build generated 192/192 pages.
- Build warnings remain for workspace-root inference, dynamic dependency analysis, existing image usage, optional Redis/E2B config, PostgreSQL SSL-mode future semantics, and dynamic-session prerender probes.
- Queue tests use mocks; migration `0040_project_brain_queue.sql` is unapplied. No Postgres `SKIP LOCKED`/lease race, authenticated browser polling, or live model inference was executed. Full-suite mocked failure-path logs are expected; Vitest exited 0.

## Google Calendar mutation approval verification (2026-11-05)
- Focused schema, approval API, HITL tool, and provider connector suite: 14/14 passed, including missing/invalid/replayed approval blocking and stale event deletion prevention.
- Full Vitest passed 1,086 tests across 137 files. Root `pnpm check-types`, focused formatter-disabled Biome, `git diff --check`, and exact-source `pnpm build` passed; build generated 192/192 pages.
- Existing build warnings remain for workspace-root inference, E2B/unpdf dependency analysis, image usage, optional Redis/E2B config, PostgreSQL SSL semantics, and dynamic-session prerender probes.
- Not run: Google OAuth/provider calls, PostgreSQL-backed token replay race, browser approval/edit flow, all-day event workflow. No schema migration added.

## Project-brain ingestion trigger verification (2026-11-05)
- Focused collection ingestion/project brain tests: 11/11 passed. Full `pnpm test`: 1,089 tests passed across 138 files.
- `pnpm check-types`, `pnpm exec drizzle-kit check`, focused Biome with formatting disabled for pre-existing formatting in these files, and `git diff --check` passed.
- Exact-source production build passed (exit 0), generated 192/192 pages. Existing dependency-analysis, `<img>`, missing optional Redis/E2B configuration, PostgreSQL SSL-mode, and dynamic-session prerender warnings remain.
- No live PostgreSQL, multi-instance rate-limit, provider, or browser journey was run. Migration 0040 remains unapplied.

## Linear issue creation approval verification (2026-11-06)
- Focused Linear endpoint, connector, and HITL schema tests passed 11/11. Full Vitest passed 1,095 tests across 140 files.
- `pnpm check-types`, focused Biome, and `git diff --check` passed. Exact-source `pnpm build` passed with 192/192 pages generated.
- Build warnings remain for workspace lockfile inference, E2B/unpdf dependency analysis, existing `<img>` uses, optional Redis/E2B configuration, PostgreSQL SSL mode semantics, and dynamic-route prerender probes.
- Not verified: live Linear OAuth/API behavior, Postgres atomic replay race, and interactive browser review. No schema migration or new dependency.

## Slack message approval verification (2026-11-06)
- Focused Slack approval route/connector/HITL suite passed 12/12. Full Vitest passed 1,101 tests across 142 files.
- `pnpm check-types`, focused Biome, `git diff --check`, and exact-source production build passed; build generated 192/192 pages.
- Existing build warnings include workspace lockfile inference, E2B/unpdf dependency analysis, `<img>` usage, optional Redis/E2B configuration, PostgreSQL SSL semantics, and dynamic-session prerender probes.
- No live Slack API/OAuth, Postgres replay race, or interactive browser journey was run. No database migration/dependency was added.

## Structured project-brain extraction verification (2026-11-06)
- Focused brain schema/graph/API/ingestion suite: 16/16 passed. Full Vitest: 1,103 tests passed across 142 files.
- `pnpm check-types`, focused Biome, and `git diff --check` passed. Exact-source `pnpm build` passed, generating 192/192 pages.
- Existing build warnings remain: workspace lockfile inference, E2B/unpdf dynamic dependency analysis, image usage, optional Redis/E2B config, PostgreSQL SSL-mode future semantics, and dynamic-session prerender probes.
- Tests validate schema filtering, grounded-evidence admission and adaptation to reviewable triples. No live model/provider, PostgreSQL queue, or browser experience was run. No schema migration/dependency was added.

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

## Zendesk approval checks (2026-11-06)
- Combined Zendesk/Jira/HITL/API focused run: 22 tests passed across 7 files. Zendesk-focused run including repository tests: 17 tests passed across 5 files.
- Root TypeScript check passed; targeted Biome check passed after import sorting; `git diff --check` passed (Git reports existing LF-to-CRLF working-copy notices).
- Tests use mocked connector credentials/database; no live Zendesk or PostgreSQL workflow was verified. Full suite/build pending.
## Zendesk approval final verification (2026-11-06)
- `pnpm test`: passed, 1,132 tests across 152 files.
- Root TypeScript check passed. Targeted Biome passed after import organization; `git diff --check` passed.
- `pnpm build`: passed; production compiler/type validation succeeded and all 192/192 pages were generated. Existing workspace-root, dependency-analysis, dynamic-session prerender, optional Redis/E2B, image, and PostgreSQL SSL-mode warnings were emitted. `/api/approvals/zendesk` appears in the route table.
- Live Zendesk/PostgreSQL verification unavailable; F025 remains partial.
## Freshdesk approval checks (2026-11-06)
- Focused Freshdesk/HITL/API/repository tests: 16/16 across 5 files. Full `pnpm test`: 1,140/1,140 across 156 files.
- Root typecheck passed after discriminated payload guards. Targeted Biome passed; `git diff --check` passed, with existing Git line-ending notices.
- Freshdesk tests mock DB/credentials and provider fetch; no live service or Postgres race was verified. Fresh final production build pending.
## Freshdesk final verification update (2026-11-06)
- Fresh source-state `pnpm build` passed after Freshdesk integration; generated all 192/192 pages and included `/api/approvals/freshdesk` in the route table. Existing workspace, optional-service, dynamic-session, dependency-analysis, image, and SSL warnings remain.
- Freshdesk batch is locally verified by tests/typecheck/build, but live Freshdesk/PostgreSQL/browser behavior remains unverified.
## External messaging approval tests (2026-11-06)
- Focused connector/schema/route/repository tests: 16 passed across 5 files. Full `pnpm test`: 1,148 passed across 160 files.
- TypeScript check with an increased Node heap completed without diagnostics after the default heap run hit Node's ~2 GB allocation limit. Targeted Biome passed; `git diff --check` passed with existing line-ending notices.
- Fresh production build pending. Live Teams/Discord/Zulip/PostgreSQL workflows are unverified.
## External messaging approval build verification (2026-11-06)
- Fresh `pnpm build` passed after the shared Teams/Discord/Zulip approval changes; Next completed type validation, generated all 192/192 static pages, and emitted `/api/approvals/messaging`. Existing workspace, dynamic-route, optional-service, dependency-analysis, image and SSL notices remain.
- No provider OAuth or live PostgreSQL tests were possible.
## Task creation approval tests (2026-11-06)
- Focused task creation/schema/API/repository tests: 16/16 across 5 files. Full `pnpm test`: 1,156/1,156 across 164 files.
- TypeScript check with 4 GB Node heap completed without diagnostics; targeted Biome and `git diff --check` passed. Fresh production build pending.
- Tests mock connector tokens, database, and provider fetch; no live Asana/ClickUp/PostgreSQL verification.
## Task creation approval build verification (2026-11-06)
- Fresh `pnpm build` passed after Asana/ClickUp changes; all 192/192 pages generated and `/api/approvals/task-creation` was emitted. Existing project build warnings remain documented.
- Live Asana/ClickUp/PostgreSQL workflows remain unverified.
## Task creation build verification (2026-11-06)
- Fresh `pnpm build` passed after Asana/ClickUp approval changes; all 192/192 pages were generated and the task approval route appeared in the route list. Existing build warnings remain.
- No live external provider or PostgreSQL validation.
## Drive file approval build verification (2026-11-06)
- Fresh `pnpm build` passed after Drive create approval integration, generated 192/192 pages, and emitted `/api/approvals/drive-file`. Standard warnings about inferred workspace root, dynamic routes, optional Redis/E2B, dependency analysis, images and PG SSL remain.
- Google OAuth, live Drive upload and Postgres-backed token replay were not verified.
## Google Drive file approval checks (2026-11-06)
- Focused Drive/HITL/API/repository tests passed 16/16; full `pnpm test` passed 1,164/1,164 across 168 files.
- 4 GB TypeScript check completed without diagnostics. Targeted Biome and `git diff --check` passed. Fresh `pnpm build` passed with 192/192 pages and the Drive approval route.
- The multipart boundary is now random per request; mocked tests verify it. No live OAuth/Drive/PostgreSQL test.
## Productboard and desktop MCP checkpoint (2026-11-06)
- Focused Productboard/task-approval, chat pagination, and desktop policy suites passed: 15/15 across five files.
- Full `pnpm test`: 1,167 passed across 169 files.
- Root TypeScript no-emit check passed with 4 GB heap. `pnpm --dir apps/desktop typecheck` and `pnpm --dir apps/desktop build` passed.
- Targeted Biome and `git diff --check` passed. Fresh `pnpm build` passed and generated 192/192 static pages. Existing workspace-root, dependency-analysis, dynamic prerender, optional Redis/E2B, SSL-mode, and `<img>` warnings remain.
- No live Productboard/PostgreSQL, browser, local desktop consent/OAuth, or MCP process verification.
## Project brain shortest path verification (2026-11-06)
- Focused helper/route tests: 11/11, covering accepted-only paths, one-sided endpoint validation, source visibility, and depth-bounded no-path behavior.
- Full Vitest suite: 1,170 passed across 169 files. Root TypeScript no-emit, focused Biome, and `git diff --check` passed.
- Fresh production build passed with 192/192 static pages. Existing workspace root, optional Redis/E2B, dependency-analysis, dynamic-page, SSL-mode, and image warnings remain. No live Postgres/browser workflow.
## Project-brain expert-routing verification (2026-11-06)
- Focused helper and API tests: 14/14, including person/topic aliases, plural query matching, proposed-claim exclusion, detached-source exclusion, and malformed-query rejection before project/database access.
- Full Vitest suite: 1,173 passed across 169 files. Root TypeScript no-emit (4 GB heap) and targeted formatter/organize-disabled Biome passed.
- Fresh `pnpm build` passed; static generation completed 192/192 pages. Existing warnings include inferred workspace root due multiple lockfiles, dynamic server usage during static probes, optional Redis/E2B config, PostgreSQL SSL-mode future semantics, dependency-analysis warnings, and `<img>` lint warnings.
- No live PostgreSQL, connector, or browser workflow was run.

## Automation run approval verification (2026-11-06)
- Focused approval suites: 9/9 across schema, repository, API, and workflow tool tests.
- Full Vitest suite: 1,182 passed across 173 files. Root TypeScript no-emit (4 GB heap) passed; targeted formatter/organize-disabled Biome passed.
- Fresh `pnpm build` passed, including static generation 192/192 pages. Existing workspace-root, dependency-analysis, dynamic-route probe, optional Redis/E2B, PostgreSQL SSL-mode and `<img>` warnings remain.
- Live Windmill/Activepieces, PostgreSQL token-race, and browser review journey were not available. Saved workflow MCP paths are not included in this verification.

## Remote MCP call approval verification (2026-11-06)
- Focused MCP approval tests: 9/9 across payload schema/hash, digest-only repository, authenticated route, and execution helper. Missing user/token and stale/mismatched tokens do not call the MCP effect; exact approval is consumed before effect execution.
- Full Vitest suite: 1,191 passed across 177 files. Root TypeScript no-emit (4 GB heap) and targeted formatter/organize-disabled Biome passed.
- Fresh `pnpm build` passed and generated 192/192 pages. Existing workspace-root, dependency-analysis, dynamic server probe, optional Redis/E2B, PostgreSQL SSL-mode and `<img>` warnings remain.
- No real MCP server, live PostgreSQL token replay/race, or browser review journey was run. Saved workflow/voice/test-page MCP paths are not covered by this check.

## Saved chat workflow approval verification (2026-11-06)
- Focused workflow/access/approval tests: 13/13 across four files. Focused formatter-disabled Biome passed across 11 files. Root `pnpm check-types` passed.
- Full Vitest: 1,197 passed and one `next.config.test.ts` timeout (5-second limit during concurrent 178-file run). Isolated rerun passed 1/1 in 2.42s; treat the full-suite result as one load-related timeout, not as a clean suite.
- Fresh `pnpm build` passed; 192/192 static pages generated and `/api/approvals/workflow-run` emitted. Existing dependency, image, dynamic-page, Redis/E2B, PostgreSQL SSL, and workspace-root warnings remain.
- No live PostgreSQL, browser workflow, remote MCP server, or external automation workflow run.

## Voice MCP approval verification (2026-11-06)
- Full suite passed 1,202/1,202 tests across 179 files with `pnpm test -- --maxWorkers=2`; lowering worker concurrency avoids the unrelated 5-second Next config test timeout seen under default parallel load.
- Latest focused voice/MCP issuance/execution tests passed 11/11; schema field stripping tests ensure voice providers do not receive the internal approval property. Focused formatter-disabled Biome passed.
- Root 4 GB TypeScript no-emit check passed before the pure schema helper was added; the final `pnpm build` also passed Next's lint/type stage and generated 192/192 static pages after all changes.
- Build warnings remain: inferred workspace root, dynamic request during static probes, optional Redis/Upstash and E2B config, PG SSL compatibility, E2B/unpdf dependency-analysis warnings, and existing `<img>` lint warnings. No live provider/browser/PostgreSQL/MCP verification.

## Workflow approval / HTTP SSRF batch (2026-11-06 04:56 IST)
- pnpm exec vitest run src/lib/webhooks/url-guard.test.ts src/lib/ai/workflow/workflow-review.test.ts src/lib/ai/workflow/load-approved-workflow.test.ts src/app/api/approvals/workflow-run/route.test.ts src/lib/ai/tools/hitl/workflow-run-approval.test.ts --maxWorkers=2 — PASS, 23 tests / 5 files.
- pnpm check-types — PASS.
- Existing URL guard tests plus added graph stability/manifest secrecy/graph edit/API revision checks passed. No PostgreSQL, browser, external MCP, or live outbound HTTP verification in this batch.
- Final verification for this source batch (2026-11-06 05:08 IST): pnpm build passed; Next compiled, ran lint/type checking, and generated 192/192 pages. Existing workspace-root, dynamic-route, E2B/unpdf, optional Redis, PostgreSQL SSL and image warnings remain. git diff --check passed (only pre-existing LF/CRLF notices).
- Build rerun note: first attempt exposed unsupported BigInt literals in the IPv6 helper. The helper was rewritten with ES2019-compatible 16-bit group checks; all focused tests/typecheck/lint and the subsequent production build passed.

## n8n workflow execute route (2026-11-06)
- `pnpm exec vitest run 'src/app/api/workflow/[id]/execute/route.test.ts' --maxWorkers=2` — PASS, 3 tests.
- `pnpm check-types` — PASS.
- Focused `pnpm exec biome lint` on the route and tests — PASS.
- `git diff --check` — PASS; only pre-existing line-ending normalization warnings.
- No live n8n account/provider run performed.

## Embedded workflow MCP access batch (2026-11-06 05:29 IST)
- Focused helper, saved-workflow load and approval API suites — PASS, 13 tests.
- URL guard and workflow review suite — PASS, 24 tests in the earlier combined run; includes public/private mapped IPv6 and NAT64 cases.
- n8n execute route suite — PASS, 3 tests.
- `pnpm check-types` default 2 GB heap — process OOM; rerun with `NODE_OPTIONS=--max-old-space-size=4096` — PASS.
- `pnpm exec biome lint` on the affected helper/route/test sources — PASS.
- `pnpm build` — PASS; Next generated 192/192 pages. Existing E2B/unpdf, dynamic route, optional Redis, SSL, workspace-root, and `<img>` warnings are non-fatal.
- `git diff --check` is rerun after the context/doc append in this checkpoint; only line-ending normalization notices are expected from existing work.
## Project-brain source visibility batch (2026-11-06)

- Focused brain overview, conflict route, and chat pagination tests: 15/15 passed.
- `NODE_OPTIONS=--max-old-space-size=4096 pnpm check-types`: passed.
- Focused Biome check for the four changed project-brain route/test files: passed after correcting import order.
- `pnpm build`: passed; Next generated 192/192 pages. Existing optional service/configuration, dynamic rendering/workspace, dependency analysis, PostgreSQL SSL semantics, and `<img>` warnings remain.
- No live PostgreSQL, browser journey, or production service was used.
### Alias collision regression (2026-11-06)

`src/lib/projects/brain-graph.test.ts` covers two person entities sharing the same accepted alias; query-by-alias returns no guessed routing result, while an unambiguous topic still finds both connected experts. Included in the 17/17 focused brain route/graph suite above; TypeScript and focused Biome checks pass.
## Typed project-brain page foundation (2026-11-06)

- Focused brain schema, graph, pages API, overview and contradiction tests: 29/29 passed.
- `NODE_OPTIONS=--max-old-space-size=4096 pnpm check-types`: passed.
- Focused Biome for page schema, queue, route/UI and tests: passed.
- `pnpm db:check`: passed; this validates migration journal consistency only, not applying SQL or PostgreSQL runtime semantics.
- `pnpm build`: passed; Next generated 192/192 pages. Non-fatal warnings include workspace root/dynamic server rendering, optional Redis/E2B config, E2B/unpdf dependency analysis, PostgreSQL SSL-mode semantics, and `<img>` use.
- No live PostgreSQL, browser, or external AI provider test; migration `0042` remains unapplied.
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
Added a bounded recent-history endpoint at /api/voice/devices/[id]/history and a per-device history view. It reads only user-role transcript messages explicitly tagged source=voice_device and the exact device ID, joins through both the owning device and owning chat thread, validates a 1–50 limit, applies per-user rate limiting, returns no-store responses, and exposes only text/language/timestamp/thread link. This reuses Void-Agent's existing transcript-as-reviewable-chat workflow rather than creating a competing transcript/action database.
- Evidence: src/lib/db/pg/repositories/voice-device-repository.pg.ts, new history route/tests, src/components/voice-devices-dashboard.tsx.
- Verification: focused history/device audio/transcript tests 7/7; focused Biome passed; root typecheck passed with NODE_OPTIONS=--max-old-space-size=4096 (default 2 GB process OOMed); fresh pnpm build passed and generated 192/192 pages. Existing nonfatal build warnings remain.
- Limits: no PostgreSQL-backed query, browser or hardware test; migration 0039 is unapplied. Firmware registration bootstrap and session/segment database, gateway/WebSocket transport and approved-action protocol are still absent. The reference checkout itself has no bridge script and its websocket route requires an external gateway. F027 remains PARTIAL.
## F027 device transcript history parity update (2026-11-06 07:02:36 +05:30)
The earlier F027 row listed device history as missing. The new authenticated history API and device-specific dashboard now cover recent transcript browsing from messages saved by the enrolled-device flow. This is not a dedicated event/action history: device audio sessions, registration bootstrap, firmware setup status and live WebSocket bridge are still incomplete. Treat the old row as superseded only for history browsing; F027 remains PARTIAL.
## F019 resumable chat stream verification (2026-11-06)
- Focused Vitest: context + resume endpoint + stop endpoint, 10/10 tests passed, including wrong owner/session, no active buffer, resumption, stop authorization/origin/rate-limit, and Redis stop-write failure.
- Targeted Biome check passed for 8 stream, route, test, and UI files. `pnpm check-types` passed with `NODE_OPTIONS=--max-old-space-size=4096`. `git diff --check` passed with existing LF/CRLF warnings.
- A fresh production build had passed immediately before the final stop-error UI/API refinement (192/192 pages); it was not rerun after that small change. No live Redis, PostgreSQL, browser, provider, push, deploy, or DB migration test was run.
## Fresh production build after F019 stop-path refinement (2026-11-06)
- `pnpm build`: passed, exit code 0; production output generated 192/192 static pages. Build reran Next lint/type validation and passed after the stop API failure handling and client notification changes.
- Existing emitted warnings: multiple lockfiles/workspace root inference; E2B and Redis/Upstash not configured; dynamic server usage messages during static collection; PostgreSQL SSL mode future-semantics warning; dependency-analysis and image optimization warnings. These did not fail the build.
- Voice command comparison was source-level only; no live device, microphone, provider, PostgreSQL, or gateway test.
## F026/F027 voice session lifecycle verification (2026-11-06)
- New session contract/start/segment/finalize focused suites: 9/9 tests passed (body bounds, no spoofable identity fields, start authorization/rate limits, segment status/replay conflict handling, empty/idempotent finalization behavior).
- Existing voice audio-command, transcript and device-history suites: 10/10 passed. Root TypeScript no-emit passed with 4 GB heap; `pnpm db:check` passed; focused Biome passed for 10 changed source/test files; `git diff --check` passed with LF/CRLF warnings.
- Fresh `pnpm build` exited 0 and generated 192/192 pages, including voice session APIs. Existing warnings include Next workspace root, dynamic server rendering messages, optional Redis/E2B configuration, PostgreSQL SSL semantics, dependency analysis and images. The final repository formatting-only pass occurred after this build.
- No live PostgreSQL migration/concurrency, browser, device firmware/gateway, audio provider, push, deploy or production database check. Migration 0043 is unapplied.
## F026/F027 owner-facing persisted session history (2026-11-06)
- Added a user-session-authenticated, rate-limited, no-store owner API for recent voice-device sessions. Repository query scopes by device and owner and returns no more than 50 sessions with at most 24,000 transcript characters each.
- Device dashboard history now loads both saved reviewable chat transcripts and persisted audio sessions, showing session status, segment count, timestamps, and transcript text.
- Focused sessions/history route tests passed 5/5; focused Biome formatting completed. Full typecheck is running; no PostgreSQL/device/gateway/browser test. F026/F027 remain PARTIAL because firmware/gateway transport is not present and no live integration has been verified. No migration applied, push or deploy.

## F026/F027 owner-facing session history verification (2026-11-06 08:03 IST)
- Correction to the preceding checkpoint note: 4 GB `pnpm check-types` completed successfully (exit 0).
- Focused session/history route tests passed 5/5. Targeted Biome passed. Fresh `pnpm build` exited 0, compiled with existing dependency warnings, passed type/lint validation and generated 192/192 static pages. Build-time logs continue to include known dynamic-server usage diagnostics for authenticated routes, optional Redis/E2B configuration warnings, PostgreSQL SSL mode notice, and image/dependency warnings.
- No PostgreSQL query/migration, device, gateway or browser journey was run; migration 0043 remains unapplied. The session query and hardware workflow still need live local verification. No push or deploy.

## F018 file/document ingestion checkpoint (2026-11-06)
- Focused reader and storage suites: 82/82 passed across 10 test files, including an ExcelJS-generated XLSX parsed end-to-end and owner-boundary cases.
- Scoped Biome check/format passed on the changed implementation/test files; `git diff --check` passed with line-ending normalization warnings.
- `pnpm check-types` passed with `NODE_OPTIONS=--max-old-space-size=4096`.
- Fresh `pnpm build` exited 0; Next generated 192/192 static pages. Non-fatal logs included workspace/lockfile detection, unset optional Redis/Upstash/E2B credentials, dynamic-server diagnostics for authenticated routes, PostgreSQL SSL-mode notice, dependency analysis and `<img>` optimization warnings.
- Not run: full unit suite, live PostgreSQL migration/query, storage-provider/browser upload, legacy object migration, external model attachment journey. No claim of end-to-end deployment parity.

## F010 immutable source snapshot verification (2026-11-06)
- Focused project source-version and brain enqueue API suites: 13/13 tests passed, including exact snapshot use when the live document changes, rejection of modified legacy source, fingerprint mismatch, metadata conflict, and safe legacy snapshot hydration.
- `pnpm db:check` passed with migration 0044 journaled; scoped Biome passed; 4 GB heap `pnpm check-types` passed.
- Fresh `pnpm build` exited 0 and generated 192/192 pages. Existing warnings: dependency-analysis, `<img>`, optional Redis/Upstash/E2B config, dynamic server usage, workspace root/multiple lockfiles and PostgreSQL SSL semantics.
- No live PostgreSQL migration/transaction/concurrency, browser, provider or storage run. Migration unapplied; no push/deploy.

## F010 source revision viewer verification (2026-11-06)
- Revision detail route + source-version helper + brain overview route tests: 16/16 passed.
- `pnpm check-types` passed with a 4 GB heap; targeted Biome check passed.
- Fresh `pnpm build` exited 0 and generated 192/192 pages, including the revision API. Nonfatal warnings remain: dynamic rendering diagnostics for authenticated pages, missing optional Redis/Upstash/E2B config, PostgreSQL SSL mode notice, workspace lockfiles, dependency analysis and image optimization.
- Not verified: live PostgreSQL access/revocation, browser viewer, migration 0044 execution or project concurrency. No DB apply, push or deploy.

## F021 desktop navigation/download checks (2026-11-06)
- pnpm exec vitest run apps/desktop/src/main/external-links.test.ts apps/desktop/src/main/download-paths.test.ts: 6/6 passed (after adapting a path assertion to the host OS).
- pnpm --dir apps/desktop typecheck: passed. pnpm --dir apps/desktop build: passed. Targeted Biome formatting/check passed; git diff --check -- apps/desktop/src/main passed.
- No live Electron UI, server export endpoint, or platform notification was tested.


## F014 citation prompt checks (2026-11-06)
- Tabular review schema/cell and API suites: 10/10 passed.
- Targeted Biome check passed after formatting. Prompt assertions cover numbered citation markers, the citations block, exact quotes, and no citation instructions for text columns.


## F010/F011 project task review verification (2026-11-06)
- `pnpm exec vitest run src/lib/projects/brain-schema.test.ts src/app/api/projects/[id]/brain/route.test.ts src/app/api/projects/[id]/brain/todos/[todoId]/route.test.ts`: 19/19 passed.
- `pnpm db:check`: passed. `pnpm check-types` with 4 GB Node heap: exit 0. Targeted Biome: passed. `pnpm build`: exit 0, 192/192 pages generated; existing workspace, dependency, optional environment and dynamic-route warnings remain.
- No real PostgreSQL migration/query, AI provider, or browser task workflow was run. Migration 0045 remains unapplied.


## F010 project connector sync audit (2026-11-06)
Read-only source tracing confirmed the reference implements editor attach, manual queued sync, read-only action filtering, bounded gathered data, classification of failed tool results, source persistence, and detach cleanup. Primary has no equivalent project-bound sync data model. This audit adds no tests and claims no integration verification; the upcoming implementation requires mocked authorization/provider tests plus a disposable PostgreSQL and UI workflow where available.

## F010 MCP connector sync validation (2026-11-06)
- MCP annotation propagation + project MCP argument/result/allowlist helper tests and MCP manager suite: 30/30 passed.
- pnpm db:check passed. Full TypeScript check (pnpm exec tsc --noEmit --pretty false --incremental false) passed. Targeted Biome check passed. Production pnpm build passed, generated 192/192 pages.
- Build warnings remain for inferred workspace root, existing critical dependency/import-meta warnings, existing img usage, dynamic server usage diagnostics, optional Redis/E2B configuration and PostgreSQL SSL-mode behavior.
- No PostgreSQL-backed connector route test, live MCP server, browser workflow or external provider run. Migration 0046 remains unapplied. Composio project sync remains missing; do not claim complete F010 parity.
### Verification update (2026-11-06)
Expanded focused tests to 34/34, including endpoint-level attach policy tests. Re-ran drizzle check, full TypeScript check, targeted Biome and production build after adding fingerprinted source dedupe; all passed, and build generated 192/192 static pages. No live database/MCP/browser execution. Migration 0046 remains unapplied.

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

### F012 contradiction persistence check (2026-11-06 11:18:20 +05:30)
- pnpm vitest run 'src/app/api/projects/[id]/brain/contradictions/route.test.ts' src/lib/projects/brain-graph.test.ts: 2 files, 13 tests passed.
- pnpm db:check: passed (Drizzle reports schema/journal consistent).
- pnpm exec tsc --noEmit: in progress at the time of this entry; completion is recorded in context.md after polling.
- Migration remains unapplied; no PostgreSQL-backed test or UI/browser verification in this batch.


### TypeScript resource-limit follow-up (2026-11-06 11:19:58 +05:30)
The first pnpm exec tsc --noEmit invocation exhausted Node's default ~2 GB heap after more than two minutes; it did not report source diagnostics. Retried with NODE_OPTIONS=--max-old-space-size=6144; result pending. Treat type checking as unverified until that command exits successfully.


### TypeScript retry result (2026-11-06 11:21:31 +05:30)
NODE_OPTIONS=--max-old-space-size=6144 pnpm exec tsc --noEmit completed successfully with exit code 0.


### Production build and scoped formatting (2026-11-06 11:27:26 +05:30)
- NODE_OPTIONS=--max-old-space-size=6144 pnpm build: passed; Next generated all 192 static pages and completed traces. Existing warnings include multiple lockfiles/workspace-root inference, dynamic server usage during static probes, optional Redis/E2B configuration, SSL-mode behavior, and dependency <img>/dynamic import warnings.
- pnpm exec biome format --write applied formatting to the three changed TypeScript files; subsequent scoped biome check passed cleanly.
- git diff --check passed for tracked source/schema/journal paths. Migration remains unapplied; no PostgreSQL-backed verification.


### F012 adjudication verification (2026-11-06 11:42:40 +05:30)
- Focused tests for candidate filtering/caps, model output mapping, conflict resolution/dismissal, graph and source visibility: 4 files, 27 tests passed.
- pnpm exec tsc --noEmit with 6 GB Node heap: passed (exit 0).
- Scoped Biome: passed across all changed TypeScript files.
- pnpm db:check: passed.
- pnpm build: passed after this batch; Next compiled and generated 192/192 pages. Existing warnings remain (workspace lockfiles, dependency dynamic imports, optional Redis/E2B setup, dynamic-render probes, SSL-mode forward compatibility, and <img> lint findings).
- Not verified: applying migration 0048, PostgreSQL-backed integration, live model/provider behavior, and browser journey.


### F007 and F012 batch verification (2026-11-06 12:04:47 +05:30)
- Full Vitest suite: 211 test files, 1,373 tests passed.
- Full pnpm exec tsc --noEmit with 6 GB Node heap: passed.
- Scoped Biome checks for modified source/test paths: passed.
- pnpm db:check: passed.
- pnpm build: passed; 192/192 static pages generated and page traces completed. Existing workspace-root/multiple-lockfile, E2B/unpdf dynamic dependency, dynamic-render probe, optional Redis/E2B, pg SSL-mode, and <img> lint warnings remain.
- No PostgreSQL-backed test, migration application, live dynamic provider call, or browser hardware workflow. Migration 0048 remains unapplied.


## F027 voice OTA activation tests (2026-11-06)
- Focused command `pnpm exec vitest run src/lib/voice src/app/api/voice`: 19 files, 50 tests passed.
- `pnpm exec tsc --noEmit --pretty false --incremental false` with 6 GB Node heap: passed.
- `pnpm db:check`: passed for journal consistency; migration 0049 was not applied.
- Scoped Biome check on 14 changed TypeScript/TSX files: passed after formatting.
- Production build was running during the first progress-document append; final result must be appended after completion.
- Not performed: PostgreSQL integration/concurrency tests, firmware/hardware/browser E2E, live Redis or audio gateway verification.

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

## F021 updater implementation checks (2026-11-06)
- Focused Vitest: update feed parser, updater policy, updater IPC sender boundary, export-shape interop, desktop MCP policy/spawner: 19/19 passed.
- `pnpm --dir apps/desktop typecheck`: passed.
- `pnpm desktop:build`: passed (main and preload bundles).
- Scoped Biome check on all modified updater/desktop UI/config files: passed.
- Root production build was run because the application layout now mounts the updater notifier; final result is tracked in the appended verification entry.
- Not run: package/signing build (no signing credentials/feed), actual installer/update, live release feed, interactive Electron UI, push or deployment.
- Final outcome: root production build passed and generated 192/192 pages. Existing warning classes are unchanged; no updater-specific failure was reported.

## F010/F012 active source revision checks (2026-11-06)
- Focused source version, brain queue, overview, graph, node, fact review, typed page, contradiction, merge, and project-knowledge tests: 44/44 across 8 files.
- Whole-repository TypeScript (`NODE_OPTIONS=--max-old-space-size=6144 pnpm exec tsc --noEmit --pretty false --incremental false`): passed.
- `pnpm db:check`: passed with migration `0050` journal entry.
- Scoped Biome: passed.
- Fresh `pnpm build`: passed; generated 192/192 static pages. Existing warning classes remain (optional Redis/Upstash/E2B, authenticated routes during static probes, dependency analysis, PostgreSQL SSL mode notice, image lint).
- No PostgreSQL migration apply, live query/transaction, concurrency test or browser journey; migration `0050` remains local/unapplied.

### Source-item freshness verification (2026-11-06)
- Focused project-brain/source-version regression suites: 44/44 across 8 files.
- `pnpm exec tsc --noEmit --pretty false --incremental false` with 6 GB heap, `pnpm db:check`, scoped Biome, and `pnpm build` all passed; production build generated 192/192 pages.
- No live PostgreSQL timestamp/transaction behavior, source upload browser journey or migration apply was performed.

### Collection item freshness writer test (2026-11-06)
- Added focused test that the shared collection-item status mutator always writes an updated timestamp; this is the current content-ingestion ready/failed transition path used by RAG ingestion.
- Related source version/queue + collection repository suites passed 10/10; scoped Biome and `git diff --check` passed. No live database/browser verification.

## F018 private Blob test record (2026-11-06)
- Added Vercel Blob driver cases for default public compatibility, private upload/get/delete behavior, and invalid mode rejection.
- Focused run: `pnpm exec vitest run src/lib/file-storage/vercel-blob-storage.test.ts src/lib/file-storage/storage-utils.test.ts src/app/api/storage/download/route.test.ts` — 12/12 passing across 3 files.
- Still required: full TypeScript/build after this batch; private-store staging upload token and browser/model attachment verification. Mock tests do not validate Vercel account/store configuration.

## F018 private S3 tests (2026-11-06)
- Storage tests now verify private-mode owner upload URLs, follow-up URL lookup, preservation of unowned generated asset URLs, malformed configuration rejection, and existing public Blob compatibility.
- Focused suite: 31/31 passed across six files (`s3-file-storage`, Vercel Blob storage, storage utilities, storage config action, authenticated download, and owner-scoped legacy file route).
- Whole-project TypeScript passed. Fresh production build is running after S3 URL changes; no live S3/Blob ACL, presigned upload, browser preview, or provider-consumption run.

## F018 final validation (2026-11-06)
After adding private S3 owner URLs, the focused storage/config/download/file-route suite passed 31/31 across six files; root TypeScript passed; focused Biome and scoped whitespace checks passed; fresh `pnpm build` exited 0 and generated 192/192 pages. The build reported established workspace, dependency, image, optional Redis/E2B, PostgreSQL SSL, and dynamic-route diagnostics. No live Blob/S3 ACL, browser, Postgres, or model-provider attachment test was performed. Public objects remain public until migrated and removed. F018 remains PARTIAL.

## 2026-11-06 — Generic HTTP approval batch
- pnpm exec vitest run src/lib/ai/tools/http/fetch.test.ts src/lib/ai/tools/hitl/http-request-approval.test.ts src/lib/db/pg/repositories/http-request-approval-repository.pg.test.ts src/lib/webhooks/url-guard.test.ts src/app/api/approvals/http-request/route.test.ts: 22 tests passed across five files.
- Whole-project pnpm exec tsc --noEmit --pretty false --incremental false with 6 GB Node heap: passed.
- Focused Biome on new HTTP approval modules/tests: passed after import ordering; git diff --check scoped to this batch: passed (existing LF/CRLF notices).
- Not run: full suite, production build, live PostgreSQL, browser, provider requests, or outbound Internet calls.

### DNS-pinned generic HTTP follow-up (2026-11-06)
- Focused tests: 24/24 across HTTP executor, approval schema/repository/API and URL guard suites.
- Root TypeScript no-emit: passed after the pinned HTTPS transport and bounded DNS lookup changes.
- Production pnpm build: exit 0; 192/192 static pages generated. Existing build warnings include optional integrations without credentials, dependency-analysis, image lint, dynamic authenticated routes and PostgreSQL SSL mode notice.
- Reference Void-Agent-V2 voice-device WebSocket endpoint was inspected read-only: it authenticates an enrolled device then returns 426 and requires an external pnpm voice:bridge; this checkout contains no bridge implementation. Do not report the gateway as reference-implemented parity.

## Project-brain fact/source revision link (2026-11-06)
- Focused tests: 38 passed across six suites (fact-source composite constraint, source-version guard, graph, contradiction and brain API coverage).
- pnpm db:check: passed. Root TypeScript no-emit: passed.
- pnpm build: running after this schema/source change; result to be appended when the process exits.
- Migration 0051 is unapplied; no PostgreSQL migration, browser, production-data, push or deployment test/action.

Project-brain source-provenance production-build follow-up: pnpm build exited 0 and generated 192/192 static pages. This validates app compilation and route generation only; it does not execute migration 0051 or prove PostgreSQL constraint/backfill behavior.

### F010/F012 contradiction decision history (2026-11-06)
- Added a read-only closed-decision history view with source revision provenance (revision ID/time, filename, and the evidence stored on each decision's facts). Existing source-content snapshots are not returned.
- Kept the reference-compatible GET contract: GET /brain/contradictions returns open contradiction candidates for currently active source revisions; GET /brain/contradictions?history=true returns closed decisions, including decisions whose source revisions are no longer current. Both flows enforce project access, attached collection and owner visibility, and ready source status. Existing PATCH decision flow was not changed.
- Focused project-brain API/helper suite: 23/23 passed across four files. Root TypeScript no-emit passed after the final route-contract change. Previous project-brain source-lineage DB journal check passed; no schema changed in this batch.
- A fresh production build reached static generation 192/192 and final tracing, but its process handle expired before an exit code was captured. Treat this build as UNVERIFIED; rerun a fresh build before reporting it as passing. No PostgreSQL/browser workflow or migration 0051 application was performed. F010/F012 remain PARTIAL.

### Current migration focus — project-brain dream cycle audit (2026-11-06)
- The reference's manual/nightly dream cycle consists of model-judged page deduplication, cross-source contradiction detection, salience recomputation, and stale-page archival; it records stage metrics and warnings and is separate from source extraction/consolidation.
- Void-Agent has source-version-aware facts, conflict review/history, graph reads, and an audited editor-driven same-type page merge. It does not yet have an equivalent project-wide dedupe/salience/archive scheduler or a verified end-to-end dream cycle. No work on this feature should overwrite user-reviewed fact decisions or auto-merge identities without evidence and review.
- Next action: implement compatible salience refresh and safe stale-page handling in Void-Agent's existing typed-page/fact schema, with project/source visibility checks, role/rate limiting, tests, and explicit UI trigger; then assess whether model-judged automatic dedupe is safe given its user-approved identity merge contract.

## 2026-11-06 project-brain history/ranking verification
- Focused tests: 28/28 across six files (salience API authorization/origin/rate-limit, SQL visibility predicates, conflict history/open list, graph, conflict classification, source version).
- pnpm check-types: passed using 6 GB Node heap after default-heap (2 GB) run ended in V8 out-of-memory without diagnostics.
- pnpm db:check: passed; migration journal valid.
- pnpm exec biome check --write on changed TS/TSX: passed; git diff --check on this batch: passed.
- pnpm build: exit 0; 192/192 static pages. Existing workspace root, dependency analysis, <img>, optional Redis/E2B, SSL and authenticated dynamic-route warnings were observed. No live PostgreSQL migration, browser journey, or external service call was run.

### 2026-11-06 15:53:03 +05:30 — final exact-source verification update
The accepted project-brain entity page list now sorts by salience so the refreshed score affects the visible ranking. After that final UI/API source change, the focused pages/salience suites passed 10/10 and a fresh pnpm build exited 0 with all 192 static pages generated. Build still emits existing workspace-root, dependency-analysis, <img>, optional Redis/E2B, SSL-mode and authenticated dynamic-route diagnostics. Migration 0052 remains unapplied; no live PostgreSQL/browser run was done.

## 2026-11-06 duplicate identity review verification
- Final focused suite: 20/20 across candidate helper, pages GET/PATCH/POST, audited page merge, salience SQL, and salience API.
- pnpm db:check: passed with migration 0053 journaled. Scoped Biome and git diff --check: passed.
- Fresh exact-source pnpm build: exit 0; 192/192 static pages. Existing workspace-root, critical dependency, <img>, dynamic authenticated-route, optional Redis/E2B and PostgreSQL SSL warnings observed.
- Migration 0053 is local/unapplied. Tests are mocked/unit-level; no disposable PostgreSQL execution or interactive browser test was run.

## 2026-11-06 stale-page lifecycle verification
- Focused project-brain suite: 24/24 across five files (stale-page query/mutation predicates, request authorization and source visibility, candidate review, merge safety, salience).
- Root TypeScript check passed using a 6 GB heap; default 2 GB run had exhausted heap without a diagnostic.
- pnpm db:check, scoped Biome and git diff --check: passed.
- pnpm build: exit 0; 192/192 static pages. Existing dynamic-session/prerender, optional Redis/E2B, dependency-analysis, workspace-root, SSL-mode and <img> warnings remain.
- No migration applied, disposable PostgreSQL run, or interactive browser journey. Build output is not DB/runtime verification.

### Advisory project-brain duplicate comparison (2026-11-06 16:32 +05:30)
- Implemented an on-demand AI comparison for deterministic same-type duplicate candidates. The API revalidates editor access, same-origin, rate limit, pair bounds, attached collection/current owner scope, ready sources, active revisions, accepted facts, and current candidate eligibility. Model inputs are bounded and treated as untrusted; no tools or page/fact mutation are available.
- The panel displays the result as advisory and retains the existing explicit review/confirmation step for merge. No automatic merge or identity mutation was added.
- Verification: focused project-brain suite 26/26 across five files; root typecheck with 6 GB heap passed; pnpm db:check and git diff --check passed. Scoped Biome passed. Fresh production build is in progress; record its final outcome separately.
- Limitations: no PostgreSQL runtime or interactive browser verification; model provider availability was mocked in tests. Stale-page handling remains manual; there is no scheduled dream-cycle orchestration. F010/F012 remain PARTIAL.

- Build verification update (2026-11-06 16:39 +05:30): pnpm build exited 0; Next generated 192/192 pages and completed build tracing. Existing workspace-root, dependency-analysis, image optimization, optional Redis/E2B, PostgreSQL SSL mode, and caught dynamic-session/prerender diagnostics were emitted. These do not alter the test/build exit result; no runtime DB or browser check was performed.

- Build verification update (2026-11-06 16:40 +05:30): pnpm build exited 0; Next generated 192/192 pages and completed build tracing. Existing workspace-root, dependency-analysis, image optimization, optional Redis/E2B, PostgreSQL SSL mode, and caught dynamic-session/prerender diagnostics were emitted. No runtime DB or browser check was performed.

### F012 model-reviewed cross-source contradiction scan (2026-11-06 16:54 +05:30)
- Implemented an editor-triggered scan in the existing project-brain route. It compares up to 40 new cross-source claim pairs per run, caps candidates at three per page/predicate, and considers only accepted facts from active source revisions, ready items, attached collections and current collection owners. Same-source and same-page/key/value candidates are excluded by the candidate helper.
- Results are persisted once per canonical fact pair with onConflictDoNothing: genuine contradictions stay open for editor review; compatible/unknown results are stored as classified history. Existing decisions are never overwritten, and the scan never changes fact review status. Same-origin, editor authorization, per-user rate limit and bounded query/model inputs are enforced.
- UI adds a manual scan action and refreshes the graph and revision-aware history. Evidence: src/lib/projects/brain-contradictions.ts, its tests, src/app/api/projects/[id]/brain/contradictions/route.ts and tests, src/app/api/projects/[id]/brain/graph/route.ts, and src/components/project-brain-panel.tsx. Existing varchar fields were reused; no migration added.
- Verification: 25 focused contradiction helper/API/graph tests passed; whole-project typecheck passed with 6 GB heap; Drizzle journal check and scoped Biome passed; git diff --check passed. Exact-source production build is running; append its result after completion.
- F012 is now PARTIAL rather than missing: model classification is available on demand, but there is no automatic/nightly full dream-cycle orchestration. PostgreSQL-backed persistence, concurrent scans and browser/provider flow are not runtime-verified. Review decisions remain human-controlled.

- Build verification update (2026-11-06 17:00 +05:30): exact-source pnpm build exited 0; Next generated 192/192 pages and completed tracing. Existing workspace root, dependency analysis, image optimization, optional Redis/E2B, PostgreSQL SSL mode and caught dynamic-session/prerender diagnostics remain. No live database or browser interaction was run.

### MCP/workflow approval audit and project-sync Origin hardening (2026-11-06 17:03 +05:30)
- Static call-path audit found direct interactive MCP execution is wrapped by exact-payload one-use approval, saved workflows consume an approval bound to the current graph revision and check MCP ownership/enabled state, and project brain sync revalidates a project-bound read-only tool allowlist plus argument schema and credential-owner permission. The reference saved-workflow executor directly runs configured MCP nodes; Void-Agent's outer graph approval is retained.
- Closed one CSRF edge in project brain MCP sync: requests with missing Origin now fail closed, matching its existing cross-origin rejection. This endpoint executes only explicitly allowlisted read-only tools, but it still uses the authenticated session and idempotency contract.
- Focused MCP approval, saved-workflow and project-sync tests passed 18/18; root TypeScript, git diff --check, and fresh production build passed (192/192 pages). Build emits existing workspace/dependency, image, optional Redis/E2B, SSL and caught dynamic-render diagnostics.
- F025 remains PARTIAL: static/unit evidence does not prove browser approval, PostgreSQL token replay race, provider semantics, or every custom execution path. No production DB, external MCP provider, push or deployment was used.

### Project status synthesis verification (2026-11-06 17:25 +05:30)
- `pnpm exec vitest run src/lib/projects/project-brain-status.test.ts 'src/app/api/projects/[id]/brain/status/route.test.ts'`: passed, 2 files / 8 tests.
- `NODE_OPTIONS=--max-old-space-size=6144 pnpm check-types`: passed.
- `pnpm db:check`: passed. Scoped Biome and `git diff --check`: passed.
- `pnpm build`: exited 0; Next compiled with existing dependency and `<img>` warnings, then generated 192/192 pages. Build logs also reported existing caught dynamic-session/prerender diagnostics, missing optional Redis/Upstash and E2B configuration, and PostgreSQL SSL mode warning.
- No PostgreSQL-backed migration/API tests, browser workflow, or live model-provider verification. Migration 0054 remains unapplied.

### Project-brain task transition hardening (2026-11-06 17:35 +05:30)
- `pnpm exec vitest run 'src/app/api/projects/[id]/brain/todos/[todoId]/route.test.ts'`: passed, 1 file / 4 tests.
- Whole-project `pnpm check-types` with 6 GB heap: passed. Scoped Biome and `git diff --check`: passed.
- Fresh `pnpm build`: exit 0; 192/192 static pages generated. Existing dependency, `<img>`, dynamic-session, optional Redis/E2B and PostgreSQL SSL diagnostics remain.
- No PostgreSQL transaction/race test, browser run, push, deploy, or database migration.

### Project task consolidation verification (2026-11-06 17:50 +05:30)
- Focused Vitest: 4 files / 17 tests passed (exact-match grouping, accepted/completed state, guarded group completion, stale/hidden/mixed IDs, origin, body size, rollback, existing todo route and brain endpoint).
- Whole-project `pnpm check-types` with 6 GB heap: passed. `pnpm db:check`, scoped Biome and `git diff --check`: passed.
- Exact-source `pnpm build`: exited 0; Next generated 192/192 static pages. Existing dependency/image warnings, caught dynamic-session logs, optional Redis/E2B setup and SSL-mode warning remain.
- No PostgreSQL-backed transaction/race tests or browser flow. No migration was added/applied.

### Consolidated task source-navigation follow-up (2026-11-06 18:00 +05:30)
- Final source after restoring source links in grouped evidence: focused helper/API suites 2 files / 8 tests passed; 6 GB whole-project TypeScript and scoped Biome passed; fresh production build exited 0 with 192/192 pages. Build continues to emit existing dependency, image, dynamic-session, optional Redis/E2B and SSL warnings.


### F024 schedule dashboard slice (2026-11-06)
- Focused Vitest run route.test.ts: passed, 1 file / 4 tests (session required, owner check, bounded result limit, malformed/oversized limit).
- pnpm check-types: passed. Scoped Biome check on five changed source files passed.
- pnpm build: exited 0; Next generated 192/192 pages. Existing dependency and img warnings, caught dynamic-session/prerender diagnostics, missing optional Redis/E2B configuration and PostgreSQL SSL mode warning remain.
- No PostgreSQL-backed tests or browser interaction run. Build is not evidence of DB runtime behavior.



### F024 final schedule creation UI verification (2026-11-06)
- Final-source run-history route test suite: 1 file / 4 tests passed. The test validates auth, owner-scoped parent lookup, result limit bound and malformed limit rejection.
- `pnpm check-types` passed with `NODE_OPTIONS=--max-old-space-size=6144`; the default heap attempt failed with Node OOM, then the configured 6 GB attempt completed successfully.
- Scoped Biome passed for the five changed source files. Final-source `pnpm build` exited 0 and generated 192/192 pages. Existing workspace-root, E2B/unpdf dependency, `<img>`, caught dynamic-session, missing optional Redis/E2B and PostgreSQL SSL-mode warnings remain.
- No browser journey or PostgreSQL-backed verification.



### F024 diagnostics and schedule editing verification (2026-11-06)
- Focused Vitest: 5 files / 25 tests passed across diagnostics, job create/edit/delete Origin boundary, owner scoping, bounded run history, cron validation, and one-shot lead-time checks.
- Whole-project pnpm check-types passed with NODE_OPTIONS=--max-old-space-size=6144. Scoped Biome passed across 11 changed source/test files.
- Fresh pnpm build exited 0; 192/192 pages generated. Existing parent lockfile workspace-root warning, E2B/unpdf dependency warnings, img warnings, caught dynamic-session logs, optional Redis/E2B configuration warnings, and PG SSL-mode warning remain.
- No Postgres-backed race/ownership test or browser journey was performed.


### F024 IANA timezone recurrence and DST support (2026-11-06 19:16:29 +05:30)
- Added additive local migration 0055 (scheduled_job.timezone, default UTC); migration journal check passes and the migration was not applied.
- Recurring schedules now validate IANA zones and compute next occurrences across DST with cron-parser. Dashboard creation/edit, the chat scheduler tool, and /schedule --timezone <IANA> all carry timezone metadata. Existing UTC recurrence retains Void-Agent's legacy AND behavior when both day-of-month and day-of-week are constrained; this behavior is tested for UTC and New York.
- Verification: scheduler/slash/API focused tests 53/53, whole-project pnpm check-types with 6 GB heap, pnpm db:check, and scoped Biome all passed. Production build was attempted but exited 1 after Webpack repeatedly failed to restore cache entries (UNKNOWN: unknown error, read) and ended with Cannot read properties of undefined (reading 'length'); no source-level compile error was reported. Build remains unverified pending a clean cache retry.
- No browser, PostgreSQL runtime, migration apply, push, deployment, or production DB action. F024 remains PARTIAL: atomic worker claiming/lease protection and safe manual-run semantics remain open.

### F024 durable job claim lease update
- Scheduler due-job claims now use a PostgreSQL transaction with `FOR UPDATE SKIP LOCKED`, persist a per-tick UUID claim token and expiry, heartbeat active work, and fence final schedule advancement/release by token. Expired claims are recoverable after worker termination; pause/reschedule clears the lease. Claim requests with non-positive or non-finite limits return no rows.
- Focused scheduler/API suites passed 51 tests across 7 files; TypeScript, `pnpm db:check`, and scoped Biome passed. PostgreSQL-backed concurrency and worker crash tests remain unavailable; migrations 0055/0056 are authored but unapplied. The system remains at-least-once if the process dies after causing the chat side effect but before persisting completion. Manual run remains unimplemented.

## F019/F025 status correction and n8n review gate (2026-11-06)
- Corrected stale base classifications: F004, F010–F013, F019 and F021 were marked MISSING despite later implementation evidence in this matrix. They are now PARTIAL; later implementation notes remain authoritative.
- F019 evidence: `src/lib/ai/chat-stream-context.ts`, `src/app/api/chat/[id]/stream/route.ts`, `src/app/api/chat/route.ts`, and `src/components/chat-bot.tsx` implement Redis-buffered stream resumption, owner-scoped HEAD/GET, stop signaling, and client resume. Redis is optional and no live Redis/browser journey was performed; status PARTIAL.
- F025: Void-Agent Run controls for n8n now fetch a bounded effect manifest and executable-definition hash, show an explicit review, issue a user-scoped one-use token bound to platform/workflow/revision/input, re-fetch and revalidate immediately before execution, and consume before calling n8n. Manual-trigger JSON is passed through `triggerToStartFrom`; output is reduced to a bounded acknowledgement so execution data is not returned.
- F025 evidence: `src/lib/n8n/workflow-review.ts`, `browser-approval.ts`, `client.ts`, workflow approval API, execute API, `workflow-list-page.tsx`, `n8n-workflow-embed.tsx`, and `node-config/execute-tab.tsx`. Payloads have a 24-level JSON nesting cap, a 20 KB request bound, owner session, same-origin validation and rate limits. No database schema change; approvals reuse atomic one-use verification deletion.
- Security boundary: this gate applies to Void-Agent's Run controls and app test runner. The embedded external n8n editor still permits its own explicit Run action outside this gate; manifest classification is heuristic and workflow GET/revision check cannot be atomic with n8n's subsequent execution POST.
- Verification: 20 focused approval tests across 6 files passed; 6 GB TypeScript check, scoped Biome, and Drizzle journal check passed. Production build completed with 192/192 static pages after fixing JSX lint; existing E2B/unpdf critical-dependency, `<img>`, dynamic-server, optional Redis/E2B, workspace-root and PostgreSQL SSL warnings remain. No live n8n/browser/PostgreSQL test, no push/deploy.

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

### F018 stored-document preview verification (2026-11-06 20:30:13 +05:30)
- Focused command: pnpm test -- src/app/api/storage/document/route.test.ts src/lib/file-ingest/docx.test.ts src/lib/file-ingest/pptx.test.ts � 3 files, 30 tests passed.
- pnpm check-types passed; scoped Biome formatting/check passed; pnpm db:check passed.
- pnpm build passed; Next generated 192/192 static pages. Existing workspace-root, dependency-analysis, optional Redis/E2B, PostgreSQL SSL, <img>, and dynamic-session diagnostics remain.
- Not verified: live PostgreSQL/storage, object-store ACL, browser attachment journey, external model/provider behavior.

### F018 preview audit corrections (2026-11-06 20:35:36 +05:30)
After the parallel edge-case review, focused tests for the stored preview route, attachment URL identity, DOCX and PPTX parsing passed: 4 files, 33 tests. pnpm check-types passed. The existing production build from the preceding code state passed; this final correction only changes preview metadata and filename inference.

### F017 team-shared knowledge validation (2026-11-06 21:12:22 +05:30)
- Focused access/collection routes/ingest/RAG/repository suite: 6 files, 25 tests passed.
- pnpm check-types: passed.
- pnpm db:check: passed with migration 0057 journaled.
- pnpm build: passed; 192/192 static pages generated. Existing workspace-root, E2B/unpdf dependency, image, optional Redis/E2B, PostgreSQL SSL, and dynamic-session diagnostics remain.
- Not run: PostgreSQL-backed ACL/revocation, live browser, production DB/migration, connector/provider or deployment verification.

### F017 project-brain source scope follow-up (2026-11-06)
- Focused tests: 72 passed across 14 files covering source scope, project-brain overview, graph/detail, pages/dedupe, contradictions, todos, status, salience, versions, and credential-owner sync behavior.
- TypeScript, formatting/lint, and production build: pending for the active batch.
- Live PostgreSQL, browser, connector provider, and migration application: not performed.

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

## 2026-11-07 integrated migration checkpoint

- `pnpm check` passed: lint (existing Next `<img>` warnings), TypeScript, and **1,666 tests across 283 files**.
- `pnpm build` passed; Next generated all **193/193** pages. Existing warnings include workspace-root inference from multiple lockfiles, E2B/unpdf bundler warnings, optional Redis/E2B configuration, dynamic-session diagnostics during page collection, image lint warnings, and PostgreSQL SSL-mode compatibility notice.
- Focused batches also passed their own tests: selected-project collaboration (20/20), CSRF and notification URL hardening (30/30), voice transcript/summary workflows (24/24), conversation archive API (7/7), table review (14/14), CreateAgent tools (17/17), notification producer/subscription tests (as recorded in prior batch), and desktop consent IPC (4/4).
- `pnpm db:check` passed for journaled migrations. Migrations 0058/0059 and earlier feature migrations remain unapplied; no live PostgreSQL migration or database-backed concurrency test was run. External provider, browser, device hardware, push-delivery and desktop package-signing checks remain unverified.
- No deployment occurred. Verified code and migration documentation were pushed to the private Void-Agent GitHub repository as commit `23589b8` on `main`. No deployment occurred.

## 2026-11-07 CreateAgent schedule and published-page verification addendum

### F024 optional recurring schedule from CreateAgent
- Focused test command: `pnpm exec vitest run src/lib/ai/tools/hitl/index.test.ts src/lib/scheduler/jobs.test.ts src/lib/db/pg/repositories/scheduler-repository.pg.test.ts src/app/api/scheduler/jobs/route.test.ts` � passed, 4 files / 38 tests.
- Covers tool proposal bounds, schedule hash stability for recurring retries, exact schedule payload hash binding, transactional reservation insertion/replay, key payload conflict, deleted-job tombstone, caller-owned agent check, and key propagation.
- `pnpm db:check` passed with 0061 in the journal; scoped `biome lint` passed; `git diff --check` passed. `pnpm check-types` did not pass because of two errors in concurrent files outside this batch: `src/app/api/chat/route.ts:1830` (`orgId` absent on `ChatThread`) and `src/lib/ai/team-member-ai-budget.ts:13` unused `TeamBudgetAuthorizationError` import. No production build, PostgreSQL migration application, browser workflow, or live recurring execution was run.

### F015 published page checkpoint (parallel tabular/page agent)
- The primary has an additive versioned slug store (migration 0060), owner-scoped publish/republish/revoke and page-management APIs/UI, and a public unlisted `/p/[slug]` reader. The public response is no-store and uses a CSP sandbox with opaque origin, blocked form/network/frame/object capabilities, and bounded publishing input. No signing in is required to read an unlisted page.
- Evidence: `src/app/api/published-page/route.ts`, `src/app/api/published-pages/route.ts`, `src/app/p/[slug]/route.ts`, `src/components/published-pages-dashboard.tsx`, `src/components/tool-invocation/published-page-tool.tsx`, `src/lib/published-page/*`, migration `0060_published_pages.sql`.
- Agent-reported focused verification: 20/20 tests across 7 files; `pnpm db:check`, scoped Biome, and `git diff --check` passed. Integrated typecheck/build are pending; migration 0060 is unapplied. F015 remains PARTIAL until disposable PostgreSQL and browser lifecycle tests pass.

## F008 team-member monthly cost budget verification (2026-11-07)
- Focused command: `pnpm exec vitest run src/lib/ai/model-pricing.test.ts src/lib/ai/team-member-ai-budget.test.ts` passed 2 files / 8 tests. Coverage includes explicit trusted pricing parsing, case-insensitive model lookup, missing/invalid price rejection, cost math, membership/team authorization matching, owner exemption, missing-policy fail-closed behavior, serialized concurrent capacity decisions, settlement/release counters, and UTC monthly boundaries.
- Scoped `pnpm exec biome check` passed for pricing/budget modules, chat route, admin config route, team/chat repositories, schema and chat types. `pnpm db:check` passed. `git diff --check` passed with only existing LF/CRLF notices.
- `pnpm check-types` passed with `NODE_OPTIONS=--max-old-space-size=6144`. An initial default-heap invocation ran out of memory near 2 GB without diagnostics; the 6 GB rerun passed after correcting temporary import issues.
- Integrated root suite passed 1,699 tests across 291 files. Production build is running; result pending.
- No PostgreSQL test URL was configured. Migration execution, advisory-lock concurrency, actual membership queries, and stream settlement/release have not been exercised against PostgreSQL. Migration `0062_team_member_ai_budget.sql` is journaled but unapplied.
- Admin rate configuration has no UI yet; it uses the authenticated `/api/admin/config` models section with `modelPricing` entries. No default model prices are shipped. Only main `/api/chat` team-scoped text generation is charged; other model routes/calls are listed under F008 explicit exclusions in the parity matrix.

## F008 explicit rollout gate verification (2026-11-07)
- Added admin-managed `models.teamMemberBudgetsEnabled`, strict boolean validation, and default-off behavior. Missing/false/invalid values do not load member policy or pricing and do not reserve budget; once explicitly enabled, capped members still fail closed for unpriced models. Admins should configure trusted prices before enabling.
- Focused command: `pnpm exec vitest run src/lib/ai/model-pricing.test.ts src/lib/ai/team-member-ai-budget.test.ts src/lib/ai/team-member-ai-budget-gate.test.ts` passed 3 files / 13 tests. Scoped Biome check passed for six changed source/test files. `pnpm check-types` with a 6 GB Node heap exited 0.
- Production build passed 193/193 pages before this rollout-gate correction; a fresh build after this correction remains pending. Migration 0062 remains unapplied; no live PostgreSQL verification. No push/deploy.

## Final post-gate integrated verification (2026-11-07)
- Rollout-gate focused tests: 13/13 across 3 files. Scoped Biome passed. `pnpm check-types` with a 6 GB Node heap exited 0.
- Production build after the rollout-gate correction exited 0; Next generated 193/193 pages. Evidence: `.audit/build-20261107-rollout.log` (root reported build session 54975 exit 0).
- The integrated 1,699-test / 291-file suite passed before the rollout-gate correction; it was not rerun for this final gate change. Migration 0062 remains unapplied; no live PostgreSQL verification. No push/deploy.

## F032 streaming markdown rendering (2026-11-07)

- Command: `pnpm test -- src/lib/markdown-blocks.test.ts src/components/markdown.test.tsx` � 2 files, 9 tests passed.
- Mounted React component test verifies the settled paragraph is not re-rendered as the tail changes, then verifies the tail re-renders when streaming completes. Parser coverage also verifies a 50,000-line blank run is collapsed without large variadic argument expansion while loose-list boundaries remain intact. Captured ReactMarkdown props assert GFM/remark-math and KaTeX remain configured and no raw-HTML or custom URL-transform plugin was added.
- `pnpm exec biome check` passed on the seven affected source/test files; scoped `git diff --check` passed with only the repository's existing LF/CRLF notices.
- Integrated typecheck/build intentionally not run in this batch; parent is coordinating integrated checks. F032 remains PARTIAL until these pass. No browser benchmark or live external integration applies to this render-only slice.

## F008 budget administration UI (2026-11-07)
- Added a section to the admin Models page for the default-off rollout switch and explicit EUR input/output rates per provider/model per million tokens. Rates are parsed as decimal strings into integer micros without floating-point rounding. The save request contains only the `models.modelPricing` and `models.teamMemberBudgetsEnabled` fields; the existing admin config endpoint authorizes the write and merges these into existing model settings, preserving providers and unrelated config.
- Reference review found only a fixed default EUR 15 monthly cap policy and uncapped owners; no per-member cap editing API or UI exists upstream. No custom cap editor was introduced.
- Focused UI/pricing/budget tests passed 24/24 across 5 files. Coverage includes default-off, exact decimal conversion, empty-price removal, preventing opt-in with no prices, server save errors, partial settings payload, rate validation, and backend rollout-gate behavior. Scoped Biome and `git diff --check` passed.
- Whole-project typecheck/build are deferred while the parallel chat-route change is in progress. No PostgreSQL verification, migration application, push, or deployment.

## 2026-11-07 F025 model pin tests
- Focused Vitest: 27/27 passed across 5 files (`pinned-model`, HITL schema, approval hashing, agent create API, and model catalog API). Coverage includes provider/model parsing, enabled/keyed catalog filtering, unauthorized/no-pin inheritance, user pin overriding request model, stale pin rejection, effective model reaching team budget pricing, stale creation rejection before writes, authenticated permission gate, and approval hash binding.
- Scoped Biome check passed for seven isolated/new helper/API test files. `git diff --check` passed for the touched batch paths. A broader check over shared chat/HITL source surfaced existing whole-file formatting deltas; no formatter churn was applied.
- Integrated typecheck, production build, component browser journey, and live PostgreSQL verification were not run in this batch; root coordinates integrated checks. No migration was added or applied, no push/deployment occurred.

## F015 quota and version retention verification (2026-11-07)
- Focused command: `pnpm exec vitest run src/lib/published-page/quota.test.ts src/lib/db/pg/repositories/published-page-repository.pg.test.ts src/app/api/published-page/route.test.ts src/lib/ai/tools/publish-page.test.ts` passed 4 files / 17 tests.
- Tests cover owner-before-slug advisory lock ordering, shared owner lock identity for concurrent different-slug publishes, exact oldest-version pruning to retain 10, oldest revoked-row reclamation without touching active rows, rejection at a full active-page quota without deletion, and clear 409/tool quota errors.
- Scoped Biome and `git diff --check` passed. Whole-project typecheck/build were not run per root coordination; live PostgreSQL/migration/browser checks remain pending. No schema migration was added or applied.

## Integrated verification checkpoint (2026-11-07)
- `pnpm check-types`: exit 0 (root-run integrated check).
- Full Vitest suite: 1,743 tests passed across 299 files.
- Production build attempts 1 and 2 failed in the compile stage with `undefined.length`; neither emitted a stack trace or module path. Root preserved the generated `.next` tree recoverably at ignored `.audit/next-failed-20261107-0130` for diagnosis. A clean production build, session 42765, exited 0 and generated 194/194 pages.
- Build warnings remain non-fatal: workspace root inference; dependency critical-dependency notices; existing `<img>` warnings; dynamic-server/session diagnostics caught during static generation; missing optional Redis/Upstash and E2B configuration; PostgreSQL SSL-mode warning.
- No DB migration was applied, no live PostgreSQL/browser test was performed in this checkpoint, and no push/deployment occurred.

## F023 managed workflow generation/dashboard source review (2026-11-07)
- Verified source paths: V2 `lib/voice/workflow-draft.ts` always returns `null` with a hosted-edition explanation; `lib/navigator-tools/tools/workflows.ts` reports unavailable generation; migration `0064_navigator_workflows_dashboard.sql` and the schema declare fields, but no dashboard/session/provisioning implementation exists.
- Standard workflow list/create/editor/execution is present in both codebases. Primary n8n and internal workflow paths remain distinct and are not marked excluded.
- No tests were run because there is no executable managed generator/dashboard path to exercise. No source changes or external calls were made for this adjudication.

## 2026-11-07 F010/F014 focused verification
- Focused brain maintenance/archive/salience and table-review component/helper tests passed: 13 tests across 5 files.
- Scoped Biome passed for the seven F010/F014 files. `pnpm check-types` exited successfully.
- These results verify only the listed code-level slices. No production build, browser journey, configured AI provider, or PostgreSQL-backed workflow was run for this slice. F010/F014 remain PARTIAL.

## 2026-11-07 F027 handoff verification
- Voice device session route tests passed 7/7; scoped Biome and `git diff --check` passed.
- The route returns deterministic review targets only for finalized nonempty transcripts and preserves existing auth/rate/limit behavior. The chat side loads the transcript through its owner-scoped action and requires an explicit user choice before sending.
- Whole-project typecheck is not yet green because concurrent Cockpit edits have reported `Status.canManage` and `isNull` errors. No PostgreSQL, gateway, hardware, or browser end-to-end test was run. F027 remains PARTIAL.


## F030 Stripe Cockpit slice verification (2026-11-07)
- Focused pnpm test -- src/lib/cockpit/stripe.test.ts src/lib/cockpit/access.test.ts src/app/api/cockpit/stripe/connection/route.test.ts: 17/17 passed (3 files).
- Scoped pnpm exec biome lint over 12 Cockpit/API/UI/schema files passed. pnpm db:check reported the Drizzle migration journal is consistent. pnpm check-types with 6 GB heap exited 0 after fixing the status type.
- Tests cover personal/team role resolution, connection metadata redaction, cross-origin/unauthenticated requests, manager-only changes, body bounds, rate limiting, key format, summary aggregation, fixed Stripe host/GET, response-body cap and generic provider errors.
- Migration 0063 was not applied. No live PostgreSQL, browser-authenticated journey, or Stripe account request was made. F030 remains PARTIAL.

## 2026-11-07 F025 file binding and bounded staging verification
- Focused tests passed: 35/35 across 6 files, covering owner-bound normalization, foreign-key rejection, safe staging/idempotent manifest, per-file/aggregate bounds, stream cancellation, and S3/Vercel oversized metadata rejection before body download.
- Scoped Biome checks passed on 15 feature/storage files. Root combined test batch passed 70/70 across 15 files including agent API, storage, Cockpit, voice, F010/F014 suites. Cockpit agent reports whole-project `pnpm check-types` passed after current fixes; root will rerun after desktop F021 work settles. `pnpm db:check` passes.
- No live storage provider, E2B sandbox, PostgreSQL-backed agent lifecycle, browser journey, or production build was run for the new file-binding workflow. F025 remains PARTIAL.


## F030 Vercel Cockpit verification (2026-11-07)
- `pnpm test -- src/lib/cockpit/vercel.test.ts src/app/api/cockpit/vercel/connection/route.test.ts src/lib/cockpit/access.test.ts src/lib/cockpit/stripe.test.ts src/app/api/cockpit/stripe/connection/route.test.ts`: 28/28 passed across five files.
- Scoped `pnpm exec biome lint` over 15 Cockpit API/service/UI/schema files passed. `pnpm db:check` passed.
- Whole-project `pnpm check-types` (6 GiB heap) has no Vercel/Stripe errors; it exits on separate concurrent `src/app/api/projects/[id]/brain/status/route.ts:172` (`string` not assignable to `Health | null`).
- No PostgreSQL connection/migration, browser workflow, or live Vercel request. Migration remains unapplied; F030 is PARTIAL.

## 2026-11-07 integrated current-worktree verification (2026-11-07 06:41:22 +05:30)
- F029 project health notification: focused tests passed 19/19 across 4 files; scoped Biome passed; whole-project check-types passed after health schema validation and restoration of the prior route regression tests.
- F030 Vercel + Stripe: focused Cockpit tests passed 28/28 across 5 files; scoped Biome passed; pnpm db:check passed. No external account or PostgreSQL was contacted.
- Full pnpm test passed 1,862 tests across 320 files. pnpm build passed and generated 196/196 pages. Existing non-fatal dependency, workspace-root, lint, dynamic-route, optional-service configuration and PostgreSQL SSL notices remain.
- No live database migration/authorization, browser workflow, VAPID delivery, or Stripe/Vercel credential test was performed. F029 and F030 remain PARTIAL.

## Integrated migration snapshot � 2026-11-07

- Typecheck: `pnpm check-types` passed with `NODE_OPTIONS=--max-old-space-size=6144`.
- Full suite: `pnpm test` passed **1,921 tests across 331 files**.
- Lint: `pnpm lint` exited 0. Existing `<img>` optimization and multiple-lockfile workspace-root warnings remain.
- Database journal: `pnpm db:check` exited 0 for the current journal. This checks migration metadata consistency only; it does not apply migrations or validate against PostgreSQL.
- Production build: `pnpm build` exited 0; 198/198 static pages generated. Build emitted dependency-analysis warnings for E2B/unpdf, dynamic-session probes, missing optional E2B/Upstash configuration and PostgreSQL SSL-mode notices.
- Additional focused verification: desktop F021 tests 8/8 plus desktop typecheck/build; workflow effect review 21 tests; tabular review route security 19 tests; Slack inbound owner guard 8 tests; F031 reports 6 tests; F008 agent generation 4 tests; F020 MCP result/approval tests 5 tests; F010 queue tests 8 tests; F030 Website 7 tests and Vercel 28 tests. Several of these are included in the full suite.
- No PostgreSQL-backed migration test, live AI/provider test, browser E2E, VAPID/Slack/Supabase/Revolut access, or hardware/desktop GUI execution. Do not equate passing mocked/unit suites and static build with functional parity.

## F030 Revolut provider focused verification (2026-11-07)
- `pnpm exec vitest run src/lib/cockpit/revolut.test.ts src/app/api/cockpit/revolut/connection/route.test.ts`: **6/6 passed**. Covered RS256 assertion claims/issuer validation, fixed sandbox host, OAuth refresh, read-only bounded 30-day requests, internal-transfer/exchange aggregation, active balances, redacted status, team manager access, same-origin rejection, and request-size limit.
- Scoped `pnpm exec biome lint` across 12 changed source/test/schema files: passed.
- `pnpm db:check`: passed.
- `pnpm check-types`: started but stopped on parent request to avoid resource contention while F023 work was in progress; inconclusive, not counted as passed. No production build, live PostgreSQL, Revolut API or browser workflow was run for this slice.

## F030 Superlog provider focused verification (2026-11-07)
- `pnpm exec vitest run src/lib/cockpit/superlog.test.ts src/app/api/cockpit/superlog/connection/route.test.ts`: **8/8 passed**. Coverage includes MCP summary aggregation, declared-argument filtering, fixed endpoint/redirect policy, streamed response bounds, invalid token types, secret-free status, same-origin/team-manager checks, and bounded config input.
- Scoped Biome passed on Superlog API, service, dashboard, provider navigation, and tests. `git diff --check` passed with existing line-ending conversion notices.
- Integrated typecheck and build are pending root verification. No live Superlog token/provider, PostgreSQL, or authenticated browser journey was available. Migration 0063 remains unapplied; F030 remains PARTIAL.
## Integrated verified migration batch (2026-11-07 09:16 IST)
- Added/finished implementation slices across F023 saved-workflow draft editing, F025 human-review effect hardening and desktop MCP consent, F010/F011 dream-cycle status synthesis, F030 Website analytics breakdown UI and Superlog provider, and F031 administrator report rate limiting. Each family remains PARTIAL where broader functionality or external verification remains.
- Integrated checks on the current combined primary worktree: `pnpm check-types` passed with a 6 GiB heap; full `pnpm test` passed **1,968 tests across 346 files**; `pnpm lint` exited 0 with existing `<img>` and workspace-root warnings; `pnpm db:check` passed; `pnpm build` exited 0 and generated **201/201 static pages**; `git diff --check` passed (line-ending notices only).
- Build warnings include existing E2B/unpdf dependency analysis, dynamic-session prerender probes, missing optional Redis/Upstash/E2B settings, and PostgreSQL SSL-mode notices. These do not prove live service behavior.
- Focused additions: F023 draft APIs/UI 10/10 after type repair; F025 approval/review/desktop/voice checks 31/31 combined; F010 dream status stage tests 5/5; F030 Superlog tests 8/8 and Website analytics component test 1/1; F031 report-list/status rate-limit tests 6/6. Focused tests are included in the full suite where collected.
- Migration files remain unapplied. No live PostgreSQL, external provider, browser E2E, hardware/desktop GUI, production DB, deployment, or GitHub push was performed. No completion percentage is claimed.

## F028 Slack inbound focused recheck (2026-11-07 09:20 IST)
- Re-ran `pnpm vitest run 'src/app/api/inbound/[token]/route.test.ts' src/lib/inbound/slack.test.ts`: **2 files passed, 8/8 tests passed**. This verifies the current primary inbound owner-binding/HMAC route and Slack parsing/helper tests only.
- Reference lifecycle audit is source-evidence based: schema/migration and UI calls exist, but no `/api/slack` handlers, task worker/table consumers, event replay verification, or response delivery were found. No upstream lifecycle parity is claimed and no lifecycle implementation was added.
## F030 SEO provider focused verification (2026-11-07)
- `pnpm vitest run --reporter=dot src/lib/cockpit/seo.test.ts src/app/api/cockpit/seo/connection/route.test.ts src/lib/cockpit/superlog.test.ts src/app/api/cockpit/superlog/connection/route.test.ts`: **4 files, 15/15 tests passed**. SEO assertions cover bare-domain/credential validation, response summary bounds, fixed-host and redirect rejection, declared and streamed content-length cap cancellation; API tests cover team membership/manager role, same-origin mutation, endpoint override rejection, bounded request body and scoped removal.
- `pnpm db:check`: passed (Drizzle journal consistency only, not an applied migration). Initial scoped Biome found one unused test callback binding; fixed; scoped Biome rerun and integrated typecheck/build are pending. No live DataForSEO, PostgreSQL, or browser authentication workflow was run. F030 remains PARTIAL.
### F030 SEO verification correction (2026-11-07)
- Final rerun after adding a rate-limit-store failure test: SEO + Superlog focused suites passed **16/16 across 4 files** (SEO alone: 8/8 across 2 files). This supersedes the prior 15/15 and 7/7 counts.
- Scoped Biome passed across 9 SEO source/test/schema files; git diff --check passed with only a schema LF/CRLF notice. pnpm db:check passed. Integrated typecheck/build remains with root's verification batch.

## F025 n8n approval focused verification (2026-11-07)
- pnpm vitest run src/lib/n8n/workflow-review.test.ts src/app/api/approvals/workflow-run/route.test.ts — PASS, 2 files / 13 tests. Coverage: exact literal HTTP preview, configured credential metadata redaction, inline header and JSON-string secret redaction, dynamic expression rejection, unknown action rejection, oversized effect rejection, and no approval-token issuance for unreviewable n8n definitions.
- pnpm exec biome check on the four touched review/route implementation and test files — PASS. Scoped git diff --check — PASS with Windows LF/CRLF normalization notices. No live n8n, PostgreSQL, provider, or browser flow was run.
## F008 project-brain status budget regression (2026-11-07)
- Focused Vitest: 3 files / 25 tests passed across `src/app/api/projects/[id]/brain/status/route.test.ts`, `src/lib/projects/project-brain-status.test.ts`, and `src/lib/ai/team-member-ai-budget-runtime.test.ts`.
- Coverage includes server-derived persisted team scope/model, matching-snapshot reuse, usage settlement, conservative estimate when provider usage is absent, stale-evidence rejection after billing, and no reservation release if settlement fails after provider inference.
- Integrated `pnpm check-types` passed with a 6 GiB heap. Full-suite/lint/database-journal results are recorded in the current verification checkpoint; production build is pending. No PostgreSQL migration was applied.
## Integrated verification after F008/F025 security follow-ups (2026-11-07)
- `pnpm check-types` passed with `NODE_OPTIONS=--max-old-space-size=6144`.
- `pnpm test` passed: **1,988 tests across 348 files**.
- `pnpm lint` exited 0; existing Next `<img>` and multiple-lockfile workspace-root warnings remain.
- `pnpm db:check` passed; this checks Drizzle migration journal consistency only and does not apply migrations.
- `pnpm build` exited 0 and generated **202/202 static pages**. Existing E2B/unpdf dependency-analysis, dynamic-session prerender, optional Redis/Upstash/E2B configuration, and PostgreSQL SSL notices remain.
- `git diff --check` passed with Windows LF/CRLF normalization notices. No live PostgreSQL migration, provider, authenticated browser, voice device, Electron GUI, production DB or deployment run was performed.
## F030 Cockpit overview focused verification (2026-11-07)
- `pnpm vitest run src/lib/cockpit/overview.test.ts src/components/cockpit/cockpit-overview.test.tsx`: PASS, 2 files / 4 tests. Coverage checks connection-state classification, invalid payload handling, six existing endpoint paths, secret-field omission, and failed status requests rendering unavailable instead of disconnected.
- `pnpm biome check` passed on nine new/modified formatted files; `pnpm biome lint src/components/cockpit/seo-dashboard.tsx` passed (the pre-existing SEO dashboard is intentionally not reformatted). No full typecheck/build, live provider, Postgres or browser E2E was run by this slice.
## F037 unlink scope regression (2026-11-07 10:22 IST)
- `pnpm vitest run 'src/app/api/projects/[id]/documents/[itemId]/route.test.ts'`: PASS, 1 file / 4 tests. Coverage verifies authorized mapping-only unlink, viewer/origin rejection, live access revocation, role downgrade, detached collection, and source-owner scope loss.
- Scoped `pnpm biome check` passed for the route/test; scoped `git diff --check` passed with Windows LF/CRLF notices. No DB schema/migration or live PostgreSQL/storage/browser operation was performed.
- This is focused verification only; F037 remains PARTIAL and object cleanup is not implemented.
## F010/F030/F037 follow-up batch verification (2026-11-07)
- Focused changes: nightly project-brain dream discovery, unified Cockpit provider status overview, and current-scope revalidation before project-document unlink. Combined focused Vitest passed **4 files / 9 tests**; the components add 1 dream-run, 4 unlink, 2 status-classification, and 2 overview-rendering tests.
- Integrated `pnpm check-types` passed with a 6 GiB heap; full `pnpm test` passed **1,994/1,994 across 351 files**; `pnpm lint` exited 0 with existing `<img>` and multiple-lockfile warnings; `pnpm db:check` passed (journal only; no migration was applied); production `pnpm build` exited 0 with **203/203 pages**; `git diff --check` passed with line-ending notices.
- Existing non-blocking build warnings include E2B/unpdf dependency analysis, dynamic-session prerender probes, optional Redis/Upstash/E2B configuration, and PostgreSQL SSL notices. No live Postgres, provider, browser, or Electron verification was performed.
## F018 private file deletion lifecycle (2026-11-07 10:53 IST)
- Focused Vitest: **13/13 passed** across collection DELETE route, outbox worker, and collection repository test files.
- Scoped `pnpm exec biome check` passed on seven changed implementation/test files. `pnpm db:check` passed (migration journal consistency only; no database migration applied). `git diff --check` passed with Windows line-ending notices.
- Whole-project typecheck was not completed: the initial default-heap run exhausted Node's 2 GiB heap; a 6 GiB retry was stopped when root requested focused verification only. No production build, PostgreSQL-backed test, live object-store call, deployment, push, or reference-repository write was performed.
- F018 remains PARTIAL pending integrated typecheck/build, migration application in a disposable test database, and live private-provider verification.

## F024 schedule history refresh security regression (2026-11-07 10:54 IST)
- `pnpm vitest run src/app/api/scheduler/jobs/[jobId]/runs/route.test.ts`: PASS, 5/5 tests, including owner scoping and output/error redaction.
- `pnpm biome check src/components/scheduled-jobs-dashboard.tsx 'src/app/api/scheduler/jobs/[jobId]/runs/route.test.ts'`: PASS. `git diff --check`: PASS with Windows line-ending notices.
- No full suite/typecheck/build, live PostgreSQL, authenticated browser journey, migration apply, deployment, or push was run by this F024 subtask. Run-now remains unimplemented pending durable idempotency through the worker claim path.
## F014 penalty preset verification (2026-11-07)
- Focused Vitest passed 13/13 across table-review dashboard, review-column, schema and cell-schema tests. The new regression asserts the `penalty` field type and extraction prompt appear in the create-review payload. Scoped Biome passed. This does not verify a live PostgreSQL/provider/browser flow; F014 remains PARTIAL.
## F018/F024/F014 combined verification (2026-11-07 11:09 IST)
- Integrated pnpm check-types passed with NODE_OPTIONS=--max-old-space-size=6144; combined focused Vitest passed 18/18 across 4 files; full pnpm test passed **2,007/2,007 across 353 files**.
- pnpm lint exited 0 with existing <img>, deprecated Next lint, and multiple-lockfile workspace-root warnings. pnpm db:check passed (journal consistency only; migration 0067 was not applied). git diff --check passed with Windows line-ending notices.
- Production pnpm build exited 0 and generated **203/203 pages**. Existing dependency-analysis warnings (E2B/unpdf), workspace-root warning, and optional Redis/Upstash/E2B configuration notices remain.
- No PostgreSQL-backed migration, live storage/provider, authenticated browser, deployment, or production DB verification was performed. F018, F024, and F014 remain PARTIAL; F024 Run now is explicitly deferred until durable lease-safe idempotency is implemented.
## F018 source deletion UI completion slice (2026-11-07 11:13 IST)
- Added a per-source Remove action only for writable personal collections and file-backed items. The user must confirm; the component calls the authenticated collection-item DELETE endpoint, refreshes list data, and distinguishes queued cleanup (202) from immediate completion. Team collections and URL sources do not expose this action.
- Focused component tests passed 2/2: confirmation invokes the expected DELETE request and refresh on queued cleanup, and team collections do not offer per-source deletion. Scoped Biome check passed. F018 remains PARTIAL for project/reference blockers, wider multimodal parity, and live PostgreSQL/storage/browser validation.
## F029 project-consolidation digest parity audit (2026-11-07 11:17 IST)
- Reference trace: apps/web/src/lib/project-brain/run-pipeline.ts calls consolidate-generate, consolidate-apply, then notify as distinct idempotent workflow steps. consolidate-project.ts marks only explicitly model-selected open todos as notified, reads the per-run set, derives currently authorized project recipients, and creates one deduplicated project_digest per run/recipient; push is sent only for newly inserted rows.
- Primary behavior is materially different: primary src/lib/projects/brain-queue.ts stores extracted ProjectBrainTodo rows as proposed; there is no consolidation model, notify intent, per-run notified marker, or project todo digest trigger. The status route generates snapshots and only sends health-transition notifications; the todo route is a human review transition. src/app/api/projects/[id]/brain/status/route.ts generates a status snapshot and sends only a health-transition notification. src/app/api/projects/[id]/brain/todos/[todoId]/route.ts is a human review transition, not a digest workflow.
- Decision: exclude this upstream todo digest subfeature for now. Notifying on raw proposed tasks would surface unreviewed model output and lacks durable idempotency or a newly-notified marker; task acceptance or health changes are not equivalent triggers. Parity needs an explicit consolidation/notify lifecycle and reviewed-notification state adapted to the primary task model.
- Safe existing behavior retained: health changes notify only current project recipients, content is generic (does not leak private blockers), per-transition keys deduplicate, and push is attempted only when a recipient's in-app row was newly inserted. Existing project-health and status-route regression tests pass 20/20 together with the todo-review route suite.
- F029 remains PARTIAL. No schema/migration or source behavior was changed by this audit; live PostgreSQL, browser permission, and real VAPID delivery remain unverified.
## F010/F011 bounded project-brain cycle retry (2026-11-07 11:20 IST)
- Added a one-time retry path for partial/failed root dream runs. Retry requests are same-origin, authenticated project-editor only, rate-limited, streaming body capped at 2 KiB, bound to a run in the same project, and idempotent on etry:<root-run-id>. A retry cannot itself be retried; repeated requests resolve to the same queued retry row.
- Retry replays the existing staged workflow from the beginning. Existing stage effects are designed to be repeat-safe: dedupe only produces review suggestions, contradiction pairs use conflict-safe insertion and existing-pair exclusion, salience/archive are deterministic, and unchanged status fingerprints reuse a persisted snapshot. No auto-merge or fact-decision bypass was added.
- The dream status API exposes only canRetry, not the internal idempotency key. The project-brain panel offers Retry cycle only when the latest run is partial/failed and eligible. F010/F011 remain PARTIAL pending database/browser/worker verification and broader feature gaps.
- Evidence: src/app/api/projects/[id]/brain/dream/route.ts, its route tests, src/lib/projects/brain-dream-state.ts and tests, and src/components/project-brain-panel.tsx.


## F024 manual run-now focused verification (2026-11-07 11:24 IST)
- `pnpm test -- 'src/app/api/scheduler/jobs/[jobId]/run/route.test.ts' src/lib/db/pg/repositories/scheduler-repository.pg.test.ts`: PASS, 2 files / 14 tests. Covers auth/same-origin/idempotency key requirements, safe replay response, idempotency-key conflict, duplicate pending rejection, lease claim locking, pre-execution run binding, and expired-started-request non-replay.
- `pnpm exec biome check` passed on the 7 modified F024 implementation/test files. `pnpm db:check` passed (journal consistency only; migration 0068 was not applied). `git diff --check` passed with Windows LF/CRLF notices.
- Integrated typecheck/full suite/build and PostgreSQL-backed migration/claim-race validation are pending root verification. No live chat, browser, deployment, or database mutation was performed. F024 remains PARTIAL.

## Integrated F010/F011/F014/F018/F024 batch verification (2026-11-07 11:43 IST)
- Whole-project typecheck passed with a 6 GiB Node heap. Combined focused tests passed 40/40 across 8 files; full Vitest suite passed **2,024/2,024 tests across 356 files**.
- Lint passed with existing `<img>`, deprecated Next lint, and multiple-lockfile workspace-root warnings. Drizzle migration journal check passed; migrations 0067 and 0068 remain unapplied. Diff whitespace check passed with Windows line-ending notices.
- Production build passed and generated **203/203 pages**. Existing E2B/unpdf dependency-analysis, optional Redis/Upstash/E2B configuration, dynamic-session prerender, and PostgreSQL SSL warnings were emitted.
- No PostgreSQL-backed migration/claim-race test, live storage/provider/browser/device workflow, deployment, or production database operation was performed. F010/F011, F014, F018, F024 and the overall reference migration remain PARTIAL; the matrix records the remaining gaps and exclusions.
## Published verified F010/F011/F014/F018/F024 batch (2026-11-07 11:44 IST)
- Commit b07feed (feat: complete scheduler and project workflow parity) was pushed to origin/main after integrated typecheck, combined focused tests, full suite, lint, Drizzle journal check, production build, and diff whitespace validation passed.
- Published scope: secure project-brain retry, whole-review regeneration, private-file source deletion UI and cleanup workflow, and durable worker-lease manual schedule runs. F010/F011/F014/F018/F024 remain PARTIAL for migration/live-service/browser and broader reference gaps as documented. Migrations 0067 and 0068 are unapplied. The reference checkout and CognixAI user specs were not modified or committed.
## F029 accepted project-brain todo notification (2026-11-07 11:49 IST)
- Added an adapted safe notification event: only a successfully persisted human transition from proposed to accepted calls the notification helper. Rejected, completed, invisible, invalid, denied, and conflicted transitions do not notify.
- The helper resolves current project recipient IDs at send time and stores one in-app notification per recipient with the existing unique (user_id, dedupe_key) constraint. Stable key project-brain-todo-accepted:<todo-id> deduplicates retries per recipient/task. Notification text is generic and omits untrusted model-generated task title/evidence. Web Push runs only after a new notification row is inserted and remains best-effort.
- Focused Vitest passed 7/7 across the todo review API route and notification helper tests; scoped Biome and git diff --check passed. No schema change or migration was needed.
- This is an adapted accepted-task event, not the reference per-run consolidation digest. F029 remains PARTIAL pending broader notification event parity and live PostgreSQL/browser/VAPID delivery validation.
## F018 DOCX layout preview verification (2026-11-07 11:51 IST)
- Focused Vitest passed 14/14 across docx-html renderer tests, authenticated storage-document route tests, and OOXML/DOCX parser tests. Coverage includes table structure, external-link removal, malformed archive rejection, owner/auth guard, rate limit, raw-byte and rendered-output limits, and unsupported PDF route behavior.
- Scoped Biome check passed on six touched implementation/test/UI files; git diff --check passed with only Windows line-ending normalization notices.
- This does not verify an authenticated browser rendering, live object-store ACL, PDF/audio preview, PostgreSQL behavior, or deployment. F018 remains PARTIAL.
## F030 OpenSEO through Navigator OAuth (2026-11-07)
- Added a personal-scope OpenSEO connection path that reuses the existing DataForSEO SEO summary and dashboard. It accepts only a caller-owned, private, enabled MCP server whose URL is exactly `https://app.openseo.so/mcp`; the server must have a stored OAuth token. Team-shared OpenSEO configs are rejected because this repository's MCP OAuth session is server-global rather than user-scoped.
- The dashboard lists only eligible owned OpenSEO server IDs/names plus authorization state. It directs users to Navigator to complete OAuth. SEO execution checks current caller ownership again, requires a connected MCP client, and invokes only tools annotated `readOnlyHint` that match fixed domain overview/keyword/backlink name patterns. Arguments are constructed solely from declared schema properties and saved domain/location/language values. Returned payloads are capped at 1 MB; manager calls retain their configured MCP tool timeout.
- Focused schema, read-only tool selection/argument, route, and server-list tests: pending final integrated verification. Live OAuth/provider, PostgreSQL, browser, and team-sharing journeys were not run. F030 remains PARTIAL.

## F008 team budget: brain dedupe route (2026-11-07 12:00 +05:30)
- Focused Vitest: 14/14 passed across src/app/api/projects/[id]/brain/pages/dedupe/route.test.ts and src/lib/projects/brain-page-duplicate-candidates.test.ts.
- Scoped Biome and git diff --check passed. A global pnpm check-types was already running at handoff and is being polled; root will run the integrated typecheck and full gate. No PostgreSQL-backed test, database apply, live model-provider call, build, deploy, or push was performed for this slice.
### F030 OpenSEO focused verification (2026-11-07)
- SEO implementation tests passed 12/12 across three Vitest files: provider schema/read-only MCP selection/argument construction, SEO connection API, and eligible Navigator server-list API.
- Scoped Biome passed across seven changed source/test files. `git diff --check` passed with Windows line-ending notices.
- A whole-project `pnpm check-types` command was launched. The command wrapper remained open without output, but a subsequent process snapshot found no running `tsc` or `pnpm` process and no exit code/result was returned; treat whole-project typecheck as unverified and let the root integrated gate decide.
- No live OpenSEO OAuth/provider/PostgreSQL/browser workflow was run. OpenSEO is personal-scope only, server ownership and fixed URL are rechecked at execution, and only annotated read-only SEO tools are eligible. F030 remains PARTIAL.
- F030 typecheck result correction: the `pnpm check-types` process eventually returned exit code 134 with Node V8 heap exhaustion near its default 2 GiB heap. This is an environment/resource failure, not a reported TypeScript diagnostic. Root should retry the combined check with the repository's larger-heap convention only after all agents finish.

## Integrated verification: F008 / F018 / F029 / F030 (2026-11-07)
- Focused combined Vitest passed 49/49 across 10 files; full Vitest suite passed 2,043/2,043 across 359 files.
- `NODE_OPTIONS=--max-old-space-size=6144 pnpm check-types` passed. `pnpm lint` passed with existing Next lint deprecation, `<img>` warnings and multiple-lockfile workspace-root warning. `pnpm db:check` passed journal consistency only. `git diff --check` passed with Windows line-ending notices.
- `NODE_OPTIONS=--max-old-space-size=6144 pnpm build` passed; production build generated 203/203 pages. Existing E2B/unpdf critical-dependency, optional Redis/Upstash/E2B configuration, dynamic-session prerender, and PostgreSQL SSL-mode warnings remain non-fatal.
- No PostgreSQL migration/runtime test, live OpenSEO OAuth/provider call, object-storage/browser preview, Web Push/VAPID delivery, deployment, or production database operation was performed. No new migration was introduced in this batch. The four affected capability families and total migration remain PARTIAL.

## F026 Voice Inbox focused verification (2026-11-07)
- `pnpm test -- src/lib/voice/voice-inbox.test.ts src/app/api/voice/inbox/route.test.ts src/components/voice-inbox.test.tsx`: PASS, 3 files / 6 tests.
- Coverage includes cursor round-trip/date validation, malformed/empty cursor rejection, stable timestamp+message-ID keyset SQL, owner predicate, page sentinel/30-row cap, text-only 8,000-character projection, authentication/rate limit, and device transcript links into the existing review route.
- Scoped Biome check passed across the 7 implementation/test/page files. No integrated typecheck/build or live PostgreSQL/browser/provider journey was run by this slice. No database migration was added.

## F021 desktop native menu verification (2026-11-07)
- `pnpm --dir apps/desktop typecheck` passed.
- `pnpm --dir apps/desktop build` passed (main-process bundle; not an installer/package build).
- `pnpm exec vitest run apps/desktop/src/main` passed 50/50 across 14 files, including the new platform menu tests.
- Scoped `pnpm exec biome check apps/desktop/src/main/application-menu.ts apps/desktop/src/main/application-menu.test.ts apps/desktop/src/main/index.ts` and `git diff --check` passed.
- No Electron GUI, signed package, live OAuth/server switching, updater feed install, deployment, or production system was tested. F021 remains PARTIAL.
## Integrated verification: F021 / F025 / F026 (2026-11-07)
- Root `pnpm check-types` passed with `NODE_OPTIONS=--max-old-space-size=6144`; root `pnpm test` passed 2,051/2,051 across 363 files; `pnpm lint` passed with existing deprecation, `<img>`, and workspace-root warnings; `pnpm db:check` passed journal consistency; and `git diff --check` passed with Windows line-ending notices.
- Desktop companion `typecheck` and `build` passed; desktop main Vitest passed 50/50 across 14 files; scoped Biome/diff checks passed.
- Production `pnpm build` passed, generating 203/203 pages. Existing E2B/unpdf critical-dependency, optional Redis/Upstash/E2B configuration, dynamic-session prerender, and PostgreSQL SSL-mode warnings were non-fatal.
- Initial full-suite run overlapped typecheck and had four timeout failures (auth permission and DOCX/PPTX parser/render tests). All four files passed 34/34 when rerun alone; a complete full-suite rerun with typecheck finished passed 2,051/2,051. The overlap run is classified as resource contention, not a product regression.
- F025 had no missing executable reference mutation; the audit confirmed matching primary workflows and stronger server-side effect gates. F021/F025/F026 remain PARTIAL pending unavailable GUI/browser/live-service verification. No schema migration, database application, deployment, or production DB operation was performed.

## Integrated verification (2026-11-07 13:54 IST)
- `NODE_OPTIONS=--max-old-space-size=6144 pnpm check-types`: PASS.
- `pnpm exec vitest run --maxWorkers=2`: PASS, 369 test files and 2,080 tests. A default-worker attempt encountered a transient Windows worker startup `stat` error; the controlled run passed. Earlier individual focused route, voice, finance, and DOCX suites also passed.
- `pnpm lint`: PASS with existing `<img>` and Next workspace-root warnings.
- `pnpm db:check`: PASS (Drizzle schema/journal consistency only; migration 0069 was not applied and no live PostgreSQL validation occurred).
- `NODE_OPTIONS=--max-old-space-size=6144 pnpm build`: PASS; static generation completed 203/203 pages. Existing dependency-analysis, optional-service configuration, dynamic-session prerender, and PostgreSQL SSL notices remain non-fatal.
- `git diff --check`: PASS. No browser, live OAuth/provider, storage, payment, device, or PostgreSQL-backed journey was run. No deployment occurred.

## Integrated verification: F010 / F014 / F018 / F026 (2026-11-07)
- `NODE_OPTIONS=--max-old-space-size=6144 pnpm check-types`: PASS, including latest F026 access-filter/UI updates.
- `pnpm exec vitest run --maxWorkers=2`: PASS, 371 test files and 2,094 tests. Controlled two-worker run completed with exit code 0.
- `pnpm lint`: PASS across 1,882 files. Existing Next workspace-root and `<img>` warnings remain.
- `pnpm db:check`: PASS (Drizzle schema/journal consistency only; no live PostgreSQL or migration apply).
- `NODE_OPTIONS=--max-old-space-size=6144 pnpm build`: PASS; static generation completed 203/203 pages. Existing dependency-analysis, optional-service, dynamic-session, workspace-root and PostgreSQL SSL notices remain non-fatal.
- Focused slices passed: project brain 1/1, typed table-review 13/13, PDF preview helper+route 9/9, voice preview/project assignment 20/20. Scoped Biome passed across affected files; `git diff --check` passed.
- No live PostgreSQL, browser, PDF storage provider, voice device, model provider, or deployment workflow was exercised.

## Integrated verification: F003 / F007 / F008 / F009 / F029 (2026-11-07)
- Focused related suites: 9 files / 47 tests PASS (thread API pagination, provider availability/catalog/runtime, project-brain contradiction budget, project-role policy, notification helper, dream schedule).
- `NODE_OPTIONS=--max-old-space-size=6144 pnpm check-types`: PASS.
- `pnpm exec vitest run --maxWorkers=2`: PASS, 375 files / 2,115 tests; exit code 0.
- `pnpm lint`: PASS, 1,888 files scanned; existing Next workspace-root and `<img>` warnings.
- `pnpm db:check`: PASS; journal consistency only, no database connection or migration apply.
- `NODE_OPTIONS=--max-old-space-size=6144 pnpm build`: PASS, 203/203 static pages generated.
- `git diff --check`: PASS. No live PostgreSQL, browser, model/provider, web-push, or deployment workflow was exercised. This checkpoint remains local because broad feature parity remains incomplete.

## F033 password recovery focused verification (2026-11-07)
- Focused Vitest: 4 files / 16 tests PASS (password-reset-email, password-reset-rate-limit, auth-route-logging, and middleware).
- Scoped Biome: PASS across 17 auth/recovery implementation, test, and route files. messages/en.json parsed as valid JSON.
- No live PostgreSQL, configured email provider, or browser verification was available; no full integrated typecheck/build is claimed by this slice.

## Integrated verification: F001 / F010 / F022 / F033 and current local batch (2026-11-07)
- `NODE_OPTIONS=--max-old-space-size=6144 pnpm check-types`: PASS after current auth recovery, brain page links/backlinks, and workflow video changes.
- `pnpm exec vitest run --maxWorkers=2`: PASS, 388 test files / 2,182 tests.
- `pnpm lint`: PASS, 1,920 files checked; existing `<img>`, Next lint deprecation and multiple-lockfile workspace-root warnings remain.
- `pnpm db:check`: PASS (Drizzle schema/journal consistency only; no live database connection or migration application).
- `NODE_OPTIONS=--max-old-space-size=6144 pnpm build`: PASS; static generation completed 205/205 pages. Existing dependency-analysis, optional service configuration, dynamic-session prerender, workspace-root and PostgreSQL SSL warnings remain non-fatal.
- `git diff --check`: PASS (line-ending normalization notices only).
- No live PostgreSQL, email delivery, browser, external media playback, provider, or deployment verification was performed. No production database action, deployment, reference repository write, or push occurred. Feature families remain PARTIAL where end-to-end/runtime evidence is outstanding.

- Auth telemetry follow-up: one additional test verifies exception details are not included in logged auth error context. Final focused total is 16/16.

## F021 secure remote desktop MCP verification (2026-11-07)
- Added HTTPS remote MCP transport via injected SDK fetch backed by Undici Agent lookup pinning and public-address validation; redirect and cross-origin requests fail closed, and every request/reconnect resolves again.
- Added exact-config consent coverage, DNS/address policy tests, and origin/redirect rejection tests.
- Validation: desktop package `typecheck` passed; desktop bundle build passed; focused Vitest passed 14/14 across 3 files; scoped Biome passed on 8 files after formatting.
- Not verified: live HTTPS MCP server, Electron GUI/native consent, network-level TLS/SNI, or reconnect against a changing live DNS record. F021 remains PARTIAL.

## F021 remote operation and cross-package type follow-up (2026-11-07)
Fixed union-schema validation for both desktop list and call operations; remote configs now reach the pinned Streamable HTTP/SSE connection workflow. A deterministic mocked-client operation harness covers remote list/call without making external requests. Fetch-policy tests cover private/mixed DNS, cross-origin/HTTP, redirect-init, and resolver failure. Root `pnpm check-types`, desktop typecheck/build, scoped Biome, and 18 focused tests passed. This does not replace live Electron or remote endpoint verification; F021 remains PARTIAL.

## Integrated verification: F007 / F010 / F021 current slices (2026-11-07)
- `NODE_OPTIONS=--max-old-space-size=6144 pnpm check-types`: PASS after correcting the context-meter SDK usage types and desktop Undici/global fetch type boundary.
- `pnpm exec vitest run --maxWorkers=2`: PASS, 392 test files / 2,198 tests.
- `pnpm lint`: PASS, 1,927 files checked; existing Next lint deprecation, workspace-root and `<img>` warnings remain.
- `pnpm db:check`: PASS (Drizzle schema/journal consistency only; no live database connection or migration application).
- `NODE_OPTIONS=--max-old-space-size=6144 pnpm build`: PASS; static generation completed 205/205 pages. Existing dependency-analysis, optional-service, dynamic-session prerender, workspace-root, and PostgreSQL SSL warnings remain.
- Focused F007 context-meter and F010 page-detail suites passed 14/14. Desktop MCP package typecheck/build passed; 18/18 focused tests across four files cover stdio + remote list/call, consent IPC, and pinned-fetch DNS/origin/redirect protections. Scoped Biome passed; `git diff --check` passed (line-ending notices only).
- No live PostgreSQL, browser, email provider, Electron GUI, real remote MCP server, external media playback, deployment, production DB action, or GitHub push was performed. Migration 0070 remains unapplied. F007/F010/F021 and overall parity remain PARTIAL.

## F029 foreground chat alert verification (2026-11-07)
- `pnpm exec vitest run src/hooks/use-chat-background-alerts.test.ts src/lib/agent-alerts/chat-background-alerts.test.ts --maxWorkers=2`: PASS, 12 tests across 2 files.
- Coverage: generic completion toast without response text; pending approval without recipient data; hidden desktop delivery only; hidden-to-visible transition without replay; disabled preference suppression; root-relative same-origin navigation with encoded route segment.
- Live browser permission, VAPID receipt, PostgreSQL migration 0038 and browser end-to-end behavior were not tested. F029 remains PARTIAL.

## Composio direct toolkit connection workflow (2026-11-07)
- `pnpm exec vitest run src/app/api/integrations/composio/route.test.ts src/components/composio-app-connections.test.tsx`: passed, 7 tests across 2 files.
- Scoped Biome check/write passed for the route, route tests, Composio helper, UI, UI test, and MCP dashboard.
- Integrated `pnpm check-types` rerun after UI changes is pending at checkpoint write. No live OAuth/provider/account disconnect or browser-session test was possible.
- Final verification update: `pnpm check-types` passed after the final UI and route changes; focused tests passed 7/7. External OAuth/account lifecycle remains unverified.

## F025 approval policy parity update (2026-11-07)
The reference system prompt distinguishes harmless read-only chains, a single action with its own approval card, and genuinely complex consequential plans. Void-Agent already had the reference proposal tools and server-enforced exact-payload effect tokens, but the shared guidance did not explicitly prevent unnecessary plan-approval cards or say that plan approval cannot authorize an effect. Updated `src/lib/ai/tools/hitl/index.ts` to keep plans proportional, preserve each tool's server-side approval boundary, and collect related missing details in one `requestInput` call. Added guidance-contract tests in `src/lib/ai/tools/hitl/index.test.ts`. Focused Vitest passed 13/13; Biome and `git diff --check` passed. F025 remains PARTIAL because prompt tests do not establish model adherence and live browser/PostgreSQL/provider journeys remain unverified. No permission gate was removed.

## Focused F015/F032 verification - 2026-11-07 19:00 IST
- `pnpm exec vitest run src/lib/markdown-blocks.test.ts src/components/markdown.test.tsx src/app/api/published-page/route.test.ts src/app/p/[slug]/route.test.ts src/lib/db/pg/repositories/published-page-repository.pg.test.ts --maxWorkers=2`: PASS, 5 files / 24 tests.
- Coverage includes streamed markdown block render stability, large blank-run parsing, publish validation/ownership/limits, public opaque-origin CSP and cache behavior, version/quota repository behavior, and revocation. These tests use mocked DB boundaries where applicable; no live Postgres/browser journey was performed. F015 and F032 remain PARTIAL pending broad end-to-end verification and current aggregate build/typecheck.

## F018 stored WAV-to-chat attachment validation (2026-11-07)
- Focused tests passed 13/13 across audio attachment ingestion, stored audio transcription route, and device WAV route. Scoped Biome lint passed across 10 changed source/test files.
- pnpm check-types is still running at checkpoint; its result is not yet recorded. Live speech-provider, object-storage, and browser attachment-send journeys remain unverified. F018 remains PARTIAL.


## F033 account/profile parity audit - 2026-11-07
- Compared Better Auth profile/image/email updates, password change/session revocation, and admin-only account deletion in reference and primary; implementations are equivalent. Session listing helper/component is unused in both settings UIs.
- `pnpm exec vitest run src/app/api/user/actions.test.ts src/lib/auth/password-reset-rate-limit.test.ts src/lib/auth/password-reset-email.test.ts src/lib/auth/auth-route-logging.test.ts src/lib/user/server.test.ts --maxWorkers=2`: PASS, 5 files / 35 tests.
- No live PostgreSQL, email provider, or browser click-through was run. F033 remains PARTIAL only for this integration verification.

## F018 WAV-to-chat final local typecheck (2026-11-07 19:04:59 +05:30)
- pnpm check-types completed with exit code 0 after the stored WAV chat-ingestion helper and chat route changes.
- Focused tests remained 13/13 across 3 files; scoped Biome lint remained clean across 10 touched files.
- This is source/type validation only. Live transcription provider, private object storage/browser upload-send-playback, other audio codecs, OCR, and broader multimodal parity are not verified; F018 remains PARTIAL.

## Project-brain timeline batch (2026-11-07)
- Focused Vitest: PASS, 4 files / 19 tests (extraction evidence/bounds, source-scoped list API, review authorization/state transition, and editor/viewer UI behavior).
- `pnpm check-types`: PASS.
- `pnpm db:check`: PASS (Drizzle schema/journal consistency only; no live database connection and migration 0071 not applied).
- Scoped `pnpm exec biome check --write`: PASS, 11 implementation/test files.
- `git diff --check`: PASS, with existing LF/CRLF working-tree notices.
- No live PostgreSQL, browser, configured model-provider, deployment, or production database verification.

- Timeline review API follow-up: body-size regressions (malformed 400 / oversized 413) and conditional update source-visibility predicates pass in the same 19-test focused run. A bounded SHA-256 dedupe key replaces a text-composite index.

## F007 public per-user provider workflow verification (2026-11-07 19:39 IST)
- Focused Vitest passed 6 files / 29 tests: pinned HTTPS transport (DNS pin callback, redirect rejection, bounded timeout/body), authenticated user provider CRUD/discovery, user catalog, model ownership/fallback policy, and encrypted-at-rest repository projection.
- Scoped Biome check passed 19 files. `pnpm check-types` passed with `NODE_OPTIONS=--max-old-space-size=6144`; captured output is in ignored `.audit/check-types.log`. `pnpm db:check` passed Drizzle schema/journal validation only. `git diff --check` exited 0 with existing LF/CRLF working-tree notices.
- No live public provider, browser chat, PostgreSQL, or migration apply was run. Migration 0072 remains authored and unapplied; F007 remains PARTIAL pending end-to-end environment verification and local-machine endpoint architecture.

### F007 CRUD completion and final verification correction (2026-11-07 19:44 IST)
- Added owner-scoped provider editing to the settings UI. Blank API key retains the existing encrypted credential; update re-discovers models before persisting the endpoint/model allowlist. Added regression coverage that the old key is used only server-side and passed through to owner-scoped persistence without returning it.
- Final focused provider suite: 6 files / 30 tests passed. Scoped Biome passed 19 files. Final integrated `pnpm check-types` passed with 6 GiB heap; output is in ignored `.audit/check-types.log`. `pnpm db:check` passed without applying migrations. `git diff --check` exited 0; only existing LF/CRLF notices appeared.
- F007 remains PARTIAL: no live PostgreSQL, external provider, browser, or chat streaming verification; migration 0072 is unapplied. Localhost/LAN Ollama/LM Studio are still excluded pending a client proxy. No reference write, production database, deployment, commit, or push.

## F010 accepted timeline events in status synthesis - 2026-11-07 20:33 IST
- pnpm exec vitest run src/lib/projects/project-brain-status.test.ts: **PASS**, 1 file / 8 tests. Covers owner/source/current revision predicate on every knowledge query, accepted event inclusion and source fingerprinting, event-only synthesis, and prompt untrusted-data policy.
- pnpm exec biome check src/lib/projects/project-brain-status.ts src/lib/projects/project-brain-status.test.ts: **PASS**, 2 files.
- pnpm check-types with NODE_OPTIONS=--max-old-space-size=6144: **PASS**.
- Production build pending; no live PostgreSQL/browser/provider execution. No migration applied.

## F010 status snapshot timeline consumer - 2026-11-07 20:40 IST
- Focused Vitest: **PASS**, src/lib/projects/project-brain-status.test.ts (8/8).
- Scoped Biome: **PASS**, status helper and test (2 files).
- Integrated pnpm check-types with 6 GiB Node heap: **PASS**.
- Fresh pnpm build: **PASS**, static generation 206/206 pages. Existing optional-service/dependency/workspace/dynamic-session/SSL/image warnings remain non-fatal.
- No live PostgreSQL, browser, or provider run; no migration applied.

## F010 project knowledge recent-event feed - 2026-11-07 20:57 IST
- pnpm exec vitest run src/lib/ai/tools/project-knowledge.test.ts: **PASS**, 1 file / 4 tests. Verifies visible event output, project/source/owner/ready/accepted/active-revision SQL constraints, existing claim behavior, membership revocation, and invalid query short-circuit.
- pnpm exec biome check --write src/lib/ai/tools/project-knowledge.ts src/lib/ai/tools/project-knowledge.test.ts: **PASS**, 2 files.
- Integrated pnpm check-types with 6 GiB Node heap: **PASS**.
- Fresh pnpm build: **PASS**, static generation 206/206 pages. Existing non-fatal dependency-analysis, dynamic-session, optional Redis/Upstash/E2B, workspace-root, PostgreSQL SSL, and <img> warnings remain.
- No live PostgreSQL/provider/browser workflow; no migration applied.

## F010 project status chat tool - 2026-11-07 21:08 IST
- Focused Vitest: **PASS**, project status and project knowledge tool suites, 2 files / 8 tests.
- Scoped Biome: **PASS**, tool, tests and chat route.
- Integrated pnpm check-types with 6 GiB Node heap: **PASS**.
- Fresh pnpm build: **PASS**, static generation 206/206 pages. Known non-fatal E2B/unpdf dependency warnings, optional service config, dynamic-session static probes, workspace-root/multiple lockfiles, PostgreSQL SSL notice and existing <img> warnings remain.
- No live PostgreSQL/browser/provider/voice workflow; no migration applied.
