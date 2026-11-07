# Integration strategy

Void-Agent is the only implementation target. Reference hashes are captured in
repository-discovery.json; do not modify the reference or replace the primary tree.

## F032 streaming markdown performance adaptation (2026-11-07)

Reuse Void-Agent's renderer and keep its existing GFM, KaTeX, Shiki, Mermaid, JSON, citation/table, link and ReactMarkdown URL-safety behavior. Split only at stable top-level blank-line boundaries, with fence/display-math guards; memoize blocks by source text and streaming state. Preserve GFM loose lists while collapsing arbitrarily long blank runs to one retained separator. Propagate the chat's active generation state only to the last text block and defer syntax highlighting/word splitting until that block settles. Test mounted rerenders directly so unchanged earlier blocks must not invoke ReactMarkdown again. Keep the family PARTIAL until the integrated typecheck and production build pass.

Use direct adaptation only for isolated compatible behavior. Rewrite features tied
to AI SDK 7, postgres.js, organization tables or workspace packages around existing
AI SDK 5, node-postgres, Team and site_config interfaces. Reuse existing memory,
collections, scheduler, billing, connectors and workflows before adding equivalents.

A shared label is insufficient evidence of parity; each route/tool/table candidate
needs caller, persistence, auth and UI review. This checkpoint has a complete source
surface census and initial family matrix, not completed semantic review of every
candidate. Individual integrations must link their reviewed slices and tests.

Initial reviewed slice: post-login destination preservation. Reference files
apps/web/src/lib/auth/callback-url.ts and public-routes.ts carry intended in-app
paths through login. Primary middleware discards them and both email/social auth
hardcode /dashboard. Implement a validated relative callback and preserve the
existing dashboard default. No schema, dependencies or provider changes needed.

## Bounded conversation history adaptation

The reference loads the latest 50 messages and pages older rows on demand. Void-Agent now uses the same interaction while preserving its repository and AI SDK contracts. The repository method is backward compatible: omitted options still return complete history for exports, insights, and API consumers. Paged reads use a thread-scoped cursor and stable chronological ordering. The server action requires an authenticated session and verifies ownership before accessing the page. No schema or dependency change was needed. Database-backed end-to-end verification remains outstanding.

The cursor timestamp is resolved as a thread-scoped SQL subquery so database precision is retained; ties are ordered by message ID. This avoids relying on millisecond-precision JavaScript dates for PostgreSQL timestamp boundaries.

## Human-in-the-loop tools

Adapted three reference decision workflows inside the existing AI SDK 5 chat path: plan review, batched user input, and editable email draft review. Tool definitions are not added to the user's configurable default-tool categories or selector; they are supplied only when the current request permits tool calls. Each uses a bounded Zod input schema and a no-execute tool definition, and the UI returns a result through the existing `useChat.addToolResult` path. Prompt guidance forbids requesting secrets. The user-input result is persisted with the conversation like other tool results, so this tool must not be used to collect credentials. Email approval does not cryptographically authorize or execute sending; connected email tools retain their own permission model. Agent creation still needs an adapted write workflow and is not claimed complete.

## Project knowledge scope adaptation

Keep Void-Agent's existing user-owned collections and document-chunk RAG as the storage/retrieval foundation. A nullable UUID array on each chat thread scopes retrieval without duplicating the reference's knowledge store: `NULL` keeps legacy all-collection behavior; `[]` selects none; non-empty IDs select only those collections. First-request IDs and later scope updates are checked against authenticated ownership, and existing threads use persisted scope to prevent a modified request body widening access. This is a base slice only; the reference project-brain graph, ingestion orchestration, facts and contradiction workflows require separate implementation.
## Project workspace adaptation addendum (2026-11-05)
Projects are implemented on the primary Team/TeamMember contracts and existing collection/RAG storage. A nullable chat-thread project reference supports association; explicit project collection IDs are enforced on new and existing threads. Current membership is checked at request time, and the collection-owner set is limited to current team members. Project brain ingestion, graph and fact workflows remain a separate incomplete layer.

## Project brain source-analysis adaptation
Analysis consumes the existing parsed document text attached to a project collection, rather than adding a second upload/storage pipeline. Persisted runs are unique by project/source content fingerprint; failed and stale runs can be retried. Extraction is bounded and treats source text as untrusted, and produces proposed facts with evidence excerpts. Project editors review them before accepting or dismissing. This is only a base brain layer: durable asynchronous jobs, graph entities/relations, contradictory claims, history/timeline and consolidation remain planned.

Graph/conflict slice: derive display nodes/edges from persisted reviewed/proposed facts instead of introducing another graph storage representation before the fact contract stabilizes. Conflict heuristics only nominate same-subject/predicate facts with different values; the UI calls them potential conflicts and an editor resolves by selecting the accepted value, with the other fact rejected in one project-scoped transaction. Revisit durable contradiction records and entity aliasing after usage/evidence proves the fact model.
# Tabular multi-document review adaptation

Better Chatbot couples review creation to a chat tool call and persists a separate uploaded-document model. Void-Agent adapts this around its Knowledge collections and extracted document text: authenticated chat exposes a bounded source list scoped to caller-owned collections (including only caller-owned collections attached to a project) and a create-review tool that rechecks ownership/project scope; a review card links to the persistent table. The dedicated review workspace selects ready items, persists bounded per-field cells, streams model results at concurrency three, and exports XLSX using existing JSZip. The review remains private to its creator. This avoids copying the alternate file/user schema. Cell edits and targeted regeneration use creator-scoped routes, lock the parent review during edits, cap JSON bodies, and recompute aggregate review status after regeneration. Team-shared review access and source-offset citations remain future parity work; F014 stays PARTIAL.

# Browser voice session history adaptation

Better Chatbot persists completed realtime turns into an ordinary chat thread so tool outputs and transcripts remain available after the voice session. Void-Agent adapts this without a new table: OpenAI Realtime and KonvO messages flow through a shared client contract to an authenticated route, which verifies thread ownership, creates an owned thread on first flush, and upserts namespaced message IDs. User speech starts persistence (avoiding empty greeting-only threads); a debounced client flushes completed turns, retries changed turns by signature, and exposes a link to the saved chat. Payload sizes and request rates are bounded, and oversized tool outputs are replaced with safe summaries. Hardware device enrollment and websocket/audio gateway APIs remain a separate migration because the checked-out reference lacks the bridge source.

# Notifications and browser push adaptation

Notifications use a dedicated user-owned table and idempotent dedupe key. Scheduled worker terminal states generate in-app notifications; Web Push is an optional delivery channel when VAPID configuration exists. Browser subscription key material is AES-GCM encrypted using the existing encryption master key. User-controlled endpoints are checked for HTTPS and public DNS both on registration and immediately before delivery. The service worker validates same-origin navigation and the client exposes unread state plus read actions. Migration `0038_notifications_and_push.sql` is append-only and must be applied through the normal migration workflow before the APIs are used against a database.

