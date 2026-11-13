# Better Chatbot to Void Agent migration handoff

Updated: 2026-11-07 23:45 IST

## Current continuation status - 2026-11-07 23:20 IST
The user asked to continue implementing in verified batches while keeping this handoff current. Pushes of verified changes to Void Agent origin are authorized; never force push, deploy, or apply production migrations. This status supersedes older historical pause/no-push statements retained later in this file.

Latest published origin/main is `d3138d5e7214b18b2134016b054815237b478b25`; it includes the automatic project-brain chat context batch and its handoff records. The current uncommitted batch implements exact page/document pins for F014 table reviews and is undergoing final validation. The 37 broad family labels are 0 COMPLETE, 10 EXISTING, 22 PARTIAL, 2 EXCLUDED, 2 OPTIONAL, and 1 DEPRECATED; this is not a completion percentage. The 206 route/page/tool census is not a workflow denominator. Two untracked Void AgentAI specs remain untouched.
Workspace: `C:\Users\Ikra\Desktop\Void Agent`

## Current goal
Continue the Better Chatbot V2 to original Void Agent migration. Void Agent is the implementation target; V2 is read-only. Preserve Void Agent's architecture, features, branding, and security improvements while integrating each valuable compatible reference capability. The user has resumed work and authorized verified changes to be pushed to the origin Void Agent repository. Never force push, deploy, or apply migrations to production.

## Current checkpoint - 2026-11-07 23:41:34 +05:30
- Latest published implementation: voice `getProjectStatus` in OpenAI Realtime and KonvO through owned project chat scope (`30cfb58`); handoff follow-up `ce8cf38`.
- Current local batch replaces workflow HTTP validate-then-fetch with DNS-pinned HTTPS transport. Focused tests passed **21/21**; scoped Biome and integrated `pnpm check-types` passed. Fresh production build passed with 206/206 pages.
- Separate workflow audit found the embedded n8n full editor grants native run/activation/edit calls that bypass the host review UX; direct activation `PUT /api/workflow/[id]` also lacks a review-token check. Dynamic MCP/LLM node effects in saved graphs currently fail closed and cannot run until exact runtime approval is implemented. This next gap must remain visible; do not claim F025 complete.
- No database/schema change, migration apply, production deploy, or live outbound/provider/database journey. Existing migrations 0070-0072 remain unapplied. Do not stage user-owned Void AgentAI specs.
## Migration completion assessment
The migration remains incomplete. The current matrix has 37 broad family rows (F001-F036 plus F037): 0 COMPLETE, 10 EXISTING, 22 PARTIAL, 2 EXCLUDED, 2 OPTIONAL, and 1 DEPRECATED. EXISTING means an implementation was found, not verified end-to-end behavior. The 206 reference routes/pages/tool surfaces are not unique workflows, so there is still no defensible feature-level completion percentage.

## Verified work and limits
The local/published migration includes project workspaces and brain ingestion/graph/contradictions, accepted entity and timeline review, team model routing/budgets, user-scoped encrypted public HTTPS providers, conversation pagination/archive/fork evidence, desktop remote MCP transport, notifications, Composio app connections, voice inbox/review/task approval, stored WAV-to-chat transcription, account recovery hardening, workflow video preview, and many security regression tests. See the feature matrix and integration-progress doc for paths and evidence.

Full test suite on the prior published checkpoint: **404 files / 2,254 tests passed**. Full lint, integrated typecheck, Drizzle journal check, and build passed at that checkpoint. This current F010 slice additionally passed its focused test, typecheck, formatting, and fresh production build. No live PostgreSQL/browser/provider/email/device workflow was available; do not claim those passed.

## Remaining major work
1. Individually audit all 206 reference surfaces and retain evidence for behavior, authorization, persistence, tests, and compatibility.
2. Continue closing compatible partial/missing systems, especially the complete agent/tool approval user journey, project-brain scheduled and voice consumers, non-WAV audio/multimodal support, table-review citations, team/provider model routing details, desktop packaging/runtime, notifications/integrations, and end-to-end conversation/project workflows.
3. Validate authored migrations in a disposable PostgreSQL environment only; they have not been applied. Never apply to production under this authorization.
4. Run external provider, OAuth/email, Redis, browser, Electron, and hardware flows where configured; report unavailable services explicitly.
5. After meaningful batches, rerun focused tests/type/lint and build as appropriate, update feature matrix/progress/testing/security docs and append-only context.md, then review staged paths before pushing to origin/main.

### Workflow HTTP DNS pinning verification - 2026-11-07 22:08 IST
- Focused pinned-transport, approved HTTP and URL guard suites passed 21/21; scoped Biome and `pnpm check-types` with 6 GiB heap passed; fresh production build passed (206/206 pages). `git diff --check` passed with LF/CRLF notices only.
- No live external request or database/provider verification. This closes DNS rebinding in the workflow HTTP executor; it does not close the separately documented n8n editor and activation approval bypass. Source/docs are local pending staged review and push.

## Newly audited workflow approval gaps - 2026-11-07 21:48 IST
- `src/app/api/n8n/embed/[id]/route.ts` creates a short-lived JWT for the full n8n editor; iframe and raw-editor links expose native edit/run/activation requests outside Void Agent's explicit review/one-use approval endpoints. `src/app/api/workflow/[id]/route.ts` also accepts activation updates without same-origin, rate limit, or a review token. The immediate safe design is to remove the full editor capability from the user-facing embed and provide a read-only definition view, while keeping host reviewed-run routing; activation needs an explicit effect-review/approval contract or must be disabled.
- `getWorkflowEffectReview` deliberately rejects LLM-generated MCP/app-tool parameters and dynamic HTTP inputs, so these workflows fail closed but do not yet match the reference's parameterized execution workflow. Future completion needs a graph pause/resume effect review that shows exact runtime node arguments and uses a one-use token bound to user, graph revision, node, and exact effect data.
- V2 executes graphs after access checks without server-enforced side-effect approval; Void Agent's existing approval boundary is stronger and must be preserved.

## Repository safety
Only modify Void Agent. Keep Void Agent-V2 read-only. Preserve existing user changes and the two Void AgentAI spec files; do not reset/clean/stash. Keep temporary logs in ignored .audit/, outside .git; do not expose secrets. No production deployment or database migration has occurred.

Historical pause and publication entries below are retained as a timeline; the current status above supersedes their old �paused,� �no push,� build-pending, and unpublished statements.
## Resumed task checkpoint - 2026-11-07 19:52 IST
- User resumed the migration and requested one completed task, continuous handoff updates, and a GitHub push.
- Selected task: finish aggregate verification and publish the already implemented, locally accumulated migration batch as one reviewable commit. Current branch is `main`, and `HEAD` matches `origin/main` (0 ahead/0 behind before this batch). Push target is the Void Agent `origin` remote only.
- Current local batch includes completed F007, F010 timeline, F018 WAV chat ingestion, F019 reconnect limits, F025 approval guidance, F027 segment review, F033 parity audit, F015/F032 verification, and earlier migration work recorded above. It is not yet committed or pushed.
- Do not include or modify `void-agentai-app-spec.md` or `void-agentai-rebuild-spec.md`. Build is being rerun because the prior build was interrupted at the user's pause request. Commit and push are contingent on fresh build success and a final staged-diff review; no force push.

## Verification and publication checkpoint - 2026-11-07 20:09 IST
- Production build rerun after resume: PASS, `NODE_OPTIONS=--max-old-space-size=6144 pnpm build`, exit 0; static generation completed 206/206 pages. Warnings include existing E2B/unpdf dependency-analysis, missing optional Redis/Upstash/E2B configuration, dynamic session access during static probes, workspace-root/multiple lockfiles, PostgreSQL SSL-mode notice, and existing `<img>` lint warnings.
- The verified code state also has the prior recorded full suite (404 files / 2,254 tests), integrated TypeScript pass, Drizzle journal check pass, full lint pass (1,952 files; warnings only), and diff check pass. No source files changed since those checks; only this handoff was updated during the resumed push task.
- The user explicitly authorized pushing the verified code. Next: stage only this migration worktree, exclude `void-agentai-app-spec.md` and `void-agentai-rebuild-spec.md`, review staged paths/stat and whitespace, create one local commit, and push to `origin` (`https://github.com/ibrahimkhan008/Void Agent.git`) without force. If staged review exposes unrelated/user data, stop and remove those paths from the index before committing.
- This publication is a verified batch, not completion of the full migration. Broad parity remains incomplete and no completion percentage is defensible.

## Publication batch update - 2026-11-07 20:11 IST
- The latest user instruction resumes work, requests one completed task, asks that this handoff be kept current, and explicitly authorizes pushing the verified code. This supersedes the earlier pause/no-push notes above.
- The completed task for this batch is verification and publication of the accumulated local migration changes. Fresh production build passed (206/206 pages); the previously recorded full suite, typecheck, lint, Drizzle consistency check, and whitespace check also passed. No production database or service was touched.
- Staging plan: include the current migration changes and migration documentation only; explicitly exclude void-agentai-app-spec.md and void-agentai-rebuild-spec.md. Push only to origin/main, without force. A final commit hash and push result will be appended after publication.
- The broader feature migration remains in progress; this commit is a verified checkpoint and does not claim full parity.

## Publication result - 2026-11-07 20:12 IST
- Published migration checkpoint commit 6861227776178fd5424548805ac8bb700050b028 (eat: extend verified Void Agent migration) to origin/main successfully. Push was fast-forward from 5eb27b2; no force operation was used.
- Remote verification: local HEAD and origin/main both resolve to 6861227776178fd5424548805ac8bb700050b028; ahead/behind count is 0/0.
- Commit contains 163 paths (13,183 insertions, 522 deletions) spanning migration implementation, tests, and docs. The two Void AgentAI spec files were not included and remain untracked locally.
- This is one verified migration checkpoint only. The feature migration remains incomplete; see �Remaining major work� above. No production deploy or database migration was performed.

## F010 publication result - 2026-11-07 20:41 IST
- Commit 3539a8f73172aeae328ea4a958f1114db8ae79e6 (eat: include brain timeline in project status) was pushed to origin/main successfully as a fast-forward from 7925cd2.
- Remote verification: ahead/behind count is 0/0. Commit contains the F010 implementation/tests and updated migration matrix, progress, testing report, and handoff.
- The two untracked Void AgentAI specification files remain untouched and excluded. Overall migration remains incomplete; no DB apply or production deployment.

## F010 project chat event-feed publication - 2026-11-07 20:57 IST
- Published commit 5aaa4ec1aae58d8f7f17665f8db8c738d6259f82 (eat: add recent events to project knowledge) to origin/main as a fast-forward from 9880192.
- Verification: 4/4 focused project-knowledge tests, scoped Biome, integrated typecheck, and production build (206/206 pages) passed. HEAD and origin/main are aligned; ahead/behind count 0/0.
- The dedicated voice navigator and complete project status/todo tool remain incomplete; F010 remains PARTIAL. No DB migration or deploy.

## F010 project status tool publication - 2026-11-07 21:09 IST
- Published commit 5ee73aa62ba24fb4509ccfd663802b22a18e9334 (eat: add project status chat tool) to origin/main as a fast-forward from 845da7b.
- Verification: focused status/knowledge tests 8/8; scoped Biome; integrated typecheck; production build generated 206/206 pages. Remote ahead/behind is 0/0.
- The feature remains PARTIAL: no live PostgreSQL/browser/voice workflow and the reference's dedicated voice navigator has not been recreated. No migration applied or deployment performed.

## n8n editor and activation boundary - 2026-11-07 22:20 IST
- The prior `52fa768` DNS-pinned workflow HTTP change is already on origin/main. This local batch addresses the separately audited native n8n editor/activation bypass.
- Removed the native editor iframe and direct editor link. `/api/n8n/embed/[id]` now returns 410 and cannot mint a JWT. The workflow page receives only a sanitized projection of workflow name, active status, description, and bounded node labels/types; credentials, parameters, connections, and settings are not serialized to the browser.
- Removed n8n creation/activation controls from the list. Existing workflows remain viewable and can run through the existing exact-revision review/one-use approval. Deactivation is allowed through a same-origin, rate-limited bounded request. Activation fails closed until an approval-bound effect review exists. The page links to Void Agent's own saved-workflow editor. This intentionally leaves external n8n authoring/activation unavailable for now and does not claim parity or F025 completion.
- Focused suites passed 24/24 across 6 files; scoped Biome passed. Typecheck is rerunning after correcting one test-fixture cast. Production build, final diff review, and publication are pending. No production data/service, migration, or V2 file was touched.
- Void AgentAI specification files remain untouched and untracked.
## n8n batch verification and publication status - 2026-11-07 22:32 IST
- Focused workflow/approval suites: 24/24 across 6 files. Scoped Biome: pass. `pnpm check-types`: pass.
- `pnpm build`: pass; static generation completed 206/206 pages. Existing warnings include E2B/unpdf dependency analysis, Next `<img>` lint notices, optional Redis/Upstash/E2B configuration, dynamic session probes, multiple lockfiles/workspace-root inference, and PostgreSQL SSL-mode notices.
- First build attempt stopped on a newly introduced plain-anchor lint error; replaced it with Next `Link`, reran focused tests, and the fresh build passed. This is documented rather than represented as a clean first attempt.
- Diff review and push are still pending. No external n8n/PostgreSQL user journey was run and no live service or database was touched.
## n8n batch publication result - 2026-11-07 22:34 IST
- Published verified security batch `00242083e658e226d7bd254d6f0b4e54348af2b9` (`security: retire unreviewed n8n editor access`) to origin/main as a fast-forward from `52fa768`.
- Remote verification succeeded: local HEAD and origin/main both resolve to `00242083e658e226d7bd254d6f0b4e54348af2b9` (ahead/behind 0/0).
- Only the 15 reviewed source/test/documentation paths were committed. The two untracked Void AgentAI specs remain untouched and excluded.
- Next batch recommended by parallel read-only audits: add source-grounded project-knowledge graph search to OpenAI Realtime/KonvO voice sessions, reusing current thread-bound ownership and accepted-fact/source-revision filters; keep Kimi excluded until its client executor supports tools. Runtime saved-workflow MCP node pause/review/resume remains a larger subsequent approval-system gap. Full migration is still incomplete; no percentage is claimed.
## Voice project knowledge search batch - 2026-11-07 22:42 IST
- Added `searchProjectKnowledge` to the project-scoped voice tool set. OpenAI Realtime and KonvO expose it only when a current authenticated project chat thread is attached; Kimi keeps it filtered because that client does not execute these tools.
- New same-origin POST route strictly accepts only the thread UUID and a 2-300 character query, applies per-user rate limiting and a 2 KiB body cap, resolves project scope exclusively from the user's owned main chat thread, and reuses `createProjectKnowledgeGraphTool` so current project membership, collection owner, accepted fact/event, ready source, and source-revision checks remain authoritative.
- Voice output limits results to 6 claims and 4 events; each claim/evidence/source is bounded, internal source item IDs are omitted, URL citations return hostname only, and credential-like text is redacted. No new query, schema, or DB migration was added.
- Focused route/scope/graph/tool availability tests passed 18/18 across 5 files; scoped Biome passed. `pnpm check-types` passed. Full production build, diff review and push are pending. No live voice provider/browser/Postgres verification.
## Voice project knowledge integration hardening - 2026-11-07 22:53 IST
- Closed two integration gaps found during review: project-only tools now appear in the voice tool menu only when the current thread list marks the active thread as a project; and saved voice transcript threads inherit project/collection scope only from a source thread whose ownership and current project access are revalidated on the server. The UI metadata is advisory; the server scope resolver remains authoritative.
- Added same-origin validation to transcript persistence and explicit voice tool guidance that evidence excerpts are untrusted source data, not instructions.
- Expanded verification now passes: **27/27 tests across 7 files**, scoped Biome, and `pnpm check-types`. The earlier production build passed before these final menu/persistence hardening changes; a fresh production build is now required before publication. No live OpenAI/KonvO/Postgres journey.
## Voice project knowledge batch final verification - 2026-11-07 23:01 IST
- Final version validation: **27/27 focused tests across 7 files**, scoped Biome pass, `pnpm check-types` pass, fresh `pnpm build` pass with **206/206** static pages.
- The build emits existing E2B/unpdf analysis, image lint, optional Redis/Upstash/E2B, dynamic-session probe, workspace-lockfile, and PG SSL-mode warnings. Build completes successfully.
- No live OpenAI Realtime/KonvO voice, browser, or PostgreSQL integration was available. No schema migration, deployment, production DB operation, or V2 change.
- Source/docs remain local pending staged-path review and push. The previous build run before final visibility/context hardening was superseded by this fresh pass.
## Voice project knowledge publication result - 2026-11-07 23:03 IST
- Published commit `7ad6d655f2c75be304be219b822bc8de7b8ca998` (`feat: add project knowledge search to voice`) to origin/main as a fast-forward from `eeaf442`.
- Remote verification: local HEAD and origin/main both resolve to `7ad6d655f2c75be304be219b822bc8de7b8ca998`; ahead/behind is 0/0. The two Void AgentAI specs remain untouched and untracked.
- Next recommended feature batch: automatically inject a small query-matched set of current, human-accepted project-brain facts/events into eligible project chats. Reuse primary-owned project/collection/source-revision scope and keep brain citations separate from ordinary RAG citation metadata. The broader migration and F010 remain incomplete; no percentage claimed.
## Automatic project-brain context batch - 2026-11-07 23:11 IST
- Added an indexed, bounded text-match query for accepted project facts/events with current project membership, attached thread collection intersection, source collection owner, ready status, and active source revision checks. Maximum 5 fact + 3 event records; no raw document body, no new DB schema, and no new RAG citation metadata.
- Interactive owned project chats with at least one attached collection get a separate `project-brain-context` prompt section alongside existing ordinary RAG. Embed/scheduler/non-project/empty-scope requests do not query. The section is capped and XML-escaped, explicitly marks evidence as untrusted data, requests source labels in prose, and has a 1.2s soft timeout; no numeric markers that can collide with RAG `[n]` citations.
- Focused project-brain, graph search, project status, and prompt suites pass **20/20 across 4 files**; typecheck passes; scoped Biome and diff check pass. Fresh production build pending. No live PostgreSQL/browser provider run; database time for this bounded `ILIKE` query remains a live workload risk.
## Automatic project-brain context final verification - 2026-11-07 23:15 IST
- Focused suites: **20/20 across 4 files**; scoped Biome pass; integrated `pnpm check-types` pass; fresh `pnpm build` pass with **206/206** pages.
- Only existing build warnings remain: E2B/unpdf dynamic dependency analysis, image lint, optional Redis/Upstash/E2B config, dynamic session probing, workspace lockfile root, and PostgreSQL SSL mode.
- This verifies build/type/unit behavior, not live production-sized PostgreSQL query latency or an authenticated browser chat. No schema migration, deployment, production DB or V2 changes.
- Final diff/staged-path review and push remain pending.
### Automatic project-brain context publication - 2026-11-07 23:18:54 +05:30
- Published e4ada90c5c54a877c412d9a26aec10cc95e9f147 to origin/main as a fast-forward from 506d96684c7c78f5bdb14eaec25953159138ae93; verified remote main resolves to the same commit.
- The batch adds query-matched accepted project facts/events as separately labeled untrusted evidence for eligible interactive project chats. Retrieval rechecks current project/collection/source-owner access and active source revision; failures/timeouts omit this optional context. No database schema or citation marker behavior changed.
- Verification: focused suites 20/20, scoped Biome, pnpm check-types, pnpm build (206/206), and staged diff check passed. Live PostgreSQL query-plan/latency and authenticated browser verification remain outstanding. No DB apply/deploy.
- The two Void AgentAI spec files remain untracked and excluded. F010 remains PARTIAL pending broader workflows and related voice/scheduler consumers. Continue with the next substantial feature gap; no overall parity percentage claimed.

### Handoff publication follow-up - 2026-11-07 23:19:21 +05:30
- Published the handoff update as edbca8fb2aefb00eadd033849230e78b6a1c1771 to origin/main. Remote and local HEAD match; no other paths were committed.

### F014 table-review source revision batch - 2026-11-07 23:37:39 +05:30
- Ongoing implementation: exact ordered source-page pins replace the current generate-time join over every document version. Migration 0073_tabular_review_source_documents.sql adds page pins and backfills every extant page for existing review rows without changing saved cells; applying it remains explicitly out of scope.
- Review detail/export include pinned source coverage. Regeneration rechecks current collection owner and ready status, ignores later reingestion, and fails closed on a missing pin rather than using partial content.
- Verification to this point: focused suite 27/27, typecheck, scoped Biome, pnpm db:check, and git diff --check pass. Production build and final staged review remain pending; no live PostgreSQL/browser run.

### F014 table-review source revision pinning - verified implementation
- Exact multi-page source pinning is implemented across creation, generation, review detail and XLSX export. Authorization and ready-state checks are re-run at generation time; missing/inaccessible pins fail closed. Reingestion does not silently change existing review inputs.
- Verification: 27/27 focused tests across 6 files; scoped Biome; integrated typecheck; pnpm db:check; fresh production build exit 0 with 206/206 pages; diff check.
- Migration 0073 is additive and journaled but unapplied. No live PostgreSQL/browser workflow or deployment. Existing review cell values are retained; legacy source pin backfill records the complete extant page set for future regeneration, not historical cell provenance.
- Overall measured matrix snapshot: 37 broad families (F001-F036 plus F037): 0 COMPLETE, 10 EXISTING, 22 PARTIAL, 2 EXCLUDED, 2 OPTIONAL, 1 DEPRECATED. This is a taxonomy, not a valid completion percentage. Individual workflows still need to be enumerated and verified; 206 surface entries are not unique features.

### F014 source page pinning publication result
- Published code and documentation commit 0a8721036277cf4c4630f210bdb635f6e2bf7aa8 to origin/main as a fast-forward from d3138d5e7214b18b2134016b054815237b478b25. Remote verification confirmed origin/main equals the commit. No force push.
- The two untracked Void AgentAI specification files were excluded. Migration 0073 is committed but has not been applied. No deploy or production database action.
- Ongoing overall migration: 37 broad family labels are 0 COMPLETE, 10 EXISTING, 22 PARTIAL, 2 EXCLUDED, 2 OPTIONAL, 1 DEPRECATED. This is not a completion percentage. The canonical individually verified workflow denominator is still unbuilt; the 206 census rows are route/page/tool surfaces rather than independent feature units.
- Next high-priority work: continue mapping the inventory into user-visible end-to-end workflow units with explicit status and evidence, while implementing the next major incomplete system. Audit findings: dynamic workflow MCP/app-tool effects need a persisted pause/review/resume design to obtain exact-argument approvals; the primary desktop MCP bridge is more secure than the reference and is test-screen-only in both projects, so do not copy the reference bridge.

### Feature-level denominator audit in progress
- To give a real answer for �how much is complete,� three read-only audits are now mapping route/page/tool surfaces into independently testable user workflows rather than treating the 37 family rows or 206 surfaces as a feature count.
- Scopes: chat/models/conversation/settings; projects/knowledge/files/voice; integrations/tools/workflows/accounts/billing/desktop. Each item needs reference and primary evidence, status, and the remaining end-to-end verification gap.
- The resulting denominator will count only discrete user-visible workflows. Existing family labels are retained as a coarse cross-check, not converted into percentages. Auditors make no repository edits.

### Provisional workflow-level progress count
- Added docs/feature-work-register.md. Three audited scopes have been grouped into 71 distinct workflow units after merging two overlapping rows (chat audio transcription and general workflow CRUD/execution) and adding the separate F014 table-review workflow.
- Current counts: 61 PARTIAL, 1 MISSING, 5 EXCLUDED, 2 OPTIONAL, 1 DEPRECATED, 1 PRIMARY CUSTOM, and 0 COMPLETE. Therefore 62 units in this audited slice are still incomplete (61 partial plus 1 missing); partial includes both remaining implementation and missing end-to-end evidence, so it is not a count of code features to build.
- This is not the total project denominator. More surfaces from the 206-route/page/tool census remain ungrouped, and the three-agent audit has not yet had independent evidence review. Do not present a project-wide percentage from these provisional counts.

