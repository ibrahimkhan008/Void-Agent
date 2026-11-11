# Integration roadmap

- P0: Complete semantic review of source-surface candidates; secure auth destination
  continuity; bounded message retrieval with older-history UI/export compatibility;
  audit tool approval ownership and cancellation. No live schema mutation.
- P1: Per-project scoping mapped to collections/archives/teams; durable source
  ingestion using existing memory/scheduler; resumable stream transport; render
  performance; provider/catalog gap review without replacing current models.
- P2: Evidence-backed facts/contradictions, tabular reviews, Slack subscriptions,
  voice transcript persistence, web push and workflow dashboard gaps.
- P3: Optional desktop bridge, hardware devices, cockpit and opt-in telemetry.

Dependencies: ownership/scoping -> source ingest -> brain runs -> facts/graph;
stream persistence -> cross-instance stop; VAPID -> push delivery; scoped device
credentials -> pairing. Do not import automatic upstream repository replacement.

Next checkpoint: finish route/tool-level equivalence annotations; implement the
reviewed auth slice; then design bounded message pagination without losing history.

## Checkpoint update � 2026-11-05

Bounded message retrieval and the load-older UI are implemented. The behavior remains PARTIAL until verified against the supported Postgres runtime, including cursor boundaries for tied timestamps. Next: verify this workflow and then audit agent tool approval ownership and cancellation.

## Checkpoint update - tool approval batch

Implemented three no-execute HITL workflows (plan, user input, email draft). Remaining in this feature family: reference create-agent approval/persistence, full browser journey verification, and server-side review of approval-to-effect correlation. Next major family after this safety review is project-brain/knowledge, preserving Void-Agent's existing memory and RAG.

## Checkpoint update - thread knowledge scope

Per-thread collection scoping is now wired over existing collections/RAG. Next dependencies remain: verify migration and owner-scoped workflows against a local test Postgres (not production), then implement project-level CRUD/context and knowledge ingest orchestration before graph/facts/contradictions. F009 remains PARTIAL; this selector is not project-brain parity.
Project-workspace checkpoint: personal/team CRUD and chat association now extend existing collections/RAG. Continue with project source ingestion/review, brain jobs, graph/facts/contradictions, then validate with local test Postgres. Do not count this family complete; migration 0035 is still unapplied.

## Desktop MCP migration priority update
F021 is promoted from optional P3 to next-batch P1 by user direction. First implement the isolated desktop companion and safe MCP test workflow only; do not imply that cloud AI chats execute local stdio tools. Required secure boundaries: trusted app-origin/main-frame verification on IPC, strict command/config validation and user consent, default-deny tool policy, bounded/redacted outputs and audit events, safe browser OAuth handoff. After the local testing journey is verified, evaluate whether an explicit approval protocol can support chat/agent invocation.

## Desktop follow-up (2026-11-05)
F021's local MCP test workflow now exists as a separate Electron companion and remains PARTIAL. Next: run the production build; perform a manual local development OAuth + native consent journey when provider credentials and a trusted test MCP server are available; inventory any remaining desktop reference surfaces individually. Keep cloud chat/agent tool use out of scope until an explicit, authenticated approval-return protocol is implemented and tested. Package signing and update delivery are separate release work.

## Current project brain continuation (2026-11-05)
`searchProjectKnowledgeGraph` is available in project chat for accepted, source-backed claims; existing RAG continues to cover unstructured content. This is one integrated slice, not completion of the brain family. Next: durable ingestion/run orchestration and end-to-end source lifecycle, then evaluate the reference entity/alias traversal and node-detail APIs against the current fact graph. Continue tool-effect approval coverage for mutating connectors in a separate batch.

## F028 audit decision
Do not implement the reference Slack Navigator candidate from its schema alone: the inspected reference has table definitions and a settings page, but no API handlers or event/task execution path. Keep the missing inbound automation status visible and revisit after a functional reference path exists. Next implementation family: F026 voice dictation/transcription, extending the current OpenAI/KonvO voice experience with the reference's authenticated ephemeral AssemblyAI streaming-token flow.

## F026 voice continuation
AssemblyAI ephemeral-token dictation is integrated into the chat composer, with server-side account-key isolation and no automatic message sending. F026 remains PARTIAL pending live provider/browser verification and remaining reference voice workflows (long capture, device gateway, and broader session/tool behavior). Do not use the new transcript path to trigger external side effects without the independent approval system.

## Current continuation (2026-11-05)
Project-brain manual source analysis now runs through a durable queue consumed by the existing authenticated cron worker. The worker uses PostgreSQL row locking, stale-run recovery, current authorization/source checks, and a bounded model call. F010/F011 remain PARTIAL pending automatic ingestion triggers, resumable multi-step runs, project-level consolidation, and richer graph behavior. Next major migration batch: trace and extend server-enforced approvals for mutating connector/MCP/workflow tools, preserving each tool's exact payload and provider semantics.

## Tool effect approval continuation (2026-11-05)
Google Calendar event creation, updates, and deletion now use a server-issued single-use exact-payload approval; Google update/delete carry ETag protection and delete checks current event details. F025 advances but remains PARTIAL because other mutating connector, MCP, and workflow effects are not yet covered or live-verified. Next: inventory action-level mutability for connector tools and implement another dependency-coherent provider family with exact payload approvals; then review shared MCP/workflow effect boundaries.

## F010/F011 automatic project-brain ingestion follow-up (2026-11-05)
Attached project brains now receive idempotent queue entries after a successful collection source ingest, with project/owner/source revalidation and a per-user hourly enqueue cap. The collection ingest still succeeds if optional brain enqueueing fails. F010/F011 remain PARTIAL pending live DB/browser verification and the remaining staged graph/consolidation pipeline.

## F025 connector approval continuation (2026-11-06)
Linear issue creation was added to the server-enforced user-review path: editable review card, authenticated same-origin throttled token issuance, one-time exact-payload token consumption, and a fail-closed connector write. The Linear issue state query was also made variable-bound. The broader mutating connector/MCP/workflow inventory remains incomplete and must continue action-by-action; F025 is still PARTIAL.

## F025 communication connector approval continuation (2026-11-06)
Slack channel posting is now available behind explicit per-message user review and a server-enforced single-use exact-payload approval. Its existing OAuth scope includes `chat:write`. Read/list actions remain available without approval. Other communication and connector write paths remain to be audited and gated; do not mark this family complete.

## F010/F011 structured entity and relation extraction (2026-11-06)
The project-brain queue now extracts typed entities, aliases, attributes and explicit relations, then maps them into Void-Agent's existing evidence-backed reviewable triples for graph display. Malformed/dangling graph output is filtered; source quotes are verified against the source text before persistence. The existing review model remains the source of truth. F010/F011 remain PARTIAL because typed pages/aliases, source version history, consolidated status/todos, and full graph retrieval are not yet implemented.

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