# Physical voice device pairing adaptation

Void-Agent now supports the common device-code flow without copying the reference's incomplete websocket bridge. The authenticated web user creates a short-lived pairing code; a device redeems it through a public endpoint protected by per-IP and per-code rate limits. Code consumption plus device creation is transactional. A single-use bearer token is returned once and only its peppered digest is stored; owners can list and revoke devices. The device page explicitly identifies that audio transport remains unavailable until a separately deployed gateway exists. Migration `0039_voice_device_pairing.sql` is local and unapplied.

## Voice device transcript adaptation

The new authenticated `POST /api/voice/transcript` route accepts only active device bearer credentials, rate-limits per device, validates a strictly bounded JSON contract, and persists recognized speech into an existing user-owned chat thread. Device/session/event identifiers are namespaced into stable UUIDv5-shaped IDs so device retries upsert the same thread/message. This workflow delivers transcript content to the owner but does not interpret it as permission to execute MCP or agent actions. Audio transcription and approved action execution remain separate work.

## Device audio ingress strategy
Adapt the reference raw WAV endpoint to the primary's existing Sarvam STT configuration rather than add the reference AssemblyAI dependency. Accept only raw WAV MIME types, authenticate device bearer identity first, cap streamed bytes before allocation, validate the RIFF/WAVE signature, and persist the resulting transcript through the same idempotent owner-scoped chat helper as text transcripts. Treat recognized speech as untrusted user input and save for review; do not dispatch MCP or agent actions directly.

## F021 implementation update (2026-11-05)
The next P1 desktop MCP batch is implemented as an isolated companion for local MCP testing. The system-browser OAuth handoff uses an allowlisted provider and one-time token; stdio process access is gated by trusted-frame IPC validation and native consent. The app remains separate from server chat/agent execution. F021 stays PARTIAL until the desktop user journey is exercised against real auth and MCP servers, remaining desktop reference features are audited, and release signing/update requirements are resolved. No automatic local MCP tool execution is added to agent workflows.

## F025 approval strategy update (2026-11-05)
Treat approval as a server-enforced capability, not a chat transcript convention. The built-in Gmail send/reply path now uses an authenticated issuance endpoint and a ten-minute, one-use token bound to the exact reviewed action and payload; the provider tool consumes it atomically before sending. The existing Better Auth verification table avoids a parallel token store/schema. Extend this pattern only after each mutating connector's payload/result semantics are traced. F025 remains PARTIAL until other mutating tools and persistent browser/Postgres workflows are covered.

## Project knowledge graph retrieval addendum
Expose only reviewed project facts to project chat through a bounded tool. Revalidate membership and collection/source access when the model invokes it; the prompt must not treat model confidence as truth and must cite evidence. Keep unstructured retrieval in the existing Void-Agent RAG path. Do not represent this term-ranked fact lookup as full graph traversal; alias resolution and graph query semantics remain future work.

## F010/F011 durable manual source queue (2026-11-05)
Keep Void-Agent's existing collections, extracted document text, reviewed facts, and scheduler. Manual analysis now reserves a queued run in the request, then the existing cron worker claims and executes it; no second queue service was added solely to mirror upstream Inngest. The worker reauthorizes the requester and source against live project membership/collection ownership and checks a content fingerprint before model use. This queue does not yet claim upstream source-trigger, consolidation, or multi-step pipeline parity.

## F025 calendar connector effect approval (2026-11-05)
Extend Void-Agent's existing Google Calendar connector rather than replacing it with the reference's Composio tool abstraction. Read/list/get remain available without approval. Writes are exposed only through a review tool and require a short-lived server-side token bound to a canonical action and exact approved fields; atomic consumption happens immediately before the provider mutation. Use PATCH and ETags to avoid clobbering unrelated event data or applying stale edits. Delete verifies the target still has the reviewed title and times. Keep F025 PARTIAL until other mutating connector/workflow effects and real provider journeys are addressed.

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
## Productboard mutation reconciliation (2026-11-06)
Preserve the existing Productboard read actions. Adapt the shared task/item creation approval contract for `create_feature`, binding provider, Productboard product ID, name, and description. Use the authenticated issuance route and digest-only one-use token repository already established for Asana/ClickUp. The connector consumes the token before the provider POST; no separate token table or dependency is needed. Productboard's URL-safe IDs are validated by a bounded identifier pattern.
## Graph shortest-path retrieval (2026-11-06)
Adapt reference graph pathfinding over the existing Void-Agent evidence-backed fact graph. Query only accepted, currently visible source facts; use undirected breadth-first search with strict depth/node caps; retain source visibility policy at the API boundary. Do not infer a path from proposed or rejected claims.
## Typed page identity and merge compatibility decision (2026-11-06)
Do not port reference `mergePages` directly onto flat Void-Agent triples. It assumes page IDs are foreign keys across facts, links, aliases, events, contradictions, versions, and embedded chunks; Void-Agent has a different evidence/review contract. Next design a Void-Agent-owned canonical entity/page layer with alias uniqueness and source-backed claims, then add a transactional merge that preserves rejected/proposed state, current source visibility, stable loser redirects, and retrieval/chunk consistency. Automated dedupe must remain disabled until database transaction and rollback tests pass.
## F010/F013 expert routing adaptation (2026-11-06)
Use existing accepted, evidence-backed triples rather than introducing a second page graph. Normalize aliases for both queried concepts and person entities, require all query terms to match, rank by bounded accepted relationship confidence, and return up to five people with up to five supporting claims each. Apply project membership/collection owner/ready-source visibility in the API before routing. Treat this as a relevance hint, never a claim that expertise is verified. Canonical typed pages and full reference ranking remain separate migration work requiring additive schema design and transactional verification.

## F025 app-default automation write boundary (2026-11-06)
Gate Windmill/Activepieces `run` actions using an authenticated same-origin issuance API and digest-only, expiring, one-use approval token. Review binds platform, target and exact JSON payload with stable key ordering; connector consumes the token before any network request. Keep flow/script discovery read-only. This covers only the app-default automation tool; saved workflow MCP nodes and direct chat MCP tool calls require distinct context/access checks and remain under audit.

## F021/F025 direct remote MCP call boundary (2026-11-06)
Wrap chat-loaded MCP tools with an `approvalToken` field and require an authenticated user-bound token over server ID/name, tool name, and canonical full arguments. Keep the token outside MCP arguments; strip it before forwarding. Consume atomically before the tool call. Use the same wrapper for manually confirmed calls by issuing the exact token server-side after the existing explicit user confirmation. This does not cover MCP tools executed inside saved workflow graphs, voice, or the standalone MCP test page.