### Updated scope: upstream sync while preserving Void Agent (2026-11-08)
- User clarified the intended task: keep the original Void Agent features/custom behavior intact and bring in useful updates from its base upstream Better Chatbot. The preceding broad feature-parity audit was over-scoped; its 71-unit register and �0 E2E complete� count are not a meaningful implementation-progress percentage and should not be used to judge delivered code.
- Fetched `better-chatbot` remote only; Void Agent working files and branch were not replaced. Upstream main is 6f4183566bc48616303cb84055f11f79578c82fe (2026-11-06). Since the last audited baseline 2868c33, upstream has three commits: mention-chip rendering (989dc36), lifetime-vs-monthly member budget semantics (945d3da), and README documentation (6f41835/945d3da).
- Porting the mention-chip improvement into the original message renderer. Preserve Void Agent's existing monthly team budget, which is custom behavior; do not change it to upstream's lifetime cap. Branding/readme changes are not imported.
- The separate Void Agent-V2 checkout has extensive staged changes already present. It remains read-only and untouched. No merge, reset, or deployment is part of this sync.
- Current mention code/tests are local and await final verification. The last published Void Agent code remains commit `0a8721036277cf4c4630f210bdb635f6e2bf7aa8`; documentation checkpoints are on origin/main after it.

## 2026-11-08 00:12 IST � Upstream mention chips verified; major gaps re-audited
- Ported upstream rendering of sent-message agent/tool/workflow/MCP mentions as inline chips, adapted to Void Agent's serialization and kept collapsed previews from truncating inside a mention.
- Verification is green: focused tests 6/6, scoped Biome, `pnpm check-types`, `git diff --check`, production `pnpm build` exit 0 (206/206 page slots). Build has pre-existing warnings for dependency analysis, image tags, optional config, dynamic sessions, lockfile inference and PostgreSQL SSL-mode behavior.
- Three independent read-only audits found concrete remaining work: richer project-brain chat retrieval (semantic/full-text ranking, graph/alias, current snapshot), mid-execution workflow node approval (current saved-workflow approval is securely pre-run only), and upstream model metadata/catalog UX plus deployment-aware routing. V2 direct workflow execution is weaker and excluded from copying.
- Modified mention renderer/parser/test files; this work remains local and unpushed. Reference checkout and untracked Void AgentAI specs were not changed. No deployment or production DB action.
- Next: improve the existing project-brain retrieval path while preserving its ownership, collection and active-source-revision security gates.

## 2026-11-08 00:28 IST � Hybrid project-brain context implementation
- Chat project-brain retrieval now uses existing semantically retrieved RAG source IDs plus lexical fact/event matching with reciprocal-rank fusion, then adds at most two graph-neighbor facts from matched entities. Vector source hints are accepted only for currently attached project collections; graph lookup rechecks project, owner, ready status, accepted review and active source revision. No new tables or migrations.
- Verification: 15 focused tests passed; scoped Biome passed; typecheck passed with a 6 GB Node heap (default 2 GB heap OOMed); fresh production build passed, 206/206 static page slots. Existing build warnings remain. No live PostgreSQL/provider/browser execution.
- `docs/feature-work-register.md` B07 now records actual implementation and remaining work. B07 remains PARTIAL (status snapshot chat injection, brain-specific vector/FTS retrieval and live end-to-end evidence remain). Local only; no push/deploy/production database or V2 change.
- Next: continue substantial end-to-end parity work, prioritizing deployment-aware model metadata or durable exact-argument approval for dynamic workflow side effects. Preserve security behavior and the original monthly team-budget customization.

## 2026-11-08 00:40 IST � Review hardening and fresh verification
- Independent review led to stricter collection-filter-before-cap behavior, a five-source hint cap, 12-record lexical candidates, a two-neighbor graph cap, defensive accepted/ready/owner filters, and cleared timeout timers. Added semantic-only, foreign-collection, duplicate/rejected/stale/foreign-owner, one-hop SQL and cap assertions.
- Verification on the final code: 15/15 focused tests, scoped Biome, `git diff --check`, typecheck with 6 GB Node heap (default heap OOM), and fresh production build exit 0 with 206/206 static page slots. Build warnings remain from existing dependencies/config and Next dynamic routes.
- Remaining B07 gaps: current status snapshot prompt integration, brain fact-level vector/FTS retrieval, realistic PostgreSQL EXPLAIN/latency, live provider/browser and broader citation workflow. Wildcard ILIKE scan behavior is unmeasured; do not call B07 complete.
- Local only. No push/deploy, production DB operation, migration apply, or V2 modification. Next major candidate: add validated model catalog display metadata/filters without conflating display USD prices with Void Agent's custom EUR budget pricing.

### Model catalog metadata batch verification - 2026-11-08 01:08:50 IST
- Added a separate curated model-display metadata path: administrator-managed provider/model labels, country codes, badges, and display-only USD per-million prices; authenticated model catalog projection; and model-picker badges/filters. This does not alter provider secrets, monthly budget enforcement, or the existing EUR budget pricing.
- The admin config API validates the metadata on read/write/import; the metadata is stored in the existing JSON config without a SQL migration. Provider settings saves omit this separately edited field so a stale provider form cannot overwrite it.
- Verification on the current combined local diff: 8 focused test files / 28 tests passed; scoped Biome on 21 files passed; pnpm check-types passed using a 6 GB Node heap; fresh pnpm build exited 0 with all 206/206 static page slots; git diff --check passed.
- Build emitted existing warnings for dependency analysis, <img> usage, missing optional Redis/Upstash/E2B configuration, dynamic session probing, multiple lockfiles/workspace-root selection, and PostgreSQL SSL-mode semantics. Local Upstash is not configured, so build-time free-tier checks report per-instance memory fallback; no live service verification was done.
- etter-chatbot/main was re-fetched and remains at 6f4183566bc48616303cb84055f11f79578c82fe; no newer commits since the reviewed mention chips, fixed-total member cap, and README changes. The fixed-total cap remains intentionally unported to preserve Void Agent's monthly budget policy.
- Mention-chip and hybrid project-brain changes also remain in this local diff and were included in focused tests/typecheck/build. A13 and B07 remain PARTIAL; no workflow is promoted to COMPLETE without end-to-end evidence. The broader migration remains incomplete and no completion percentage is asserted.
- No push, deployment, production database operation, migration application, reference checkout modification, or Void AgentAI spec change. Current source/doc modifications are local and uncommitted.

### Current project status in chat - 2026-11-08 01:21:24 IST
- Added the existing source-fingerprint-validated project status snapshot to eligible interactive project chat context alongside query-matched brain facts/events. The lookup reuses the authenticated request's access result only if its project ID matches, validates current accepted source scope through the existing status context builder, and uses a 650 ms timeout so status can be skipped without blocking normal chat.
- The prompt includes a bounded summary, up to three blockers, three accepted tasks and three recent events. All text/attributes are XML-escaped and explicitly labeled untrusted source-derived evidence. No new schema or DB migration.
- Verification: combined focused suite 9 files / 34 tests passed; scoped Biome passed; pnpm check-types passed with a 6 GB Node heap; fresh pnpm build passed with 206/206 page slots. Build retains existing dependency, image, optional service, dynamic-session, lockfile-root and PostgreSQL SSL warnings. No live database/provider/browser journey.
- Updated B07 in docs/feature-work-register.md; it remains PARTIAL for missing fact-level vector/FTS indexing, wider citations and realistic query-plan/latency verification. No project-wide percentage claimed.
- All changes remain local; no push, deploy, production DB action, or V2 modification.

### Status lookup performance refinement - 2026-11-08 01:31:12 IST
- Narrowed automatic status snapshot retrieval to status-oriented questions (status, progress/progression, milestones, blockers, risks, deadlines, on-track/behind-schedule, upcoming tasks). Ordinary project queries do not run the additional full current-fingerprint context reads. If the optional lookup fails or reaches 650 ms, it is omitted.
- Final verification after this change: 9 focused test files / 35 tests passed; scoped Biome and TypeScript pass; fresh pnpm build exit 0 with 206/206 generated pages; git diff --check pass.
- Build still emits existing dependency/image/config/dynamic-session/lockfile/PostgreSQL warnings. No live PostgreSQL/provider/browser execution. B07 remains PARTIAL for indexing, citations and production query-plan/latency evidence.
- Correction to the immediately preceding entry: current status context is included only for status-oriented questions, not every eligible project-chat message.

### Next implementation target
- C08: design and implement durable saved-workflow pause/review/resume for dynamic side-effect arguments. Existing pre-run approval binds workflow revision and explicit input but fails closed on runtime-resolved effect parameters. Parity requires persisting execution state, displaying the exact resolved effect for human review, binding approval to that pending execution/effect, resuming without repeating completed nodes, and enforcing expiry/ownership/revision/idempotency checks. Do not relax the current fail-closed behavior until this lifecycle is implemented and verified end to end.

### C08 durable workflow approval persistence groundwork - 2026-11-08 01:52 IST
- Continued from the saved C08 checkpoint. Added a bounded JSON state contract and a PostgreSQL execution table/migration for saved workflow runs; added a repository for owner-scoped reads, atomic per-node checkpoint merges, exact side-effect payload hashes, approval binding, one-time durable effect-start marking, and uncertain-outcome containment.
- Security intent: keep the current pre-run fail-closed review unchanged; this new persistence layer does not yet make dynamic effects runnable. Callers must still recheck workflow publication/revision and MCP access. A side effect whose durable started marker exists without a persisted result must become `effect_uncertain`, never be silently replayed.
- Verification: 8 focused unit tests pass across 2 files; `pnpm db:check` passes; scoped Biome and `git diff --check` pass; `pnpm check-types` passes with a 6 GB Node heap. No migration was applied and no live PostgreSQL, chat, or browser workflow was run.
- C08 remains PARTIAL: executor replay/interrupt support, approval/resume API, exact effect review UI, cancellation/expiry handling, and full user-journey verification remain. Do not describe this foundation as feature parity.
- Modified: `src/lib/ai/workflow/execution-state.ts`, its test, `src/lib/db/pg/repositories/workflow-execution-repository.pg.ts` and its test, `src/lib/db/pg/schema.pg.ts`, migration `0074_workflow_executions.sql`, and migration journal. The pre-existing `Void Agent-V2` checkout and untracked Void AgentAI specifications were untouched. No push, deploy, or production DB action.
### C08 executor checkpoint/replay support - 2026-11-08 02:05 IST
- Extended the existing graph executor with optional durable execution hooks. A resumed run can seed a node's saved input/output and skip its completed implementation, while recording successful new node results after execution.
- Resumable executions serialize node bodies so parallel graph branches cannot race the current single persisted approval slot or checkpoint ordering. Ordinary non-resumable workflow execution keeps its existing concurrent behavior.
- Added a replay test proving a completed node is skipped and later nodes are checkpointed. The existing branch/linear executor tests remain green.
- Verification: 15 focused tests across 3 files pass; scoped Biome and `git diff --check` pass. `pnpm check-types` is rerunning after this executor change. No API/UI integration or live DB/browser verification yet; C08 remains PARTIAL.
### Typecheck completion follow-up - 2026-11-08 02:08 IST
- The typecheck started during executor-hook validation completed successfully with `NODE_OPTIONS=--max-old-space-size=6144`. A fresh final sequence after the executor serialization change also passed: `pnpm check-types`, `pnpm db:check`, and `git diff --check`.
### C08 approval rejection and verification update - 2026-11-08 02:08 IST
- Added a repository transition to cancel only the pending effect bound to the signed-in owner's exact effect hash; mismatched owner/hash/status returns no row and cannot alter another execution.
- Final focused tests: 16/16 across 3 workflow files. Scoped Biome, `pnpm check-types` with a 6 GB Node heap, `pnpm db:check`, and `git diff --check` pass.
- This is still persistence/executor groundwork. The approval/resume API, chat-card UI, exact effect preview redaction, and end-to-end workflow are outstanding. No migration apply, live PostgreSQL, production build, push, or deploy.
### C08 chat/API approval wiring and replay review - 2026-11-08 02:25 +05:30
- Connected saved-workflow durable execution to chat streaming, added owner-scoped approve/reject endpoint with same-origin, rate-limit, pending-effect hash, authorization/publication/revision/MCP rechecks, and added a redacted effect review card with uncertain-outcome messaging.
- Resume behavior reuses the exact previously reviewed tool arguments; it does not regenerate arguments via the model. Fixed an exhaustive-union type issue in MCP/app-tool target selection.
- Verification after this batch: 19/19 focused tests across 4 files pass; pnpm check-types passes; pnpm db:check passes; scoped Biome on the changed C08 files passes; git diff --check passes. A broad Biome scan of the whole workflow directory reported pre-existing formatter differences in unrelated legacy files, so no broad formatter rewrite was applied.
- C08 remains PARTIAL: no live PostgreSQL migration/run or authenticated browser end-to-end verification has been performed; production build/full regression suite remain outstanding. Migration 0074 remains unapplied. No push, deploy, or production database action.
- Updated docs/feature-work-register.md. Full migration is not done; multiple major reference capability families remain incomplete.
### C08 payload encryption and build verification - 2026-11-08 03:35 +05:30
- Reviewed persisted approval effects and found that exact resolved HTTP/MCP arguments could include credentials in headers or bodies. Added AES-256-GCM encryption of the effect payload in JSONB using the existing lib/security/encryption.ts helper; metadata/hash stay queryable, and repository owner-scoped reads decrypt before the execution service validates and resumes. Legacy plaintext effect rows remain readable for compatibility; new writes fail closed if the existing encryption key is unavailable.
- Added coverage proving effect payloads are encrypted in storage, decrypted on owner-scoped reads, and approved MCP arguments are replayed exactly without another model parameter-generation call.
- Verification: focused workflow/approval suite 25/25 tests across 6 files; pnpm check-types; pnpm db:check; scoped Biome; git diff --check; and pnpm build all passed. Build compiled and generated 206/206 pages. It emitted existing warnings for inferred workspace root/multiple lockfiles, dynamic session reads during static attempts, optional Redis/E2B configuration, PostgreSQL SSL modes, dependency critical imports, and <img> usage.
- C08 remains PARTIAL: no local PostgreSQL migration/run or authenticated browser approval journey was exercised. No DB migration was applied. No push/deploy/production DB action.
- Updated feature register. Next feature candidate from parallel read-only audit: C12 connector lifecycle (pause/resume/disconnect) has inconsistent supported-provider sets; resume exposes only 7 of the ~50 supported providers and lifecycle route tests are absent. Plan: centralize validation and cover ownership/state/token cleanup, then update exact counts.
### C12 connector lifecycle reconciliation - 2026-11-08 03:44 +05:30
- Corrected the shared connector provider definition: 15 base providers plus 33 OAuth and 12 token-only reference integrations = 60 valid providers. Reused this single registry/type in connector credentials, token refresh, API catalog typing, and client settings typing; pause/resume/disconnect now validate URL parameters against it rather than casting arbitrary strings.
- Fixed a lifecycle inconsistency: pause had been implemented as a toggle, so calling /pause on an already paused connector could resume it. It now always pauses idempotently, preserves credentials, requires an owned connected connector, and uses an isConnected update guard/returning result to handle a concurrent disconnect. Resume now covers all 60 providers, validates ownership/connected state, and preserves credentials. Disconnect still revokes best-effort and clears local tokens under owner scope.
- Added route tests for pause/resume/disconnect: 9/9 pass. Scoped Biome passes; pnpm check-types passes with the configured 6 GB Node heap; git diff --check passes. The production build passed before this C12 code change (206/206 pages); a post-C12 production build remains pending. No live DB/provider OAuth journey.
- C12 remains PARTIAL pending live persistence and provider verification. The audited register stays at 61 PARTIAL + 1 MISSING compatible workflows (62 unresolved), with the other statuses unchanged. This is not the full migration total because census surfaces still need workflow mapping.
- Files changed in this batch: src/lib/connectors/providers-list.ts, src/lib/connectors/credentials.ts, src/lib/connectors/refresh.ts, src/app/api/connectors/route.ts, src/app/(chat)/settings/connectors/connectors-settings-view.tsx, src/app/api/connectors/[provider]/pause/route.ts and test, 
esume/route.ts and test, disconnect/route.ts and test, plus progress documentation. No push, deployment, production database action, or V2 modification.
- Next audited code target: A21 attachment upload/storage/chat retrieval security coverage. The primary implementation already has a 15 MiB limit and owner-scoped reads; audit recommended tests for auth, MIME/size rejection, storage owner, and preventing foreign-user refs from reaching ingestion/provider conversion.
### A21 upload boundary tests and size-message correction - 2026-11-08 03:47 +05:30
- Added an early Content-Length guard (16 MiB multipart request cap) before ormData() parsing, retained the 15 MiB per-file check before the extra rrayBuffer() copy, and hardened malformed/non-file form values. Active content MIME blocking and authenticated ownerId storage behavior remain in place. Corrected the client toast from the inaccurate 50 MB claim to the actual 15 MiB limit.
- Added upload-route tests: 6/6 pass for auth-before-body, oversized declared request rejected before parsing, file-size rejection before byte read, active SVG rejection, authenticated owner passed to storage, and invalid storage config.
- Combined C08/C12/A21 focused suite: 40 tests across 10 files passed. Typecheck passes with 6 GB heap, scoped Biome passes, and git diff --check passes. The last full build (206/206 pages) predates C12/A21 changes; post-batch build not yet run. No real storage-to-model browser journey.
- A21 stays PARTIAL: chat already filters foreign managed-storage keys before privileged download/provider conversion, but a dedicated regression around that route boundary and an authenticated live storage/provider path are outstanding.
- The 70 reference workflows presently counted remain 61 PARTIAL + 1 MISSING; this batch changes evidence but does not claim an end-to-end COMPLETE item. More of the 206 source surfaces still needs mapping.
- No push, deploy, production DB operation, or reference checkout modification.
### Post-change build and attachment ownership verification - 2026-11-08 03:57 +05:30
- Extracted chat attachment ownership enforcement into src/lib/file-storage/chat-attachment-ownership.ts and wired the chat API route to it. The helper independently filters requested attachments and sanitizes message parts so foreign managed keys cannot reach the privileged ingestion/provider path. Two tests cover foreign-owner blocking plus same-owner files, inline images, and external source URLs.
- Current focused suites: 48/48 tests across 12 files passed. This includes C08 approval/persistence/executor cases, C12 connector lifecycle route cases, A21 upload boundary cases, storage-key rules, and chat ownership filtering.
- pnpm check-types (6 GB Node heap), scoped Biome over 32 changed source/test files, pnpm db:check, and git diff --check pass. Post-change pnpm build passed and generated 206/206 pages.
- Build warnings: inferred workspace root due parent package-lock.json and project pnpm-lock.yaml; dependency critical import warnings in E2B/unpdf; existing <img> lint warnings; optional Redis/E2B configuration warnings; expected dynamic-session logs while Next attempts static evaluation; and PostgreSQL SSL-mode aliases. These did not fail the build.
- C08, C12, and A21 remain PARTIAL because live PostgreSQL/browser/provider workflows were not run. Migration 0074 remains unapplied. The 70 reference workflows currently enumerated still show 61 PARTIAL + 1 MISSING (62 unresolved), 5 EXCLUDED, 2 OPTIONAL, and 1 DEPRECATED; no COMPLETE under strict runtime proof. This is scoped only; the 206-surface mapping is incomplete.
- No push, deploy, production database operation, V2 edit, or modification of user-provided specs.
### 2026-11-08 04:20 +05:30 - Upstream workflow parser port, table-review citation traceability, MCP approval hardening in progress
- Refetched `better-chatbot/main`; latest fetched commit remains `6f4183566bc48616303cb84055f11f79578c82fe`.Void Agent
- Git evidence shows no merge base between current `main` and `better-chatbot/main`; the trees differ across 3,798 paths (60 modified, 2,060 deleted, 1,380 added, 298 renamed by current diff detection), largely due to upstream moving to `apps/web` plus packages while Void-Agent keeps its primary app in root `src`. A direct merge/replacement would not preserve the current product; continuing as upstream behavior ports into the primary tree.
- Ported upstream commit `5cb318f` recursive TipTap workflow-input conversion: nested content and bullet lists render while mentions and hard breaks remain supported. Focused tests: 2/2; scoped Biome and `git diff --check` pass.
- D01 table-review citation traceability now preserves exact-quote validation, maps citations to ordered pinned source segments, displays evidence in the full review and chat tool surfaces, and exports answer/quote/segment evidence to XLSX. Segments are not represented as PDF page numbers. Focused tests run locally: 31/31 across 7 files; scoped Biome across 9 files passes. No database schema change.
- C13 MCP approvals now store an argument digest plus canonical MCP-config SHA-256 fingerprint (not endpoint secrets), compare current config before token consumption, recheck before dispatch, and check the active in-memory MCP client config before tool invocation. Focused suites: 44/44 across 5 files; 6 GB heap typecheck passed. A subsequent read-only audit found one remaining stale proposal-to-click gap: a server could change after tool definition/session creation but before the user approves. Chat and voice agents are adding a proposal-time snapshot/challenge; C13 is not complete until that is verified.
- No full test suite/build, live PostgreSQL, migration apply, provider-backed browser flow, push, deploy, production DB operation, or reference checkout modification in this batch.
- Current migration remains incomplete; no overall parity percentage is claimed. Continue with proposal-time MCP snapshot wiring, another verified upstream behavior port, then revalidate the integrated batch and update the work register.
### 2026-11-08 04:44 IST — MCP approval hardening, upstreaVoid Agent, and notification parity
- Continued implementation in parallel with three agents; Void-Agent remains the only target and the upstream checkout remains read-only.
- C13 MCP approval security: HMAC-SHA256 fingerprints use `BETTER_AUTH_SECRET` and fail closed if absent. Captured config identity follows the proposed call through confirmation, tokenVoid Agentconsumption and dispatch. MCP tool listing synchronizes requested servers and excludes stale/unverifiable clients. Focused integrated tests rerun locally: 73 passed across 8 files (includes MCP approval/executor/repository, voice approval and error-display coverage). Agent verification: 6 GB heap typecheck, scoped Biome and diff checks passed for C13 before the concurrent project-brain edits. C13 remains PARTIAL; no live DB/MCP journey and other connector/workflow mutation paths remain.
- Ported the actionable failed-chat guidance from upstream #407 into the original message UI. Only allowlisted safe messages are expanded; arbitrary provider errors remain hidden, and Void-Agent monthly team-budget guidance is preserved. Five focused tests and scoped lint passed. The concurrent typecheck reports no diagnostics in these files, but currently fails on project-brain changes below.
- Ported upstream notification list semantics: type filters also filter unread counts, and mark-all uses the explicit `{all:true}` payload. Existing origin/auth/rate/body limits, owner scoping and href sanitization remain. Local rerun: 8/8 tests; agent scoped Biome passed. C15 remains PARTIAL pending authenticated browser/live PostgreSQL verification.
- C02 monthly team AI budget enforcement was already implemented and locally verified at 11/11 route tests; the register now records active-organization membership checks, bounded reservation/settlement, release only for unspent calls, and no hidden fallback for budgeted requests. Live PostgreSQL/provider flow remains unverified.
- Project-brain chat learning is still in progress, not complete. Current additive schema/migration draft is `0075_project_brain_chat_sources.sql`; queue processing, lifecycle wiring, focused tests and type repair are not finished. A concurrent typecheck reports 39 errors in the project-brain files owned by that batch; the agent is resolving them. Do not apply the migration to any database.
- No full regression suite/build after this batch; latest production build predates the current changes. No migration application, live DB, push, deploy, V2 modification, or production action. No overall parity percentage is asserted; remaining 206-surface mapping is incomplete.
### 2026-11-08 04:52 IST — C15/C16 and voice delegation verified; C01 upstream port started
- C15 notification behavior now rejects empty `{}` and `{all:false}` mark-read bodies; callers must provide non-empty owned IDs or explicit `{all:true}`. Local route + contract suite: 13/13 passed.
- C16 push UX uses the existing owner-scoped subscription API and service worker. Added a push-specific browser client for permission states, VAPID-key refresh, subscribe persistence and server-first unsubscribe; the existing center gives recovery guidance for denied/dismissed/unsupported states. Local combined push/notification suite: 26/26 across 6 files; C16's focused subset reported 19/19 across 4 files. Scoped Biome passed; no live VAPID delivery.
- B22 upstream voice agent delegation is implemented in `/api/voice/run-agent` and the three voice hooks. Route enforces auth/saVoid Agentrate limits, owner-visible agent access, enabled pinned/default model resolution, strict input/output/runtime bounds, no delegated tools, and existing team budget reserve/settlement. Local route/provider suite: 11/11 across 3 files; scoped Biome and diff check passed. ElevenLabs needs a blocking `runAgent` tool configured in its dashboard; exact schema/setup is documented at `docs/voice-agent-delegation.md`. Live provider flow remains unverified.
- C01 upstream audit found the executable six-preset catalog plus authenticated `POST /api/agent/from-preset` in the reference. Void-Agent has no equivalent catalog/route/entrypoint. Implementation is now underway with owner authorization and an additive idempotent preset ID; migration is draft-only.
- Project-brain chat-source batch remains in progress. The last 6 GB typecheck reported 11 errors in the active brain changes (nullable source IDs, queue predicates, context/status typing). The agent is fixing these; no push or DB application. Previous handoff type-error counts were stale and should be superseded by this entry.
- No full test suite or fresh production build after current edits; no live PostgreSQL/browser/provider journey, migration application, push, deploy, production DB action, or reference checkout modification.
### 2026-11-08 05:03 IST � B23 read-only voice web search; B20 browser audit
- Implemented a query-only `searchWeb` voice capability through the existing Exa/SearXNG provider. Authenticated same-origin route is owner-rate-limited, validates 2�500 character queries, accepts no URL, forwards request abort and a 12-second timeout to the provider, emits at most five public citation links with 600-character excerpts, marks excerpts untrusted, and does not fetch returned pages or mutate websites.
- OpenAI Realtime, Groq/Konvo, and ElevenLabs client callbacks are wired. ElevenLabs requires a matching blocking `searchWeb` client tool in the provider dashboard; setup is documented at `docs/voice-web-search.md`.
- B20 remains MISSING. Upstream relies on isolated Kernel browser + credential vault + organization policy/credit gate + abortable streamed status and read-only live view. Primary Steel/Crawl/Cloak browser workflows permit arbitrary navigation and interaction without equivalent isolated egress/redirect controls or prompt-injection boundaries. No unsafe browser automation was exposed to voice. Public search is separately registered as B23, not parity.
- Ledger updated to 73 scoped workflows: 63 PARTIAL, 1 MISSING, 5 EXCLUDED, 2 OPTIONAL, 1 DEPRECATED, and 1 primary-only custom. This is not the complete 206-surface census or an overall completion percentage.
- Verification: B23 focused tests 9/9; combined B22+B23 tests 18/18 across five files; scoped Biome lint and `git diff --check` passed; `pnpm check-types` with 6 GB heap exited 0. Search was tested through mocks only; no live Exa/SearXNG or provider-dashboard run. Project-brain runtime behavior tests remain separately unverified.
- Files changed for B23: `src/app/api/voice/web-search/route.ts`, its route test, `src/lib/ai/tools/web/web-search.ts`, `src/lib/ai/speech/index.ts`, voice hooks for OpenAI/Konvo/ElevenLabs, new speech web-search client/helper tests, `docs/voice-web-search.md`, `docs/feature-work-register.md`, this handoff/testing/context update. No browser agent, V2, DB schema, push, or deployment changed.