## F025 Zendesk approval extension (2026-11-06)
Zendesk `add_comment` now follows the explicit review path: editable ticket/comment card, authenticated same-origin throttled issuance, short-lived digest-only token, and one-use exact-payload consumption before ticket PUT. Read methods are unchanged. Focused tests and root typecheck passed; full suite/build remain pending. F025 remains PARTIAL because connector, MCP and workflow effects remain to audit and gate.
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
## F025 Productboard mutation follow-up (2026-11-06)
Productboard `create_feature` was identified in the connector side-effect audit and added to the exact-payload review path. Next, continue action-by-action auditing for mutations outside connector `*-tool.ts` files, especially MCP tool execution and workflow nodes; confirm all remaining provider write methods are explicitly gated or document concrete exclusions. Keep F025 PARTIAL until the full inventory and server-enforced gates are verified.
## F010/F013 graph path query follow-up (2026-11-06)
The graph panel supports shortest accepted-claim relationship paths with API-side source visibility filtering and bounded traversal. Next project-brain work should cover typed page/alias lifecycle and source-history semantics, expert routing, and consolidation; prioritize typed page/lifecycle next because it establishes stable identity and merge behavior. Keep these capabilities partial until DB/browser workflows are verified.
## F010 typed page and merge continuation (2026-11-06)
Reference audit confirms page merging is coupled across facts, graph links, aliases, events, contradictions, versions and embeddings. Void-Agent's flat reviewed triples cannot safely accept the reference merge directly. Next: design an additive canonical page/alias layer and transactional, tested loser-to-survivor redirect; then connect extraction and retrieval. Do not enable model-driven dedupe before those boundaries and rollback behavior are proven.
## F010/F013 next step update (2026-11-06)
- Completed this slice: accepted-fact expert routing with person/topic alias resolution, bounded matching/ranking, source evidence links, authenticated project visibility, and no-store responses.
- Verification: 14 focused graph/helper/API tests; full suite 1,173 tests/169 files; root TypeScript check, targeted Biome and production build pass.
- Remaining high-priority project-brain work: additive canonical typed entity/page and alias identity; transactional merge/redirect and rollback tests; source-version/history integration; consolidation only after those invariants. Expert routing stays PARTIAL until database-backed and browser journeys are verified.

## F025 workflow side-effect audit follow-up (2026-11-06)
- Implemented exact-payload approval for app-default Windmill/Activepieces automation runs. Focused tests 9/9, full suite 1,182/1,182 across 173 files; root typecheck, targeted Biome and production build pass (192/192 pages).
- Next: map every saved workflow entry point (chat mention and editor/manual run), MCP node execution, and direct chat MCP call; enforce owner/server access and approval at the correct boundary without breaking deliberate read-only tools. Keep F025 PARTIAL until this effect inventory is complete.

## F021/F025 direct MCP approval checkpoint (2026-11-06)
- Completed direct chat MCP execution gate and manual-confirmation routing through that gate. Focused tests 9/9; full suite 1,191/1,191 across 177 files; root TypeScript check, targeted Biome and production build passed (192/192 pages).
- Remaining effect surfaces: saved chat workflow runs containing MCP nodes, voice MCP tool calls, standalone MCP test UI, plus live authorization/replay verification against an actual MCP server. Continue with saved workflow execution because it can compose multiple external effects.

## F025 follow-up (2026-11-06)
- Added the saved chat workflow input/access gate with focused tests and production build verification.
- Next: expose a bounded, readable effect manifest in the approval UI and bind the approval to a stable graph-definition fingerprint; then audit voice MCP and standalone MCP test execution before closing the MCP/workflow write-surface inventory.
- F025 remains PARTIAL; do not infer full workflow/MCP effect parity from this slice.

## F021/F025 voice and manual MCP follow-up (2026-11-06)
- Gated model-proposed remote MCP calls from all three voice providers and the standalone MCP remote test interface.
- Remaining: verify real provider callback identity mappings and approval UI in a browser; exercise one-use token replay/race against PostgreSQL; provide saved-workflow effect summaries and bind them to graph revisions; continue the remaining 206-surface parity audit.

## Workflow approval / outbound HTTP update (2026-11-06 04:56 IST)
- [x] Show a sanitized saved-workflow action manifest before approval.
- [x] Bind approval to deterministic graph revision and reject edits between review and execution.
- [x] Apply HTTPS/public address validation and redirect rejection to workflow HTTP nodes; extend IPv6 representation coverage.
- [ ] Verify in a browser against disposable PostgreSQL, including graph edit/replay cases.
- [ ] Audit and gate workflow editor and any other direct execution surfaces; current gate is the chat-exposed saved workflow path.
- [ ] Consider DNS pinning at the HTTP transport boundary to close the resolver/fetch lookup race.

## n8n run execution audit update (2026-11-06)
- [x] Add same-origin, authentication, bounded ID, and per-user rate limit to the n8n execute API.
- [x] Verify workflow access via the requesting user's n8n client before run dispatch.
- [ ] Validate live n8n account ownership/sharing behavior and run result semantics.
- [ ] Document the external workflow's internal effects as opaque; retain F025 partial status until a compatible approval/inspection mechanism exists.

## Embedded workflow MCP authorization update (2026-11-06)
- [x] Recheck access to each MCP server referenced by saved workflow graph at preview, issuance and execution.
- [x] Reject disabled or renamed MCP servers before tool dispatch.
- [ ] Browser/PostgreSQL replay and actual owned/public/private MCP integration tests remain outstanding.
- [ ] Keep workflow tool arguments generated at runtime visible as a documented approval limitation; determine whether review/approval can pause at each MCP node.
## Continuation update (2026-11-06)

The initial roadmap above is historical; its “next checkpoint” is superseded by verified work in `integration-progress.md`. The current project-brain gap is canonical typed page/alias lifecycle: define an additive model over reviewed facts, preserve source visibility/review status, and prove transactional merge/rollback invariants before any dedupe automation. Continue voice/device, desktop MCP, multimodal, provider, and collaboration surfaces in coherent end-to-end batches. The 206-surface census is not proof of parity.
### Project brain identity safety

Accepted alias routing now refuses collisions; next implement canonical typed pages and alias/merge history as an additive feature system. Preserve the current fact review model and source authorization checks.
### F010 continuation after typed-page foundation