## Saved workflow MCP approval adaptation (2026-11-06)
Keep Void-Agent's graph executor and published-workflow ownership model. Gate the model-facing saved workflow tool with a server-issued token binding the exact workflow identity and user input; recheck current publication/access immediately before execution and consume the token before loading the executable graph. Do not equate this with approval of hidden downstream side effects: add a readable action manifest and bind workflow-definition revision before marking the broader workflow effect system complete.

## Voice MCP actions and standalone MCP testing (2026-11-06)
Keep the current provider SDKs and client voice transports. Maintain a separate tool-to-server identity map in each authenticated session response; remove the internal chat approval-token field from voice-provider schemas, then stop at a native browser confirmation showing exact arguments. After confirmation, request a short-lived server token and invoke a user-authorized server action that consumes it against the exact server ID/name/tool/payload before dispatch. Keep local stdio MCP in the existing desktop native-consent boundary. Do not treat UI confirmation or mock verification as live provider/PostgreSQL parity.

## Saved workflow review revision and HTTP node SSRF (2026-11-06 04:56 IST)
- Keep the existing approval-token architecture. Add an access-checked preview endpoint on the existing route rather than duplicating workflow APIs.
- Derive a minimal effect manifest server-side; expose only action labels, HTTP method and hostname. Never send configured headers, bodies, URL paths, query parameters, or credentials to the approval UI.
- Hash canonical graph nodes/edges, sorting rows by ID for stable revisions. Bind that hash into token issuance and recompute it against the exact graph returned for execution.
- Guard each runtime HTTP destination immediately before fetch and reject automatic redirects. The existing DNS check plus platform fetch still has a DNS-rebinding time-of-check/time-of-use limitation; strict DNS pinning is not claimed.

## n8n workflow run route hardening (2026-11-06)
Keep n8n's own per-user authorization as the authority for workflow visibility: fetch the requested workflow through that user's n8n account before calling its run endpoint. Add exact same-origin validation, user-keyed rate limiting, bounded IDs, no-store responses, and generic upstream failures. Do not claim this reveals or reviews side effects inside the external n8n graph.

## Embedded MCP tools in saved workflows (2026-11-06)
Validate MCP references from the graph's persisted node configuration at all three boundaries: approval preview, token issuance, and final graph load. Resolve access through `selectAllForUser`, require the server to remain enabled and its current name to match the reviewed node, and reject before approval token consumption when unavailable. Never let a public workflow's publication state grant access to its owner's private MCP credentials.
## Project-brain authorization boundary follow-up (2026-11-06)

Use the same source visibility policy for derived brain data as for graph traversal: current project access, attached collection IDs, current collection-owner membership, and ready source state. Apply it to reads and transactional review mutations. Keep the existing reviewable fact store as the source of truth while typed page identity is designed additively; exclude stale facts after source detach or member removal.
### Alias resolution rule

Do not choose a canonical entity from an ambiguous alias mapping. Until typed page identity and reviewed merges exist, only a unique accepted alias mapping may be used for expert routing; ambiguous labels remain unlinked.
## Typed page adaptation

Keep Void-Agent's reviewed claims authoritative. Add stable page IDs as a materialized identity layer; populate only from grounded typed claims. Link each alias to its source fact and require accepted status plus current source visibility before showing it. Attach relation endpoints only when extraction explicitly identifies both entities. Never pick a page for ambiguous labels; add manual, same-type merge review and transactional lineage before any dedupe.
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
## F019 resumable chat streaming strategy update (2026-11-06)
- Reuse Void-Agent's existing chat ownership/session checks and AI SDK 5 stream contract; add Redis-backed buffering only when a TCP Redis URL is configured. Do not make browser-held credentials or an unauthenticated stream ID sufficient for resumption.
- A Redis stop failure must be surfaced as unavailable, never reported as successful. Without Redis, keep the existing request-bound abort behavior. The feature remains partial pending live service and browser verification.
## F026/F027 voice device command security decision (2026-11-06)
- Use authenticated enrolled-device WAV/transcript intake, strict content/size/signature validation, rate limits, event idempotency, and owner chat persistence. Device speech is saved for review; external actions must proceed through normal chat and per-tool approval controls. Do not allow speech alone to bypass user approval. Persistent session/segment history remains a planned major implementation slice.
## F026/F027 voice session lifecycle adaptation (2026-11-06)
- Persist metadata and bounded transcript text only: bind each session to authenticated device and owner; use unique event and sequence constraints; serialize append/finalize with session row locks; cap a session at 500 segments and final transcript at 24,000 characters. Do not retain raw audio or accept caller-provided owner/device identity.
- Finalization writes one deterministic final transcript event into the existing owner chat and leaves all action execution behind the normal human-reviewed chat/tool approval flows. Keep migrations additive and unapplied locally until separately verified against a disposable PostgreSQL database. The hardware gateway must adopt the new endpoints before claiming parity.
## F026/F027 owner-facing persisted session history (2026-11-06)
- Added a user-session-authenticated, rate-limited, no-store owner API for recent voice-device sessions. Repository query scopes by device and owner and returns no more than 50 sessions with at most 24,000 transcript characters each.
- Device dashboard history now loads both saved reviewable chat transcripts and persisted audio sessions, showing session status, segment count, timestamps, and transcript text.
- Focused sessions/history route tests passed 5/5; focused Biome formatting completed. Full typecheck is running; no PostgreSQL/device/gateway/browser test. F026/F027 remain PARTIAL because firmware/gateway transport is not present and no live integration has been verified. No migration applied, push or deploy.

## F018 document ingestion and storage boundary (2026-11-06)
Adapted the reference readers into Void-Agent's existing chat ingestion pipeline rather than replacing the storage or attachment architecture. Reused existing DOCX/PDF parser dependencies, added ExcelJS and fast-xml-parser for workbook/XML parsing, and kept sequential bounded extraction. All OOXML archive members are verified before parser entry. Authenticated owner IDs flow into managed upload key construction, and chat/storage ingestion checks owner prefixes. This does not change the existing public-object storage ACL or make historical globally keyed objects safely attributable; those remain excluded from privileged AI ingestion until migrated with verified ownership.

## F010 immutable source revisions (2026-11-06)
Extend the existing project-brain source-version table with a nullable bounded content snapshot instead of introducing a second raw-source system. Fingerprints are recomputed from `(source item ID, exact text)` before persistence and before analysis. Workers first revalidate current project membership, attached collection access, owner IDs, and a ready source-item row, then analyze the immutable queued snapshot. Historical metadata-only rows remain unknown until a worker can prove that the current source still matches the stored fingerprint. Additive migration 0044 is journaled but not applied. This change retains analysis inputs, not every historical upload/file revision.