### 2026-11-08 05:05 IST — Project chat learning veVoid Agentce verified
- Ported upstream #425 chat-learning behavior into Void-Agent's existing project-brain system. Completed project-chat turns create bounded text-only source revisions; tool arguments and attachment metadata are excluded. A queued worker verifies owner/project/thread/revision before extraction; facts remain proposed until review. Current accepted chat-derived evidence is available in project context.
- Edits/truncation refresh the active revision and invalidate old claims; deleting a thread/message or detaching it from a project revokes the source. Brain GET/review APIs and panel show current source status/labels. Document-source authorization paths remain explicitly source-type guarded.
- Focused project-brain suite: 32/32 tests across 6 files. `pnpm check-types` (6 GB heap), `pnpm db:check`, scoped Biome (23 changed paths), and `git diff --check` pass. Migration 0075 is additive and journaled but unapplied; no DB-backed worker/review/browser E2E.
- Current scoped feature register now has 74 candidates: 64 PARTIAL, 1 MISSING, 5 EXCLUDED, 2 OPTIONAL, 1 DEPRECATED, 1 PRIMARY CUSTOM. This remains a scoped count; no overall parity percentage because the full upstream surface census still needs workflow mapping.
- Also verified in this continuation: C15/C16 notification+push suite 26/26; B22/B23 combined voice suite 18/18; C01 local preset route/repository/schema rerun 7/7. Migration 0076 for preset adoption is additive and unapplied. Full build not yet rerun on the current tree.
- In progress: C17 lazy settings context; C20 accurate remote MCP consent display; next project batch remains dependent on full regression/build. No push, deploy, production database, migration apply, or reference checkout modification.
### 2026-11-08 05:11 IST — C17 lazy account settings and C20 desktop consent wording
- C17: adapted upstream lazy settings-context loading. The chat layout no longer needs to server-render the account/provider summary on every render; the drawer fetches it on open from an authenticated, owner-scoped, no-store endpoint and shows a loading state. Existing password/recovery/session protections remain. Implementation agent ran 18/18 tests across 4 files and full typecheck; root locally reran the new route/UI pair (5/5). Live DB/email/browser/session journey remains unverified.
- C20: corrected native consent for remote HTTPS MCP calls to identify the origin, explain that exact arguments are sent to it and results return as untrusted, while keeping credential values hidden. Local desktop MCP regression tests: 22/22 across 5 files; desktop typecheck/build and scoped Biome passed. No live Electron or remote server journey.
- Scoped ledger remains 74 workflow candidates (64 PARTIAL, 1 MISSING, 5 EXCLUDED, 2 OPTIONAL, 1 DEPRECATED, 1 PRIMARY CUSTOM). No overall percentage because the 206-surface census is not fully mapped.
- Current work in parallel: A23 audio/multimodal gap audit+implementation; B20 isolated Kernel browser integration investigation; C17/C20 batches locally verified. Full app production build remains pending after the latest combined code changes. No push/deploy/production DB/migration apply/reference modification.
### B20 Kernel egress-boundary decision - 2026-11-08
- Upstream Kernel browser-run uses server-side credentials/profiles and arbitrary model-authored Playwright code in the same VM as Chrome. The current SDK's `network.allowed_hosts` filters only Kernel-managed browser-proxy egress; it explicitly does not filter VM processes bypassing that proxy, and relies on proxy v3 plus an organization feature flag. No DNS pinning/private-address guarantee for allowed hostnames was established.
- Safe decision: B20 remains MISSING; no code was added. B23 voice web search is a distinct query-only workflow. Also record the official Nov 4, 2026 Kernel security incident and require vendor-risk review before any later integration. Next code target: C04/C05 MCP server registration and per-server/tool customization audit.

### 2026-11-08 05:43 IST — B05 safe project-document unlink UX
- Compared upstream project document actions with primary. UVoid Agentposes per-document download and destructive delete; primary already uses current project/collection source-owner checks, private byte proxy downloads with safe headers/rate limits, non-destructive unlink with role/recheck guards, and source-revision-bound tracked DOCX proposal/accept/reject flows that preserve the original file.
- Ported the useful reference confirmation interaction with Void-Agent semantics: before unlink, the UI explains that the source remains in its Knowledge collection and any other linked projects. Cancel sends no write; confirmed unlink calls the existing same-origin editor-authorized API, then reloads the list. Did not copy upstream destructive deletion.
- B05 remains PARTIAL: independent project storage spaces and live PostgreSQL/authenticated browser verification remain. No API contract or schema change.
- Verification: project document unlink/download/tracked-edit routes and panel suite passed 18/18 tests across 5 files; scoped Biome, 6 GB heap full typecheck, and scoped `git diff --check` passed. No live DB/storage, push, deploy, or reference changes.
### C22 problem-report notification parity - 2026-11-08

- Compared Better Chatbot's problem-report route with pVoid Agentavior. Upstream writes the report, then emits best-effort incident telemetry and sends a staff notification. It does not provide a triage assignment/status workflow. Primary already has admin-only owner-safe status triage; no assignment capability was invented.
- Added optional post-persistence notification through Void-Agent's regional Resend integration, routed only to a server-configured single `PROBLEM_REPORT_NOTIFY_TO` recipient. The message includes report ID, bounded summary, sanitized page URL/locale/viewport and screenshot count; it omits reporter identity and private object keys. Subject/header injection is rejected, HTML user content is escaped, and email failure does not fail durable report submission. `.env.example` documents the optional destination.
- Focused unit/API suite: 10/10 passed across the problem-report API and notification helper tests. Tests cover recipient validation, injection escaping/bounds, sanitized URL content, and failure isolation.
- C22/F031 remains PARTIAL pending live email delivery and authenticated PostgreSQL/browser verification. Upstream Superlog/trace linking was not copied because primary has no equivalent OTel setup/schema field; no database migration was needed or applied. No push/deploy/reference modification.
- Verification update: Expanded the focused coverage for missing-recipient behavior, insertion-before-notification order, and long-subject ID retention; rerun passed 12/12 across 2 files. Scoped Biome and changed-path `git diff --check` passed. Full typecheck is blocked by an unrelated existing/in-flight Dodo component diagnostic at `src/components/payments/dodo/dodo-upgrade-card.tsx(129,18)`; no C22 diagnostics were reported.
### B06 project-brain extraction status and recovery - 2026-11-08

- Upstream inspection found a latest-run status surface, sanitized failure information, stale-run detection, and editor recovery affordance. Primary's queue API already carried run timestamps, attempts, and safe error messages and already recovered failed/stale-running runs, but the project source UI omitted those fields and disabled all running entries indefinitely.
- Added shared five-minute lease predicates for server and client use. Project source entries now expose attempt count, stale-running state, safe failure message to editors, and `Retry analysis` only when the backend can recover the run. Current running/queued jobs cannot be restarted through the UI; stale queued entries display scheduler wait state. Worker budget/accounting and source ownership checks remain untouched.
- The brain API regression fixture was updated for current separate chat-source owner validation: it now asserts no document-derived queries while allowing the membership-scoped chat-source lookup.
- Focused tests passed 21/21 across 3 files; scoped Biome and diff checks passed. Full typecheck pending at this entry. B06 remains PARTIAL pending live scheduler/Postgres/browser verification. No schema/migration change, migration apply, push, deployment, or reference edit.
- Verification update: The integrated 6 GB TypeScript check completed successfully after the initial focused run. No diagnostic in B06 files. Production build/live database/browser journey remain unverified.
### C03 clone published agents into user-owned copies - 2026-11-08

- Added a separate gallery **Copy to my agents** action and `POST /api/agent/[id]/clone`; the existing Install button/`agent_install` record and count remain separate and unchanged.
- The route checks session, agent-create permission, same-origin, UUID validity, and per-user rate limit. The repository opens a transaction, locks the source row (`FOR SHARE`), rechecks `published_at` and public/readonly visibility, then creates a private copy owned by the caller. A user/source deterministic `preset_id` makes concurrent/repeated requests idempotent.
- Clone payload is sanitized to name/description/icon and role/system prompt only. It does not inherit model pins, MCP/agent mentions, file references, publication state, gallery metadata/cover, or install count. No integrations/secrets are copied.
- Focused clone route/repository plus existing install/gallery regression suites: 33/33 passed across 6 files; scoped Biome and changed-path diff check passed. Typecheck pending at this entry. No migration/schema change or database action. C03 remains PARTIAL until live PostgreSQL/browser journey verification.
- Verification update: After A22's `pdf-ingest.ts` file reappeared, the full 6 GB TypeScript check completed successfully. The earlier TS6053 was a transient concurrent file-state error, not a C03 code diagnostic.
### 2026-11-08 06:15 IST — B17 voice-device credential rotation
- Added an authenticated, same-origin, user-rate-limited endpoint to rotate the bearer credential for an active device owned by the caller. Repository write is owner/status scoped and stores only the peppered token digest; the new bearer is returned once with `Cache-Control: no-store`.
- Added dashboard confirmation and one-time copy/hide handling. Successful revocation clears any displayed replacement token. Firmware/command dispatch were untouched.
- Focused route/repository/UI tests passed 8/8; scoped Biome, changed-path diff check, and integrated 6 GB TypeScript check passed. No live PostgreSQL/device workflow, migration, push, or deployment. B17 remains PARTIAL pending hardware/PostgreSQL verification.
### 2026-11-08 06:24 IST — B18 paginated device session history
- Primary already had authenticated session listing and ordered, bounded transcript segments, but the dashboard only loaded the newest 20 sessions. Added keyset paging over `(started_at,id)` and a “Load older sessions” button. The cursor preserves PostgreSQL microseconds; endpoint validation, no-store response, user/device predicates and existing segment text limits remain in force. No token fields are exposed.
- Reference inspection found no paired-device session/segment history route and its WebSocket path depends on an absent external bridge script. No firmware, websocket or command dispatch was added.
- Focused API/repository/UI suites passed 15/15; scoped Biome and diff check passed. Whole-project TypeScript is awaiting the concurrent A06 check; a duplicate check was stopped and surfaced only an unrelated in-flight workflow type diagnostic. No live DB/device run, migration apply, push or deploy. B18 remains PARTIAL.
### 2026-11-08 06:34 IST — B07 source-state and citation-boundary hardening
- Upstream project search returns ranked project chunks and numbered citation guidance. Primary already had tighter collection/team/project ACLs and active project-brain revision controls, but local vector RAG could still match leftover chunks if an ingestion ended as `failed`/`chunking`; its SQL lacked the ready-state predicate.
- Local RAG now filters `collection_item.status = ready`, preserving owner/team/collection scope. Retrieved prompt excerpts and source labels are XML-escaped into indexed `<source>` envelopes and the model is explicitly told to treat source text as untrusted evidence, never instructions/tool requests. Citation ranks and chunk limits remain.
- Focused retrieval/formatter/project-brain tests passed 37/37 across 3 files. Scoped Biome/diff check pending at this entry. No live DB/provider/browser, migration, push or deployment. B07 remains PARTIAL for fact-level vector/FTS, citation UI, query-plan and live workflow gaps.
- B07 verification update: focused retrieval/formatter/project-brain tests pass 37/37; scoped Biome and diff check pass. Full 6 GB TypeScript run reports only the concurrent A07 `chat-export-repository.pg.ts(37,14)` interface mismatch (four missing share contract methods); no B07 diagnostics. No live DB/provider/browser workflow.
### 2026-11-08 06:41 IST — B08 graph neighbor navigation
- Upstream graph detail supports following links/backlinks into another entity. Primary already had a source-scoped node detail API, but its Related neighbors were plain text. Added accessible neighbor buttons in the graph detail panel; selection opens that node through the existing authenticated detail fetch.
- Preserved existing project access, ready source, collection owner allowlist and active source-revision checks. Added SQL-contract coverage for those predicates. No endpoint/schema changes.
- Focused graph/detail/UI tests passed 14/14. Scoped Biome/diff and aggregate TypeScript pending. No live DB/browser, migration, push or deployment. B08 remains PARTIAL.
### 2026-11-08 06:46 IST — B09 exact timeline source revision preview
- Timeline events now expose the source-version ID from their current run. The timeline UI can fetch and display that exact immutable snapshot with a no-store request.
- The version endpoint now joins the run and rechecks `projectBrainRunIsActiveSourceRevision`; existing project access, collection/owner allowlists, ready status, source fingerprint/length validation, and rate limit still apply. An edited/revoked source can no longer be previewed through a stale event card.
- Focused UI/timeline/version tests passed 8/8; scoped Biome/diff passed. Aggregate TypeScript pending parent check. No live DB/browser, migration, push, or deploy. B09 remains PARTIAL.
### B03 upstream project-thread history adaptation — 2026-11-08Void Agent
- Added a bounded project chat history view and owner-scoped list endpoint based on Better Chatbot's project threads API. Project membership is checked before querying, and the SQL additionally limits rows to the authenticated user's own chats to preserve Void-Agent privacy.
- Focused tests: 6/6 across API and UI; scoped Biome and `git diff --check` passed. B03 remains PARTIAL pending project-thread assignment parity and live PostgreSQL/browser verification.

### 2026-11-08 06:51 IST - B09 contradiction evidence provenanceVoid Agent
- Adapted the reference contradiction review's source-attribution behavior to Void-Agent's existing fact model: current conflict cards identify each source document and observation time beside its evidence excerpt.
- Graph responses include this metadata only on conflicting claim pairs after existing project/collection/owner, `ready`, and active-source-revision filters. The UI renders labels as text and does not add arbitrary source links.
- Focused route/component tests passed 12/12; scoped Biome and `git diff --check` passed. No schema change, live PostgreSQL/browser run, push, or deploy. B09 remains PARTIAL.

### 2026-11-08 06:52 IST — Aggregate check for current direct-port batch
- Current code changes include owner-controlled hashed chat shares, bounded project-aware thread forks, project-thread history, exact timeline source previews, contradiction evidence provenance, and server-derived password-change ownership.
- Verification: `pnpm check-types` passed; `pnpm db:check` passed; project-thread API/UI focused tests passed 6/6; scoped Biome and changed-path `git diff --check` passed.
- No migrations applied. Live PostgreSQL, browser end-to-end, production build and provider verification remain pending. No push/deploy/reference edit.

### 2026-11-08 — C06 bounded MCP resource links
- Upstream MCP resource-link output is now represented as a user-clicked HTTPS link with a visible host, bounded labels, no embedded credentials, and `noopener noreferrer`. No result URL is fetched or embedded automatically; unsafe URI text is redacted from result JSON. Existing bounded inline raster image rendering remains in place.
- Focused utility/UI tests passed 9/9; scoped Biome and diff checks passed. Remaining MCP media/resource workflows and live server/browser execution keep C06 PARTIAL.

### Verification correction — full test suite, lint, and production build in progress (2026-11-08)
- Full unit suite rerun passed 491 files / 2,615 tests after adding the missing project-chat-source mock to the brain todo route test.
- `pnpm lint` passed with only existing `<img>` performance warnings. `pnpm db:check` passed without applying migrations. 6 GB TypeScript check passed; the default 2 GB runner OOMs on this repository.
- The first production build found Next bundling the native canvas binary. Added `@napi-rs/canvas` to `serverExternalPackages`. The next build stage found the voice search URL helper exported from an App Router route; moved it to `src/lib/voice/public-web-url.ts` and verified its focused tests. Final production build is now rerunning; status pending.

### 2026-11-08 — Project assignment triggers existing chat ingestion
- Existing project selector assignment is now connected to the current source-version/brain queue: after owner/project validation and persistence, the transcript is snapshotted and queued for the destination project. Moving/detaching continues to revoke prior source evidence before changing scope. Queue errors are logged and do not misreport the persisted project change as failed.
- Focused `actions.project-brain.test.ts` passed 7/7; 6 GB full TypeScript check passed. Final production build pending. Migration 0075 stays unapplied; no live PostgreSQL/browser action.

### Final verification update — 2026-11-08
- Final test suite passed 491 files / 2,617 tests; production build passed and generated all 205 pages; lint passed with existing warnings; 6 GB typecheck and Drizzle migration-metadata check passed; `git diff --check` passed.
- Build emitted an environment schema warning for missing `agent.preset_id` (migration 0076 remains unapplied) plus the expected no-Redis rate-limit fallback warning. The build generated pages, but a live migrated PostgreSQL-backed runtime has not been verified. No database migration/apply, push, or deploy occurred.
- Local-only state: `main` remains at the same commit as `origin/main`; 334 changed paths remain uncommitted. The reference tree is unchanged.


### 2026-11-08 — C05 customization trace and C06 inline audio
- Compared the MCP server/tool prompt customization path with Better Chatbot 2.0. The primary already has per-user persistence, cache invalidation after save/delete, filtering to tools currently bound for the request, and system-prompt composition for chat and voice. No duplicate code was added. C05 remains PARTIAL until live PostgreSQL and browser-to-MCP verification.
- Added safe inline MCP audio result playback: allowlisted MIME types only, at most 2 clips and 2 MiB per clip, base64 validation, transcript-byte redaction, native controls, and `preload="none"`. Existing MCP approval and authorization code was untouched.
- Focused MCP media/UI tests passed 12/12; scoped Biome and changed-path `git diff --check` passed. C06 remains PARTIAL pending broader resource behavior and a live authenticated MCP journey.
- No PostgreSQL, browser automation, migration apply, push, deployment, or reference checkout modification.
### A15 provider configuration editing follow-up - 2026-11-08 10:14 IST
- Admin custom providers now have an Edit action. It preserves the provider's curated ID and model defaults/fallback chain, allows name/base URL/model catalog updates and optional key rotation, and never returns a saved key to the browser. During discovery, the server reuses a saved encrypted key only when the provider ID and normalized endpoint match; editing the endpoint requires a newly supplied key.
- Focused tests: 28/28 across discovery, model runtime, and user-provider suites; scoped Biome passes. Integrated typecheck currently fails only at `src/lib/ai/tools/project-document.ts:47` because the active project-document work has a nullable filename type mismatch. No live DB/provider/browser verification, schema migration, push, or deployment was performed. A15 remains PARTIAL.

### A15 verification count update - 2026-11-08 10:17 IST
- Added direct admin-provider save route coverage for stable provider IDs, key retention and rotation, and secret-free responses. Focused provider verification now passes 30/30 across 5 files.

### B07 project document analysis from chat � 2026-11-08
- Ported Better Chatbot's model-invokable document-analysis workflow as a read-only project chat tool. Project prompt inventory is metadata-only. A tool invocation resolves exactly one project-linked document and rechecks current project membership, attached collection scope, source-owner allowlist, and source-ready state before reading it.
- Returned content is SQL-capped at 30,000 characters, escaped as untrusted evidence, and handled by the already budget-reserved chat model. No separate provider call or schema migration was introduced.
- Focused `project-document.test.ts`: 4/4 passed; scoped Biome and `git diff --check` passed. Final full TypeScript result is unverified because the run was canceled; live PostgreSQL, provider, and browser journey remain pending. B07 remains PARTIAL.