The additive `0042_project_brain_typed_pages` migration and accepted-page read path are implemented but local/unapplied. Next build the human-reviewed same-type page merge/history transaction, covering alias and fact relinking, archived loser resolution, authorization/source visibility, idempotence, and rollback behavior before adding model-driven candidates. F010/F011/F012/F013 remain PARTIAL.
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
## F019 resumable streaming checkpoint (2026-11-06)
- Implemented authenticated owner-only resume and remote cancellation over Redis, plus no-Redis request-bound fallback. Focused tests, typecheck and lint pass. Next: run the full verification after further major migration batches; live Redis/PostgreSQL/browser testing remains outstanding. F019 is PARTIAL.
## Voice session lifecycle follow-up (2026-11-06)
- Keep direct voice-device action dispatch excluded while it lacks an equivalent user confirmation surface. The next major voice slice is persistent owner-scoped voice session and transcript segment lifecycle (start, idempotent segment intake, finalize, recent history), adapted to current device auth and chat persistence; author additive local migrations only and do not apply them.
## F026/F027 session backend checkpoint (2026-11-06)
- Added device-scoped session start, ordered/idempotent segment append and retryable finalization into reviewable chat history. Added migration `0043_voice_device_sessions.sql` and journal entry; focused tests, typecheck, Drizzle journal check, lint, and production build pass.
- Next: inspect/wire the available voice gateway or firmware protocol to these endpoints; extend owner-facing history to show session status/segments; exercise migration and row-lock behavior on a disposable local PostgreSQL instance. Then continue the remaining audited feature surfaces. No hardware/gateway source was present in the inspected checkout.
## F026/F027 owner-facing persisted session history (2026-11-06)
- Added a user-session-authenticated, rate-limited, no-store owner API for recent voice-device sessions. Repository query scopes by device and owner and returns no more than 50 sessions with at most 24,000 transcript characters each.
- Device dashboard history now loads both saved reviewable chat transcripts and persisted audio sessions, showing session status, segment count, timestamps, and transcript text.
- Focused sessions/history route tests passed 5/5; focused Biome formatting completed. Full typecheck is running; no PostgreSQL/device/gateway/browser test. F026/F027 remain PARTIAL because firmware/gateway transport is not present and no live integration has been verified. No migration applied, push or deploy.

## F018 file and multimodal parity checkpoint (2026-11-06)
- Completed this slice: TXT/Markdown/JSON/DOCX/XLSX/PPTX text extraction; bounded OOXML archive validation; owner-prefixed new upload paths; authenticated owner checks for chat and storage ingestion.
- Still needed before parity: a safe legacy-key ownership migration or user-directed re-upload flow; verify direct-upload storage paths in browser and each configured backend; evaluate XLSX preview and richer office rendering; run isolated PostgreSQL-backed tests. No legacy global object is automatically reassigned.
- Next major system after this batch: resume dependency-aware major-family implementation (agent approvals/tool workflow or project-brain based on current roadmap), not another isolated convenience feature.

## F010 source snapshot completion checkpoint (2026-11-06)
- Implemented immutable bounded text snapshots tied to the existing per-project/source fingerprint and analysis run; worker no longer substitutes newly changed document content for the queued revision.
- Migration `0044_project_brain_content_snapshots.sql` is additive, journaled, and unapplied. No current-content-based backfill of old historical revisions was attempted.
- Remaining F010/F011 work: expose safe version details/history as user workflows, richer page/source version lineage, consolidation/current-truth views, retry/background worker journeys, and real Postgres transaction/queue verification. Continue a whole feature system per batch; overall parity remains incomplete.

## F010 source revision history UX checkpoint (2026-11-06)
- Project members can browse saved revision metadata and open retained source text on demand; reviewers see a clear unavailable label for historical metadata without retained content.
- Route tests cover auth/access, no-store response, missing/legacy/oversized rows, and throttling. Live browser/PostgreSQL is still pending.
- Remaining larger knowledge systems: source-wise/current-truth consolidation, richer citation/history workflows, durable queue/worker integration, and graph behavior not yet matched. Do not mark F010 complete.

## F021 desktop follow-up (2026-11-06)
- Completed this local slice: same-origin export routing, native Save As handling, safe filename/log handling, and HTTPS/mailto external navigation under a default-deny policy.
- Next verification: run the Electron shell against a local Void-Agent instance and exercise real PPTX/ZIP/XLSX exports; then assess updater/release distribution capabilities without introducing signing credentials or changing packaging trust boundaries.


## F014 citation columns (2026-11-06)
The citation column now follows the reference's inline [N] and <CITATIONS> block format, with exact-quote constraints. Follow up with verified citation anchoring only if it adds measurable value beyond reference behavior; finish multi-user review collaboration and real Postgres/browser verification before parity claims.


## F010/F011 project tasks from brain sources (2026-11-06)
Task extraction and editor review are implemented over the immutable source revision path. Remaining: verify transactions against disposable PostgreSQL; add richer current-truth/task consolidation and project-wide grouping/history; exercise source revocation in a browser. Do not mark F010/F011 complete based on the new task proposal flow alone.


## F010 project connector sync — next major batch (2026-11-06)
Implement an editor-authorized project connector link bound to its credential owner and chosen server/account. Start with MCP, allowing only currently discovered tools with explicit `readOnlyHint === true`; add manual rate-limited sync, result/error classification, bounded snapshots, idempotent queueing and current-member checks. Connect those snapshots to brain analysis with durable provenance. Then add Composio using stored discovery allowlists revalidated at every sync. On unlink, preserve historical evidence but stop new sync and suppress stale source-derived current-state/todos. Complete a transaction/browser journey before status upgrades.

## F010 next implementation/verification batch (2026-11-06)
MCP project-source attach/manual sync is implemented locally. Next: add route-level authorization/idempotency/cleanup tests and a disposable PostgreSQL plus browser journey; then implement Composio project sync using snapshotted read-action allowlists revalidated on every sync. Continue other major missing families (tool approvals, voice/audio, desktop MCP, provider/model controls) without upgrading broad parity status based on this slice.
### Verification update (2026-11-06)
Attach route tests now pass for cross-origin rejection, viewers, allowed read-only tool persistence and write-tool exclusion; focused MCP tests 34/34. Production typecheck and build plus drizzle check pass. Next batch remains database-backed sync authorization/idempotency/detach verification, then Composio sync and other major feature families.

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

### F012 checkpoint (2026-11-06 11:18:20 +05:30)
Implemented durable resolution audit storage for project-brain conflicts. Remaining: persist/open candidates from ingestion, provide resolution history UI, add model verdicts with compatible/unknown outcomes, and support source-version/temporal comparisons. Keep F012 PARTIAL until the full lifecycle is verified.


### F012 continuation checkpoint (2026-11-06 11:42:40 +05:30)
Completed cross-source model adjudication and keep/dismiss lifecycle (local, unapplied migration). Remaining F012 work: attach fact records to source versions, prevent stale-version comparisons, provide review history/audit retrieval, and verify on PostgreSQL. Then continue the next high-priority incomplete major family from the evidence-based matrix.


### F007 checkpoint (2026-11-06 12:04:47 +05:30)
Completed the dynamic provider first-use, enabled/disabled, refresh, and cache invalidation slice. Remaining model catalog work: live custom endpoint/model discovery verification, provider capability metadata parity, and fallback behavior against real configured provider credentials. Do not claim all F007 parity complete until those workflows are tested.