## F010 source revision history UI and access boundary (2026-11-06)
Expose revision metadata with the existing source list and fetch one content snapshot only when requested. The API independently requires current project membership, derives attached collection owners, requires a ready item in one of those collections, applies a per-user rate limit, verifies the snapshot's length and fingerprint, and disables caching. This keeps source text out of the oversized overview payload and honors current access revocation. Historical rows with no retained text are explicitly unavailable.

## F021 desktop downloads and navigation (2026-11-06)
Adapt export navigation into the existing Electron shell instead of replacing the companion. Exact configured-origin export paths use Electron's download manager; untrusted schemes remain blocked and HTTPS/mailto links go through the OS browser. Filenames are sanitized before constructing the Save As default path, and query-bearing URLs are never written to logs. Desktop MCP capabilities and native consent requirements are unchanged.


## F014 citation column adaptation (2026-11-06)
Keep the existing bounded text extraction, per-cell storage, manual correction, and export pipeline. When the configured column type is citation, instruct the model to return inline numbered citations and a <CITATIONS> mapping of exact short quotes from the untrusted source. Do not change formats for other column types or treat model output as cryptographically/offset verified evidence.


## F010/F011 project task adaptation (2026-11-06)
Adapt the reference's source-derived project todo capability into Void-Agent's review-first source analysis: extract capped tasks alongside facts, require exact source-grounded evidence, keep candidates proposed, and let editors accept/reject/complete. Link each task to its immutable analysis run and source item; use run-scoped idempotency to avoid duplicate writes during retry. No connector side effect occurs from task review.


## F010 project-connected connector sync boundary (2026-11-06)
The current brain queue requires a ready collection item, so do not bypass it with an untracked model call. Design a first-class external source/run snapshot that binds project, connector, credential owner, selected read operations, and immutable result content. Recheck active project membership and current server/account state at run time, allow only MCP `readOnlyHint` tools (or currently revalidated Composio read-action slugs), classify failures before text reaches extraction, and bound/redact stored payloads. The connector owner must be able to detach/revoke access; historical raw data must follow explicit retention and source visibility rules.

## F010 MCP sync adaptation status (2026-11-06)
Adapted a secure manual MCP-only source workflow to Void-Agent's existing Project/Collection/ProjectBrain queue: selected owned server, attached owned collection, read-only annotation snapshot and revalidation, conservative JSON-schema argument validation, owner-only external execution, per-user rate limit, idempotency key, bounded text-only result persistence and source lineage. Detach deletes generated source items so facts, tasks, versions and runs cascade away. Composio allowlist/sync is not yet implemented. Migration 0046 is local and unapplied.
### Verification update (2026-11-06)
Added route tests covering same-origin, editor role, owner-only read-only tool discovery and response secrecy. Content fingerprint uniqueness is transactionally enforced for concurrent duplicate syncs. Focused tests 34/34; typecheck, migration check and production build pass. Live DB/browser verification remains pending.

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

### F012 persistence update (2026-11-06 11:18:20 +05:30)
Adapted the reference contradiction record lifecycle to the existing fact review API. Conflict resolution is written in the same transaction as accepting/rejecting facts; canonical ordering makes pairs idempotent. The current Void-Agent heuristic is preserved and stored as potential; model verdicts are deferred until a bounded classifier can be tested end to end.


### F012 classifier and review integration (2026-11-06 11:42:40 +05:30)
Reused primary fact/source provenance and customModelProvider. Candidate pairs are restricted to distinct ready attached sources with a matching normalized claim key and different values; at most 20 are sent per run. Model output can refer only to supplied candidate indexes, and malformed/duplicate/out-of-range decisions are ignored. Classifier failure is isolated from successful ingestion. Confirmed pairs enter editor review; compatible/unknown pairs are stored closed. Existing owner scoping is enforced again when graph results are read and when editors act.


### F007 dynamic provider lifecycle (2026-11-06 12:04:47 +05:30)
Preserved the existing OpenAI-compatible dynamic provider architecture and encrypted site_config storage. Added async resolution wrappers and migrated server call sites to await hydration rather than racing a fire-and-forget read. Registry refresh reconciles enabled state and removal, protects reserved provider IDs, and uses a generation counter so admin invalidation cannot be lost behind an in-flight stale read. Provider operations remain local to the primary repository.


## F027 OTA voice-device registration adaptation (2026-11-06)
Kept the existing primary website-generated code pairing path and added the reference's firmware-first activation path alongside it. New route set: OTA create/status config; session-authenticated claim; device-authenticated completion using both numeric code and the private 256-bit bootstrap secret; owner-only setup status. Claim serializes on the registration row and creates the device plus encrypted delivery credential in one DB transaction. Completion locks the row, validates expiry and both proofs, clears ciphertext and marks complete atomically before returning the token once. Expiration through owner status lookup clears staged ciphertext and revokes a device whose firmware never retrieved credentials. Live websocket/audio is explicitly outside this batch because the reference bridge is missing and the primary has no compatible transport implementation.

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

## F021 updater integration decision (2026-11-06)
- Adapted the reference updater lifecycle to the existing Void-Agent Electron companion rather than replacing its hardened browser, auth, download, or local-MCP paths.
- Feed configuration is supplied at package time by electron-builder and read from packaged `app-update.yml`; only HTTPS feeds without userinfo/query/fragment are accepted. No renderer-supplied URL or secret enters updater config.
- Release packaging is configured for the Void-Agent app ID/product identity. Windows and macOS updates require signing; the local scripts validate required signing configuration and invoke electron-builder with publishing disabled.
- Completion is intentionally gated on producing signed artifacts and testing the update journey against a controlled release feed. Do not call desktop parity complete before that verification.

## F010/F012 source-currentness reconciliation (2026-11-06)
- Reconciled immutable history with current-state brain retrieval by adding an active source-state pointer, rather than deleting facts/todos from previous document versions.
- The pointer is updated only after source fingerprint/content validation, in the same enqueue/sync transaction where available. A correlated SQL `EXISTS` predicate verifies the analysis run, active version, project, and source item agree before source-derived current-state content is returned or reviewed.
- Existing revisions are backfilled from each project's latest analysis run by migration `0050`. Old versions remain in source history; when a source revision changes, outdated facts, aliases/page identity claims, conflict candidates, and todo proposals stop participating in current views.
- Risk: externally updated collection content is considered current only when a new fingerprinted analysis is requested. The app does not yet automatically detect/queue every source mutation. PostgreSQL execution and concurrent reactivation need disposable DB tests before applying migration.