### 2026-11-08 10:33 IST � Provider, MCP media, and project-document ports; aggregate verification
- Added stable-ID editing for admin-configured OpenAI-compatible providers. Existing default/fallback selections, enabled state, timestamp, and encrypted key are retained; key rotation requires a new value. Server-side discovery reuses the saved key only for the same normalized endpoint. Focused provider suite: 30/30.
- Extended MCP result rendering with bounded allowlisted inline audio playback and redaction; verified existing server/tool customization behavior rather than adding a duplicate. Focused media/UI suite: 12/12.
- Ported Better Chatbot's model-invokable project document analysis into the existing project chat. Inventory is metadata-only; each selected document is re-authorized against live project membership, collection scope, owner and ready status; SQL bounds the read to 30,000 characters and marks it untrusted. Focused suite: 4/4.
- Aggregate verification on the combined worktree: `pnpm test` passed 493 files / 2,629 tests; `pnpm lint` passed with existing `no-img-element` warnings; 6 GB heap `pnpm check-types` passedVoid Agentild` passed and generated 205/205 pages. Build emitted existing dependency, workspace-root, dynamic-page-data/session, and absent Redis/Upstash configuration warnings. No migrations or production data were changed.
- Reference checkout was not edited; nothing was committed or pushed, and nothing was deployed. Existing unapplied migrations remain unapplied. Next code batch: adapt upstream onboarding to Void-Agent's current owner-scoped Composio and preferences APIs.

### 2026-11-08 10:35 ISVoid Agentnce checkout status observationVoid Agent
- Read-only `git -C ..\Void-Agent-V2 status --porcelain` reported 3,072 staged path records (34 modified, 1,336 deleted, 1,423 added, 279 renamed) at the first status check in this turn. No reference checkout file or Git operation was performed by this turn; preserve that state and do not claim the reference worktree is clean until its owner reviews it. Primary `Void-Agent` is on `main` at `23a0177397232874689d67100d2e6730b23e6c75`, matching `origin/main`; its local changes remain uncommitted and unpushed.

### A15 legacy fallback credential status - 2026-11-08 10:40 IST
- `GET /api/admin/providers` now reads the tools config only to determine whether `apiKeysSecrets[dyn_${id}]` is a non-empty string. `apiKeyConfigured` is true for either a direct stored provider key or this legacy fallback. No key is decrypted, serialized, or returned; failure to read the optional tools config does not hide providers whose direct key is configured.
- Regression coverage: GET returns `apiKeyConfigured: true` for a fallback-only provider while the encrypted sentinel remains absent from JSON; direct-key listings still succeed if the tools config read fails. Focused route suite: 4/4; scoped Biome and `git diff --check` pass.
- No migration, DB write, provider request, push, deployment, or reference checkout operation. A15 remains PARTIAL pending live database/provider/admin-browser verification.

### 2026-11-08 10:45 IST — E01 upstream onboarding vertiVoid Agent
- Added the global first-run onboarding flow adapted to Void-Agent's existing UI and secured Composio integration API. `/onboarding` resumes from stored preference state; overview choices lead to `/agents`, `/workflow`, or the app; connect-apps lists paginated toolkits and supports connect/disconnect; setup can be skipped when Composio is not configured.
- New `POST /api/user/onboarding` is authenticated, same-origin, rate-limited and strict-schema validated. `userRepository.updateOnboardingPreference` uses one `jsonb_set` update scoped by authenticated user ID, replacing only the onboarding key so notes/skills/notification preferences are preserved under concurrent updates.
- New completion handler verifies saved `step: done` before setting an HttpOnly, SameSite=Lax cookie (Secure in production). GET uses fixed same-origin redirects; POST supports new-device cookie sync. The `(chat)` layout gates only authenticated app pages, uses database state when cookie is missing, and avoids auth/OAuth/public routes.
- Verification: 23/23 focused tests across 7 files; 6 GB `pnpm check-types` passes; scoped Biome and `git diff --check` pass. No production build after this batch, live PostgreSQL, or live Composio OAuth/browser round trip. E01 stays PARTIAL. No schema migration, push, deploy, or reference modification.
- Changed paths include `src/types/user.ts`; new onboarding user/route tests; `src/lib/db/pg/repositories/user-repository.pg.ts`; new user-onboarding repository test; new `src/app/api/user/onboarding/**`, `/api/onboarding/complete/**`, `/app/onboarding/**`; new onboarding UI/gate helpers; `src/app/(chat)/layout.tsx`; and migration/security/testing progress documents.
### Reference status reVoid Agent26-11-08 10:47 IST
- Read-only `git -C ..\Void-Agent-V2 status --porcelain` returned 3,072 path records. The reference worktree is not clean; no file or Git operation was performed there by the onboarding batch. This is a status observation only, not a new baseline or a claim that the reference has remained untouched throughout earlier sessions.
### 2026-11-08 11:27 IST � Onboarding batch and final aggregate verificationVoid Agent
- E01 now adapts Better Chatbot's first-run onboarding as a resumable two-step Void-Agent wizard with agent/workflow entry points and optional Composio connections. It uses existing authenticated, owner-scoped Composio routes; onboarding preferences are atomically merged so notes/skills/settings are preserved. Completion state is checked server-side before an HttpOnly device cookie is set, and the gate is confined to authenticated chat pages. No schema migration.
- Onboarding focused suite: 23/23 across 7 files. Independent security review found no concrete redirect, cookie, CSRF, ownership or preference-loss defect. Provider edit/fallback status and project-document ACL suites also have focused regressions (provider GET 4/4; project document 6/6).
- Final aggregate verification after all current code: `pnpm test` passed 500 files / 2,656 tests; `pnpm lint` passed with existing `no-img-element` warnings; 6 GB `pnpm check-types` passed; `pnpm db:check` passed; `pnpm build` passed with `/onboarding` included and 205/205 static pages generated; `git diff --check` passed.
- BVoid Agentns environment/dependency warnings: parent npm lockfile workspace-root selection, E2B/unpdf dynamic dependency notices, session-dependent pages logVoid Agentg static collection, and absent Redis/Upstash fallback. No migration was applied and no production data was written.
- `Void-Agent` remains on `main` at `23a0177397232874689d67100d2e6730b23e6c75`, equal to `origin/main`, with 351 local status paths and no commit/push/deploy. `Void-Agent-V2` status remains 3,072 staged paths; this turn performed no reference checkout writes. Preserve that unknown-origin staged state.
- E01 remains PARTIAL pending live PostgreSQL, browser, and Composio OAuth verification. Continue upstream integration; do not report full parity or an overall completion percentage from the scoped 75 workflow rows.

### 2026-11-08 11:16 IST — E02 project onboarding and agentsVoid Agent
- Upstream behavior verified from V2 project-workspace.tsx, project-onboarding-content.tsx, step components, and /api/projects/[id]/onboard: guided goal/documents/tools/people/agents setup; goal and same-organization members persist at finish; project-brain ingestion is queued. Void-Agent adapts this to its dashboard and existing secured project/document/knowledge/connector/collaborator APIs.
- New project creation opens the wizard. Current step persists through authenticated same-origin editor-only /api/projects/:id/onboard; close retains it for reload/resume; skip-step advances; finish stamps completion; completed setup can be reviewed. Goal and collections save with existing project PATCH. Agent assignment uses /api/projects/:id/agents, restricted to the current caller's agents or public agents; another editor's private agent metadata is hidden and cannot be detached.
- Added project_agent, project.onboarding_step, and project.onboarding_completed_at in migration 0078 and the schema/journal. Migration is additive and unapplied; no database change was made.
- Focused tests 10/10; 6 GB typecheck passed; db journal check passed; scoped Biome passed. Live PostgreSQL/browser verification and a fresh production build remain pending. E02 remains PARTIAL.
- Changed code: src/app/api/projects/[id]/agents/route.ts (+ tests), src/app/api/projects/[id]/onboard/route.ts (+ tests), src/components/project-assigned-agents.tsx, src/components/project-setup-wizard.tsx (+ test), src/components/projects-dashboard.tsx, src/hooks/queries/use-projects.ts, src/lib/db/pg/schema.pg.ts, migration 0078_project_setup_agents.sql, and migration journal.
- No push, deployment, migration apply, or reference checkout write.

#### E02 final review corrections — 2026-11-08 11:24 IST
- Agent access policy is consistent across surfaces: team projects can assign/list public agents only; personal projects can assign/list the current caller's private agents and public agents. Another user's private assignment cannot be attached, listed, or detached. UI explains the team-project restriction.
- Added an advisory transaction lock per project before agent accessibility recheck, duplicate lookup, 100-entry capacity check, and insert. Duplicate retry works when the cap is full; concurrent additions are serialized. Focused tests: 16/16 across 3 files.
- Attached agents are currently stored as project configuration; project chat does not execute them. E02 remains PARTIAL for that missing runtime behavior and for live database/browser verification.
- Migration 0078 is additive and unapplied. Apply it after any earlier pending migrations before deploying this source. No migration was applied locally.

#### E02 stale-assignment cleanup and lint correction - 2026-11-08
- DELETE now removes an existing project-agent association by project ID + agent ID after authenticated project-editor and same-origin checks. This permits cleanup if a team project's attached public agent later becomes private; the response includes no agent metadata. GET/available/POST visibility restrictions remain unchanged.
- Added regression coverage for removing a now-private former-public assignment. Escaped the wizard JSX apostrophe as `project&apos;s` to fix the aggregate lint finding.
- Focused agent-route tests: 8/8 passed. Scoped Biome lint passed for wizard and agent route/test. `git diff --check` passed with existing line-ending normalization notices. Direct `pnpm exec eslint` could not run because ESLint 9 found no `eslint.config.*`; root will rerun aggregate lint.
- Request-start authorization was retained because no concrete escalation was identified in the in-flight revocation window. No push, deployment, migration apply, or reference checkout write.
#### E02 Next route-export validation correction - 2026-11-08
- Fresh production build found Next.js App Router rejected the named `agentAccessFilter` export from `src/app/api/projects/[id]/agents/route.ts`.
- Moved the shared SQL visibility predicate to `src/lib/projects/agent-access.ts`; the API route now exports only GET/POST/DELETE handlers, while tests import the helper from the library module.
- Focused route suite passed 8/8; scoped Biome lint passed for the route, test, and helper; `git diff --check` passed with existing line-ending notices. Root will rerun the aggregate production build. No aggregate typecheck rerun in this correction.
### 2026-11-08 - Verified feature batch and current handoffVoid Agent
- Continued from the previous checkpoint and completed source-grounded integrations: structured requestInput for HITL, cancellation-safe table-review creation, persisted OpenAI Realtime VAD/noise controls, and SHA-256 result hashes for desktop MCP audit rows. Void-Agent security boundaries remain in place.
- Finished E02 project setup review: team projects accept public agents only; personal projects accept the caller's agents or public agents. Agent creation is serialized under a per-project advisory transaction lock; duplicate retries work at capacity, and stale assignments can be removed without exposing agent data. Project-agent assignments remain configuration only and do not affect project chat.
- Current scoped ledger: 78 workflow candidates - 68 PARTIAL, 1 MISSING, 5 EXCLUDED, 2 OPTIONAL, 1 DEPRECATED, 1 primary-only custom; 0 COMPLETE under the strict end-to-end evidence rule. This is not a 0%-work claim or full migration completion. The 206 reference surfaces have not all been mapped/deduplicated, and no overall parity percentage is available.
- Verification: full pnpm test 506 files / 2,682 tests passed before the final E02 cleanup, followed by current E02 focused 16/16; lint passed; 6 GB typecheck passed; pnpm db:check passed; production build passed and generated 205/205 pages; git diff --check passed. Focused voice/table/HITL/desktop suites passed 3/3, 3/3, 16/16, and 23/23.
- Limitations: no PostgreSQL-backed verification or migration apply; migrations 0074-0078 remain deployment migrations to apply in order. The successful build emittedVoid Agentnings, including absent agent.preset_id in the configured database (0076 unapplied), static collection of session-dependent routes, missing Redis/Upstash, E2B/unpdf warnings, and workspace-root ambiguity. No live provider/browser/Electron journeys were exercised.
- Repository safety: primary branch remains main at 23a0177397232874689d67100d2e6730b23e6c75, equal to origin/main; 368 local status paths are uncommitted. Reference Void-Agent-V2 still reports 3,072 staged paths of unknown origin; it was not modified. No commit, push, deploy, or migration apply occurred.
- Next exact work: continue closing major compatible gaps, starting with secure project-agent runtime consumption (or retire assignment UI if no secure invocation path fits), then continue auditing unresolved voice/browser/tool-approval and remaining 206 surfaces. Keep workflows PARTIAL until user journeys are verified. Do not push.
#### E02 reference-runtime correction (2026-11-08)Void Agent
- Source trace confirmed Better Chatbot 2.0's onboarding stores project-agent assignments but its project-chat wrapper/runtime does not read or execute `ProjectAgentTable`; project chat only passes project ID/name. Void-Agent matches this assignment-only behavior with stricter project-owner/public visibility and capacity checks.
- Therefore project-agent runtime consumption is NOT an upstream parity gap and will not be added as custom complexity. E02 remains PARTIAL only for live PostgreSQL/browser verification and unapplied migration rollout.
## 2026-11-08 12:17 IST - Parallel continuation checkpoint
Void Agent
Three independent implementation batches are underway after the 12:02 checkpoint: B20 voice browser automation compatibility/security review, C09 scheduled-job management gap, and B24 learning/review of completed-chat facts. Agents are changing only the primary Void-Agent checkout; root will review and update this handoff after receiving each result.

Since the prior checkpoint, B07 alias-aware project-brain retrieval was implemented with source/page/owner/current-revision visibility constraints and a focused 6/6 suite. B10 now explicitly supports completed-to-accepted todo reopen, binding the update to the current completed status and the same source-visibility guards; stale/concurrent reopen returns 409. Focused suite: 10/10. C10 scheduler drift diagnostics compare stored and expected next-run time without changing worker semantics; focused scheduler suite: 29/29. Root's combined focused run passed 12 files / 57 tests. `pnpm db:check` and `git diff --check` passed.

The full suite/typecheck/build have not yet been rerun on this combined current tree. No migrations applied, no production changes, no commit or GitHub push. Primary HEAD remains `23a0177` equal to `origin/main`. V2 remains untouched by this work; its checkout has 3,072 pre-existing staged status records of unknown origin.

Next: review the three active feature batches, integrate their focused evidence, then run aggregate validation once code edits stop. Update this file and `context.md` with exact outcomes.
### 2026-11-08 12:20 IST - B10 review correction
Direct review caught that the first B10 implementation note overstated completed-task reopening: the route's `accepted` transition still filtered only `proposed`. Corrected both chat-source and document-source atomic updates so `accepted` may follow `proposed` or `completed`, while `completed` still requires `accepted` and `rejected` still requires `proposed`. Existing active-revision and source visibility/owner predicates remain in the same UPDATE. Regression now checks generated SQL status parameters and stale UPDATE => 409. Focused route tests pass 5/5. Earlier progress text is retained for audit trail; this correction supersedes its reopen-complete claim. Independent review requested. No push/deployment/migration apply.
## 2026-11-08 12:23 IST - Scheduler resume and voice-thread parity

C09: Re-enabling an inactive recurring schedule now advances `nextRunAt` to the next future cron slot, matching upstream and avoiding immediate replay of a missed occurrence. One-time schedules keep their original timestamp. Invalid schedule timing returns a generic 400. Owner-scoped read/update and same-origin checks are unchanged. Scheduler tests: 30/30 across 4 files; scoped Biome and diff-check passed.

B15: Read-only trace found equivalent primary functionality already exists: completed user/assistant voice turns are persisted with bounded body/turns, debounced signature retry/upsert, same-origin/auth/rate controls, existing thread owner checks, server-verified project scope, and an Open in chat action. Focused route/contract suite: 9/9. No code change.

B20: Upstream voice browser execution depends on a cloud browser plus arbitrary Playwright interaction; the primary Steel/Crawl/Cloak systems do not provide a proven enforced private-network egress boundary. Voice MCP approval alone does not prevent SSRF. No unsafe browser bridge was added; B20 remains unavailable pending a browser runtime with enforceable egress isolation.

Root combined focused verification passed 10 files / 46 tests (B10, B07, C09/C10/C11, B15). This is overlapping focused coverage, not the full suite. Live PostgreSQL/browser/provider/worker checks and aggregate typecheck/lint/build remain pending until the other parallel batches finish. No migration applied, push, deployment, production write, or V2 write.
## 2026-11-08 12:27 IST - MCP registration security and current verification

C04 primary registration was less strict than upstream: it cast arbitrary JSON into a database insert before the connection action. It now requires application/json, bounds request bodies to 64 KiB, strictly validates name/config/visibility, rejects unknown fields and userId mass assignment, and passes validated configuration plus the authenticated user ID to the existing connect/OAuth/rollback workflow. Authentication and create-permission checks remain before parsing. Route tests pass 4/4; scoped Biome and diff-check passed.

C05 was traced end to end and is already present: per-server/per-tool customization APIs/UI, loaded-tool filtering, custom prompt construction, and separate MCP execution approval/token validation. Focused prompt/approval suite passed 19/19; no change.

B24 lifecycle tests were added for allowed completed owned-chat sources and revoked/stale/foreign-owner rejection. They are not yet verified: aggregate TypeScript check identified mock typing errors in the new tests. Agent is correcting them; do not count this test batch as complete until focused tests, lint, and typecheck pass.

Recent root combined tests passed 10 files/46 tests for B10, B07, C09/C10/C11 and B15. Full suite/build are pending after parallel edits stabilize. No migration apply, production write, commit, push, deployment, or V2 write.
### 2026-11-08 12:31 IST - B24 lifecycle coverage verified
Added focused service-boundary regression tests for completed-chat project-brain capture and queue processing. Coverage verifies editor authorization, owner-bound source record, bounded/redacted snapshot, queue creation, proposed facts, and rejection of revoked, stale-fingerprint, and foreign-owner sources before transcript read or inference. These are mock-backed tests; no production semantics changed and no live PostgreSQL was used. Focused tests pass 6/6, 6 GB typecheck passes, scoped Biome and targeted diff-check pass. Full suite/build pending after the active C12 connector batch.
### 2026-11-08 12:34 IST - C12 Composio shared accounts
Upstream lists all accessible Composio account types; primary previously listed only PRIVATE accounts. Authenticated GET now explicitly includes shared accounts and returns only a safe PRIVATE/SHARED label. UI displays shared state and hides Disconnect for shared accounts. DELETE retains its private-only owner lookup; regression proves a shared account ID returns 404 and never reaches provider deletion. Focused tests 10/10 across 3 files; scoped Biome and diff-check passed. No DB/provider production calls. C12 remains PARTIAL pending live OAuth/browser/provider verification.
### 2026-11-08 12:38 IST - B16 browser voice handoff and C08 parity
B16 gap fixed: completed browser realtime voice turns use `metadata.source=voice_realtime` and already appear in the transcript inbox, but the shared handoff validator only accepted `voice_device`. It now accepts both sources while keeping the same owner, message/thread ID, user-role, and transcript length checks. Browser voice transcript preview stays read-only; external task creation continues to require destination review and exact one-use approval. Focused suite 40/40 across 10 files; scoped Biome and diff-check passed. No automatic upstream actions were introduced.

C08 trace found no primary gap: upstream executes a graph directly without durable run history/effect approval; primary has owner-scoped execution records/checkpoints, project/revision access validation, explicit effect approvals, cancellation, and uncertain-effect retry safety. Focused tests 32/32 across 7 files; no code change. Full aggregate suite/build still pending after A14 and other parallel changes.
### 2026-11-08 12:42 IST - A14 fallback provider availability
Found that regular chat checked whether the selected provider was enabled but fallback candidates could still use a disabled static provider. All fallback sources (admin chain, heuristic, named, and hidden) now use the shared admin enablement policy. If config cannot be read, the chosen primary is returned without any fallback. Personal user-owned provider requests retain their early return and pinned HTTPS transport. Focused model tests 10/10; scoped Biome, 6 GB typecheck, and diff-check passed. No live provider request was made.
### 2026-11-08 12:45 IST - B17 voice-device security/parity
Pairing and management already include owner-scoped listing/enrollment/claim/revoke plus OTA enrollment and credential rotation. Found the device DELETE endpoint lacked same-origin validation. It now rejects cross-origin before rate limiting or repository mutation; auth and owner-scoped revoke remain. Added regressions for unauthenticated, cross-origin, and same-origin owner/rate paths. Focused voice-device tests 18/18 across 7 files, scoped Biome and diff-check passed. No live hardware/device verification.
### 2026-11-08 12:49 IST - B22 voice agent matching
Voice delegation now accepts exact IDs/names or a unique partial spoken agent reference from the existing access-filtered roster. Ambiguous/no matches do not guess. Upstream's delegated MCP/Composio action execution was not ported because it can run actions without per-action approval; primary keeps its explicit no-tools delegated turn. Focused helper/route tests 12/12, scoped Biome, and TypeScript passed. No live voice provider/browser flow.
## 2026-11-08 13:04 IST - Aggregate verification checkpoint

- `pnpm test`: PASS, **513 test files / 2,724 tests**.
- `pnpm lint`: PASS. Existing `<img>` warnings; Next `lint` deprecation; workspace-root ambiguity from parent package-lock and project pnpm lockfile.
- `pnpm exec cross-env NODE_OPTIONS=--max-old-space-size=6144 pnpm check-types`: PASS.
- `pnpm db:check`: PASS (schema metadata consistency only; no migration applied).
- `pnpm build`: PASS, **205/205 pages generated**. Warnings include E2B/unpdf critical dependencies, in-memory Redis/cache/rate-limit fallback because env not configured, build-time `agent.preset_id` missing-column errors because migrations 0076 onward remain unapplied, and dynamic session/header route messages during prerender. The build exited successfully.
- `git diff --check`: PASS with LF/CRLF normalization notices.Void Agent
- Repository: primary `main` remains at `23a0177`, equal to `origin/main`; 399 local status paths. Reference `Void-Agent-V2` remains untouched by this work and reports 3,072 prior staged status paths of unknown origin. No commit, push, deploy, production write, or migration apply.

This is an aggregate verification checkpoint, not the end of feature migration. The workflow register still includes unresolved PARTIAL/MISSING items; 206 routes/pages/tools are not independent features and have not all been mapped to verified workflows. Continue implementing concrete compatible gaps and keep excluded unsafe/absent upstream capabilities documented.
### 2026-11-08 13:12 IST - B05 project-document pagination
The project-document GET previously returned only the first 100 rows with no cursor. Added stable keyset pagination on link creation timestamp plus ID, bounded 100-item pages, malformed-cursor rejection, and a Load older documents UI. Page queries retain project/attached-collection/source-owner scope; IDs used only for cursoring are not exposed. Existing private download, owner/editor unlink, and revision-bound edit contracts remain. Focused API/UI/download/unlink/edit tests pass 31/31 across 6 files; scoped Biome and diff-check pass. No live DB/browser verification.
### 2026-11-08 13:18 IST - B08 graph search and C01 preset seeding
B08 source/detail APIs were already equivalent or stronger: project ACLs, owner/collection/current-revision filters, bounded graph results, and exact source-version preview. Added bounded local entity label search over only that already-authorized response, with up to 8 matches, selection and nonmatch dimming. Focused 15/15; scoped Biome/diff-check passed.

C01 added the three upstream-designated private starter presets for new accounts. Signup seeding is best-effort; owner-private rows are inserted with conflict-do-nothing against `(user_id,preset_id)` and do not overwrite manual/custom agent state. Existing manual adoption remains. Focused tests 9/9; scoped Biome, 6 GB typecheck, and diff-check passed.

A concurrent typecheck exposed a missing client response type for `writableCollectionIds` in the new B05 append-page UI; corrected by root. Aggregate suite/build had run before these latest changes and must be rerun.
## 2026-11-08 13:29 IST - Verified B05/B08/C01 aggregate checkpoint

- `pnpm test`: **514 files / 2,731 tests passed**.
- `pnpm check-types` with 6 GB heap: passed (includes new project-document pagination and preset seed tests).
- `pnpm lint`: passed with the existing `<img>`, deprecated `next lint`, and inferred workspace-root warnings.
- `pnpm db:check`: passed; no migration was applied.
- Fresh `pnpm build`: passed; **205/205 pages generated**. Existing warnings: E2B/unpdf dependency bundling, no Redis/Upstash so memory cache/rate-limit fallback, build-time `agent.preset_id` missing-column from unapplied migrations, and dynamic session/header messages during prerender. Build exit 0.
- `git diff --check`: passed.
- Primary `main` remains `23a0177` = `origin/main`, with 402 local status paths. V2 remains unmodified by this work and has 3,072 prior staged status records of unknown origin. No commit, push, deployment, DB migration application, or production write.

This is a verified checkpoint, not final parity. Continue with B09, C02, A13 and surface mapping. The 78 workflow register is currently 68 PARTIAL, 1 MISSING, 5 EXCLUDED, 2 OPTIONAL, 1 DEPRECATED, 1 PRIMARY CUSTOM; the 206 route/page/tool surfaces are not independently classed features. No end-to-end count is claimed from these categories.
### 2026-11-08 13:35 IST - B09 review workflow parity
B09 inspection found no compatible feature gap: primary already has project-scoped fact review, exact current source-version preview, contradiction resolution/history, and role-aware timeline review; upstream lacks source-version detail and timeline review. Focused suite passed 5 files / 22 tests. No code change. Remains PARTIAL pending live DB/browser journey. C02 and A13 audits remain active.
### 2026-11-08 13:42 IST - A13 mobile picker and C02 app-aware generation
A13 catalog/provider visibility, metadata, and security filtering were already equivalent. Added an accessible bottom drawer on mobile while preserving the desktop popover; both reuse the same catalog/filter/selection behavior. Focused 20/20 across four files; 6 GB typecheck, Biome, and diff-check pass.

C02 generation now gets a bounded, sanitized list of safe unconnected Composio apps so it can suggest setup needs. Suggestions affect prompt guidance only: the generated executable tools enum remains restricted to connected/available names; test rejects an unconnected Salesforce tool. Focused 25/25 across 3 files; scoped Biome and diff-check pass. C02 remains PARTIAL pending live provider/Postgres/browser verification. Full suite/build must rerun after these changes.
## 2026-11-08 13:48 IST - A13/C02 aggregate verification
- `pnpm test`: PASS, **515 files / 2,737 tests**.
- 6 GB `pnpm check-types`: PASS.
- `pnpm lint`: PASS with existing `<img>`, Next lint deprecation, and inferred workspace-root warnings.
- `pnpm db:check`: PASS; no migration applied.
- Fresh `pnpm build`: PASS, **205/205 pages generated**. Existing E2B/unpdf critical-dependency warnings, Redis/Upstash fallback notices, `agent.preset_id` missing-column probe due unapplied migrations, and dynamic-session/header prerender messages remain.
- `git diff --check`: PASS.Void Agent
- Primary HEAD `23a0177` = `origin/main`; 406 local status paths. Reference `Void-Agent-V2` remains unmodified by this work and reports 3,072 prior staged paths of unknown origin. No commit/push/deploy/production write/migration apply.

Migration is still active; the 78 workflow register remains 68 PARTIAL, 1 MISSING, 5 EXCLUDED, 2 OPTIONAL, 1 DEPRECATED, 1 PRIMARY CUSTOM. New A13/C02 code has focused tests, while live workflows and other audit families remain. Continue implementation and maintain exact status evidence; do not call this percentage complete.
### 2026-11-08 14:03 IST - C03 agent workflow parityVoid AgentVoid Agent
Upstream V2 exposes accessible agent lists and idempotent private preset installs but has no public publish/gallery/install/uninstall workflow. Void-Agent already has those owner/public-scoped workflows; five route suites pass 31/31. No port needed. Primary publication serves the current live agent row rather than a frozen snapshot; that is a distinct Void-Agent design/schema decision, not upstream parity. Left unchanged. No DB migration. B04/B06 implementation batches are active.
### 2026-11-08 14:10 IST - C07 workflow editor no-gap audit
Primary saved-workflow editor already matches the requested create/edit/save behaviors with stronger owner-only drafts, bounded graph schema/size limits, cycle validation, transactional save, published graph write rejection and execution revision guards. Upstream has no additional compatible create/save capability. Focused tests passed 5 files / 26 tests; no code change. Live DB/browser remains unverified. B04/B06 are active implementation batches.
### 2026-11-08 14:18 IST - B04/B06 project knowledge workflows
B04 now accepts XLSX/PPTX project documents using the existing OOXML validation/expansion protections. Extraction is capped at 10 sheets x 100 rows x 40 columns / 120k characters for spreadsheets and 200 slides / 120k characters for presentations. The existing 20 MiB upload cap, private owner storage keys, project/collection ACL, and ingestion rollback remain. B04 focused suite: 62/62 across six files.

B06 now lets editors retry stale queued brain runs by reusing the same fingerprint-unique row under the existing lock; fresh queued/running rows remain blocked, prior attempts preserved, and stale polling stops in the UI. B06 focused tests: 12/12. Scoped Biome and diff checks passed. No migrations or production data operations.

Root aggregate suite/typecheck/lint/build must be rerun after these latest code edits.
## 2026-11-08 14:26 IST - B04/B06 aggregate verification
- `pnpm test`: PASS, **516 files / 2,746 tests**.
- 6 GB typecheck: PASS.
- `pnpm lint`: PASS with existing `<img>`, Next lint deprecation, and inferred workspace-root warnings.
- `pnpm db:check`: PASS; migrations remain unapplied.
- Fresh `pnpm build`: PASS, **205/205 pages generated**. Existing E2B/unpdf critical-dependency warnings, Redis/Upstash memory fallback notices, `agent.preset_id` missing-column probe due unapplied migrations, and dynamic session/header prerender notices remain.
- `git diff --check`: PASS.
- Primary `main` HEAD `23a0177` equals `origin/main`; 408 local status paths. Reference checkout remains untouched by this work, with 3,072 prior staged status paths of unknown origin. No commit/push/deploy/production write/migration apply.

Migration remains incomplete; continue the source-grounded workflow batches. The current 78-entry register has many partial/live-environment statuses and does not imply a percentage.
## 2026-11-08 15:00 IST - B11/B12/D01 active batch

- B11 discovery: upstream project tools can attach shared/org Composio accounts; primary project brain used private-only account enumeration even though global integrations included shared accounts. Fix in progress: allow shared accounts for project attach/list only; sync must remain credential-owner scoped.
- D01 discovery: chat-created tabular reviews omitted authorized source revision snapshots, unlike dashboard creation, causing later generation to fail resolving pinned sources. Fix in progress: atomically persist the same authorized snapshots.
- B12 discovery: upstream stores project-workflow associations; primary only stores project-agent associations. Additive migration/schema plus bounded project/editor ACL CRUD/UI has been authorized, but migration must remain unapplied and association metadata must not trigger workflow execution.
- No validation result yet for these new changes; do not count them complete. No production write, reference edit, push, or deployment.
### 2026-11-08 15:12 IST - B11 shared Composio project connectors
Project connector list/attach/sync now request accessible shared accounts for the authenticated user. Credential ownership stays bound to the attaching actor; sync retains existing editor/owner checks and read-only action allowlist. Focused route/helper tests pass 15/15 across 3 files; scoped Biome passes on 4 files. No live Composio calls; full aggregate validation still pending alongside B12/D01.
### [2026-11-08 13:57 IST] B20 voice browser automation security decision
- Audited upstream's `voice/browser-run.ts` -> shared browser executor -> `playwright.execute` path and primary's Steel/Crawl agent.
- Upstream implements org gating, credential resolution/redaction, streamed status, cancellation/timeout, metering, teardown, and read-only live view; it still executes arbitrary model-generated Playwright code in the browser VM.
- Neither the Kernel proxy allowlist nor primary Steel/Crawl setup proves public-only egress for VM processes. Primary sessions are persistent and their viewer is interactive. Query-only B23 does not provide B20 parity.
- No unsafe voice route was added; B20 remains MISSING with evidence in `docs/feature-work-register.md` and `docs/security-review.md`.
- Next: continue another compatible workflow. B20 can be reconsidered when a browser runtime proves VM + browser public-only egress and the complete credential/cost/cancellation/teardown boundary.

### 2026-11-08 13:59 IST - C26 structured follow-up input auditVoid Agent
- Void Agentetter Chatbot V2's `requestInput` schema/card/result flow with Void-Agent's schema, card, and chat-tool-result wiring.
- Void-Agent already supports the complete compatible non-secret workflow (four-question bound; described/unique choices; multiselect; placeholders; text/number/email/URL input; one submitted result). It imposes stricter bounds. Password input remains rejected because answers are persisted in conversation/model context; this preserves the stronger security boundary.
- Focused validation: `hitl/index.test.ts` and `request-input-card.test.tsx`, 16/16 passed.
- No source changes were required; C26 remains PARTIAL pending live model-provider/browser verification. No reference write, migration apply, production write, push, or deployment.

### 2026-11-08 13:58 IST - B14 cross-project voice status lookup
Void Agent
Compared upstream voice get_project_status (project ID/name selection through the caller's accessible project list and a fresh project ACL check) with Void-Agent's existing active-project-chat status and knowledge tools. Added the compatible status lookup path: authenticated callers may use their active project thread as before or supply a project ID / unique exact accessible project name; project-name matching only inspects listProjectsForUser, and access is rechecked after resolution. Status receives only current attached collection IDs and is read by the existing source-owner/current-fingerprint filter. The tool is read-only and its description treats source data as untrusted. Knowledge search remains thread-bound because upstream has no equivalent voice knowledge search and the primary's evidence scope is tied to project chat.

Focused verification: 4 files / 19 tests passed (project-status API/helper, voice-tool visibility, status reader); scoped Biome passed for 8 files; pnpm check-types passed. No live voice provider/Postgres/browser journey. Kimi remains without a project tool executor. Files: src/lib/voice/project-status.ts and test; src/app/api/voice/project-status/route.ts and test; src/lib/ai/speech/index.ts and tool test; OpenAI Realtime and KonvO voice handlers. No migration/apply, V2 write, push, or deploy.

### 2026-11-08 14:02 IST - B12/D01/C26/B20 review checkpoint
- B12 project workflow assignments now match upstream metadata behavior through the new project setup workflow. Migration `0079_project_workflows` is registered only and remains unapplied. Agent focused result: 14 tests/4 files; combined root B12/B14/D01 checks passed 36/36/8 files. `pnpm db:check`, migration journal parse, scoped Biome, diff-check and typecheck passed per B12 agent.
- D01 chat-created tabular review now pins source extraction rows in the same transaction as review/items/cells; root review suite passed 20/20/6 files. No live PostgreSQL/browser check.
- B14 voice project status by accessible ID or unique exact name passed 19 focused tests, scoped Biome and typecheck. Knowledge search remains active-project-thread-only.
- C26 structured input already has compatible non-secret behavior; 16/16 focused tests. Password remains rejected to avoid putting secret answers in model history.
- B20 browser automation remains MISSING: source-level analysis found no enforced browser-VM egress restriction in either runtime, so no unsafe route was introduced.
- These are focused checkpoints. Full suite, root typecheck, lint, schema check and production build are pending after the current Vercel Cockpit agent finishes. No migration apply, production write, commit/push, deploy, or V2 modification.
### 2026-11-08 14:03 IST - Verify C21 Vercel Cockpit read workflVoid Agent
- Trace: Better Chatbot exposes a read-only deployment summary. Void-Agent already has encrypted owner/team-scoped connection settings, fixed-origin GET-only Vercel API calls, response/time bounds, status/error handling, and the dashboard UI.
- Change: Added route tests for authentication, rate limits, team scope, authorization, private no-store responses, absent connection, and generic provider failure. The test exposed that the deployment summary route omitted `Cache-Control: private, no-store` on some error responses; all outcomes now carry the private no-store policy.
- Validation: Focused provider/config/API tests passed 16/16; scoped Biome and `git diff --check` passed. Live Vercel/provider/browser flow remains unverified.
- Files: `src/app/api/cockpit/vercel/deployments/route.ts`; new `src/app/api/cockpit/vercel/deployments/route.test.ts`.
- No new credential, provider call, migration, production write, V2 edit, push, or deployment.
### 2026-11-08 14:02 IST - Conversation search no-gap auditVoid Agent
V2 has no thread search UI/API, debounced query, or search pagination in this checkout. Both projects list authenticated threads grouped by date with a 40-row initial display and show-all expansion; Void-Agent has additional title reconciliation and live running state. No new search feature was added because that would not be upstream parity. Source paths and trace are in the feature register; no code/test changes.
### A22 chat spreadsheet parity - 2026-11-08 14:04 ISTVoid AgentVoid Agent
Compared Better Chatbot V2's spreadsheet parser, storage preview route, artifact table, and attachment-ingestion reader with Void-Agent. Void-Agent already has equivalent or stronger behavior: .xlsx and .csv uploads are routed as non-native source attachments; the UI offers an authenticated owner-only table preview with sheet switching; server limits are 100 rows, 40 columns, 20 sheets, and 5 MiB per preview; model ingestion is capped at 15 MiB per file, 20,000 characters per file, and 40,000 per turn, with spreadsheet values framed as untrusted data. Primary adds OOXML expansion/entry/DOCTYPE preflight, per-user preview rate limits and private no-store responses. Focused storage/parser/attachment-ingestion suite passed 32/32 tests across four files. No source change was justified. A22 remains PARTIAL only for live storage/model/browser verification. No migration, production write, V2 edit, push, or deployment.
### 2026-11-08 14:05 IST - Verify upstream reference freshnessVoid AgentVoid Agent
The GitHub API reports Better Chatbot `main` at `6f4183566bc48616303cb84055f11f79578c82fe` (2026-11-06T16:28:08Z, `docs: a README for apps/web...`). Local `Void-Agent-V2` remote-tracking ref `better-chatbot/main` is the same SHA. This confirms the inspected source baseline is current; no fetch or reference checkout mutation was needed. Current changes continue as selective feature/security adaptation into primary Void-Agent.
### 2026-11-08 14:12 IST - A24 HLS workflow playbackVoid Agent
- Source trace: Better Chatbot V2 recognizes legacy Twelve Labs and n8n HTTP HLS workflow outputs, then renders via `hls.js`/`MediaPreview`. Its legacy `/analyze/{videoId}` resolver has no route in the inspected checkout. Void-Agent already extracts bounded direct/HLS URLs and posters, but used a bare `<video>` element, which does not play HLS in Chromium.
- Change: Added lazy `hls.js` 1.6.13 playback for `.m3u8`; native HLS and direct video playback remain. URL checks reject non-HTTPS, credentialed, literal IP, local/private suffix, and nonstandard-port sources. HLS child resources are restricted to the validated manifest origin, xhr credentials are disabled, referrer is suppressed, buffers and retries are bounded.
- Validation: Focused video parser/playback suite 6/6; scoped Biome and `git diff --check` passed; 6 GB `pnpm check-types` passed before a final `referrerPolicy` attribute-only edit (root aggregate check remains pending). No real external stream/CORS/browser playback verified.
- Files: `package.json`, `pnpm-lock.yaml`, `src/components/tool-invocation/workflow-video-media.ts` and test, new `workflow-video-player.tsx`, `workflow-invocation.tsx`, A24 row in feature register, security review and this handoff.
- No DB migration, reference edit, production write, push, or deployment. A24 remains PARTIAL until a real browser/CDN workflow is exercised.
### A24 final check correction - 2026-11-08 14:15 IST
- After replacing the unsupported JSX `referrerPolicy` prop with the video element's DOM attribute, focused video tests pass 6/6 and scoped Biome/diff checks pass.
- A 6 GB full typecheck reports no A24 errors; it currently fails only on the concurrent image-tool edit (`src/lib/ai/tools/image/index.ts`, missing `LatestUserImage` at lines 191 and 206). Root has routed that to the image agent and will rerun full typechecking once fixed.
- `hls.js` is pinned to 1.6.13 in `package.json` and `pnpm-lock.yaml`, matching the inspected V2 lockfile. External stream/CORS/browser playback remains unverified.
### Image generation/editing source parity audit - 2026-11-08 14:18 ISTVoid AgentVoid Agent
Better Chatbot V2 image flow uses an AI Gateway capability catalog for Gemini/OpenAI/Black Forest Labs models; chooses model by create/edit/composite mode and reference count; extracts bounded image context including a previous generated output; supports a brush-mask inpainting UI for FLUX Fill; and accepts image/mask bytes or storage URLs for image APIs. Void-Agent has its own Void Agent image generation/edit endpoints, curated model/size selectors, prompt optimization, free-tier quotas, abort-aware polling, direct generation bypass and owner-scoped generated image storage. It lacked previous generated-output reuse and fetched model-selected image URLs directly from the server. Added `findLatestImageReference` so edit mode can use the latest image-tool output or uploaded image, and restricted server image loading to bounded inline raster data or a same-user managed storage key (15 MiB max with signature validation); arbitrary URLs are never fetched. Focused image source/edit/Void Agent tests pass 15/15, scoped Biome/diff-check pass, and 6 GB typecheck passes. V2's AI Gateway capability-based model selection, mask editor/inpainting, and multi-reference inputs are still absent: the product's Void Agent endpoint has no proven contract for them, and no Gateway provider configuration exists in Void-Agent. Do not label the entire image workflow complete; live provider/browser and model-specific mask/multi-reference parity remain.
### 2026-11-08 14:18 IST - Resolve A24 typecheck note
The prior A24 note described the concurrent image-tool `LatestUserImage` type error as outstanding. It is resolved: image history/source functions now use the shared `ImageReference` type, and the fresh 6 GB `pnpm check-types` pass succeeded. A24's live CDN/browser playback remains unverified.
### 2026-11-08 14:21 IST - A26 sandbox artifact exportVoid Agents scopeVoid Agent
- Request: Trace V2 artifact preview/download against Void-Agent's sandbox and preserve Void-Agent's Canvas without creating a competing editor. Void Agentthe secure adjacent capability only.Void Agent
- Audit: Better Chatbot V2 has an executable E2B ArtifactPanel for sandbox output; no standalone Canvas/document-editor route or tool was found. Void-Agent `/ecanvas`, Canvas PPT maker/history, and project document editing/reviews are Void-Agent-specific and are preserved. The existing E2B sandbox is already thread/user-owned; storage download, document preview, and spreadsheet preview routes already authenticate, enforce the storage owner's key, rate limit, and send private/no-store responses.
- Change: Added sandbox `export` action for relative workspace files in an allowlist, max 15 MiB. It rejects traversal/absolute/control paths, non-file/symlink entries, over-limit and size-changing reads, and active/unknown formats (HTML/SVG/JS excluded). Bytes stream under a second size bound into the existing storage service with caller ownership. Sandbox tool results now reuse authenticated owner-scoped download and preview UI; raster images and WEBM video render only through the private download route, while documents/spreadsheets use existing bounded preview endpoints.
- Files: `src/lib/sandbox/artifact-export.ts` and focused tests; `src/lib/ai/tools/sandbox/sandbox-tool.ts` and focused tests; `src/components/message-parts.tsx`; `docs/feature-work-register.md` A26 and Canvas scope finding; `docs/integration-progress.md`; `docs/migration-handoff.md`.
- Verification: 17/17 focused Vitest tests passed (resolver and sandbox-export suites); scoped Biome check passed for all 5 source/test files; scoped `git diff --check` passed. E2B plus configured storage and browser journey is not available, so A26 remains PARTIAL. Root requested that aggregate typecheck be run after other active branches settle; no whole-project typecheck was run for this change.
- Limits/security: No standalone HTML preview or second sandbox was added. A26 is separate from concurrent image workflow A25; root owns reconciliation of top-level counts. No migration apply, production write, reference write, push, or deploy.
### 2026-11-08 14:22 IST - A26 video/audio preview separation
- Review found the shared `.webm` suffix could show the audio-transcription control for video/webm artifacts. Source URL rendering now prefers the server-declared media type when present, so video/webm renders video only; extension fallback remains for legacy items without MIME metadata.
- Validation: scoped Biome and `git diff --check` passed. The export suites remain 17/17 from 14:21; no whole-project typecheck per root's aggregation request. No other project or environment changed.
### 2026-11-08 14:24 IST - Audit and harden non-Vercel Cockpit providersVoid Agent
- Request: Compare Better Chatbot V2's Website, SEO, Revolut and Superlog Cockpit workflows with Void-Agent; implement concrete safe gaps only.
- Actions: Read context/guidance; traced reference provider registry/modules and primary settings, encrypted persistence, provider fetch/MCP execution, summary dashboards, and connection test/save/delete routes. Confirmed all four provider workflows already exist in primary with user/team scope, encrypted credentials, owner/editor write policy, fixed/validated endpoints, redirect rejection, bounded responses/deadlines, and safe summaries. Added a shared response wrapper and applied it to all four private summary routes so every returned status has `Cache-Control: private, no-store`.
- Files Changed: New `src/lib/http/with-private-no-store.ts` and test; new `src/app/api/cockpit/summary-cache.test.ts`; four Cockpit summary routes for Website/SEO/Revolut/Superlog; append-only feature register, context, integration progress and migration handoff.
- Diff Summary: Existing provider feature parity is already present; summary data and all auth/rate/validation/ACL/not-connected/provider-error results now consistently receive private no-store headers. No credential values or provider response details are exposed.
- Validation: Focused wrapper + four-route tests passed (2 files / 5 tests); scoped Biome passed (7 files); `git diff --check` passed (only existing LF/CRLF notices). No live provider request or database call.
- Risks/Notes: C21 remains OPTIONAL as a secondary business dashboard, but its compatible provider workflows are implemented. No schema migration, external writes, V2 changes, production data, push, or deploy.
- Next Steps: Root will include these routes in the aggregate type/test/build verification after parallel source edits settle.
### 2026-11-08 14:37 IST - A25/A26 and aggregate verification checkpoint
- A25 image generation/edit parity: previous generated images can be reused; edit sources are limited to validated raster data or the authenticated owner's managed storage keys (15 MiB max), with byte-signature checks. Arbitrary server-side image URL fetching was removed. Focused image tests: 15/15; typecheck, scoped Biome/diff Void Agented inpainting/multi-reference remain unsupported because Void Agent's contract is unverified.
- A26 artifact export: sandbox tool can upload an allowlisted workspace file (15 MiB max) through existing owner-scoped storage for private preview/download. Traversal, active content, unsafe types, symlink parents, over-limit and inconsistent reads are rejected. Focused tests 17/17; live E2B/storage/browser remains unverified. Void-Agent Canvas remains primary-only; upstream has no standalone Canvas editor.
- A24 video output now plays HLS via lazy hls.js with native-HLS fallback and bounded playback; focused 6/6. Live browser/CDN remains unverified.
- A22 spreadsheet preview/model ingestion audit found parity already exists; primary has stronger OOXML/owner checks. Focused 32/32.
- C21 Vercel plus website/SEO/Revolut/Superlog workflows already existed; added private no-store response protections and route regressions. Vercel focused 16/16; non-Vercel focused 5/5. No live provider calls.
- C26, project conversation search, and standalone Canvas audits found no upstVoid Agentre gap; documented. C26 tests 16/16.
- Workflow register reconciled to 80 candidates: 79 reference workflows + one Void-Agent-only feature; 0 COMPLETE, 70 PARTIAL, 1 MISSING (unsafe browser automation), 5 EXCLUDED, 2 OPTIONAL, 1 DEPRECATED, 1 PRIMARY CUSTOM. This is still a scoped register, not the full 206-surface denominator or a completion percentage.
- Aggregate checks: `pnpm test` 525 files / 2,799 tests passed; 6 GB typecheck passed; lint passed with existing `<img>`, Next lint deprecation and workspace-root warnings; `pnpm db:check` passed; `pnpm build` passed with 205/205 pages; `git diff --check` passed.
- Build diagnostics: E2B/unpdf critical dependency warnings, SSL-mode forward-compat warning, missing `agent.preset_id` because additive migrations remain unapplied, expected dynamic-session/header prerender diagnostics, and memory cache/rate-limit fallback without Redis/Upstash.
- Repository state: primary HEAD `23a0177` equals `origin/main`, 442 local status paths; read-only V2 HEAD `8671f31`, latest `better-chatbot/main` ref `6f41835`, 3,072 pre-existing status paths unchanged. No commit, push, deploy, migration application, or production write.
## A10–A12 core chat stream reliability — 2026-11-08 14:46 ISTVoid Agent
- Completed a source comparison of primary aVoid Agent stream setup, stop, reconnect, persisted output, and client recovery paths. V2 and primary both use resumable-stream Redis buffering and an active thread pointer; Void-Agent retains additional stop, persisted-tail reconciliation, interrupted-run retry, no-Redis abort fallback, owner checks, rate limits and no-store headers.
- Fixed one concrete initialization race in Void-Agent: the reconnect pointer is now published only after the resumable buffer has created its sentinel and subscribed to reconnect requests. After pointer publication, a terminal sentinel is checked and the pointer is CAS-cleared if the run completed during setup.
- Changed `src/lib/ai/chat-stream-context.ts`, `src/lib/ai/chat-stream-context.test.ts`, and `src/app/api/chat/route.ts`.
- Verification: six focused Vitest files passed (47 tests), scoped Biome passed, and `NODE_OPTIONS=--max-old-space-size=6144 pnpm check-types` passed.
- Limits: mocks and type/static checks do not prove Redis behavior, PostgreSQL persistence, provider billing/streaming, browser recovery, or multi-instance operation. No live parity claim. No database apply, production write, V2 modification, push, or deployment.
- Status: A10, A11 and A12 remain PARTIAL pending configured live end-to-end verification; this fixes a specific reconnect reliability race and is not a completion claim.
### 2026-11-08 14:48 IST - A26 isolated HTML artifact prevVoid Agent
- Request: Compare Better Chatbot V2's ArtifactPanel with Void-Agent's HTML artifact renderer and enable preview/export of generated HTML only if it can be rendered read-only without escapVoid Agentivate preview boundary.
- Comparison: V2 `apps/web/src/components/artifact-panel/artifact-panel.tsx` previews code running in an E2B server iframe with `allow-forms allow-scripts allow-same-origin allow-popups`. Void-Agent's existing AI `artifact-creator.tsx` and Canvas renderers also permit selected scripts in `srcDoc`, appropriate to their distinct interactive artifact workflows but not appropriate for sandbox file export. A26 now has a separate private, read-only route and does not weaken either renderer or make raw stored HTML inline-downloadable.
- Change: Added exact runtime dependency `parse5@7.3.0` and a server sanitizer that allowlists static presentation tags/attributes, removes script/noscript/template/frame/object/form/media/link/meta/base/SVG/MathML subtrees, removes event/srcdoc/URL attributes, unwraps links, and retains only bounded PNG/JPEG/GIF/WebP base64 image sources. The authenticated `/api/storage/html-preview` route verifies the session, same-user storage key, `.html` extension, metadata and actual size (max 15 MiB), valid UTF-8, rate limit, and private/no-store response. It returns sanitized content under CSP sandbox, default-deny network, no external frames/forms/navigation, no-referrer, nosniff, and restricted permissions. The chat HTML preview uses an iframe with an empty sandbox attribute and unmounts when hidden. Normal downloads remain attachments through the existing private download route.
- Files: `package.json`, `pnpm-lock.yaml`; new `src/lib/file-ingest/sandbox-html-preview.ts` and tests; new `src/app/api/storage/html-preview/route.ts` and tests; `src/lib/sandbox/artifact-export.ts` and tests; `src/lib/ai/tools/sandbox/sandbox-tool.ts` and tests; `src/components/message-parts.tsx`; A26 row in `docs/feature-work-register.md`.
- Verification: 24/24 focused tests passed across four files (sandbox path policy, sandbox export, sanitizer, and private route); scoped Biome check passed for 9 files; scoped diff-check passed. Tests include hostile script, event handler, remote resource, SVG, link, form, iframe, top-navigation and size/ownership cases. No whole-project typecheck was run; root owns aggregate validation once active branches settle.
- Limits: The HTML preview intentionally strips executable code, links, forms, remote assets, embedded media/frames, and SVG. No live E2B, object-storage, or browser automation journey was available; A26 remains PARTIAL. No V2 write, database migration, production call/write, push, or deployment.
### 2026-11-08 14:50 IST - A26 HTML preview security and test update
- Follow-up verification after adding HTML artifacts: route tests now additionally cover unauthenticated access, per-user rate limiting, wrong extension, owner isolation, oversized metadata, and metadata/body size mismatch. Added explicit `script-src 'none'` to the private preview CSP; parent iframe keeps `sandbox=""` with no capabilities.
- Final focused result: 26/26 across four suites (sandbox artifact resolver, sandbox export, HTML sanitizer, private HTML preview route); scoped Biome passed for 9 files; scoped diff-check passed. The 14:48 entry's 24/24 result is an earlier pre-follow-up checkpoint and is superseded by this 26/26 result.
- Files include exact `parse5@7.3.0` runtime dependency, new sanitizer and private route/tests, sandbox HTML export allowlist/tests, and owner-only chat HTML preview. No aggregate typecheck, browser/E2B live run, DB operation, V2 edit, production call, push, or deploy.
### 2026-11-08 14:51 IST - B07 project RAG citation navigationVoid Agent
- Comparison: Better Chatbot V2 enriches retrieval citations with document IDs and offers a project-scoped source-open action. Void-Agent already displayed retrieved RAG snippets and scores, but source navigation only linked the raw `sourceUrl`; that was insufficient for private project files.
- Change: Chat responses now annotate project-chat RAG hits with link metadata only after a bounded server query confirms current project access, project-document linkage, current attached collection, allowed collection owner, a backing document row, and `ready` item status. The source card emits a download URL through the existing authenticated project endpoint only for those verified hits. That endpoint repeats those checks and returns private/no-store bytes. Project citations do not link to raw storage/source URLs; non-project URLs are allowed only with HTTP(S) and without embedded credentials. No retrieval engine, schema, or project scope was changed.
- Files: `src/lib/ai/tools/project-document.ts` and focused test; `src/lib/rag/format.ts`; `src/app/api/chat/route.ts`; `src/components/chat/citation.tsx` and focused test; B07 register row.
- Verification: Focused citation/document-tool suites passed 10/10 across 2 files; existing project-download endpoint tests passed 3/3; scoped Biome passed; scoped `git diff --check` passed. A default-heap typecheck attempt exited from Node's ~2 GB heap limit without a TypeScript diagnostic; a 6 GB retry was stopped at the root agent's request to avoid competing with its aggregate check. Live PostgreSQL/browser/provider journey remains unverified; B07 stays PARTIAL.
- Risks/limits: The existing download endpoint uses attachment disposition, so citations download the source instead of opening an inline viewer. Current access is rechecked on every download; stale/revoked project links return 404. No DB migration/application, production data, V2 edit, push, or deployment.

### 2026-11-08 14:53 IST - A23 uploaded-audio transcription parity auditVoid Agent
- Compared Better Chatbot V2's media renderer and voice-input path with Void-Agent's attachment transcription path.
- Reference behavior: `apps/web/src/components/media/media-preview.tsx` renders audio media supplied by tools with native `<audio controls>` and `preload="metadata"`. V2 also configures `gpt-4o-transcribe` for OpenAI Realtime voice sessions (`apps/web/src/lib/ai/speech/open-ai/realtime-session-config.ts`), but this is live voice input, not a stored chat-upload transcription endpoint. No long-recording or batch upload transcription path was found in the V2 source census.
- Primary behavior is already stronger for chat uploads: private owner-key checks, stored/requested MIME match, container-signature validation, bounded download at 15 MiB, duration parsing and <=30-second synchronous Sarvam submission; longer or unverifiable files remain playable and are not transcribed. Transcripts are length-bounded and explicitly marked untrusted before model context. The stand-alone preview route repeats owner, origin, rate, byte, MIME, signature, duration and abort checks.
- Decision: No compatible upstream transcription gap or reference long/batch workflow to port was found. Do not weaken the 30-second synchronous-provider bound or introduce a speculative batch provider/API. Existing A23 implementation exceeds the inspected reference's upload-transcription behavior; keep A23 PARTIAL only for live provider/storage/browser verification and document supported-format exclusions.
- Evidence: primary `src/lib/ai/ingest/audio-attachment.ts`, `audio-format.ts`, `audio-metadata.ts`, `uploaded-audio.ts`, `src/app/api/storage/audio/transcribe/route.ts`; reference media renderer and realtime session config above.
- Validation: no code changed. Root will include the existing audio route/ingestion suites in aggregate checks; no provider credentials, live storage call, V2 edit, DB write/migration, push, or deployment.

### 2026-11-08 14:53 IST - A23 focused regression result
- `pnpm exec vitest run src/lib/ai/ingest/audio-format.test.ts src/lib/ai/ingest/audio-metadata.test.ts src/lib/ai/ingest/audio-attachment.test.ts src/lib/ai/ingest/uploaded-audio.test.ts 'src/app/api/storage/audio/transcribe/route.test.ts'` passed: 5 files / 23 tests.
- This is mock/unit verification only; it does not verify configured Sarvam, private object storage, or browser playback.
### 2026-11-08 14:54 IST - E02 project-agent assignment parity audit
- Void Agent2 exposes project-agent assignment through its project agent table, access-controlled GET/POST/DELETE API, onboarding picker, and collaborator dialog. Repository-wide source search found no consumer in project chat or agent execution.
- Void-Agent's E02 assignment flow is likewise configuration-only. No upstream execution behavior is missing, so no automatic project-agent runs or prompt injection were added. E02 remains PARTIAL because live PostgreSQL/browser verification and the unapplied additive migration are still pending.
- Primary focused project-agent API tests from the existing batch: 8/8. This audit made no runtime code changes. V2, database, production, GitHub, and deployment state were not modified.
### 2026-11-08 14:57 IST - B22 voice delegation safety boundaryVoid Agent
Upstream voice task execution passes all MCP and Composio tools directly to a multi-step model call without per-action approval. Void-Agent's `/api/voice/run-agent` intentionally runs a bounded no-tools turn. Chat HITL cannot be reused by just adding tools: it depends on a persisted chat tool-call part, user approval card, one-use token bound to exact args/config, and server-side dispatch via `executeApprovedMcpTool`. Voice currently has no corresponding persisted tool-call or `addToolResult` lifecycle. Keep B22 PARTIAL and no-tools until a persisted handoff into chat or an equivalent owner-bound voice approval+dispatch flow exists. This is a concrete implementation boundary; no unsafe shortcut was added. Focused primary B22 tests remain 12/12 from the prior implementation. No code changes, V2 edits, DB/migration/production writes, push, or deployment.

### C13 approval-dispatch hardening - 2026-11-08 15:02 ISTVoid Agent
- Better Chatbot 2.0 has no MCP tool-call approval workflow in the inspected source; Void-Agent's existing exact-action approval is an additional security control and remains intact.
- Closed a concrete alternate dispatch path: generic tools returned by `MCPClientsManager.tools()` now fail closed with `ApprovalRequired`; the chat wrapper replaces that inert executor only after binding exact arguments to a one-use token.
- Approved manager dispatch also receives the reviewed server name, rejects missing/disabled/renamed records, checks stored and active configuration after any refresh, and repeats the identity/enabled/config check immediately before calling the MCP client. The explicit MCP action entrypoints now pass the reviewed name. Existing workflow effect approvals and project-brain's read-only allowlist are unchanged.
- Validation: 43/43 tests passed across 3 focused suites (`create-mcp-clients-manager`, `execute-approved-mcp-tool`, and MCP approval route); scoped Biome and diff-check passed. No live MCP, PostgreSQL, or browser verification was performed, so C13 remains PARTIAL.
- No V2 edit, database migration/application, production write, push, or deployment.
### 2026-11-08 15:15 IST - B22 delegated MCP action approvals
- Replaced the earlier no-tools-only B22 constraint with a safe proposal path for MCP actions: selected-agent mentions are reloaded and ACL-checked, passed to the model as schema-only tools without executors, and capped at three bounded proposals.
- Every proposal requires explicit voice confirmation. The existing 10-minute hashed token lifecycle binds the delegated agent, exact server/tool/arguments, and server configuration. Approval issuance and dispatch recheck current agent access/mentions; MCP execution rechecks current server access/config and consumes the token once. Secret-like arguments require a redacted overview plus second exact-value confirmation. Composio remains unavailable to delegated voice runs.
- Validation: 47 focused tests/8 files and scoped Biome pass. Typecheck is pending the root aggregate run because an image-source edit raced the 6 GB check and emitted a now-stale unused-constant diagnostic. No migration required/applied; existing `verification` table stores the approval token. B22 remains PARTIAL pending live voice/provider/PostgreSQL/browser verification.
- No V2 changes, production writes, migration application, push, or deployment.

### 2026-11-08 15:47 IST - B22 false-success and proposal-text hardening
Review fixes: delegated MCP calls are now marked approved only for non-error MCP results; a fulfilled `{isError:true}` response becomes failed. When the model emits tool proposals, its free-form answer is replaced with a neutral review-status message so it cannot claim that a proposed effect already happened. Focused tests pass 30/30 across five suites; scoped Biome and diff-check pass. No DB migration, V2 edit, production write, push, or deployment.

### 2026-11-08 15:49 IST - A25 image composition, mask editing, and provider hardening
- Preserved Void Agent as the default generation/single-image edit provider. Added optional AI Gateway multi-reference composition (`bfl/flux-2-pro`) only on explicit composition mode/intent; multiple attachments alone do not trigger composition.
- Added an accessible bounded brush editor. It uploads a PNG mask through authenticated owner storage and persists a `data-image-mask` part that pairs exact source/mask file IDs and URLs.
- Masked edits require both managed owner keys, validate raster signatures, cap combined input at 15 MiB and image edges/pixels, normalize the source and mask to identical dimensions, and convert painted pixels to opaque white (regenerate) with unpainted pixels opaque black (preserve). The Gateway `bfl/flux-pro-1.0-fill` call receives abort; capability discovery is authenticated/private/no-store and the provider call is owner-limited to 20/hour. Existing free-tier edit quotas remain.
- Exact upstream SDK versions are isolated aliases: `ai-image-v7` -> `ai@7.0.18`; `@ai-sdk/gateway-image-v4` -> `@ai-sdk/gateway@4.0.0-canary.107`. The primary app remains on `ai@5`. `.env.example` documents optional `AI_GATEWAY_API_KEY`.
- Void Agent provider output/poll paths were hardened: strict provider origin HTTPS URLs, no redirects, response caps/timeouts/MIME/signature checks; polling ignores provider-supplied URLs and constructs task endpoints only from validated task IDs.
- Validation: focused image/API tests 46/46 across 9 files; scoped Biome passed; 6 GiB TypeScript check passed. Live Gateway credentials/provider/browser flow unavailable. A25 remains PARTIAL. No migration, production write, V2 edit, push, or deploy.

### 2026-11-08 15:52 IST - A25 final verification update
- Added the owner-keyed masked-image rate-limit check after URL ownership validation but before either storage download; route regression confirms rate-limited requests do no storage reads.
- Verification count supersedes the earlier 46-test checkpoint: 47 focused tests across 9 files pass. Scoped Biome and 6 GiB typecheck pass after all A25 changes. The 2 GiB default typecheck OOMs in this workspace.
- Live Gateway calls remain unverified; no production build specifically for this batch. A25 remains PARTIAL until live credential/provider/browser verification.

### 2026-11-08 16:07 IST - Aggregate verification and next-batch checkpoint
- A24 documentation corrected to the final focused result: HLS source/playback tests pass 7/7 (the prior 6/6 entries were stale).
- Aggregate validation on the current root batch: full pnpm test passed 536 files / 2,862 tests; the changed stream-context suite was rerun after its test-only lint rename and passed 9/9. 6 GiB typecheck, pnpm lint, pnpm db:check, production pnpm build (exit 0; 205/205 page slots), and git diff --check passed. Lint has existing warnings only.
- Build caveat: route pre-render probes logged PostgreSQL schema mismatch (`agent.preset_id absent) and expected dynamic-session/cache notices. This is not proof of live PostgreSQL-backed workflows; migrations remain unapplied and no production database was changed.
- Current parity register is still scoped, not complete: 80 individually tracked candidate workflows, with 0 COMPLETE, 70 PARTIAL, 1 MISSING (unsafe browser automation), 5 EXCLUDED, 2 OPTIONAL, 1 DEPRECATED, and 1 PRIMARY CUSTOM. PARTIAL includes implemented features awaiting live service/browser verification; this is not a percent-complete figure and does not cover all 206 route/page/tool surfaces.
- Parallel implementation continues on table review, desktop MCP, and project-brain parity. No V2 edits, migration application, production writes, push, or deployment.

### 2026-11-08 16:09 IST - C20 desktop MCP credential-retention fix
- Review found `buildMcpConfigFingerprint() returned canonical JSON containing remote authorization headers and stdio environment values, while fingerprints remain in the process-lifetime consent cache.
- Changed the fingerprint to a SHA-256 digest over the same canonical configuration. Consent semantics still change when endpoint, arguments, headers, or environment values change, while credentials no longer appear in the retained cache value.
- Regression tests assert local and remote secrets Void Agent from the digest and the output is a 64-character lowercase hex value.
- Upstream desktop surfaces are already present in Void-Agent; the bridge preserves stronger origin/frame checks, native per-call consent, pinned remote networking, default-deny tools, bounds, and hash-only audit values.
- Verification reported by the worker: desktop main suite 68/68 across 17 files, desktop package typecheck, scoped Biome, and git diff --check passed. No real Electron/remote-server journey.
- Files: `apps/desktop/src/main/mcp-policy.ts, `apps/desktop/src/main/mcp-policy.test.ts, C20 row in docs/feature-work-register.md.
- No V2 edits, migration, production write, push, or deployment. C20 stays PARTIAL pending packaged app and live MCP verification.

### 2026-11-08 16:10 IST - B07 project-knowledge query window
- The project-brain agent fixed a concrete retrieval gap: src/lib/ai/tools/project-knowledge.ts used to load the newest 500 accepted facts before in-memory matching. Older relevant facts could therefore be unreachable.
- The query now searches/ranks accepted current facts in SQL by bounded query terms before the cap (300), retaining attached collection, source owner, ready state, active revision, and project scope; wildcard characters are escaped and query values remain parameterized. Alias expansion remains.
- Verification: 4/4 focused tests, scoped Biome, and diff-check passed. No live PostgreSQL plan/browser verification or migration. B07 remains PARTIAL.
- Files: src/lib/ai/tools/project-knowledge.ts, src/lib/ai/tools/project-knowledge.test.ts, register/matrix/progress/testing/handoff/context docs.

### 2026-11-08 16:14 IST - Independent security review closeout
- Review covered C20 desktop MCP config fingerprint hashing, B07 project-knowledge SQL search, and B22 delegated MCP approval/dispatch. No actionable security defect was found.
- B07 uses parameterized bounded predicates and preserves access/source-state checks. Leading-wildcard ILIKE performance needs a representative PostgreSQL EXPLAIN; none was run. No live external workflow is implied by the source review.

### 2026-11-08 16:16 IST - C15 Cockpit agent Updates
- Added the missing Cockpit Updates panel to `src/components/cockpit/cockpit-overview.tsx`, with implementation in `src/components/cockpit/cockpit-updates.tsx`. It polls the latest eight info/warning/alert notifications, renders severity and read status, marks individual updates read, and passes destinations through `safeNotificationHref` before navigation.
- Uses the existing authenticated, owner-scoped notifications/list and read APIs; no DB schema change.
- Fixed the loading state to `Loading updates...` after review caught mojibake. Kept the default React import because removing it made Vitest render fail with `React is not defined`.
- Focused suites: 7/7 across three UI/type/overview files; notification route/contract tests: 13/13; scoped Biome and `git diff --check` passed. Live browser/PostgreSQL validation remains; C15 remains PARTIAL.
- No V2 edits, migration, production writes, push, or deployment.

### 2026-11-08 16:16 IST - C17Void Agentrofile parity auditVoid Agent
- Void Agentted reference and Void-Agent both load profile/account settings on drawer open and provide profile editing, linked-provider status, and password management. Void-Agent's authenticated `/api/user/settings-context` derives identity from the session, uses no-store responses, and exposes only safe provider/account metadata.
- Void-Agent is stronger against forged self-service state: target identity is server-derived, self password changes require the current password, and other sessions are revoked after self-change or authorized admin reset. Existing tests cover unauthenticated access, token non-disclosure, forged state, and session revocation.
- Neither inspected repository implements 2FA or passkeys; no speculative UI/API was added. C17 remains PARTIAL only for live email/database/browser workflows.

### 2026-11-08 16:17 IST - Root rerun of C15 and B07 focused suites
- Root reran Cockpit Updates component/type/overview tests and project-knowledge retrieval together: 4 files / 11 tests passed. Scoped Biome check passed for all seven changed UI/helper/query files; diff-check passed.
- This rerun follows the loading-copy correction and documentation-byte repair; it supplements (does not replace) the worker's separate 13/13 notification route/contract result. No DB/browser integration is implied.

### 2026-11-08 16:25 IST - C09 schedule agent selection parityVoid Agent
- Better Chatbot's schedule authoring supports selecting an agent; Void-Agent's backend already enforced owner-only `agentId`, but the dashboard could create only assistant schedules and did not project the selected identity.
- The dashboard now fetches only the owner's agents, offers one during create, sends its ID through the existing owner-checked scheduler API, exposes that ID in the public job projection, and locks agent selection when editing an existing schedule. Existing durable run/cancel/history behavior remains.
- Focused scheduler dashboard/helper/route tests pass 26/26 across three files; scoped Biome and diff-check pass. No migration/schema change. Live PostgreSQL, worker, and browser verification remain, so C09 stays PARTIAL.

### 2026-11-08 16:26 IST - Aggregate typecheck after scheduler fixture repair
- Full 6 GiB `pnpm check-types` passed after the new public schedule projection test was corrected to supply the complete `ScheduledJob` fields (`userId`, `claimToken`, and `claimExpiresAt`) instead of an unsafe incomplete cast.
- The earlier provider-agent typecheck failure was only this concurrent schedule-test fixture; Personal Auto itself had no diagnostics. No production schema/data or migration was touched.

### 2026-11-08 16:35 IST - Add A27 Personal Auto and C27 team-member workflows
- A27: Personal chat Auto now uses explicit administrator task scores and priority. It filters to enabled/keyed deployment providers, excludes personal endpoints, validates capabilities/context, accepts provider-verified context sizes for otherwise unknown models, and pins an eligible prior thread model. Focused tests 32/32 across six files; 6 GiB typecheck passes; live provider/browser remains unverified.
- C27: Added an owner/admin-only team member screen and endpoint for existing accounts, with member/viewer role, rate limit, no-store, bounded validation, and atomic membership/default-budget-policy creation. The reference invitation-email/acceptance path is still missing; this workflow remains PARTIAL. Focused team/scheduler tests 38/38 across five files; 6 GiB typecheck passes.
- Review also closed a scheduler ACL mismatch: shared schedule creation now rejects public/read-only agents before persistence, matching the direct API rule.
- Updated scoped register: 82 candidates = 72 PARTIAL, 1 MISSING, 5 EXCLUDED, 2 OPTIONAL, 1 DEPRECATED, 1 PRIMARY CUSTOM, 0 end-to-end COMPLETE. This is still not the full 206-surface denominator and is not a completion percentage.
- No migration, production write, V2 edit, push, or deployment.

### 2026-11-08 16:44 IST - Full aggregate verification for current migration batches
- `pnpm test`: 542 files / 2,899 tests passed.
- `pnpm lint`: passed. Existing warnings: deprecated `next lint`, workspace-root/multiple-lockfile inference, and `<img>` LCP hints.
- 6 GiB `pnpm check-types`: passed.
- `pnpm db:check`: passed; this validates migration metadata only and did not apply migrations or verify live PostgreSQL behavior.
- Production `pnpm build`: exit 0, static generation completed 205/205 pages. Existing bundler E2B/unpdf warnings, optional Redis/Upstash/E2B notices, PostgreSQL SSL-mode notice, and dynamic session/header prerender logs remain. No build error.
- `git diff --check`: passed (line-ending normalization notices only).
- Scoped feature ledger: 82 workflows (72 PARTIAL, 1 MISSING, 5 EXCLUDED, 2 OPTIONAL, 1 DEPRECATED, 1 PRIMARY CUSTOM, 0 strict end-to-end COMPLETE). This is not the full denominator: the 206 census items are route/page/tool surfaces. No overall completion percentage is claimed.
- No V2 edits, database migration/application, production data writes, push, or deployment.

# 2026-11-08 17:23 IST - Verified implementation batch and build pending
- This checkpoint added local team invitation creation/revocation/acceptance, session-backed active-team metering selection, bounded aggregate chat attachment context, three upstream chat payload/tool-loop compatibility helpers, and desktop MCP response/serialization bounds. See context.md and integration-progress.md for source paths.
- Aggregate validation: 555 test files / 2,957 tests passed; full 6 GiB typecheck passed; lint passed with existing warnings; pnpm db:check and git diff --check passed.
- Production build was still running as of 17:23 IST (session 44879); its result is unknown until process exit.
- Scoped ledger: 88 candidate workflows = 78 PARTIAL, 1 MISSING (unsafe browser automation), 5 EXCLUDED, 2 OPTIONAL, 1 DEPRECATED, 1 PRIMARY CUSTOM, and 0 strict end-to-end COMPLETE. This is not a full denominator for all 206 reference surfaces and does not support an overall parity percentage.
- Remaining: broad mapping and implementation of reference surfaces/workflows; live PostgreSQL, email, provider, MCP, desktop, and browser E2E; additive migrations remain unapplied. V2 remains unchanged. No push, commit, deployment, migration application, or production write.
- Next: confirm build exit, record its result, then continue implementing remaining compatible workflows.

### 2026-11-08 17:30 IST - Production build result (supersedes pending status)
- `pnpm build` completed successfully: exit code 0; all 205 page slots generated.
- Warnings: webpack dependency-analysis warnings for third-party packages; existing Next `<img>` lint warnings; expected dynamic-session diagnostics for authenticated routes during prerender probing; local environment lacked Redis/Upstash and E2B configuration. These warnings do not mean live PostgreSQL/provider workflows were verified.

### 2026-11-08 17:31 IST - B23 ElevenLabs wiring correctionVoid Agent
- Fresh trace: Better Chatbot V2 includes default voice tools in its OpenAI Realtime tools and voice dropdown (`apps/web/src/lib/voice/openai-tools.ts`, `apps/web/src/components/chat-bot-voice-session.tsx`). Void-Agent already has equivalent executable wiring: `DEFAULT_VOICE_TOOLS` contains `searchWeb` (`src/lib/ai/speech/index.ts`); the ElevenLabs session route returns it in `bindingTools` (`src/app/api/voice/kimi-elevenlabs/session/route.ts`); the ElevenLabs SDK binds `clientTools.searchWeb` (`src/lib/ai/speech/elevenlabs/use-voice-chat-elevenlabs.ts`); the callback calls `searchVoiceWeb` and authenticated `/api/voice/web-search` (`src/lib/ai/speech/web-search.ts`, `src/app/api/voice/web-search/route.ts`). OpenAI Realtime/Konvo handlers are also present.
- Corrected the stale B23 register claim saying ElevenLabs client tool wiring was absent. No new runtime code was appropriate; avoid duplicating an existing feature. B23 remains PARTIAL pending external ElevenLabs dashboard tool schema configuration and live provider/browser verification. The existing setup steps are in `docs/voice-web-search.md`.
- Verification: existing focused suites passed 3 files / 9 tests (`route.test.ts`, `web-search.test.ts`, `voice-tools.test.ts`); scoped `git diff --check` passed (line-ending warning only).
- B20 voice browser automation remains unsafe with current primary browser tools due missing enforced egress isolation; no arbitrary navigation or execution was exposed.

### 2026-11-08 17:43 IST - Skills registry migration handoffVoid Agent
- Implemented an unregistered upstream capability discovered by surface audit: skills.sh catalog search and licensed SKILL.md preview/import into Void-Agent personal skills. Content is not persisted until user review and rights confirmation; attribution is persisted/displayed. See A32.
- Focused tests: 15/15; scoped Biome passes. Full 6 GiB TypeScript check is running; production build has not been rerun after this batch. Live registry/GitHub and browser journey remain unverified.
- Scoped register: 89 candidates (79 PARTIAL, 1 MISSING, 5 EXCLUDED, 2 OPTIONAL, 1 DEPRECATED, 1 PRIMARY CUSTOM, 0 strict E2E COMPLETE). The complete reference surface denominator is still unmapped.

### 2026-11-08 17:43 IST - Personal provider capability batch
- Implemented A16-compatible per-model tool opt-in after V2 source review confirmed dynamic local models are offered tools. Legacy rows default false, capability IDs are checked against fresh model discovery, endpoint changes reset the flags, and chat UI/catalog/runtime consult the same owner-scoped record. Vision remains disabled because the inspected V2 workflow also marks local models vision-unsupported.
- Validation: 6 focused files / 36 tests passed; `pnpm db:check` passed (no SQL migration); scoped Biome passed; `git diff --check` passed. Full typecheck was intentionally canceled on parent request; aggregate check pending.
- A16 remains PARTIAL pending live provider/browser verification; A17 direct local/LAN remains EXCLUDED for SSRF safety. No V2 edit, database apply, provider request, push, or deployment.

### 2026-11-08 17:47 IST - Handoff correction
- A32 now retains/display/persists the repository's license notice text in addition to SPDX/source attribution. Existing `/api/skills` POST/PUT/DELETE now require same-origin mutations; POST/PUT parse only after a streamed 512 KB limit. Regression tests cover cross-origin mutations and an oversized streamed request. Focused suite: 17/17; scoped Biome and diff-check passed. A full typecheck passed on the preceding draft before these last changes, so the aggregate root typecheck must validate the final tree.

### 2026-11-08 17:49 IST - C30 Plan Mode implementation checkpoint
- Added user-selected, persistent Plan Mode to chat and a bounded `createPlan` artifact with a rendered inline card. Server allowlist exposes only read-only research tools plus the artifact. It ignores client mentions, skips direct schedule dispatch, disables image tools, and fails clearly for models without tool calling.
- Focused suite: 6 files / 11 tests; scoped Biome and diff-check pass. Root aggregate typecheck is pending. C30 stays PARTIAL pending live provider/browser verification.
- With A32 skills import and C30 Plan Mode individually registered, current scope is 90 candidates: 80 PARTIAL, 1 MISSING, 5 EXCLUDED, 2 OPTIONAL, 1 DEPRECATED, 1 PRIMARY CUSTOM, 0 strict E2E COMPLETE. This is not a full percentage over all reference surfaces.
- No V2 modifications, migrations applied, external account settings, GitHub push, commit, deployment, or production write.

### 2026-11-08 17:58 IST - Combined implementation batch and final local validation
- Added two previously unregistered upstream workflows: A32 skills.sh catalog search with licensed import preview/review, and C30 Plan Mode with read-only research plus one bounded plan artifact. Corrected the user-provider tool capability mismatch: explicit default-deny per-model tool support now shares the owner-scoped capability source across settings, model catalog and runtime; vision remains disabled because V2 also treats local SDK models as text-only.
- Focused results: skills 17/17; personal-provider 36/36; Plan Mode 11/11. Aggregate `pnpm test`: PASS, 567 files / 2,995 tests. 6 GiB `pnpm check-types`: PASS. `pnpm lint`: PASS with existing Next deprecation/workspace-root and `<img>` warnings. `pnpm db:check`: PASS (metadata validation only). `git diff --check`: PASS (line-ending normalization warnings only). Production `pnpm build`: PASS, exit 0, 205/205 pages.
- Build warnings include third-party webpack dependency analysis, authenticated dynamic-session prerender probes, missing local Redis/Upstash and E2B configuration, plus the existing workspace-root warning. Build success is not live service or DB verification.
- Register: 90 scoped candidates = 80 PARTIAL, 1 MISSING, 5 EXCLUDED, 2 OPTIONAL, 1 DEPRECATED, 1 PRIMARY CUSTOM, 0 strict end-to-end COMPLETE. This is not the full denominator: the 206 discovered surfaces still need full individual workflow mapping. No overall completion percentage is supportable yet.
- Current verification limits: migrations 0080/0081 and other additive migrations remain unapplied; no live PostgreSQL, email, provider, skills registry/bVoid Agentice, desktop MCP, or full browser E2E. No push, commit, deployment, or production write.
- Repository note: primary is on `main` tracking `origin/main` with a large pre-existing/local migration worktree. The read-only `git status` of sibling `Void-Agent-V2` shows it is already dirty on `update/better-chatbot-2.0`; this turn performed source reads only there and no reference writes. Preserve that state; do not clean it.

## A33 - Safe, stable cVoid Agentn titles (2026-11-08)
- Upstream reference: `Void-Void Agentpps/web/src/lib/chat/thread-title.ts`, `generate-thread-title.ts`, title API, and chat route. It bounds/normalizes generated titles, falls back to user text, and writes only if the authenticated owner's title is empty.
- Primary changes: preserve Void-Agent's current auth/rate/free-tier/team-budget/provider path; normalize to a bounded single-line title; derive fallback from the first user prompt; atomically insert/fill an empty title only for the owning user. Duplicate generation cannot replace an existing nonempty title.
- Verification: focused route/helper/PG tests 17/17, including same-origin rejection; scoped Biome passed. Aggregate typecheck pending (default-heap run OOM; 6 GiB rerun was stopped at root request).
- Changed paths: `src/lib/chat/thread-title.ts`, its test, `src/app/api/chat/title/route.ts` and test, `src/hooks/queries/use-generate-thread-title.ts`, `src/types/chat.ts`, `src/lib/db/pg/repositories/chat-repository.pg.ts`, and the PG title-repository test. Ledger A33 is PARTIAL because live model/PostgreSQL/browser refresh remains unverified.

### OpenAI Realtime Composio read-only follow-up — 2026-11-08 18:34 ISTVoid Agent
- Independent audit confirmed reference voice sessions expose Composio search/execute meta-tools, while primary voice had no Composio tool path. Adapted only the valuable safe subset: read-only action search/execution. Primary sends authenticated same-origin requests to `/api/voice/composio-tool`; server-side account refs are AES-GCM encrypted, user-bound, short-lived, and revalidated against the current active owner account. Read-only slug checks, schema validation, C31 redaction, rate limits, response bounds, and untrusted-data instructions apply. Mutating actions remain unavailable because the reference's direct executor does not meet Void-Agent's approval boundary.
- Tests: 17 focused tests passed across C31 and voice helpers; Biome and scoped `git diff --check` passed. Typecheck is pending root aggregate; browser/provider/Composio E2E is unverified. This note does not alter the global candidate denominator or completion counts.

## C33 - Agent alert delivery policy (2026-11-08)
- Distinct scoVoid Agentvers inbox feed/read state; C16 covers push subscription/delivery. C33 covers client alert policy and duplicate suppression.
- V2 source: `Void-Agent-V2/apps/web/src/hooks/use-agent-alert-notifications.ts`, `lib/agent-alerts/maybe-notify-agent-alert.ts`, and `components/agent-alerts/notification-settings-content.tsx`. It suppresses a notification when the current visible pathname is already the alerted chat and supports `onlyWhenAway`.
- Primary now has `chatAlertsOnlyWhenAway` in the existing owner-scoped preference object. It defaults false for backwards-compatible behavior. When true, alerts are delivered only when the page is hidden or not focused. A visible alert for the thread currently on screen is suppressed in either mode. Existing generic private copy is retained.
- Files changed: `src/lib/agent-alerts/chat-background-alerts.ts`, `src/lib/agent-alerts/chat-background-alerts.test.ts`, `src/hooks/use-chat-background-alerts.ts`, `src/hooks/use-chat-background-alerts.test.ts`, `src/components/agent-alerts/background-chat-alert-settings.tsx`, `src/types/user.ts`.
- Tests: 2 files / 17 passed; scoped Biome and diff-check passed. No new database schema or migration.
- Status: PARTIAL pending browser settings persistence and actual browser/Electron OS notification verification. C33 is recorded as an addendum; it is not included in the 93-candidate totals above until root reconciles counts. No V2 write, push, commit, migration, or deployment.

Correction to the 18:34 handoff note: final voice search returns at most 8 actions, each with a schema capped at 4 KB; toolkits are capped at 8, candidate actions at 100/toolkit, accounts at 20, search/execute rate limits at 6/8 per minute, and sanitized results at 8 KB. No global candidate count changed.

### Agentset project search adapter - 2026-11-08
- Independent source review found a reference capability not represented as a distinct workflow: V2 `agentset@1.9.1` managed project namespace search with reranking and metadata. Added an optional server-side read/search adapter and protected `POST /api/projects/{id}/search`; local PostgreSQL/pgvector ingestion, chat retrieval, and project-brain behavior remain untouched.
- Security boundaries: enablement requires both `AGENTSET_PROJECT_SEARCH_ENABLED=true` and server-side `AGENTSET_API_KEY`; namespace slug is derived from the authorized project ID; SDK fetch is pinned to `https://api.agentset.ai`, permits GET/POST only, uses a five-second timeout and 1 MB response cap. Route validates same-origin, session, current project access, bounded query/body, then rechecks result project/source metadata against current attached collections, source-owner allowlist, ready items, and local document rows. Responses are private/no-store and text-capped.
- Files changed: `.env.example`, `package.json`, `pnpm-lock.yaml`, `src/lib/rag/agentset-provider.ts` and test, `src/lib/rag/agentset-source-access.ts` and test, `src/app/api/projects/[id]/search/route.ts` and test, `docs/features/agentset-project-search.md`, and `context.md`.
- Focused validation: 3 files / 11 tests pass; scoped Biome passes. Full typecheck/aggregate validation is assigned to root; no live Agentset credential or PostgreSQL/browser integration was exercised.
- This is intentionally PARTIAL provider parity: local documents are not mirrored to Agentset, remote ingest jobs are not managed/revoked, there is no namespace/profile UI, and external search results are not injected into chat or project-brain context. The endpoint requires a populated namespace with source metadata. Do not increment shared register totals until the root reconciles the workflow denominator.
- No V2 writes, database migration, push, commit, deploy, or production data write.

### Composio voice route regression evidence — 2026-11-08 18:41 IST
`src/app/api/voice/composio-tool/route.test.ts` now verifies foreign-Origin rejection occurs before session/service access, unauthenticated requests do not construct the action service, malformed and >32 KB streamed JSON are rejected, and authenticated search/execute dispatch returns private/no-store responses. Combined route, voice helper and C31 helper coverage: 22/22 across three files. Biome and scoped diff-check pass. No route behavior changes or global count edits.

### Composio voice test typing follow-up — 2026-11-08 18:44 IST
Fixed the aggregate TS18048/TS2339 diagnostics in `src/lib/ai/composio-voice-tools.test.ts` with explicit discriminated-union success guards only. No runtime change. Focused route/helper tests passed 12/12 across two files; scoped Biome passed. Root should rerun aggregate typecheck; no global counts changed.

### Composio voice test narrowing verification — 2026-11-08 18:47 IST
The earlier `.success` checks did not narrow because the implementation result union widens that field to `boolean`. Replaced them with test-only assertion helpers checking `success === true` and the required search/execution payload shape. Focused route/helper tests passed 12/12; Biome passed; full 6 GiB `pnpm check-types` passed with exit 0. No runtime behavior or global counts changed.

## Current verified checkpoint - 2026-11-08 19:00 IST

### What changed in this continuation
- **C33 � chat alert delivery policy:** suppresses alerts for the visibly open thread and adds owner preference chatAlertsOnlyWhenAway, default off; generic private copy is preserved. Source: src/lib/agent-alerts/chat-background-alerts.ts, src/hooks/use-chat-background-alerts.ts, settings component, preference schema. Focused: 17 tests.
- **C34 � optional Agentset project search:** pinned SDK, fixed-origin bounded search, same-origin/auth/project ACL route, and post-search source/owner/collection/document revalidation. Local pgvector/RAG remains the default. Setup: docs/features/agentset-project-search.md. Focused: 11 tests. Remote ingestion/job lifecycle, UI, and chat integration remain partial.
- **C35 � read-only Composio in OpenAI Realtime voice:** encrypted expiring account references, owner recheck, read-only action/schema validation, result redaction and limits, and private same-origin execution route. Mutations are not available. Focused route/helper/C31 tests: 22.

### Latest measured stateVoid Agent
- Register: 96 scoped workflow candidates (95 reference + 1 Void-Agent custom); 86 PARTIAL, 1 MISSING, 5 EXCLUDED, 2 OPTIONAL, 1 DEPRECATED, 1 PRIMARY CUSTOM, 0 strict E2E COMPLETE. The 206 route/page/tool census has not been fully mapped to independent workflows. Do not state an overall parity percent.
- Verification: full suite 576 files / 3,058 tests passed; 6 GiB TypeScript check passed; lint passed with existing warnings; db:check passed without applying SQL; git diff --check passed; production build passed with 205/205 page slots.
- Live limitations: no PostgreSQL-backed UI, external Agentset/Composio/model credentials, browser/Electron notification or voice E2E, physical voice device, or packaged desktop E2E was exercised. Local build noted missing Redis/Upstash/E2B configuration; production rate-limit configuration requires separate verification.

### Next work
1. Finish mapping the full 206 upstream surfaces and reconcile individually.
2. Complete safe Agentset document/job lifecycle and UI/chat-context integration or document a concrete exclusion.
3. Add server-bound exact-payload approvals before any Composio write actions.
4. Implement a verifiable network-isolated browser/voice sandbox before reconsidering B20.
5. Continue remaining partial workflows and verify them against a live PostgreSQL/browser/provider environment when available.
Void AgentVoid Agent
Only Void-Agent was modified. Void-Agent-V2 was inspection-only. No migration was applied, and nothing was pushed, committed, deployed, or written to production.

## Approval parity re-audit - 2026-11-08 19:05 IST
No new safe approval/cancellation gap was found. The reference voice executor directly dispatches MCP/Composio effects without a server-bound approval token; primary voice proposals require a persisted one-use approval and recheck access/config fingerprint. Scheduled jobs and saved workflow effect decisions also bind one-use approval to exact arguments/effects and recheck ownership/revision. Existing controls are stronger and remain unchanged; do not port unchecked reference mutations. No source changes were required for this audit.

### 2026-11-08 21:10 IST - DOCX/Morphik blockers closed; B20 browser security reviewed
- DOCX route tool-map typing/access gating and component test runtime issues are fixed. Proposal tools remain limited to project owners/editors with eligible DOCX files and only create pending-review copies; no automatic document application is possible.
- Morphik result wrapper now preserves identity only when no protected content changes; signed bearer URLs are still removed/redacted before model/transcript/persistence paths. Focused suites and aggregate checks passed (see docs/MIGRATION-STATUS-REPORT.md).
- B20 remains MISSING. V2 Kernel runs Playwright in a remote VM but direct egress is enabled and the wrapper has no destination denylist. Primary Steel/Crawl/Cloak have no enforced browser+VM egress boundary. Removed Cloak's hardcoded shared bridge token fallback and added tests; this does not fix B20 egress.
- Current scoped register: 98 unique entries (0 COMPLETE, 88 PARTIAL, 1 MISSING, 5 EXCLUDED, 2 OPTIONAL, 1 DEPRECATED, 1 PRIMARY CUSTOM). C33 appears once; C36 DOCX and C37 Morphik are PARTIAL.
- Next exact task: develop a dedicated short-lived browser runtime with network-level public-only egress restrictions and verified deny tests, cancellation, and guaranteed teardown; keep it unavailable until enforcement is proven. Then continue remaining PARTIAL workflows.
- No V2 modifications, database migrations, commits, pushes, or deployments.

### 2026-11-08 21:11 IST - B20 browser boundary and Cloak credential fix
- Independent audits traced V2 Kernel browser execution and primary Steel/Crawl/Cloak paths. Remote execution does not mean private-network egress isolation; V2 Kernel defaults direct egress, and primary browser subresources/redirects are not constrained. Keep B20 MISSING; no voice browser route was exposed.
- Removed the hardcoded Cloak bridge fallback token. Missing configuration fails before cache/network access; a new mocked regression test verifies this and configured Authorization dispatch. B20 remains blocked on network-layer browser+VM egress restriction, cancellation/teardown, and live private-network deny tests.
- No V2 writes, migrations, commit, push, or deployment.

### 2026-11-08 21:18 IST - Final blocker/security validation
- Full unit suite passes 582 files / 3,084 tests; focused Cloak credential suite passes 2/2. 6 GiB typecheck, lint, Drizzle metadata check, 6 GiB production build (205/205 pages), and diff-check pass. Build warnings and local DB schema mismatch are documented in the status report; migrations remain unapplied.
- Cloak's static bridge token fallback is removed and covered by tests. B20 remains MISSING until browser+VM-level egress restrictions are demonstrably enforced and private/metadata/redirect/subresource paths are tested.
- Feature register remains 98 items (88 partial; zero strict E2E complete). No V2 writes, commits, pushes, deployments or production writes.

### 2026-11-08 21:38 IST - B20 fail-closed code boundary
- Disabled the primary chat/agent registry and selectable UI entry for Browser Agent; direct Steel/Crawl/Cloak factory execution is guarded by `BROWSER_NETWORK_ISOLATION_VERIFIED = false` until a real boundary is verified.
- Added direct-call adversarial regression tests. Private/metadata/redirect/subresource/WebSocket/proxy/alternate-protocol cases all return before browser, cache, or bridge network I/O. This is a fail-closed app gate, not evidence of network filtering.
- B20 remains MISSING. Continue with C31 Composio write approval. No external runtime was available for live egress deny testing.

### 2026-11-08 22:20 IST - B20 fail-closed decision and C38 Composio approval flow
- B20 remains MISSING. Three independent read-only audits found no primary bypass through chat, voice, direct browser factories, or the tool registry, but Steel/Crawl/Cloak and V2 Kernel do not establish browser/VM network-layer egress enforcement. Browser automation remains unavailable; adversarial tests prove only that the app declines to start it.
- C38 adds a separate Composio write workflow: owner-connected account/action discovery, review-only proposals, same-origin authenticated approval issuance, encrypted account refs, current owner/action/version/schema/argument revalidation, expiring persisted one-use tokens, atomic consume before provider execution, and reject-without-request UI. Read-only actions remain separate. Focused 4-file suite: 21/21 passed. Live Composio/PostgreSQL/browser journey remains unverified; approval UI presents the action slug and exact JSON, while action-description display could improve review clarity.
- C38 is PARTIAL. Register now contains 99 candidates: 0 COMPLETE, 89 PARTIAL, 1 MISSING, 5 EXCLUDED, 2 OPTIONAL, 1 DEPRECATED, and 1 PRIMARY CUSTOM (98 reference plus one primary custom).
- The first production build failed because Next.js route modules cannot export the injectable handler factory. Moved the factory to `src/lib/ai/tools/hitl/composio-write-approval-route.ts`; the App Router module now exports only `dynamic` and `POST`. Rebuild is running after this fix.
- Latest checks: focused Composio approval suite 21/21 PASS; full `pnpm test` 588 files / 3,131 tests PASS; 6 GiB typecheck PASS; `pnpm lint` PASS with existing warnings; `pnpm db:check` PASS (metadata only); initial `git diff --check` PASS with line-ending notices. Rebuild and final post-documentation diff-check pending.
- No commit, push, deployment, database migration, production write, or V2 edit. Next: finish production build, reconcile report/progress/handoff/security/context with actual final result, then continue the next dependency-ordered PARTIAL workflow.

### Current aggregate checkpoint - 2026-11-08 22:27 IST
- Current scoped ledger: 99 candidates (98 reference + 1 primary custom): 0 COMPLETE, 89 PARTIAL, 1 MISSING (B20), 5 EXCLUDED, 2 OPTIONAL, 1 DEPRECATED, 1 PRIMARY CUSTOM. C38 is PARTIAL; no overall parity percentage is supported by the incomplete semantic inventory.
- `pnpm test`: PASS, 588 files / 3,131 tests. C38 focused route/helper/chat/UI suite: PASS, 4 files / 21 tests.
- `NODE_OPTIONS=--max-old-space-size=6144 pnpm check-types`: PASS.
- `pnpm lint`: PASS with Next lint deprecation/workspace-root and existing `<img>` warnings; Biome checked 2,285 files.
- `pnpm db:check`: PASS (Drizzle metadata only; no live DB or migration apply).
- Corrected 6 GiB `pnpm build`: PASS, exit 0, 205/205 pages generated. Initial build found an invalid route-exported test handler factory; moved it to `src/lib/ai/tools/hitl/composio-write-approval-route.ts` and kept the App Router file to supported exports. Build logs retain dependency-analysis, dynamic-session prerender, missing Redis/Upstash/E2B configuration, and PostgreSQL SSL warnings. Local build does not verify production database state.
- Three independent subagent reviews confirmed B20 is fail-closed across the primary app paths and there is no provider/VM egress guarantee; B20 stays MISSING. C31/C38 review confirms approval gating and replay protection in tests; live Composio/PostgreSQL/browser behavior is unverified.
- Primary status: branch `main`, HEAD `23a0177`, 315 tracked modified paths, 285 untracked paths, no staged files. Reference status remains 3,072 pre-existing staged entries; no reference writes were made. No commit, push, deployment, or migration apply.
- Next: work on P0 A01 chat creation/send/persistence using an isolated PostgreSQL test environment; preserve B20 default-deny until a verified network-isolated browser runtime exists.

### 2026-11-08 22:30 IST - Final documentation and whitespace check
- Final `git diff --check` after updating the register, testing report, migration status report, integration progress, handoff, and security review exited 0; only LF/CRLF normalization notices were emitted.
- Corrected report snapshot: 315 tracked modified paths, 285 untracked paths, 0 staged; 600 default `git status --short` entries. No commit, push, merge, deployment, migration apply, or reference write.
- Final verified aggregate remains: full tests 588/3,131, 6 GiB typecheck PASS, lint PASS with warnings, Drizzle metadata check PASS, production build PASS with 205/205 pages. B20 remains MISSING and disabled; C38 remains PARTIAL pending live Composio/PostgreSQL/browser verification.

### 2026-11-09 00:08 IST - A01 implementation checkpoint
- A01 implementation now covers atomic first-thread persistence, message-ID conflict isolation, atomic run claim/retry state, attempt-token CAS for stale callbacks, atomic finalization of user+assistant messages, retryable provider-error persistence, and claim/finalization for schedule and unknown-skill fast paths. Chat draft navigation is delayed until the first successful non-redirected stream response.
- Fresh isolated PostgreSQL database migration succeeded; 10 A01 repository integration tests passed on PostgreSQL 17.11 with pgvector 0.8.7. Full suite 593/3,157, 6 GiB typecheck, lint, db metadata check, production build (205 pages), and pre-documentation diff-check passed. See latest report addendum.
- Keep A01 PARTIAL because no authenticated route/provider/browser end-to-end journey was exercised. Do not claim a real provider run. Next task: add/run route-level lifecycle tests (auth, initial POST, stream error/cancel, duplicate POST) using isolated PostgreSQL and controlled provider mocks; if unavailable, leave the explicit limitation in status.
- Modified source: `src/app/api/chat/route.ts`, `src/components/chat-bot.tsx`, `src/types/chat.ts`, `src/lib/db/pg/repositories/chat-repository.pg.ts`; migration fixes 0042 and 0068; A01 helper and repository tests listed in the status report. No commit/push/deploy.

### 2026-11-09 00:26 IST - A01 final verification checkpoint
- Latest full suite PASS: 595 files / 3,172 tests. Fresh isolated PostgreSQL A01 suite: 12/12, complete migrations applied from a new database. Focused A01 set: 7 files / 41 tests. Typecheck (6 GiB), lint, db metadata check, production build (205 pages), and diff check PASS. Lint warnings are existing Next `<img>`, workspace root and deprecation warnings.
- Route tests now prove unauthenticated rejection, role validation, foreign thread denial, and call wiring to atomic first-message persistence. Transport tests prove fetch response gating and original abort-signal passthrough. Neither proves provider-stream or browser E2E.
- A01 remains PARTIAL pending authenticated POST + mocked/real stream lifecycle, cancellation/retry persistence through route callbacks, and browser history/retry verification. No live provider credentials were used. No commit/push/deploy. Preserve B20 MISSING/disabled and C38 PARTIAL statuses.

## A01 run-claim collision fix and callback verification — 2026-11-09 00:44 IST

- Independent concurrency review found and fixed a repository conflict predicate gap: claimMessageRun now requires an existing row to match both the requested thread and role=user before retryable upsert. This prevents a retryable assistant row from being overwritten by a client-submitted user turn using the same message ID.
- Added real PostgreSQL regression coverage asserting the claim is rejected and assistant role/content/metadata remain unchanged. The unit SQL assertion now verifies the role predicate as well.
- Added mocked route callback coverage for successful terminal finalization, sanitized retryable provider failure state, and aborted partial-response persistence. These invoke route callbacks directly; they do not verify AI SDK callback scheduling, provider stream bytes, real provider calls, or browser E2E.
- Isolated PostgreSQL lifecycle suite: PASS, 13/13. Focused A01 suite: PASS, 7 files / 45 tests. Full suite: PASS, 595 files / 3,176 tests using only the local A01 test database URL override.
- NODE_OPTIONS=--max-old-space-size=6144 pnpm check-types: PASS (also included in the successful production build after test updates). pnpm lint: PASS with existing Next deprecation/workspace-root and img warnings. pnpm db:check: PASS (metadata only). 6 GiB pnpm build: PASS, exit 0, generated 205/205 pages; existing dependency-analysis and dynamic-session warnings remain. git diff --check is to be rerun after this documentation append.
- A01 remains PARTIAL. Real provider streaming, SDK callback execution order, actual timeout/cancellation over HTTP, and browser send/retry/history remain unverified. The route has a Next maxDuration=300 setting, but this is not proof that timeout state is persisted on every deployment runtime.
- No commit, push, deployment, production database access, or reference-repository edit. Original untracked user-owned files remain untouched.

---

## A01 handoff � 2026-11-09 01:24 IST

- Current A01 status: **PARTIAL**. Verified layers: repository lifecycle on isolated PostgreSQL 17.11/pgvector (13 tests); route guard/callback tests; controlled real-AI-SDK V2 stream/SSE test (2 cases); transport tests. Full suite is 597 files / 3,186 tests passing.
- Production checks pass: 6 GiB typecheck, lint with existing warnings, Drizzle metadata check, production build (205/205 pages), and current pre-doc `git diff --check`.
- Key new protections: claim role guard prevents assistant-row overwrite; `runAttemptId` CAS protects retries; request deadline at 285s with 15s persistence grace; timeout state is retryable; explicit cancellation wins simultaneous timeout; stream finish waits for pending error-state persistence.
- Exact next A01 task: create a safe isolated Playwright config/fixture that bypasses existing destructive global seed/teardown, provisions only the isolated local PostgreSQL test DB, and exercises authenticated chat send/retry/history. If running the existing Playwright auth setup, explicitly set every DB URL to the isolated test database and review its cleanup targets first. Then consider a route-to-real-PostgreSQL test with a controlled local provider/model.
- Keep A01 PARTIAL until browser workflow and DB-backed authenticated route evidence pass. Do not mark a real provider as verified. Do not use production `.env`/credentials; do not commit/push/deploy.
- Preserve untracked `void-agentai-app-spec.md` and `void-agentai-rebuild-spec.md`. B20 remains MISSING and browser execution disabled; C38 remains PARTIAL.

## A01 handoff update — 2026-11-09 02:30 IST

A01 remains PARTIAL. Latest source and verification details are recorded in `docs/MIGRATION-STATUS-REPORT.md`, `docs/feature-work-register.md`, and `docs/testing-report.md`.

Completed this batch: controlled-model `POST /api/chat` integration backed by isolated PostgreSQL; ownership, retries, replay rejection, request cancellation, timeout/callback tests; browser UI retry and PG-backed reload/hydration; atomic finalization recovery with one exact DB retry and a non-retryable terminal fallback. SQL now blocks reclaims when the persisted failure explicitly has `retryable:false`, preventing tool side-effect replay. Fixed a flaky onboarding test timing assertion.

Final checks: A01 focus 11 files / 66 tests, PG claim/lifecycle 2 files / 17 tests, Playwright 3 tests, full suite 599 files / 3,197 tests, typecheck, lint, Drizzle metadata check, build (205/205 pages), and diff check passed. PostgreSQL was isolated on loopback port 55432. No commit, push, deployment, or production DB access.

Next exact task: create a safe authenticated browser test whose chat POST reaches the actual route with a controlled local provider, then verify that exact conversation reloads from PostgreSQL. Keep B20 disabled/MISSING and C38 PARTIAL.

## Repository roles corrected 2026-11-09
Void AgentVoid AgentVoid Agent
Canonical upstream is `keinsaasforever/better-chatbot` `main`; customized destination is `ibrahimkhan008/Void-Agent`. Earlier `Void-Agent-V2` references above describe a historical local checkout or prior audit evidence, not the canonical upstream identity. For current ports, compare live upstream `main` with the destination and preserve Void-Agent customizations. The current user instruction keeps changes local: no commit, push, or deployment.
## Canonical upstream port checkpoint — 2026-11-09 03:05:55 +05:30Void Agent
- Source: keinsaasforever/better-chatbot main at 6f4183566bc48616303cb84055f11f79578c82fe; destination: ibrahimkhan008/Void-Agent main at 589fa48f3c323d049e51d566f3b8ddff95d59bc5. No common Git ancestor; exact fork commit unknown. The configured Git remote named better-chatbot is canonical; the remote named upstream points to an unrelated repository.
- Already present: upstream mention-chip behavior from 989dc36 is implemented in destination user-message-text.tsx and message-mentions.ts.
- Ported: upstream 945d3da lifetime team-member allowance. Destination retains its DB/API column name monthlyCapMicros for compatibility but sums all monthly ledger periods inside the member-locked reservation transaction; expired current-period reservations update the ledger before the sum. Admin and error copy now describe the lifetime cap. Focused tests: 3 files, 14 tests passed. Typecheck passed. No real PostgreSQL or live provider verification for this port yet.
- Pending: Project-brain no-Inngest dispatch gap from upstream 93fdb8e is under implementation. The entire 2.0 workspace has not been synchronized; compare concrete capabilities against current upstream before claiming parity.
- No commit, push, deployment or upstream source edit.


### Budget safety correction — 2026-11-09 03:07:35 +05:30
Independent review found that TTL-only reservation expiry could release allowance while a request is still running. The final port keeps reserved spend charged across all monthly periods until explicit finalize/release; it does not auto-expire holds by elapsed time. A late settlement of a previously expired legacy row can still record actual usage. This supersedes the earlier checkpoint's description of expiring current-period reservations. Stale holds require a future reconciler with proof of termination, not a time-only release. Focused tests and typecheck must be rerun after this correction.


Next exact task: wire manual project-brain analysis and connector sync enqueue to the targeted after-commit dispatcher once route files are writable; then test all enqueue paths with isolated PostgreSQL. No commit/push/deploy has occurred.
Validation follow-up: full suite, isolated budget PostgreSQL integration, lint, db:check, build and diff-check passed. Budget hold expiry is disabled pending a reconciler that can prove execution termination. Project-brain auto-dispatch still lacks the manual and connector enqueue callers.
Upstream dispatch scope update (2026-11-09 06:01:14 +05:30): MCP and Composio connector sync routes now also schedule newly inserted project-brain runs after their transactions commit. Focused connector suites passed 16/16. Document, chat, and both connector dispatch are covered; manual project-brain analysis remains dependent on the scheduler. Current production build after these route changes completed successfully; current git diff --check exit 0.
Next upstream task: inspect current Better Chatbot main for the next concrete missing behavior and port it to the destination; manual project-brain dispatch remains the next gap from commit 93fdb8e.
Upstream sync final-state update (2026-11-09 06:11:05 +05:30): The B06 queue dispatch port now covers all fivVoid AgentrainRun insertion paths: document ingest, project chat refresh, manual analysis/retry, MCP connector sync, and Composio connector sync. Each only schedules after durable insert/commit, with the existing database claim retained. Manual analysis is no longer pending; B06 remains PARTIAL for unverified real provider/PostgreSQL/browser lifecycle. Upstream TensorX models are now wired as direct optional provider routes. New provider feature A34 makes the register 100 workflows. Current provider/auth resolution rejects missing or masked server keys and the catalog filters absent credentials. Focused combined tests pass 50/50; TensorX-focused suite 17/17, manual route 8/8, connector suites 16/16, project brain queue suite 23/23. Current 6 GiB typecheck and production build passed; full suite result 3183 passed/21 skipped was run before the final small TensorX/manual route additions. No live TensorX verification.
Next: compare current upstream for another concrete missing behavior and port only its gap into the existing Void-Agent architecture. Full upstream 2.0 capability synchronization is still incomplete.
Superseding sync update (2026-11-09 06:13:05 +05:30): Project-brain dispatch now also covers manual analysis and stale retry; together with document ingestion, chat refresh, MCP sync, and Composio sync, every current ProjectBrainRun insert path schedules after commit. Focused tests show targeted dispatch and no duplicate dispatch for active runs. B06 remains PARTIAL only for real provider/PostgreSQL/browser lifecycle verification. TensorX direct provider/model port from upstream 2.0 is tracked as A34; 100 individually listed workflows. Focused relevant tests 50/50; isolated budget PostgreSQL tests 4/4; final 6 GiB typecheck, production build, scoped Biome, and git diff --check passed. Full suite last run before manual/TensorX edits: 597 files/3183 tests passed, 3 files/21 tests skipped. No live TensorX credentials/provider verification. No commit/push/deploy.
Next upstream comparison: review 2.0 behavior beyond these recent commits and choose the next concrete missing capability. The source and destination histories are unrelated, so no exact fork commit or merge-based synchronization exists.
Void Agent
> Current repository identities, pinned source snapshots, desktop provenance, and staging status are maintained in [current-source-roles.md](current-source-roles.md). Historical Void-Agent-V2 references in this file are retained as prior audit evidence and do not identify the current canonical sources.

## 2026-11-11 00:00 IST — continuation checkpoint
Void Agent
Current source of truth: Better Chatbot exact SHA `6f4183566bc48616303cb84055f11f79578c82fe`; custom preservation source `Ayushprtp/zip-main` fetched at `aa9fce0f545afb18b9a191724be092887f83630b`; destination `ibrahimkhan008/Void-Agent` remains `main`/`589fa48f3c323d049e51d566f3b8ddff95d59bc5`. Staging remains separate and all 1,768 upstream tracked paths are present. Do not use a normal merge assumption; repository histories are unrelated.

### Done in staging and focused evidence
- Dodo test typings: 3 repository tests pass.
- Saved Notes + Collections selected tests: 27 pass; eCanvas: 26 pass.
- Community: 13 focused tests; fresh 6 GiB typecheck, db metadata check and scoped Biome passed.
- Archive: 11 route tests; 6 GiB typecheck, db metadata check and scoped Biome passed.
- Desktop: 124 tests; desktop typecheck, production build and scoped Biome passed.
- A01 runtime mechanisms exist in staged `apps/web/src`; selected run-claim, recovery, persisted-tail, guard and history tests pass 44 tests.
- Connector OAuth/provider/approval selected suite passes 44 tests, 6 GiB typecheck and lint; only Gmail send/reply, Drive create, and Teams send write paths currently have end-to-end mocked approval coverage.

### Pending / limitations
- Connectors: map all original `zip-main` tool operations, complete remaining write approval paths and tests; live Google/Microsoft/other provider tests are unavailable.
- A01: port/verify remaining route and UI tests. Current machine has no PostgreSQL binaries/service/listener, and Docker is disallowed. Do not claim real PostgreSQL integration in this session.
- Per-thread Insights: in progress; must include reachable UI integration.
- AI app builder, bug-bounty workflows, and chat-request challenge security control: still require implementation or explicit evidence-backed disposition.
- Run full current combined suite/typecheck/lint/db:check/build/security tests and desktop checks after code settles. Full content-level upstream delta inventory remains pending.
- B20 stays MISSING and browser execution disabled. C38 stays PARTIAL pending live Composio/PostgreSQL/browser verification.
- No promotion, commit, push, deploy, production DB, or production migration.
Void Agent
Before promotion: backup the primary; use a non-destructive overlay; exclude staging `.env`, `.env.local`, node_modules/build outputs, uppercase staging `AGENTS.md` (case-collides with primary `agents.md`), `apps/void-agent-desktop` (temporary duplicate), and staging copies of primary-owned `context.md`/specs. Preserve the primary's existing environment files, docs, user specs, and dirty source/test changes. Then validate the actual destination separately.

## 2026-11-11 00:12 IST — completed batches and remaining work

### Newly closed since prior checkpoint
- A01 staged transport fix: primary success-gated draft navigation behavior is now present in `apps/web`; route lifecycle and controlled AI SDK stream tests cover auth, role/ownership, atomic new-thread wiring, duplicate claim conflict, stream success/failure, timeout, cancellation and finalization retry. 3 files / 15 tests plus 4 persistence/recovery files / 16 tests; 6 GiB typecheck and scoped Biome passed. No live PostgreSQL/provider/browser E2E.
- Thread Insights: owner-scoped bounded transcript, strict output schema, timeout/rate limit, repeatable-read snapshot and hash/count/latest-ID recheck on persistence, thread-page toolbar trigger, stale label/refresh. 4 files / 11 tests, 6 GiB typecheck, db:check, scoped Biome passed. No live DB/provider/browser E2E.
- Community and Archive remain closed as detailed in the previous checkpoint (13 and 11 focused tests respectively).

### Still in progress / not ready to promote
- Direct connectors: source has 45 tool files. Latest 44-test selected suite covers Gmail send/reply, Drive create and Teams send with approval plus read paths. Nine additional provider write actions (Asana, ClickUp, Discord, Freshdesk, Jira, Linear, Productboard, Zendesk, Zulip) and any provider contracts not verified remain in progress. No live provider/PostgreSQL.
- AI app builder, Bug Bounty, and chat request challenge controls remain open.
- Full current combined suite, production web build, complete desktop revalidation, and content-level upstream delta report remain pending.
- Current Windows host has no PostgreSQL service/binaries/listener; Docker is prohibited. Do not claim PostgreSQL integration or migration application.
- Preserve staging `.env`, temporary duplicate desktop, root secrets/specs/context, and all primary dirty files. No promotion, commit, push or deployment.

Next: complete connector write action mapping/tests, finish A01 coverage, complete outstanding original features or document concrete exclusions, then run aggregate staging validation and plan the non-destructive primary promotion.

## 2026-11-11 00:17 IST — new source security and connector checkpoint

- Added verified mocked approval coverage for Asana task creation, ClickUp task creation and Linear issue creation; latest connector focus 6 files / 39 tests. Together with earlier tested Gmail/Drive/Teams writes, 6 direct connector write paths have mock evidence. Jira/Zendesk edits are not yet tested. Productboard, Freshdesk (two mutations), Discord and Zulip remain unsupported or blocked. Read-only coverage spans Gmail, Drive, Calendar, GitHub, Outlook, Slack, Notion, Teams. No live provider/Postgres verification.
- C45 source guard is absent in staging. It protects chat sends using a user/session-bound short-lived one-use signed challenge, request hash/MAC, ECDSA client proof, PoW, origin/expiry/replay/rate checks, optional adaptive Turnstile. A port is assigned; verify cache distribution and route wiring before marking secure.
- AI app builder implementation is assigned; distinct from E2B code execution. Constrain to allowlisted templates, safe relative files, fixed commands, durable owner-scoped jobs, and cleanup; `0080`/idx81 reserved. Bug bounty remains queued.
- Previously completed: community 13, archive 11, insights 11, A01 15+16 focused tests, eCanvas 26, desktop 124, Dodo 3, selected Notes/Collections 27. Their live DB/provider/storage/browser boundaries remain as previously recorded.
- Aggregate validation and primary promotion remain pending. No commits/push/deploy or production database operations.

## 2026-11-11 00:20 IST — connector follow-up

Latest connector focused suite: 7 files / 44 tests PASS. Mock exact-approval writes cover Gmail send/reply, Drive create, Teams send, Asana task, ClickUp task, Linear issue, Jira comment, and Zendesk comment. Remaining: Productboard create_feature; Freshdesk create_ticket/add_reply; Discord send_message; Zulip send_message. Jira fixed-origin PKCE and cloudId validation; Zendesk server-config-only tenant host and encrypted owner token. No live provider/DB proof. Shared 6 GiB typecheck currently has one C45 integration error (`ChatRequestSecuritySchema` missing from app-types/chat); rerun after that owner finishes. App builder 0080 and C45 remain in progress; Bug Bounty waits. No promotion/commit/push/deploy.

### Typecheck snapshot correction — 2026-11-11 00:22 IST
Connector agent reports the missing C45 `ChatRequestSecuritySchema` export is now present and a 6 GiB web typecheck passed on that intermediate staging snapshot. C45 route/client edits continued after that run and are not covered by it; a fresh typecheck is pending after those edits. Connector-focused status remains 7 files / 44 tests PASS. Do not call the current combined tree typechecked until the final post-edit run completes.

## 2026-11-11 00:28 IST — app builder initial persistence checkpoint

Staging now contains `AppBuildTable`, additive migration `0080_void_agent_app_builder.sql` (journal idx81), repository and initial generation/runner modules. `pnpm --filter web db:check` passes (metadata only). API/UI/lifecycle tests and sandbox cleanup verification are still pending. A review requested database enforcement that each build's `thread_id` belongs to its `user_id`, safe sandbox ID uniqueness, and bounded error/preview fields. C43 remains PARTIAL/in progress.

No real PostgreSQL, E2B provider, browser E2E, aggregate build, or primary promotion has occurred.

## 2026-11-11 00:32 IST — connector + app builder checkpoint

Freshdesk now supports owner-bound encrypted API-key onboarding with server-validated subdomain and approval-gated `create_ticket`/`add_reply`; connector suite 9 files / 51 tests passes. Mocked exact-approval writes cover 11 actions across Gmail, Drive, Teams, Asana, ClickUp, Linear, Jira, Zendesk and Freshdesk. Productboard is being adapted to v2 by selecting a component parent and validating workspace config; Discord (Bot token) and Zulip (realm/token) remain open.

C45 guard route/schema/client integration is in progress; current typecheck passed those changes but found `afterAll` missing in app-builder route tests. App builder has schema 0080, repository/runner and route work, but is not complete. No live PostgreSQL/provider/browser verification; no staging overlay/commit/push/deploy.

## 2026-11-11 00:37 IST — app-builder vertical slice

C43 has progressed from missing to partial implementation in staging: migration 0080/idx81 and schema; owner-scoped app-build repository and APIs; bounded generator/E2B runner; create/detail pages and query/UI; cancel/cleanup; 2 files / 11 tests pass. The model-facing `buildAppTool` is not yet registered in the shared chat route. Resume behavior, some cancellation/delete tests, fresh typecheck/db:check/Biome and full validation remain. No live PostgreSQL/E2B/browser verification.

Schema enforces composite build-owner/thread relation, one active build per owner and unique non-null sandbox IDs. C45 owns the shared chat route currently; coordinate before registering the tool. No promotion or publication.


## Current agent takeover — 2026-11-11 01:05 IST

Canonical status/scoring/evidence: docs/MIGRATION-STATUS-REPORT.md. Current estimates: 58% implementation, 31% verified functionality, 44% weighted overall (reasonable range 38–50%). The earlier 60% overall claim is superseded as overstated.
Void AgentVoid AgentVoid Agent
Roles/refs: original custom source Ayushprtp/zip-main@aa9fce0f545afb18b9a191724be092887f83630b; upstream keinsaasforever/better-chatbot@6f4183566bc48616303cb84055f11f79578c82fe; destination ibrahimkhan008/Void-Agent@589fa48f3c323d049e51d566f3b8ddff95d59bc5. Staging: C:/Users/Ikra/Desktop/Void-Agent-integration-staging, no Git metadata, not promoted. Preserve the 61 modified/untracked destination entries. Staging contains a .env whose contents must not be read/copied, and a temporary apps/void-agent-desktop duplicate. There are 1,609 exact upstream file contents, 159 differences, and zero missing paths. The original source path comparison is incomplete. Bug Bounty is missing, original App Builder agent/VibeSDK modes are omitted, B20 remains blocked.

Next actions, in order:
1. Inspect/validate the 21 App Builder files changed in staging during the prior read-only audit. Agent-reported checks: 5 files/25 tests, 6 GiB typecheck, db:check, scoped Biome; auditor did not rerun. Check owner/thread constraints, races, teardown, preview security, navigation and original source modes.
2. Explain all 159 upstream content differences.
3. Complete semantic zip-main comparison; port missing custom security/admin/provider/payment/API workflows.
4. Implement Bug Bounty and restore/equivalently replace original App Builder agent/VibeSDK modes.
5. Resolve Productboard and Zulip; securely disposition Discord Bot-token support.
6. Keep B20 disabled until browser and VM egress isolation is adversarially verified.
7. Run combined web/desktop tests, typecheck, lint, db:check, builds and security checks. No PostgreSQL service/process/listener was available; do not claim DB integration.
8. Prepare a backup and non-destructive promotion; preserve destination changes, exclude staging .env, resolve duplicate desktop and AGENTS.md/agents.md collision.
9. Promote only after validation; validate the actual destination.

Do not commit, push, deploy or apply production migrations. Prior focused tests are agent-reported evidence, not a full current validation.

---

## Controller session progress — 2026-11-11 05:15 IST

Continued from the 01:05 takeover. All work in staging; destination preserved (backup created and verified, see below). No commit/push/deploy/production migration.

**Completed this session (evidence rerun by controller, not agent-claimed):**
1. C45 chat-request security completed: pkh client-key binding fail-open fixed; destination AES envelope layer ported and wired (main + temporary routes, both clients); 12 files / 70 tests incl. adversarial + envelope suites; fail-closed cache/origin/rate-limit semantics; production requirements documented.
2. C44 Bug Bounty ported (19 original files, original persistence + visibility model; migration 0081 after structural inspection; 6 files / 56 tests).
3. C43 App Builder completed (static + agent modes, clarify, resume lifecycle fix, cancel/teardown; vibesdk = documented 503; tool registered; 8 files / 67 tests).
4. C42 Productboard + Zulip implemented with exact-payload approvals and host pinning; Discord excluded with justification; 25 files / 112 tests.
5. Upstream 159 diffs fully classified and repaired (2 missing-upstream restored incl. Azure branch; 5 accidental fixed incl. ~3.9k locale mojibake values; docs/upstream-diff-classification.md). Promotion gate satisfied on the upstream side.
6. zip-main parity triage to full disposition (483 paths; docs/zip-main-parity-map.md + 3 triage docs); ~25 files ported including the admin console core, legal routes, webhook outbox driver, /api/user/memory, memory tools. All remaining gaps have written justifications/follow-ups.
7. WP0-WP6 typechecks exited 0 at each batch boundary (6 GiB heap).
Void Agent
**Backup (correction #5):** `C:\Users\Ikra\Desktop\void-agent-backup-20261111\` contains working-tree.tar.gz (3,624 entries; excludes node_modules/.next/.git/.audit/.tmp-*; includes .env, .env.local, context.md, void-agentai specs), git-tracked-diff.patch, git-head.txt (8b7b128...), git-status-porcelain.txt, git-diff-stat.txt. Restorability VERIFIED: extracted to a temp dir; all 58 dirty/untracked entries present; every modified tracked file byte-identical; .env/.env.local identical.

**Next steps, in order:**Void AgentVoid AgentVoid Agent
1. Resolve the desktop duplicate intentionally: verify which of `apps/desktop` vs `apps/void-agent-desktop` holds the merged security port (current root scripts point `void:desktop:*` at `@void-agent/desktop` = the void-agent-desktop copy; the 23:36 log says the merge went into upstream `apps/desktop`). Keep one canonical desktop under `apps/desktop`, exclude the other from promotion, repoint the root scripts.
2. Finish WP7: full web suite (rerunning after two compile fixes: admin/toVoid Agent obfuscation test literal), fresh typecheck, lint, db:check, build, desktop tests/build — record in docs/testing-report.md.Void Agent
3. Promotion per the approved plan: verify origin remote (`ibrahimkhan008/Void-Agent`), overlay staging onto destination excluding staging `.env`/`.env.local`, node_modules, build outputs, uppercase `AGENTS.md`, `apps/void-agent-desktop`, staging copies of `context.md`/void-agentai specs; old destination `src/` tree retained (in backup + in place) until the promoted destination passes validation; then validate the destination (tests/typecheck/build).
4. Update MIGRATION-STATUS-REPORT.md / feature-work-register.md counts with post-promotion evidence; keep every EXCLUDED-FOR-NOW item visible — documented omission is not preservation.

---

## Final handoff — 2026-11-11 06:20 IST (promotion complete)

The migration handoff items 1–9 from the 01:05 takeover are complete. Read `docs/MIGRATION-STATUS-REPORT.md` §16 and `docs/testing-report.md` (controller session section) first; per-file dispositions live in `docs/upstream-diff-classification.md`, `docs/zip-main-parity-map.md`, `docs/zip-main-triage-{ai,ui,api}.md`.
Void AgentVoid Agent
State: destination `C:\Users\Ikra\Desktop\Void-Agent` is the promoted single monorepo, validated green (web 498 files/3,361 tests, desktop 132 tests, typecheck/lint/db:check/build PASS). Backup: `C:\Users\Ikra\Desktop\void-agent-backup-20261111\` (verified restorable; contains the pre-promotion working tree incl. the original desktop source, env files, tracked-diff patch). Git HEAD `8b7b128`, nothing committed/pushed/deployed/migrated.

Next agent should start from MIGRATION-STATUS-REPORT §16 "Remaining work". Do not re-audit completed work. Keep: no commit/push/deploy, no production migrations, B20 disabled, staging `.env` never read (staging remains as a historical snapshot; the destination is now canonical).