## F027 continuation roadmap update (2026-11-06)
- Implemented local: OTA activation, user claim/dashboard, encrypted one-time credential staging, device completion, owner-scoped status and expiration cleanup; additive schema/migration 0049.
- Next: add device firmware client contract and hardware test only when a supported firmware source/device is available; keep websocket gateway excluded until protocol and bridge source can be validated. Continue with the next highest remaining major parity family after this vertical slice.
- Outstanding validation: apply migration 0049 only to disposable PostgreSQL (not production), test concurrent claim/completion transactions, test credential response loss/re-pairing, and exercise browser + physical hardware workflow.

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

## F021 updater packaging follow-up (2026-11-06)
- Implemented the updater lifecycle, UI status, secure feed parsing, sender-bound IPC and local package recipes as a substantial desktop integration slice.
- Next dependencies: obtain release signing credentials and an HTTPS staging feed; create signed platform artifacts; validate metadata, update signatures, install and rollback behavior in clean VMs. Do not publish until the user separately authorizes release.
- F021 remains PARTIAL; work can continue on other major parity families while release-specific verification is unavailable.

## F010/F012 active revision integrity (2026-11-06)
- Implemented the current-revision pointer and filtered source-derived read/review paths; source snapshots and old facts remain preserved for history.
- Next: test migration `0050` backfill and concurrent revision enqueue/reactivation on disposable PostgreSQL; exercise upload/re-ingest ? new analysis ? old claim disappearance ? revision history in browser. Add source-mutation auto-enqueue only after confirming every collection item mutation path and queue reliability.
- Then continue remaining major gaps and reconciliation work; do not upgrade F010/F012 to COMPLETE based only on SQL mocks and build checks.

## F018 private Blob follow-up (2026-11-06)
- [x] Add opt-in Vercel private-store operations and focused unit tests.
- [x] Document matching store/token configuration and public-object migration caveat.
- [ ] Verify upload token, image/document attachment processing, preview and download against a private staging Blob store.
- [ ] Add private S3 support and prevent user-facing APIs from exposing unscoped public object URLs.
- F018 remains PARTIAL until live storage/access checks pass.

## F018 private object storage extension (2026-11-06)
- [x] Support Vercel Private Blob SDK operations behind `VERCEL_BLOB_ACCESS=private`.
- [x] Route owner-scoped S3 URLs through authenticated app reads behind `FILE_STORAGE_S3_PRIVATE=true`.
- [x] Validate mode strings and test public compatibility.
- [ ] Test browser upload, attachment consumption, previews and downloads using actual private staging stores.
- [ ] Verify S3 public access blocks and role permissions in staging.
- F018 remains PARTIAL until the unverified live-storage paths pass.

## F025 next checkpoint (2026-11-06)
- Completed this batch: generic HTTP tool proposal/review, exact one-use approval, endpoint protections, HTTPS/public-address check, redirect refusal, bounded data and tests.
- Remaining: verify edit/approve/execute from a browser with disposable PostgreSQL; test a safe provider and redirect response; close DNS rebinding by using a transport that connects to the validated address while preserving TLS hostname verification; continue the remaining agent/connector/desktop parity inventory.

### F025 DNS pinning completed locally (2026-11-06)
Generic chat HTTP now pins Node HTTPS to a validated public DNS answer; no new dependency was added. Remaining verification: browser approval/edit/reject/retry, disposable PostgreSQL one-use token lifecycle, and safe provider behavior. Then continue F010/F012 canonical source/history lifecycle and reference voice parity. F027 WebSocket gateway itself is not implemented in the reference checkout; its route responds 426 and requires an external bridge.

### F010/F012 next checkpoint: immutable fact provenance (2026-11-06)
- Local implementation: direct fact-to-source-version ID, extraction write, additive migration/backfill, composite source/project constraint and source-version index.
- Verified so far: Drizzle migration journal check, 38 focused tests, root TypeScript. The production build is running; migration 0051 is unapplied.
- Next: verify migration/backfill and cascade/constraint behavior on disposable PostgreSQL, then build stale/current contradiction history retrieval on fact source-version identities and test that source re-ingest retains historical claims while excluding them from current truth.