## F018 private Vercel Blob integration strategy (2026-11-06)
Keep the storage driver abstraction and make Blob access mode explicit through `VERCEL_BLOB_ACCESS`, defaulting to public for backward compatibility. In private mode, upload/delete operations target the private store and server download uses the SDK-authenticated private `get()` call. Browser access continues through existing owner-authenticated Void-Agent routes. Store mode must match the env flag; migration of existing public data is a separate operational step and is not performed here.

## F018 private S3 adapter (2026-11-06)
For deployments with a private S3-compatible bucket, keep uploads under the authenticated user's existing key prefix and return the app's owner-checked file route instead of a provider URL. Preserve provider URLs for generated non-owner assets. The app cannot introspect bucket policy, so configuration is valid only when anonymous reads are blocked and server-side IAM is provisioned.

## Generic outbound HTTP security adaptation (2026-11-06)
Keep the existing Void-Agent HTTP capability but add human approval at the action boundary rather than removing generic integration support. A dedicated review card allows edits to the exact request; a same-origin endpoint issues a user-scoped, five-minute, one-use token bound to canonical request content. Execution is rejected without that token and passes a just-in-time HTTPS/public-host guard with redirect refusal and strict request/response bounds. Further verification needs a browser and disposable PostgreSQL; DNS pinning to the already-validated address remains open because native fetch performs its own hostname resolution.

### Outbound HTTP DNS binding decision (2026-11-06)
Use Node's built-in HTTPS transport with the validator's checked address passed through its custom lookup callback. This closes the validation/connection DNS rebinding gap for generic chat HTTP requests without adding a dependency. The original hostname stays on the URL so TLS SNI and certificate verification remain hostname-based; native HTTPS does not follow redirects.

## Project-brain claim provenance adaptation (2026-11-06)
Extend Void-Agent's existing immutable source-version system instead of adding a second knowledge store. Store the exact source version on each extracted fact, backfill from its run, and enforce source/project identity with a composite foreign key. Retain the existing active-source revision filter for current views; immutable fact provenance can support future historical review without treating stale claims as current truth.