### F010/F012 contradiction decision history (2026-11-06)
- Added a read-only closed-decision history view with source revision provenance (revision ID/time, filename, and the evidence stored on each decision's facts). Existing source-content snapshots are not returned.
- Kept the reference-compatible GET contract: GET /brain/contradictions returns open contradiction candidates for currently active source revisions; GET /brain/contradictions?history=true returns closed decisions, including decisions whose source revisions are no longer current. Both flows enforce project access, attached collection and owner visibility, and ready source status. Existing PATCH decision flow was not changed.
- Focused project-brain API/helper suite: 23/23 passed across four files. Root TypeScript no-emit passed after the final route-contract change. Previous project-brain source-lineage DB journal check passed; no schema changed in this batch.
- A fresh production build reached static generation 192/192 and final tracing, but its process handle expired before an exit code was captured. Treat this build as UNVERIFIED; rerun a fresh build before reporting it as passing. No PostgreSQL/browser workflow or migration 0051 application was performed. F010/F012 remain PARTIAL.

### Current migration focus — project-brain dream cycle audit (2026-11-06)
- The reference's manual/nightly dream cycle consists of model-judged page deduplication, cross-source contradiction detection, salience recomputation, and stale-page archival; it records stage metrics and warnings and is separate from source extraction/consolidation.
- Void-Agent has source-version-aware facts, conflict review/history, graph reads, and an audited editor-driven same-type page merge. It does not yet have an equivalent project-wide dedupe/salience/archive scheduler or a verified end-to-end dream cycle. No work on this feature should overwrite user-reviewed fact decisions or auto-merge identities without evidence and review.
- Next action: implement compatible salience refresh and safe stale-page handling in Void-Agent's existing typed-page/fact schema, with project/source visibility checks, role/rate limiting, tests, and explicit UI trigger; then assess whether model-judged automatic dedupe is safe given its user-approved identity merge contract.

## 2026-11-06 project-brain roadmap update
- Completed this batch: salience persistence, scoped recomputation endpoint, and editor UI score/refresh control.
- Still open in F010/F012: run-history retrieval verification, full dream scheduler/orchestration, review-safe page deduplication, safe stale archival, PostgreSQL migration/runtime verification, and browser workflow.
- Next: design a bounded, editor-reviewed dedupe proposal workflow over active typed pages, then add disposable PostgreSQL migration/backfill coverage. Do not auto-merge identities without a user-confirmed operation.

## 2026-11-06 F010 dedupe batch update
- Done: salience persistence/refresh/ranking; bounded candidate discovery; persistent editor “not duplicate” decision; candidate-to-existing-merge confirmation flow.
- Still open: model-assisted verdicts, scheduled/manual orchestration and per-stage metrics, safe stale archival, applied-migration PostgreSQL verification, and browser journey. F010/F012 stay PARTIAL.
- Next: audit reference salience/archive lifecycle and current primary source-version schema, then design an append-only safe archival/revival path. In parallel, determine whether model dedupe judgments add enough value to justify a separate advisory endpoint while retaining mandatory human confirmation.

## 2026-11-06 F010 lifecycle update
- Done: reviewable title/alias dedupe candidates, durable editor distinct-pair decisions, salience ranking, current-source-scoped stale archive and evidence-based restore.
- Still open: model-judged dedupe advisory/reason, scheduled/manual multi-stage dream orchestration and metrics, live PostgreSQL/browser journeys. Stale archive remains editor triggered; no automatic background hide.
- Next: implement an advisory model judgment for bounded duplicate candidates using only accepted current evidence, untrusted-data instructions and strict candidate-index validation; keep editor confirmation mandatory. Then add dream orchestration over salience/contradiction/dedupe stages without bypassing current ACLs.

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


## F024 scheduling dashboard continuation (2026-11-06)
- Implemented authenticated schedule listing, pause/resume, deletion and recent run status using existing job APIs and repository functions. Added an owner-checked, bounded run-history endpoint that omits output and error content.
- Next scheduling work: compare reference diagnostics and manual-trigger semantics against the current cron worker, then add only functionality that fits the existing lifecycle and replay/idempotency protections. No direct manual execution path until its authorization and duplicate-run behavior are designed.
- Verification complete for this slice: focused route tests, typecheck, scoped formatting and production build. PostgreSQL and browser verification remain pending.



### F024 schedule creation follow-up (2026-11-06)
- Basic one-time and recurring schedule creation now uses the existing authenticated scheduler API; one-shot local-input values are converted explicitly to UTC ISO and recurring cron is labeled UTC.
- Remaining: edit schedule properties, timezone-aware cron/DST, diagnostics and a safe manual run pathway. Continue through a dependency-aware design before adding an execution shortcut.



## F024 diagnostics and editing (2026-11-06)
- Implemented diagnostics and schedule editing: per-user due state, configuration presence only, same-origin mutation checks, bounded cron/prompt validation, next-run recomputation, and preserved job associations.
- Remaining: timezone-aware recurrence/DST, safe manual run, PostgreSQL/browser verification. The next action for F024 is to design a timezone migration and worker/DST test plan; manual execution should follow only after dedupe/idempotency design.


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

### F018 completed implementation slice (2026-11-06 20:30:13 +05:30)
- [x] Add owner-scoped bounded previews for DOCX, PPTX, TXT, MD, JSON attachments.
- [x] Reuse guarded parsers; escape by rendering plain text; enforce byte/rate/output bounds.
- [ ] Verify interactive journey against a live storage provider and browser; continue PDF/audio and remaining multimodal parity review.

### F017 team-scoped collection batch (2026-11-06 21:12:22 +05:30)
- [x] Reuse the existing orgId schema for explicit team-shared collections; add team picker and labels.
- [x] Resolve current collection role; enforce viewer read-only and owner/editor ingestion access.
- [x] Enforce same-team project attachment, exact chat collection scope, and live membership in RAG SQL.
- [x] Add collection org index migration and focused route/access/RAG/ingest tests.
- [ ] Add PostgreSQL-backed membership-revocation and project-brain shared-source tests; add per-collection privacy/role controls if required by the reference's exact workflows; verify browser journey.

### F017 project-brain source scope follow-up (2026-11-06)
Source readers and the ingest queue now support exact project-attached same-team shared collections. Credential authorization remains based on current team members, separate from source ownership. Focused verification is 72/72 tests; remaining checks include full typecheck, connector/fact follow-up changes, scoped lint, and production build. F017 remains partial until interactive and PostgreSQL-backed checks are available.

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

## 2026-11-07 Addendum: CreateAgent schedule parity
- Completed a bounded end-to-end optional recurring schedule workflow in the existing CreateAgent HITL card. Schedule cron, IANA timezone, and run prompt are editable and included in explicit approval.
- Added migration 0061 durable idempotency reservations (after published pages 0060 and before team-member budget 0062). The database migration must be applied before persistent retries work in an environment using this code.
- Remaining in this CreateAgent family: reference model pinning and file bindings; this batch did not mark either complete because the primary agent execution path lacks a validated model-override lifecycle and a verified owned-file staging consumer. Full CreateAgent family remains PARTIAL.

## 2026-11-07 F015 follow-up
Published-page storage/lifecycle has an initial verified implementation (migration 0060 and owner management/public reader), but the live database/browser journey and integrated type/build remain pending. Keep F015 PARTIAL; no release readiness claim until migration application and public-view/revocation journeys are verified.

### F032 streaming markdown performance (2026-11-07)

- [x] Reconcile the reference block splitter/memoized renderer with the primary GFM/KaTeX/code/table/citation/security behavior.
- [x] Test mounted component rerenders to prove stable blocks bail out while the live tail changes; test the streaming-to-settled transition.
- [x] Defer Shiki highlighting and word splitting for the active streaming tail.
- [ ] Root integrated typecheck and production build; only then consider marking this individual slice COMPLETE. No browser workload benchmark has been run.
- Follow-up hardening: changed separator buffering to a boolean and retain at most one loose-list blank separator; a 50,000-line blank-run regression test passes.

## F025 CreateAgent follow-up (2026-11-07)
- [x] Persist reviewed model pin in existing agent instruction JSON; validate against enabled catalog on create/update.
- [x] Apply authorized agent pin to runtime effective model and team budget gate; reject stale pins with 409; preserve ordinary unpinned behavior.
- [ ] Integrate reference file bindings if an owner-checked staging/consumption workflow can be verified.
- [ ] Complete root integrated typecheck/build and broader CreateAgent parity verification.

## F023 managed workflow generation/dashboard (2026-11-07)
- Closed this reference-source audit as EXCLUDED for the hosted-only generation/dashboard layer: the community generator returns `null`, and the dashboard's schema-only fields have no corresponding provisioning/runtime/UI path.
- Continue standard workflow parity independently. The next integration work should target executable reference capability families, not speculative hosted infrastructure.

## F010/F014 implementation checkpoint (2026-11-07)
- F010: bounded post-ingest salience refresh and stale-page archival are implemented and focused-test/typecheck verified; next close remaining scheduled dream-cycle stages only where they preserve live source scope and human review.
- F014: manual table-review creation supports multiple validated typed custom columns; next verify broader generation, authorization, persistence and browser workflows.
- Evidence and limitations: see `docs/feature-parity-matrix.md`; no live DB/browser/provider test for these slices.

### F027 safe device handoff checkpoint (2026-11-07)
- Implemented deterministic finalized-session message linking into the existing review-first chat flow. No schema change or auto-execution.
- Remaining: external gateway/WebSocket transport is not in the reference community checkout; live device, PostgreSQL, and browser journeys remain unverified. F027 stays PARTIAL.


## F030 Stripe Cockpit (2026-11-07)
- Completed this implementation batch: personal/team-scoped Stripe restricted-key storage, read-only balance/subscription/charge/payout snapshot, connection CRUD/test UI, and focused tests.
- Next: run migration 0063 against a disposable PostgreSQL instance and exercise authenticated personal/team access in a browser. Then separately port and verify reference website, Vercel, Revolut, Superlog, SEO providers and unified finance controls. Keep F030 PARTIAL until those systems are implemented and verified.


## F030 Vercel provider checkpoint (2026-11-07)
- Completed a second provider slice: encrypted Vercel config/token, optional team discovery, up to six projects, read-only production deployment summaries and seven-day failure counts. Migration 0063 remains additive/unapplied and backward-compatible with Stripe `secret_encrypted` rows.
- The request boundary is fixed-host HTTPS GET-only with bounded team/project/deployment lists, response bytes, timeout, rate limit, same-origin mutations, and role-scoped team controls.
- Next: integrate remaining website, Revolut, Superlog, and SEO sources; adapt unified finance/connect controls; then test migration in disposable PostgreSQL and verify the authenticated UI in a browser. F030 remains PARTIAL.

## F029 project health transition implementation addendum (2026-11-07 06:41:22 +05:30)
- Added a generic, deduplicated notification after a project-brain health snapshot is persisted and a known health transition is detected. Recipient resolution follows current personal/team/selected-project access and excludes former team/project members; text contains only the health transition, not project names, summaries, blockers, source content, or model output.
- Reference-equivalent project-consolidation todo digest remains absent; this is an additional health-transition producer, not full notification parity. F029 remains PARTIAL pending the consolidation pipeline, PostgreSQL-backed recipient/persistence checks, browser permission flow, and real VAPID delivery.
- Focused route/helper/generation tests passed 19/19 across 4 files; scoped Biome passed; full suite, whole-project typecheck, db journal check, and production build results are in docs/testing-report.md.

## F030 Vercel integration addendum (2026-11-07 06:41:22 +05:30)
- In addition to the verified Stripe slice, Void-Agent now has a read-only Vercel production-deployment panel for up to six configured projects, with latest status/date/URL and seven-day deployment error counts. Vercel config/token are encrypted as a single payload; migration 0063 remains additive and Stripe's existing secret column remains compatible.
- Egress is fixed-host HTTPS GET-only with redirect rejection, bounded response/time/team/project/deployment limits, rate/origin/body guards, and role-scoped team access. Focused Vercel tests passed 28/28 with scoped Biome and db journal checks.
- Website, Revolut, Superlog, SEO, unified multi-provider finance controls, live database, live provider, and browser workflows remain. F030 remains PARTIAL.

## Next verified migration batch � 2026-11-07

New slices are ready for broader reference work, not family closure. Continue with: (1) remaining Cockpit providers and reference-specific dashboard detail; (2) saved-workflow generation/dashboard parity, keeping generated workflows as drafts and preserving effect approval; (3) route-by-route team AI budget coverage only where server-owned team scope exists; (4) F028 channel-specific subscriptions/task lifecycle if behavior exists upstream; (5) live PostgreSQL migration, provider, browser and desktop MCP workflows in disposable/local environments. Continue investigating uncategorized surfaces from the 206-route census. Do not update completion percentage from this checkpoint alone.
- F030 next provider batch: Revolut Business is now implemented through fixed-host OAuth/RS256, encrypted credential storage, scoped connection APIs, bounded read-only balances and 30-day transaction data, and a dashboard. Focused tests and schema checks pass; retain F030 PARTIAL until typecheck/build, PostgreSQL-backed migration/ACL, browser and live-provider verification, Superlog/SEO, and unified finance-console behavior are resolved.

## F030 Superlog provider checkpoint (2026-11-07)
- Added a Superlog read-only MCP connection/dashboard with fixed endpoint, encrypted PAT, same-origin/rate-limited changes, owner/team authorization, declared-argument filtering, bounded results and error-safe summaries.
- Focused tests passed 8/8 and scoped Biome/diff checks passed. Root is running integrated typecheck/build after this batch. Migration 0063 is local and unapplied; live provider, PostgreSQL and browser verification remain unavailable.
- Next F030 work: integrate SEO if its Navigator MCP access and DataForSEO credential paths can be safely adapted; then reconcile shared finance/connect UI and provider alert aggregation. Keep F030 PARTIAL.
## Next substantial migration priorities — 2026-11-07
- The stale 12/36 headline has been replaced with the current classification distribution; do not use family discovery labels as a completion percentage. Continue item-level traceability from the 206 reference surfaces.
- F010/F011: status synthesis now runs as the last durable dream stage. Next close remaining project-brain source lifecycle and graph/history/consolidation behavior, with current-scope checks and human review retained; validate migration/stage replay on disposable PostgreSQL when available.
- F025: continue auditing every mutating connector, workflow, MCP, voice, schedule and external execution entrypoint. The recent approval hardening closes secret leakage in effect previews but not all provider/browser journeys; keep PARTIAL.
- F030: Stripe, Vercel, Website, Revolut, and Superlog slices now exist. Next inspect/integrate SEO and unified multi-provider composition/alert controls; then exercise migrations and owner/team ACLs against disposable PostgreSQL and browser workflows. Keep PARTIAL.
- F023: community hosted workflow generation/dashboard is excluded because upstream implementation is a stub/schema-only; personal private draft dashboard/editor is present. Continue parity only for executable reference behavior; publishing/team-sharing remains separate.
- F021/F027/F031 and other families still require item-level reference audit and available runtime verification. Do not run migrations against production, deploy, or push.

## F028 evidence-based exclusion (2026-11-07 09:20 IST)
No implementation batch is scheduled for the reference Slack channel-subscription/agent-task lifecycle: the reference evidence is limited to schema/migration declarations and a settings UI, with no `/api/slack` route tree or consumers for event verification, task execution, or Slack response delivery. This feature is EXCLUDED as a source stub, not deferred as an unfinished migration. Preserve the separate primary signed-inbound path as PARTIAL and focus its existing owner/HMAC tests (8/8 passed). Reassess only if executable reference handlers/workers become available.
## F030 SEO provider checkpoint (2026-11-07)
- Implemented DataForSEO domain summary, ranked keyword, optional backlink, credential save/test/remove and dashboard paths using the existing Cockpit connection store and ACL resolver.
- Focused SEO + Superlog tests pass 15/15, scoped Biome and `pnpm db:check` passed. Database migration 0063 remains unapplied; live provider, Postgres ACL/migration, browser, and integrated typecheck/build verification remain unclaimed.
- Next: implement OpenSEO through an explicitly approval-aware OAuth MCP read-only adapter, then integrate unified provider connection/status and alert aggregation. F030 stays PARTIAL.
### F030 SEO verification update (2026-11-07)
- Final focused SEO + Superlog rerun: 16/16 passed across 4 files; scoped Biome and git diff --check passed; pnpm db:check passed. Earlier 15/15 count is superseded. Integrated typecheck/build still belong to root verification.

## F030 continuation - provider connection hub (2026-11-07)
- Implemented the shared provider connection-status overview at `/cockpit`; Stripe finance remains available at `/cockpit/stripe`. The hub intentionally stops at connection health and deep links; provider-specific metrics remain in their current dashboards until a safe, common summary contract is designed.
- Verification: 4 focused tests passed, scoped Biome passed, SEO dashboard lint passed. Whole-project typecheck/build are delegated to root's integrated batch verification.
## F018 transactional private-file deletion lifecycle (2026-11-07 10:53 IST)
- Added authenticated `DELETE /api/collections/[id]/items/[itemId]` for private file-source items in the caller-owned personal collection. Collection items outside the requested collection, team-shared collections, non-file sources, and unsafe owner keys are rejected.
- The repository locks the source row and storage key, prevents reattaching a queued/deleted key, verifies unique object ownership, and refuses deletion while project documents, tabular reviews/cells, or project-brain sync/source/run/fact/todo records refer to the item. Existing F037 project unlink remains mapping-only and is unchanged.
- Item removal and creation of `file_cleanup_outbox` happen in one transaction. Storage is never deleted before commit. The cron worker leases due outbox rows, rechecks the key owner prefix, treats missing objects as success, and records visible retry time/error on provider failure. Delete returns HTTP 202 while storage cleanup is pending and 204 only after cleanup succeeds.
- Added additive migration 0067 and corresponding Drizzle schema/journal entry. Migration is recorded only; no database was connected or changed.

## F024 manual execution follow-up (2026-11-07 10:54 IST)
- Safe gap closed: schedule history refetches whenever opened and has an explicit refresh action; the existing API remains owner-scoped and returns lifecycle metadata only.
- Run-now remains blocked from implementation without durable invocation idempotency. Next design step: additive per-user/job request key record or queue with worker lease consumption, retry replay behavior, and recurring/one-shot schedule semantics; then add concurrency/authorization tests before exposing UI.
- Do not copy the reference synchronous route, mutate `nextRunAt` for an ad-hoc request, apply a schema migration, or call the execution path outside the worker lease.
## F010/F011 bounded project-brain cycle retry (2026-11-07 11:20 IST)
- Added a one-time retry path for partial/failed root dream runs. Retry requests are same-origin, authenticated project-editor only, rate-limited, streaming body capped at 2 KiB, bound to a run in the same project, and idempotent on etry:<root-run-id>. A retry cannot itself be retried; repeated requests resolve to the same queued retry row.
- Retry replays the existing staged workflow from the beginning. Existing stage effects are designed to be repeat-safe: dedupe only produces review suggestions, contradiction pairs use conflict-safe insertion and existing-pair exclusion, salience/archive are deterministic, and unchanged status fingerprints reuse a persisted snapshot. No auto-merge or fact-decision bypass was added.
- The dream status API exposes only canRetry, not the internal idempotency key. The project-brain panel offers Retry cycle only when the latest run is partial/failed and eligible. F010/F011 remain PARTIAL pending database/browser/worker verification and broader feature gaps.
- Evidence: src/app/api/projects/[id]/brain/dream/route.ts, its route tests, src/lib/projects/brain-dream-state.ts and tests, and src/components/project-brain-panel.tsx.


## F024 manual run-now implementation (2026-11-07 11:24 IST)
- Implemented durable owner-scoped/idempotent enqueue, claim-token worker execution, a pre-bound run record, and recurrence-preserving completion. Paused jobs are eligible; disabled jobs are not.
- Crash policy: do not replay requests whose started run lease expires; mark request and run failed with an explicit ambiguous-outcome note. This avoids duplicate manual requests but may not complete a request after a crash.
- Migration 0068 remains unapplied. Next: root integrated typecheck/full test/lint/build and disposable PostgreSQL migration/race validation, then authenticated browser verification. F024 remains PARTIAL until these checks and remaining scheduling parity are complete.

## F018 DOCX structure preview slice (2026-11-07 11:51 IST)
- Implemented an authenticated, bounded, sandboxed DOCX layout preview using the existing Mammoth dependency. It retains supported tables/structure while omitting images and external navigation; raw text remains available for PPTX/text previews.
- Focused tests: 14/14 across renderer, route and DOCX parser; scoped Biome PASS. Remaining F018 work includes private storage rollout verification, PDF/audio and remaining reference media flows, and authenticated browser/live storage checks. Family stays PARTIAL.
## F030 OpenSEO through Navigator OAuth (2026-11-07)
- Added a personal-scope OpenSEO connection path that reuses the existing DataForSEO SEO summary and dashboard. It accepts only a caller-owned, private, enabled MCP server whose URL is exactly `https://app.openseo.so/mcp`; the server must have a stored OAuth token. Team-shared OpenSEO configs are rejected because this repository's MCP OAuth session is server-global rather than user-scoped.
- The dashboard lists only eligible owned OpenSEO server IDs/names plus authorization state. It directs users to Navigator to complete OAuth. SEO execution checks current caller ownership again, requires a connected MCP client, and invokes only tools annotated `readOnlyHint` that match fixed domain overview/keyword/backlink name patterns. Arguments are constructed solely from declared schema properties and saved domain/location/language values. Returned payloads are capped at 1 MB; manager calls retain their configured MCP tool timeout.
- Focused schema, read-only tool selection/argument, route, and server-list tests: pending final integrated verification. Live OAuth/provider, PostgreSQL, browser, and team-sharing journeys were not run. F030 remains PARTIAL.

## F026 Voice Inbox follow-up (2026-11-07)
- Saved browser/device transcript listing is now available at `/voice-inbox`, using owner-scoped chat history and linking to existing explicit review flows.
- Continue with the next missing reference workflow only after route-level parity review. Project intent classification/routing and transcript command execution require a separate security design; do not dispatch external actions directly from an unreviewed transcript. Physical audio gateway implementation is separate from this web inbox.

## F021 remaining verification (2026-11-07)
The compatible native menu gap is implemented. Next F021 closure requires platform runtime verification for first-run and server switching, OAuth deep-link return, native notifications/downloads, and signed package update installation. No checkout-window port is planned until Dodo's checkout host and return handling are validated by the primary payments integration.
## 2026-11-07 checkpoint
F037 now has a complete local implementation slice for tracked DOCX proposals/review/accept/reject with migration 0069 authored, but it is not closed until safe disposable PostgreSQL migration and authenticated browser/storage flows are verified. F030 finance cockpit and F026 intent preview landed as bounded UI slices. Next major parity work must continue from the existing matrix; no broad family is marked COMPLETE from this batch. The validated local batch is being staged selectively and pushed only after the current branch/remote check.

## Remaining work checkpoint - 2026-11-08 19:00 IST

The latest batch added C33-C35 as PARTIAL workflows. Next work remains substantial:

1. Map the unclassified portion of the 206 reference route/page/tool surfaces into distinct user workflows and reconcile each against primary source behavior.
2. Complete Agentset lifecycle parity if retained: local document mirroring, ingestion/status/cancel/revoke, namespace and embedding-profile management UI, and safe injection of verified results into chat/project-brain context.
3. Design server-bound exact-payload approval for mutating Composio voice/chat actions; until then, keep writes unavailable.
4. Build a safe browser/voice execution sandbox with enforceable DNS-pinned egress isolation before reconsidering B20 arbitrary browser automation.
5. Verify the remaining PARTIAL workflows in browser and PostgreSQL-backed journeys where available; the local test/build results are not live-service evidence.
6. Continue the advanced tool, collaboration, notification, desktop, and knowledge audits; document every exclusion and preserve all primary security controls.

Do not derive a completion percentage from this scoped register. It currently counts 96 candidates but is not the full reference denominator.

## Repository roles corrected 2026-11-09

Canonical upstream is `keinsaasforever/better-chatbot` `main`; customized destination is `ibrahimkhan008/Void-Agent`. Earlier `Void-Agent-V2` references above describe a historical local checkout or prior audit evidence, not the canonical upstream identity. For current ports, compare live upstream `main` with the destination and preserve Void-Agent customizations. The current user instruction keeps changes local: no commit, push, or deployment.

> Current repository identities, pinned source snapshots, desktop provenance, and staging status are maintained in [current-source-roles.md](current-source-roles.md). Historical Void-Agent-V2 references in this file are retained as prior audit evidence and do not identify the current canonical sources.

## Current staged roadmap — 2026-11-11

1. Close the remaining direct connector tool operations from all 45 original `*-tool.ts` files. Every provider write must use fixed-origin transport and exact-payload one-use approval; test owner binding, replay, expiry, rejection, and successful approved call.
2. Finish A01 route/stream/transport coverage. Keep its real-PostgreSQL claim PARTIAL in this environment; there is no PostgreSQL service/binary/listener and Docker is prohibited.
3. Independently review the community, archive, and Insights code/tests/security; their focused/mock checks pass, but live DB/storage/provider/browser workflows remain unverified.
4. Implement the original AI app builder in a secure E2B lifecycle or record a concrete technical blocker; do not equate generic code execution with app building.
5. Implement bug bounty reporting or record explicit product/security/legal disposition. Recheck and port the original chat request challenge only if the current active chat path lacks equivalent protection.
6. Re-scan all original custom source features and diff every staging content deviation against the exact Better Chatbot tree.
7. Run the complete combined unit suite, 6 GiB typecheck, lint/format, migration metadata, production web build, focused security tests, desktop tests/build. Then promote with backup and non-destructive overlay, preserving all primary user changes, and repeat relevant checks in the actual destination.

No promotion/commit/push/deploy until all staging code batches and validation are reviewed. B20 stays MISSING/disabled; C38 remains PARTIAL pending live verification.

## Roadmap status correction — 2026-11-11 00:17 IST

Active: connector source-tool parity (6 mocked writes verified, Jira/Zendesk tests pending, 5 action operations/provider contracts unresolved), C45 chat-request challenge port, and secure AI app-builder implementation. Next after C45: Bug Bounty (migration 0081/idx82 only after AI builder releases shared schema/journal). After these, close A01 with the best safe integration available; this machine has no PostgreSQL runtime and Docker is forbidden, so actual database evidence may remain externally blocked. Then perform full feature re-census, content delta comparison, aggregate tests/build and non-destructive promotion.

## Connector checkpoint 2026-11-11 00:20

Eight provider write workflow categories (nine operations counting Gmail send and reply) have mocked exact-payload approval tests. Four operation groups remain: Productboard (workspace config/relationship), Freshdesk (two API-key-auth actions), Discord (Bot-token contract), Zulip (realm/API-token contract). Jira/Zendesk are now focused-tested. Current typecheck is temporarily broken by C45's shared schema export in progress; aggregate validation waits. Continue safe credential onboarding and fixed-host controls, and document true incompatibilities rather than faking provider behavior.

### Typecheck snapshot correction — 2026-11-11 00:22 IST
Connector agent reports the missing C45 `ChatRequestSecuritySchema` export is now present and a 6 GiB web typecheck passed on that intermediate staging snapshot. C45 route/client edits continued after that run and are not covered by it; a fresh typecheck is pending after those edits. Connector-focused status remains 7 files / 44 tests PASS. Do not call the current combined tree typechecked until the final post-edit run completes.

## App-builder in-progress checkpoint — 2026-11-11
Migration 0080/idx81 and initial repository/runner have been added. Next close owner/thread DB integrity and lifecycle state transitions, then route create/list/detail/cancel, safe preview/files, UI and focused failure/cleanup tests. Verify DB metadata and 6 GiB typecheck after C45/shared changes settle. No promotion until this vertical slice is verified.

### C43 next validation actions — 2026-11-11
Close resumed-build state transitions, cancellation races and cleanup tests; add DELETE/owner/error route tests; validate preview URLs and generated paths; run 6 GiB typecheck, `db:check`, scoped Biome. Coordinate `buildAppTool` registration with C45 route owner, keeping tool access authenticated/billed/allowlisted. Then run complete full validation; no live DB/E2B evidence exists.


## Current priority order — 2026-11-11 01:05 IST

Latest estimate: 44% weighted overall (58% implementation, 31% verified; 38–50% range). This supersedes prior 60% overall language. Do not repeat the broad audit; continue from docs/MIGRATION-STATUS-REPORT.md.

1. Validate the 21 App Builder staging changes, including original agent/VibeSDK mode parity.
2. Reconcile all 159 upstream content differences.
3. Complete semantic comparison against zip-main; port missing security/admin/provider/payment/API behavior.
4. Implement Bug Bounty.
5. Resolve Productboard/Zulip; disposition Discord safely.
6. Keep B20 disabled until browser/VM egress isolation is proven.
7. Run combined web and desktop tests, 6 GiB typecheck, lint/format, db:check, builds and security checks.
8. Prepare recoverable backup/non-destructive promotion, preserve 61 destination changes and exclude .env/temporary duplicate desktop.
9. Promote only after validation; validate the actual destination.
No commit, push, deploy or production migration.