### F010/F012 contradiction decision history (2026-11-06)
- Added a read-only closed-decision history view with source revision provenance (revision ID/time, filename, and the evidence stored on each decision's facts). Existing source-content snapshots are not returned.
- Kept the reference-compatible GET contract: GET /brain/contradictions returns open contradiction candidates for currently active source revisions; GET /brain/contradictions?history=true returns closed decisions, including decisions whose source revisions are no longer current. Both flows enforce project access, attached collection and owner visibility, and ready source status. Existing PATCH decision flow was not changed.
- Focused project-brain API/helper suite: 23/23 passed across four files. Root TypeScript no-emit passed after the final route-contract change. Previous project-brain source-lineage DB journal check passed; no schema changed in this batch.
- A fresh production build reached static generation 192/192 and final tracing, but its process handle expired before an exit code was captured. Treat this build as UNVERIFIED; rerun a fresh build before reporting it as passing. No PostgreSQL/browser workflow or migration 0051 application was performed. F010/F012 remain PARTIAL.

### Current migration focus — project-brain dream cycle audit (2026-11-06)
- The reference's manual/nightly dream cycle consists of model-judged page deduplication, cross-source contradiction detection, salience recomputation, and stale-page archival; it records stage metrics and warnings and is separate from source extraction/consolidation.
- Void-Agent has source-version-aware facts, conflict review/history, graph reads, and an audited editor-driven same-type page merge. It does not yet have an equivalent project-wide dedupe/salience/archive scheduler or a verified end-to-end dream cycle. No work on this feature should overwrite user-reviewed fact decisions or auto-merge identities without evidence and review.
- Next action: implement compatible salience refresh and safe stale-page handling in Void-Agent's existing typed-page/fact schema, with project/source visibility checks, role/rate limiting, tests, and explicit UI trigger; then assess whether model-judged automatic dedupe is safe given its user-approved identity merge contract.

## F010 dream-cycle adaptation decision (2026-11-06)
Implemented the deterministic, non-destructive salience-ranking stage against Void-Agent's typed-page/fact schema. The refresh requires live editor access and scopes aggregation to active source revisions, ready collection items, attached collections and current collection owners. It updates only the ranking column and exposes no hidden-source facts or content. The route is same-origin and rate-limited. Model-judged auto-dedupe and stale-page archival are still deferred pending a safe design that preserves user-reviewed fact decisions and the immutable page-merge audit trail; this is not full dream-cycle parity.

## F010 reviewable page-identity suggestions (2026-11-06)
Adapted the reference dedupe surface to Void-Agent's higher-integrity page-merge contract. Candidate generation is deterministic and bounded to current accepted same-type pages. An editor can persist a “not duplicates” decision; otherwise, the editor must explicitly review and confirm a merge, which is revalidated against live project/source visibility inside the established transaction. The system never lets a model write identity changes. Remaining: reference-style model verdict/reason as advisory only, candidate scheduling, stale archive, and full database/browser workflow verification.

## F010 reversible stale-page lifecycle (2026-11-06)
Reused the existing archivedAt lifecycle instead of changing schema. Listing is project/source scoped; archival candidates require 30-day age, visible attached/ready-source history, no current accepted identity fact, and an unmerged active page. The API repeats those predicates inside the atomic update. Restoration requires an archived unmerged page plus a current accepted identity fact in a live collection. The UI asks for confirmation and shows that facts remain. This is a human-controlled adaptation of reference automatic archival, chosen to avoid hiding identities without a current project editor's review. Full scheduled dream-cycle parity remains open.

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


### Scheduling feature reconciliation (2026-11-06)
- Keep Void-Agent's existing scheduler repository, cron worker, leader lock, internal chat authentication and outbox. Do not import the reference's Inngest tables or scheduling schema.
- Adapt the reference schedule-management workflow onto existing owner-scoped job APIs. The new dashboard only exposes status lifecycle and bounded run metadata; run output and errors stay private to server logic.
- Add diagnostics and user-facing schedule creation/edit only after mapping the current one-shot/recurring job contract and ensuring the dashboard cannot trigger arbitrary execution.



### F024 schedule creation follow-up (2026-11-06)
- Add one-time and recurring schedule creation to the existing dashboard via POST /api/scheduler/jobs. Keep the current UTC scheduler contract explicit; do not suggest timezone-aware recurrence until schema, cron calculation and DST behavior are migrated and tested.



### F024 diagnostics and edit adaptation (2026-11-06)
- Added diagnostics over the current scheduled-job table; expose only secret-presence booleans and the caller's due-state rows, with private/no-store caching. Keep outputs and credentials out of the diagnostic response.
- Edits normalize through the existing schedule contract and preserve agent/thread context. State-changing job routes require same-origin Origin checks.
- Do not imitate reference timezone fields atop a UTC-only worker. Migrate cron timezone and DST semantics as a cohesive schema/worker project. Defer manual run until idempotent run identity and conflict behavior are designed.


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

### F018 document preview adaptation (2026-11-06 20:30:13 +05:30)
Reuse the existing file-ingest parsers and owner-prefixed storage boundary rather than copying the reference HTML rendering. Serve capped extracted text for DOCX/PPTX/TXT/MD/JSON; render it as text in the existing attachment dialog. Apply owner check before storage reads, 5 MiB stored/downloaded byte cap, per-user rate limit, 100,000-character output bound, and private no-store headers. DOCX extraction now validates the OOXML archive inflation budget before Mammoth expands it. Leave PDF/audio preview and live provider checks as open parity work.

### F018 preview fidelity correction (2026-11-06 20:35:36 +05:30)
The DOCX parser returns text rather than a visually faithful Word document, so API metadata now reports partial: true. UI extension inference uses the URL pathname (decoded) and ignores query/hash for attachments without a persisted title; it still never uses that URL for a server-side fetch.

### Team-scoped collection access (2026-11-06 21:12:22 +05:30)
Adapt CollectionTable.orgId instead of adding an Agentset or second vector store. Personal collections keep their previous owner-only semantics. Team sharing is opt-in by explicit team selector; server checks owner/editor/viewer role and same-origin for mutations. List/detail/item queries check active membership; deletion is additionally fenced in SQL; ingestion rechecks role after upstream parsing before row creation. Projects can bind a shared collection only when its org matches the project team. Normal chat retains personal-only default retrieval; explicit selected team collections are scoped to exact IDs, with RAG SQL requiring a live team-member or team-owner record. Additive migration 0057 adds an org_id index only. Project-brain's historical owner-ID scope and per-collection team visibility settings remain follow-ups.

### Team-shared sources in project brain
Source queries use the project's exact collection attachment list plus owner IDs resolved from current project members and creators of attached collections whose `org_id` exactly matches the project's `team_id`. This preserves explicit attachment and current project ACL boundaries while allowing a shared collection to remain usable after its creator leaves the team. Connector credential checks continue to use active member IDs only. Enqueue uses the same source scope after the editor's live project authorization check. The worker revalidates the original requester; leaving the team revokes queued work rather than granting background execution indefinitely.

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

## CreateAgent schedule adaptation (2026-11-07)
Keep the existing agent approval transaction and the existing scheduler subsystem. The approval UI performs the agent create first, then calls the scheduler API with the same stable tool-call idempotency key in a separate idempotency namespace. The scheduler reservation/hash/job are transactional; retries after network uncertainty resolve to the existing job or a payload conflict instead of creating duplicates. The endpoint verifies current ownership of any target agent before scheduling. Do not store artifact URLs or accept arbitrary files as an agent binding without a complete owner-checked staging/runtime contract. Model pinning similarly requires routing changes before model resolution, outside this batch.

## F015 published pages (2026-11-07)
Adapt the reference shareable-page feature using append-only version records and stable unlisted slugs. Keep publishing and revocation owner-authenticated and same-origin; public serving uses an isolated sandbox CSP and no-store response. Treat URLs as bearer links. Migration 0060 is local and must be applied before database-backed use; retain PARTIAL status until a browser and disposable PostgreSQL publish/republish/revoke test passes.

## F025 model pin design (2026-11-07)
Use the existing `Agent.instructions` JSON to avoid a schema migration. The review UI consumes a server-authenticated enabled model catalog and submits only a user-reviewed `provider/model` value. Server create/update validation remains authoritative. Chat resolves the selected agent through the same user-scoped owner/public visibility helper already used for agent instructions; only that returned authorized agent may select a model. Validate persisted pins against the current catalog and return a clear conflict when a model was disabled or removed. Feed the effective model through all downstream model identity, budget/pricing, and usage paths. Preserve the requested model exactly when the agent is unauthorized, absent, or has no pin.

Remaining CreateAgent migration work includes reference file-binding parity and integrated build/type verification; this pin slice alone does not complete the family.

## F023 evidence-based scope decision (2026-11-07)
- Do not invent a managed GitHub-source-to-container workflow builder from schema columns alone. The checked V2 community generator is an explicit null stub; dashboard provisioning/session/hosting has no executable route, UI, worker, or implementation.
- Record this hosted-only surface as EXCLUDED. Preserve standard workflow CRUD/editor/execution parity tracking separately; primary n8n integration and internal graph workflow execution remain supported, with their existing auth/review boundaries.

## F010/F014 strategy update (2026-11-07)
Preserve the fact-backed, owner/source-scoped project-brain architecture; attach lightweight salience/archive maintenance to the existing durable ingest worker and keep human review for identity merges. Extend the existing typed table-review schema/UI rather than introducing a competing review model. The new slices passed focused tests and typecheck; schedule the remaining dream-cycle stages and integration verification as separate dependency-aware work. Both families remain PARTIAL.

## F027 integration strategy update (2026-11-07)
Reuse the existing owner-scoped chat transcript handoff and human approval UI for completed voice-device captures. Do not copy the reference's direct tool-dispatch finalizer into this product. Preserve partial status until the absent gateway dependency and live device/browser workflow are resolved.


## F030 Stripe Cockpit vertical slice (2026-11-07)
Adapt only the reference read-only Stripe finance provider first. Store restricted keys in the existing AES-GCM envelope; scope personal records to the signed-in user and team records to a verified team ID. Match existing Team roles: members can read the shared dashboard; owners/editors may save, test or remove keys. Use fixed Stripe HTTPS endpoints and GET only, with rate-limited API entry points, explicit request/response bounds, and generic provider failures. Keep each unported provider separate in the matrix; a Stripe slice does not establish full Cockpit parity.


### Vercel provider adaptation (2026-11-07)
Vercel is a second independent read-only source. Keep token plus team/project configuration in one AES-GCM `config_encrypted` payload; preserve Stripe's legacy encrypted-secret column. Expose only redacted project config and `tokenSet`. Use fixed Vercel HTTPS host, GET-only production deployments, bounded team discovery/project/page/body/time, and owner/editor team mutation permissions. Report only supported deployment state/date/URL and seven-day ERROR count; do not invent spend or margin. This does not establish unified Cockpit parity.

## F029 project health transition implementation addendum (2026-11-07 06:41:22 +05:30)
- Added a generic, deduplicated notification after a project-brain health snapshot is persisted and a known health transition is detected. Recipient resolution follows current personal/team/selected-project access and excludes former team/project members; text contains only the health transition, not project names, summaries, blockers, source content, or model output.
- Reference-equivalent project-consolidation todo digest remains absent; this is an additional health-transition producer, not full notification parity. F029 remains PARTIAL pending the consolidation pipeline, PostgreSQL-backed recipient/persistence checks, browser permission flow, and real VAPID delivery.
- Focused route/helper/generation tests passed 19/19 across 4 files; scoped Biome passed; full suite, whole-project typecheck, db journal check, and production build results are in docs/testing-report.md.

## F030 Vercel integration addendum (2026-11-07 06:41:22 +05:30)
- In addition to the verified Stripe slice, Void-Agent now has a read-only Vercel production-deployment panel for up to six configured projects, with latest status/date/URL and seven-day deployment error counts. Vercel config/token are encrypted as a single payload; migration 0063 remains additive and Stripe's existing secret column remains compatible.
- Egress is fixed-host HTTPS GET-only with redirect rejection, bounded response/time/team/project/deployment limits, rate/origin/body guards, and role-scoped team access. Focused Vercel tests passed 28/28 with scoped Biome and db journal checks.
- Website, Revolut, Superlog, SEO, unified multi-provider finance controls, live database, live provider, and browser workflows remain. F030 remains PARTIAL.

## Reconciliation notes � 2026-11-07

- Project-brain consolidation extends the existing fact/source-revision/visibility model; dream stages use current collection-owner scope and preserve human review for entity/contradiction decisions.
- Workflow approvals are layered on the existing saved-workflow/N8N execution paths. Static reviewed actions are authorized by a one-use token bound to graph revision and input; actions whose runtime effects cannot be previewed are blocked pending per-effect review.
- MCP tool output is treated as untrusted external data and bounded before entering chat/UI. Desktop audit visibility exposes metadata/hashes only through sender/origin-gated IPC.
- Cockpit connections reuse the shared encrypted connection store and access resolver, keeping Stripe's existing encrypted-secret representation while using encrypted config for Vercel/Website.
- Report and Slack inbound handling preserve the primary's per-user ownership and signed-webhook boundaries rather than inheriting reference assumptions.
- F030 Revolut adaptation reuses the primary Cockpit connection store and role resolver. OAuth client assertion and access-token exchange remain on the server; temporary codes never enter persistence. Existing upstream semantics are retained for the bounded 30-day balance/transaction summary while data access is further restricted to fixed hosts and read-only routes. Migration 0063 is still un-applied.

## F030 Superlog provider adaptation (2026-11-07)
- Reused the encrypted Cockpit connection config and existing team scope resolver. Kept Superlog's MCP tool discovery and incident/alert/error summary behavior while replacing its user-configurable endpoint with the documented fixed `https://api.superlog.sh/mcp` host.
- Added redirect rejection, hostname/path validation at the fetch boundary, a streamed 1 MiB response cap, a 6-second abort deadline, declared-argument filtering, output row/text limits, and generic errors that do not echo upstream response text.
- Stored the PAT only in encrypted config. Personal/team reads are scoped; team changes require owner/editor. Migration 0063 remains unapplied. The SEO provider and unified upstream Cockpit console remain open; F030 stays PARTIAL.
## F028 source-stub exclusion clarification (2026-11-07 09:20 IST)
The channel-subscription/agent-task lifecycle is excluded because the reference only defines `SlackChannelSubscriptionTable` and `SlackAgentTaskTable` in `Void-Agent-V2/apps/web/src/lib/db/pg/schema.pg.ts` and migration `apps/web/src/lib/db/migrations/pg/0030_slack_navigator_bot.sql`, plus a settings component (`apps/web/src/components/slack/slack-integration-settings.tsx`) that calls `/api/slack`, `/api/slack/channels`, `/api/slack/sync`, and `/api/slack/connect`. There is no `/api/slack` route tree and no repository consumer implementing event verification/replay protection, task execution, or response delivery. Adding lookalike persistence/UI would not migrate working behavior, so no new lifecycle implementation is appropriate absent executable upstream source. Keep Void-Agent's signed inbound processing classified PARTIAL, not as channel-subscription parity; focused owner/HMAC tests passed 8/8.
## F030 SEO provider adaptation (2026-11-07)
- Adapted the reference DataForSEO path to primary encrypted Cockpit config and `resolveStripeScope`, retaining per-user/team isolation and owner/editor-only mutations. Domain inputs are bare-domain validated; requests use a hard-coded DataForSEO MCP host, reject redirects, cap the response stream, set an abort deadline, select only non-mutating overview/keyword/backlink-named tools, and include only declared input fields.
- Did not call connected OAuth MCP servers from Cockpit. OpenSEO requires an approval-aware Navigator OAuth adapter, while the current manager tool-call API can invoke arbitrary registered tools directly; preserving the MCP approval boundary is required before implementing that path. The DataForSEO-only slice is not whole-provider parity; F030 remains PARTIAL.

## n8n effect review policy (F025; 2026-11-07)
The n8n path now follows a fail-closed node allowlist. Safe logic nodes have no external effect; literal HTTP Request nodes expose method, URL, and parameters after secret handling. HTTP expressions, inline credential values, secret-bearing URL query/userinfo, unsupported node types, and previews exceeding structural/byte bounds are not approvable. JSON/form-style strings and header/query name-value pairs are scanned and redacted before being rejected. Credential references are represented by type only. Any future n8n integration node requires a dedicated sanitizer/preview adapter and regression tests before approval can be enabled.
### F030 overview adaptation (2026-11-07)
- Preserve each provider's authorization and data contract by calling its existing read-only connection endpoint from the client overview. Validate and project the response down to the common status fields, render failed checks as unavailable (not disconnected), and never request provider summary data from the overview.
- Keep the previous Stripe dashboard behavior at `/cockpit/stripe` while `/cockpit` becomes the overview. Use current authenticated `/api/projects/teams` options for selecting scope; each provider endpoint independently enforces access.
## F037 unlink revalidation (2026-11-07 10:22 IST)
- Project document removal remains a mapping-only operation; do not delete collection source bytes during project unlink because collections and other projects may share that source.
- The unlink route revalidates current editor access, attached collection IDs, and eligible source-owner scope before deleting the project mapping. This narrows the stale-ACL window without adding a second document/storage system.
- Object cleanup for actual collection-item deletion is deliberately deferred: it requires a transactional cleanup outbox and retry worker; no schema/migration was introduced in this slice.
## F018 transactional private-file deletion lifecycle (2026-11-07 10:53 IST)
- Added authenticated `DELETE /api/collections/[id]/items/[itemId]` for private file-source items in the caller-owned personal collection. Collection items outside the requested collection, team-shared collections, non-file sources, and unsafe owner keys are rejected.
- The repository locks the source row and storage key, prevents reattaching a queued/deleted key, verifies unique object ownership, and refuses deletion while project documents, tabular reviews/cells, or project-brain sync/source/run/fact/todo records refer to the item. Existing F037 project unlink remains mapping-only and is unchanged.
- Item removal and creation of `file_cleanup_outbox` happen in one transaction. Storage is never deleted before commit. The cron worker leases due outbox rows, rechecks the key owner prefix, treats missing objects as success, and records visible retry time/error on provider failure. Delete returns HTTP 202 while storage cleanup is pending and 204 only after cleanup succeeds.
- Added additive migration 0067 and corresponding Drizzle schema/journal entry. Migration is recorded only; no database was connected or changed.

## F024 manual run boundary (2026-11-07 10:54 IST)
Do not implement manual schedule execution by directly calling the worker body or by overwriting `nextRunAt`. Void-Agent's lease token fences worker completion, but `scheduled_run` has no durable user-request key or pending invocation contract, so request retries cannot be distinguished from intentional second executions. A future run-now implementation needs an additive durable request/idempotency record consumed by the existing worker/lease path, with owner checks, duplicate suppression, and tests for concurrent requests and claim races. Until that design exists, improve the safe run-history workflow only.
## F018 source deletion UI completion slice (2026-11-07 11:13 IST)
- Added a per-source Remove action only for writable personal collections and file-backed items. The user must confirm; the component calls the authenticated collection-item DELETE endpoint, refreshes list data, and distinguishes queued cleanup (202) from immediate completion. Team collections and URL sources do not expose this action.
- Focused component tests passed 2/2: confirmation invokes the expected DELETE request and refresh on queued cleanup, and team collections do not offer per-source deletion. Scoped Biome check passed. F018 remains PARTIAL for project/reference blockers, wider multimodal parity, and live PostgreSQL/storage/browser validation.
## F014 source-to-primary full regeneration strategy (2026-11-07 11:15 IST)
- Reconcile the reference's explicit force-recompute request with the primary's stricter review owner lock, same-origin enforcement, user rate limiting, safe-source checks, prompt-injection framing, citation verification, and one-cell retry path.
- Force mode is opt-in and user-confirmed because it overwrites existing answers and incurs provider calls. Request schema accepts only literal orce: true; existing targeted and retry semantics remain. Do not mark the family complete until live database/provider/browser verification and team/shared scope decisions are resolved.
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


## F024 manual run-now adaptation (2026-11-07 11:24 IST)
- Use the same scheduler worker and ScheduledJob claim token/expiry instead of the reference synchronous runner. The authenticated same-origin API only enqueues a durable request; it never executes AI work in the request lifecycle.
- A per-user idempotency tombstone identifies retries, and a partial unique index permits one pending/processing request per job. Claiming the request, leasing its job, creating its ScheduledRun, and linking that run to the request happen transactionally. Worker completion is fenced by the shared claim token.
- Manual runs do not change nextRunAt or disable a one-shot schedule. Paused jobs can run manually; disabled jobs reject.
- Once a request is durably linked to a started run, lease expiry marks it failed/ambiguous without replay. This is at-most-once for a manual request and avoids duplicate request execution; exactly-once external effects are not possible. The tradeoff is a possible missed/ambiguous run after a crash before work actually begins.

## F029 accepted project-brain todo notification (2026-11-07 11:49 IST)
- Added an adapted safe notification event: only a successfully persisted human transition from proposed to accepted calls the notification helper. Rejected, completed, invisible, invalid, denied, and conflicted transitions do not notify.
- The helper resolves current project recipient IDs at send time and stores one in-app notification per recipient with the existing unique (user_id, dedupe_key) constraint. Stable key project-brain-todo-accepted:<todo-id> deduplicates retries per recipient/task. Notification text is generic and omits untrusted model-generated task title/evidence. Web Push runs only after a new notification row is inserted and remains best-effort.
- Focused Vitest passed 7/7 across the todo review API route and notification helper tests; scoped Biome and git diff --check passed. No schema change or migration was needed.
- This is an adapted accepted-task event, not the reference per-run consolidation digest. F029 remains PARTIAL pending broader notification event parity and live PostgreSQL/browser/VAPID delivery validation.
## F018 DOCX preview structure adaptation (2026-11-07 11:51 IST)
- Reuse the primary's installed Mammoth renderer instead of importing another parser. Invoke it only behind the existing authenticated storage preview route after current user-prefix ownership, metadata-size, downloaded-size and rate-limit checks.
- The renderer independently verifies the OOXML ZIP bounds and rejects malformed/DOCTYPE packages before Mammoth. It suppresses image inlining, rewrites anchors to inert spans, and caps returned HTML. The attachment view uses srcDoc in sandbox="" and a restrictive CSP, retaining tables/headings without enabling scripts, navigation, network fetch, or access to the app DOM.
- This closes the DOCX layout/table-preview gap only. It does not close public bucket policy, PDF, audio, video, or live browser/storage requirements.
## F030 OpenSEO through Navigator OAuth (2026-11-07)
- Added a personal-scope OpenSEO connection path that reuses the existing DataForSEO SEO summary and dashboard. It accepts only a caller-owned, private, enabled MCP server whose URL is exactly `https://app.openseo.so/mcp`; the server must have a stored OAuth token. Team-shared OpenSEO configs are rejected because this repository's MCP OAuth session is server-global rather than user-scoped.
- The dashboard lists only eligible owned OpenSEO server IDs/names plus authorization state. It directs users to Navigator to complete OAuth. SEO execution checks current caller ownership again, requires a connected MCP client, and invokes only tools annotated `readOnlyHint` that match fixed domain overview/keyword/backlink name patterns. Arguments are constructed solely from declared schema properties and saved domain/location/language values. Returned payloads are capped at 1 MB; manager calls retain their configured MCP tool timeout.
- Focused schema, read-only tool selection/argument, route, and server-list tests: pending final integrated verification. Live OAuth/provider, PostgreSQL, browser, and team-sharing journeys were not run. F030 remains PARTIAL.

## F008 adaptation addendum � team budgeted brain dedupe (2026-11-07 12:00 +05:30)
- Reused the existing team-member budget reservation and settlement path for project brain duplicate suggestions. Only a persisted, authorized team project plus current membership and an enabled configured model enter the billed path. Owner exemption and personal execution preserve previous behavior. Charged inference pins the reserved model and disables fallback/retries to prevent model/pricing mismatch.
- No schema change. Missing membership, model, currency/reservation, or budget availability fails closed. Reauthorization is performed after inference before returning suggestions. Broader F008 route coverage remains open.
