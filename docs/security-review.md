# Security review

This is an incremental review, not a completed security audit. Preserve current session prefix isolation, per-user access guards, upload defenses, SSRF restrictions and encrypted provider keys. No production/database migration authorized by feature audit. Callback destinations must reject external URLs, protocol-relative URLs, backslashes, controls and auth loops. Add tests before wiring inputs into router/OAuth. Remaining: project ownership, approval correlation, file parser boundaries, sandbox permissions, webhook replay and dependency audit.

## Checkpoint findings and fixes

Storage diagnostics imported the client factory and threw before returning a
configuration error. Driver selection now has no client initialization side effects.
Payment HMAC validation accepted alternate Base64 encodings for the same signature
bytes; canonical encoding is now required before constant-time byte comparison.
This is encoding malleability, not a demonstrated payment-authorization bypass.
The subscription ownership/active-payment requirement is unchanged. Regression
covers an equivalent-byte alias deterministically. CSP policy was never weakened;
its stale test now asserts all existing directives.

## Bounded history review

Older-message requests require an authenticated session and are rejected unless the requested thread belongs to that user. Cursor resolution is additionally scoped to the same thread, so a foreign/stale message ID returns an empty page. The UI cannot choose an arbitrary page size; both initial and older pages use the server-owned 50-message window. Full-history repository callers retain their existing behavior. Focused repository tests cover chronological reversal and an unresolved cursor. Postgres-backed ownership and same-timestamp boundary checks remain outstanding; no new data migration or security boundary was introduced.

Cursor comparison keeps PostgreSQL timestamp precision in the SQL predicate instead of round-tripping through JavaScript Date, avoiding sub-millisecond boundary skips. The test suite currently covers repository ordering and empty pages with a mocked query builder; actual SQL behavior still needs a Postgres-backed integration check.

## Human approval trace (in progress)

Reference evidence shows four UI-resolved HITL tools (plan approval, email proposal, input request, agent creation). Void-Agent's existing generic manual-tool flow stores a `ManualToolConfirmTag` on a tool result and later invokes the resolved tool from the chat request. No claim is made yet that the approval is durably bound to an immutable tool input across every path. Before expanding approval UI, trace client-supplied message mutation, route authentication, thread ownership, tool lookup, and MCP/workflow execution. This is the next security-focused integration review.

## HITL tool batch review

Added bounded schemas for plan todos, up to four user questions, and email drafts. The request-input guidance forbids secrets because answers return through chat and are persisted. These UI decisions are not a durable server-side approval token and must not be treated as sufficient authorization for sensitive operations. Email draft approval returns exact approved fields to guide the model; connector permissions still govern sending. Void-Agent's existing generic manual tool approval and server executor were preserved. Agent creation and a full test of approval-to-external-side-effect correlation remain open; this batch did not weaken or replace access controls.

## Conversation knowledge scoping

Collection IDs are UUID-validated at the chat request boundary and checked against the authenticated user before a new thread stores them. Updating an existing scope requires a session, thread ownership and collection ownership. Existing-thread retrieval uses persisted scope, ignoring client attempts to widen it. Explicit empty scope returns before embedding or database retrieval. Migration 0033 is append-only and nullable, retaining legacy retrieval semantics. Database migration/runtime behavior has not been verified against Postgres yet.
## Agent creation approval path

The create-agent proposal has no `execute` handler. Creation occurs only after a user confirms the editable card and uses existing `/api/agent` session authentication and `canCreateAgent` authorization; server-side ownership is taken from the session rather than the proposal. The card validates the returned ID/name before presenting a link. No schedule or file attachments are part of this adapted path. A lost POST response can still leave an ambiguous retry and requires server-side idempotency before claiming robust exactly-once behavior.
## Agent-creation retry integrity

The card sends its stable AI tool-call ID as an idempotency key. The server validates its length/character set, binds uniqueness to the authenticated user, and hashes normalized persisted agent fields. A private reservation row and Agent row are inserted atomically; the unique user/key index serializes concurrent retries. Exact replays return the same authorized user's agent; changed data returns 409. The replay table stores the request hash outside agent projections and retains a tombstone when an agent is deleted. Route tests verify session identity overrides client userId and `canCreateAgent` is still enforced. Database locking/concurrency semantics still need local Postgres integration coverage.
## Project workspace authorization
Project access is resolved from current Team/TeamMember membership on list/read/update/delete and chat use. A former team member does not retain access merely because their user ID created a team project. Viewers are read-only and cannot create team projects. Project chat retrieval accepts only collection IDs explicitly attached to the project, then scopes collection ownership to current team members. New project/thread schema migration 0035 has not been applied or verified against Postgres. Policy tests cover owner/member/viewer/removal and collection-scope cases.

Team collaboration follow-up exposes the caller's own Team/TeamMember workspaces in the project form through `/api/projects/teams`. The endpoint is authenticated and returns membership-visible teams only; the project create endpoint still checks membership and role. UI filters viewers, but API policy remains the security boundary.

## Project brain source analysis controls
The analysis API requires a session, project access with edit role, an attached collection ID, an item owned by the project owner/current team member, and a ready ingestion status. It limits model requests to eight per user per minute, selects at most 30 document segments and 60,000 characters, and returns only bounded schema-validated claims. Source text is identified in the prompt as untrusted; the model has no tools. Extracted facts remain proposed until a project editor accepts or rejects them. Review writes are scoped by both fact ID and project ID and only transition proposed facts. Run/fact migrations 0036 are not applied; authorization and SQL behavior still require Postgres integration verification.

## Graph and conflict review security
Graph reads use current project access and return at most 500 facts. Rejected claims are excluded. Potential-conflict resolutions are available only to project editors, validate both fact IDs within the same project and verify the pair's normalized subject/predicate match while values differ, then lock and update both records atomically. This is a heuristic for candidate review, not an automatic truth determination. Source/run facts remain project-scoped; Postgres concurrency and tenant isolation have not been integration-tested.

## Tabular review security
Review sources must be ready collection items owned by the authenticated user; for project chats, the collection must also be attached to the project the user can currently access. Item IDs are resolved through `collection_item -> collection` rather than trusted from model input. The chat inventory is limited to 30 eligible sources and creation rechecks project membership/collection ownership at tool execution. Reviews are private to their creator, and get/delete/generate/export routes filter by both review ID and user ID. Input caps are 20 sources, 8 columns, 500 prompt characters per column, 60,000 source characters per model call, and 350 output tokens; concurrency is capped at 3 and creation/generation are rate-limited. Source text is framed as untrusted data and model errors are replaced with generic stored cell errors. XLSX fields are XML-escaped inline strings, not formulas. Migration 0037 is unapplied; SQL-level tenant isolation and live stream cancellation/retry still need Postgres-backed/browser tests. Team-shared review records are not supported.
## Tabular review cell actions (2026-11-05)
- Added owner-scoped cell edits and targeted regeneration. Both require an authenticated session, review ownership, a source row attached to the review, and an existing review cell; edit requests are rejected while the review is generating.
- Cell edit JSON is read incrementally with an 8 KiB cap; values are limited to 4,000 characters. Regeneration input uses a strict UUID/column-ID schema and cannot select rows/columns outside the persisted review.
- No authorization boundary was broadened. Team-visible source documents can be selected by chat only where existing source authorization permits; review records remain creator-private.

## Browser voice conversation persistence (2026-11-05)
- The endpoint requires an authenticated session, applies per-user rate limiting, caps request bodies at 600 KB and validates UUID thread IDs, voice session IDs, turn count, roles, and part count.
- A client-selected existing thread is checked against the session user before any message write. New threads are created through the repository's ownership-guarded upsert, and message IDs are namespaced by the owned thread ID to avoid global message-ID collisions.
- Turn content is capped before persistence: serialized parts at 24 KB; oversized tool output is replaced, and long text is truncated. The UI persists only completed user/assistant turns and idempotently replays by stable IDs/signatures.
- Verification is currently route/contract mocks and unit tests. No database-backed ownership, browser teardown, live voice provider or actual transcript persistence journey has been run.

## Notification and Web Push controls (2026-11-05)
- Notification queries and read mutations include the authenticated user ID in database predicates; supplied ID batches cap at 100. Notification navigation accepts only same-origin root-relative paths.
- Push subscription endpoint is strict-schema validated, HTTPS-only and checked against DNS-resolved private/link-local addresses both when registering and before each delivery. Subscription p256dh/auth values are AES-256-GCM encrypted before database persistence; subscription writes fail closed when `ENCRYPTION_MASTER_KEY` is unavailable.
- VAPID delivery is optional; absent VAPID configuration disables sending. Expired 404/410 endpoints are removed through a user+endpoint predicate. Push exceptions do not alter scheduler outcomes.
- Contract tests cover input bounds and local navigation. Endpoint auth, PostgreSQL ownership/uniqueness, DNS guard regression and real browser subscription remain to be verified. Migration 0038 is unapplied.

## Physical voice-device pairing controls (2026-11-05)
- Pairing-code creation and device list/revocation require a user session and owner-scoped DB conditions. Codes expire after 10 minutes, are pepper-hashed, and are atomically consumed with device creation to prevent concurrent reuse.
- Device bearer tokens contain 256 random bits, are prefixed/length checked, and are only returned at pairing time; only peppered SHA-256 hashes are stored. Revocation changes status and active-token lookup rejects revoked rows.
- Pair requests have per-IP and per-code rate limits; request bodies are streamed and capped, with strict device-type/name/firmware bounds. `VOICE_DEVICE_TOKEN_PEPPER` is required and validated to at least 32 characters.
- Pairing/schema/credential tests and build/type checks are required for this batch. PostgreSQL race/ownership and physical-device tests remain unavailable; migration 0039 is unapplied.

## Voice device transcript endpoint (2026-11-05)
- The transcript route requires a valid active pepper-hashed device bearer token; ownership derives exclusively from that record. A device cannot impersonate another device or select an owner/thread.
- Calls are rate-limited per device. Request JSON is streamed with a 16 KiB cap and strict Zod schema limits session/event/text/language values. Event and thread identifiers are deterministic and scoped by device identity.
- Utterance content is stored as an ordinary user message in that user's chat thread. The endpoint does not call agent/MCP tools or execute transcript instructions. PostgreSQL ownership/idempotency and endpoint E2E are not DB-tested; migration 0039 remains unapplied.

## Voice device raw audio controls (2026-11-05)
- Audio ingress authenticates an active device token before reading audio, throttles per device, rejects unsupported MIME, validates strict bounded session/event metadata, enforces a streamed 1,000,000-byte cap before concatenating chunks, and checks RIFF/WAVE magic bytes.
- Audio is forwarded server-to-server to the preconfigured Sarvam proxy; proxy credentials remain server-side. Raw audio is not stored. STT output is capped and persisted as an ordinary owner message with stable device/session/event identifiers. Transcript text is treated as untrusted and no MCP/agent tool is executed by this route.
- Tests cover malformed/oversized audio, auth, throttling, request metadata, no persistence on STT failure, and safe provider errors. No hardware or provider live call was made.

## Desktop MCP security and integration audit (2026-11-05)
- Reference Electron has safe renderer defaults (contextIsolation, sandbox, disabled Node integration) and restricts navigation, but mcp-ipc.ts does not inspect the IpcMainInvokeEvent sender or validate IPC payloads. mcp-spawner.ts accepts renderer-supplied command/args/env, starts local stdio processes, and its allowlist is tool-name-only. A malicious process can implement an allowed read tool or return sensitive file contents. Error messages are copied into local audit metadata.
- The default deny-list policy does reduce accidental write-tool calls, but it is insufficient to treat the raw process bridge as safe for unchanged reuse. Main-process origin/frame checking, server-config confirmation, command/env policy, bounded output, tool-result review, and error redaction are required before implementation.
- In the upstream UI, the bridge is invoked in the MCP server testing screen; searches found no server-side chat/agent dispatcher callsite. Therefore the feature is local MCP testing, not desktop MCP use by cloud agent runs.
- Void-Agent has no native desktop runtime, and its hosted route intentionally rejects stdio. F021 remains MISSING; an isolated Electron companion plus compatible system-browser auth handoff is technically feasible and is now prioritized. No files in Void-Agent-V2 were changed.

## Desktop MCP and OAuth handoff controls (2026-11-05)
- The primary desktop renderer uses context isolation, sandbox, disabled Node integration, and same-origin navigation. Its IPC methods require the exact BrowserWindow, main frame, configured origin, and the MCP test path.
- Renderer-provided stdio config is bounded and rejects reserved inherited environment keys. Users approve process launch natively and approve each tool call separately. Native prompt text does not imply that a server's tool name is trustworthy; it explains that the local process can access resources available to the desktop account and that output is returned to the Void-Agent origin.
- Tool names are default-deny with a narrow read-style allowlist; this does not make an untrusted process safe. Output schemas/results are capped and audit logs contain only hashes. MCP operation timeouts close the client/transport in the cleanup path.
- OAuth handoff binds an allowlisted provider request to 192-bit random state, five-minute expiry, safe same-origin return route, and a single-use hashed Better Auth token. The desktop validates the deep-link scheme/state before exchange. Live OAuth, native prompts, code signing, and update flows remain unverified.
- No local stdio is exposed to hosted chat/agent APIs. No production credentials, deployment, or reference repository changes were used.

## Gmail effect approval controls (2026-11-05)
- The browser approval endpoint requires a current user session, matching Origin/request origin, bounded JSON and per-user rate limiting. It returns a random 256-bit token with `Cache-Control: no-store`.
- Persistence stores a one-way token digest and canonical payload digest in the existing Better Auth verification table, namespaced by user. The raw bearer is not stored. Expiry is ten minutes; stale approvals for that owner are pruned on issuance.
- Consumption is an atomic delete filtered by user-scoped token digest, exact canonical payload digest and unexpired timestamp. Concurrent/repeated use cannot return more than one row. Gmail send/reply requires successful consumption before sending; reply also compares the approved subject with the Gmail source message.
- Recipient validation, subject CR/LF rejection, body and input bounds, message ID character restrictions/path encoding, and same-origin issuance reduce header/path abuse. Provider credentials remain server-side.
- The same approval gate does not yet cover all mutating connector tools or arbitrary MCP tools. Do not claim global side-effect approval parity.

## Project graph chat tool review (2026-11-05)
The project graph search tool is constructed only for a project chat and rechecks workspace membership at execution. It intersects the thread collection scope with current project attachments, includes only source items owned by current project members and still marked ready, and queries only accepted facts. It caps candidates/results and emits source/evidence for traceability. No raw source is returned and no write operation is exposed. Remaining verification: database-backed row scope, membership revocation under Postgres, and authenticated browser chat.

- Defense-in-depth follow-up: project graph results are now filtered again in application code against accepted review state, ready status, current attached collection IDs and current collection owner IDs. Focused tests and typecheck pass; Postgres-backed membership revocation remains unverified.


## AssemblyAI streaming dictation security review (2026-11-06)
- The account API key is read only on the server. Token issuance requires a signed-in session, exact same-origin POST, per-user rate limiting, a fixed AssemblyAI HTTPS endpoint, 10-second timeout, and token type/size validation. Token and availability responses are private/no-store.
- The browser receives only a provider-issued short-lived token; audio is sent over WSS directly and is not uploaded to Void-Agent or stored. Final transcript events are parsed, bounded, deduplicated by turn order, appended to the draft, and never auto-submitted or executed as commands.
- Validation uses mocked provider responses. A live AssemblyAI account/browser session and actual provider data-retention settings were not reviewed; the service must be configured/approved by the operator before use.

## Project brain queue security review (2026-11-05)
- The request path authenticates, requires project editor/owner role, enforces per-user rate limits, and selects only a ready source in an attached collection currently owned by a project member.
- The worker rechecks the requesting user's current project role, attached collection IDs, collection owners, source readiness, and content fingerprint immediately before model use. Revoked access or changed source fails closed.
- PostgreSQL `FOR UPDATE SKIP LOCKED` prevents concurrent workers claiming one run; five-minute stale recovery avoids permanent orphaning. Model execution is limited to 45 seconds. Result facts and run status commit atomically. No source text or raw provider error is saved to run rows.
- Migration 0040 adds a requester FK and queue index and backfills old runs to the project owner; it is not applied to any database. PostgreSQL-backed authorization, row-lock, and retry races remain unverified.

## Google Calendar effect approval review (2026-11-05)
- Calendar event create/update/delete require a signed-in same-origin approval issuance call with bounded strict schema, per-user throttling, and a ten-minute random token; only token/payload hashes are persisted in Better Auth's existing verification table.
- The connector consumes the token atomically, bound to current user and exact canonical payload. Missing, changed, expired, foreign-user, or replayed tokens do not call the provider.
- Update fetches the current event, then PATCHes with its ETag via `If-Match` when present. Delete requires the reviewed event ID/title/start/end to match the current provider representation and conditionally deletes with `If-Match`. Only the explicitly reviewed fields are changed.
- Unit tests mock the provider and approval repository. Live OAuth permissions, Postgres one-time concurrency, provider ETag behavior, and browser review journey are not verified. The current flow does not yet support all-day events.

## Automatic project-brain enqueue security addendum (2026-11-05)
- Trigger runs only after the authenticated collection repository confirms ownership and a persisted ingest succeeds. The queue helper separately confirms the requester currently owns the source collection and may edit a project with that collection attached.
- Auto-enqueue attempts are capped at 30 per user per hour through the shared rate-limit repository; only one queued analysis is processed per scheduler tick. Source text is bounded and fingerprinted, and worker authorization/source checks remain mandatory immediately before inference.
- Queue errors are logged but do not reverse a completed knowledge ingest. The endpoint response exposes queue count/cap status without provider details or document contents.
- The shared limiter may use per-instance memory if the deployment has no configured shared Redis backend; multi-instance enforcement therefore depends on deployment rate-limit configuration. No live Postgres or multi-instance verification was available.

## Linear issue approval security review (2026-11-06)
- Issue creation requires a signed-in same-origin request, bounded strict schema, per-user issuance rate limit, and a 10-minute random opaque token. Only token and payload digests are stored in the existing verification table.
- The Linear connector atomically consumes the token bound to the current user and exact team/title/description before calling the provider; changed, missing, expired, foreign-user or replayed approval does not issue a mutation.
- The Linear state filter is parameterized as a GraphQL variable, removing raw user/model text interpolation from that query. Numeric page size remains bounded by the tool schema.
- Provider calls and Postgres concurrency were tested with mocks only. No live Linear OAuth or browser approval journey was run. The shared rate limiter can fall back to instance-local memory when shared Redis is absent; configure shared rate limiting for multi-instance deployments.

## Slack message approval security review (2026-11-06)
- Slack posting requires an authenticated same-origin bounded request, per-user rate limiting, and a short-lived opaque token. Only the token and canonical payload digest are stored.
- The connector consumes the token atomically for the current user and exact channel/text before the external request. A changed or replayed draft cannot reach `chat.postMessage`.
- The configured Slack OAuth authorization requests `chat:write`; provider errors or missing permissions return an error and are not reported as success.
- Tests mock provider/repository behavior. Live Slack permission and token replay races are not verified; absent shared Redis, the existing limiter fallback remains instance-local.

## Project-brain extraction provenance hardening (2026-11-06)
- The source remains wrapped as untrusted content and the model receives no tools. Extracted triples require a bounded evidence excerpt, and the adapter rejects every quote that is not present in the source under case/whitespace normalization before any database write.
- Entity IDs are constrained and deduplicated; relations must connect two emitted entities and cannot be self-referential. The output is capped at 40 direct claims, 30 entities, 60 relations and 100 normalized review facts.
- Existing project editor/owner checks, source collection-owner checks, ready-item checks, fingerprint revalidation, bounded model timeout, queue lease, and human fact review remain in place. Live model output and PostgreSQL worker behavior are still unverified.

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

## Security review — Zendesk approval (2026-11-06)
- Zendesk `add_comment` fails closed without an owner-bound single-use approval matching the exact positive-decimal ticket ID and bounded comment. The token is consumed before provider mutation; only digests are stored.
- Issuance requires an authenticated session, same-origin request, per-user rate limit, strict bounded JSON, and no-store response. List/get/search remain read actions.
- No live Zendesk API or PostgreSQL replay-race verification was available. Other connector, MCP, and workflow mutations remain under review.
## Security review — Freshdesk writes (2026-11-06)
- Freshdesk ticket creation and replies fail closed unless the current user consumes a single-use token bound to the exact operation. Requester identity, ticket target, content, status and priority are validated and reviewed.
- Token storage holds only hashes. Issuance is authenticated, same-origin, rate-limited, strict, body-bounded, and no-store. No live Freshdesk/PostgreSQL verification yet; other external mutation paths remain to audit.
## Security review — external messages (2026-11-06)
- Teams, Discord and Zulip message sends now require user-reviewed, owner-bound, one-use approval tokens matching the provider and exact destination/content; Zulip also binds the topic. Tokens are digest-only in storage and are consumed before provider calls.
- Approval issuance requires login, same-origin, rate limit, strict bounded schema, and no-store response. Existing read/list operations are not routed through approval. Live provider or PostgreSQL validation remains unavailable.
## Security review — Asana and ClickUp task writes (2026-11-06)
- Task creation fails closed unless the current user has approved the exact provider, numeric project/list ID and task fields. The write connector consumes a one-use digest-backed token immediately before mutation. Existing read operations are unchanged.
- No live Asana, ClickUp, or PostgreSQL replay-race verification was available. Other external mutation surfaces remain in the audit.
## Security review - Productboard feature creation (2026-11-06)
- Productboard create is gated by strict bounded reviewed fields: URL-safe product ID, trimmed feature name/description, provider identity, digest-backed one-use token, and current user. The token is consumed before outbound POST; stale, altered, missing, or replayed approvals are rejected.
- The desktop MCP review confirms native prompts and main-process checks; tool-name allowlisting is only a guardrail because a local MCP server can misrepresent behavior. The user is warned to trust the executable/configuration. Cloud chat/agent does not execute local stdio MCP.
- No live provider, PostgreSQL, browser, or desktop runtime check was performed. Continue the MCP and workflow effect audit.
## Project-brain expert routing review (2026-11-06)
- Routing requires an authenticated project session; the existing API restricts facts to project-attached collections, current collection owners and ready sources before the helper runs. The helper uses accepted facts only for person types, aliases, target matching and links.
- Query input is bounded to 160 characters and rejects control characters before project/database work. Output is capped at five people and five supporting facts per person and returned with `cache-control: no-store`.
- UI labels results as accepted source-backed connections and states these do not verify expertise. No new secret, external execution, schema, or authorization path was added.
- Coverage is unit/API mocked only; live PostgreSQL and browser authorization/source-visibility checks remain pending.

## Windmill/Activepieces run approval boundary (2026-11-06)
- Direct app-default automation `run` now fails closed without authenticated user context and a current single-use token that matches platform, exact target, and full canonical JSON payload. User identity is part of token storage key; only token/payload digests are stored. The token expires in ten minutes and is consumed before `fetch`.
- Issuance requires same-origin, applies per-user rate limiting, bounds JSON input and returns `Cache-Control: no-store`. `list_scripts` and `list_flows` are read-only.
- Tests verify missing/rejected approval makes no external request and exact approval is consumed first. No live external service/PostgreSQL validation.
- Open gap: a reviewed workflow may itself perform broad downstream actions; app approval only proves the user approved the invocation payload. Separate saved workflow MCP nodes and direct MCP execution paths remain under audit.

## Direct remote MCP execution review (2026-11-06)
- Chat-loaded remote MCP tools require a user-bound, exact server/tool/full-arguments authorization token. The wrapper strips the token and forwards only the approved arguments. Missing user context, malformed payload, expired/replayed/changed token, or repository failure returns a structured error before the MCP client call.
- Token and payload digests only are stored in the verification table. Issuance is authenticated, same-origin, per-user rate-limited and no-store. Manual tool execution requires the existing explicit confirmation, then issues and consumes the exact token through the same wrapper.
- Focused tests verify the effect callback never runs without a valid consumed token. No live MCP provider/PostgreSQL/browser replay test.
- Open gaps: workflow graphs can call MCP clients directly; voice sessions and standalone MCP testing have separate dispatch actions. Review these before claiming MCP-wide enforcement.

## Saved workflow execution approval (2026-11-06)
- Saved chat workflow execution now fails closed unless the current user can execute the currently published workflow and consumes a short-lived exact-input token before graph execution. Workflow name/UUID, input payload, and approval token field are bound to the token digest.
- API issuance is authenticated, same-origin, rate-limited, body-bounded, and no-store through the existing approval path.
- Open risks: review card does not show internal workflow side effects; workflow graph revision is not bound across review and execution; voice and standalone MCP test UI are separate client-triggered paths. Do not describe MCP/workflow security as complete.
- No live PostgreSQL token replay/race, browser approval journey, or external MCP workflow was available.

## Voice and standalone MCP review (2026-11-06)
- OpenAI Realtime, Groq/Konvo, and ElevenLabs voice MCP calls now pause for an explicit confirmation of server/tool/exact JSON arguments, receive an authenticated same-origin rate-limited token, and dispatch through a server action that checks current user access and consumes the user/server/tool/payload-bound token before the MCP call.
- Approval issuance verifies current MCP server UUID/name and owner/public/admin access. Voice provider schemas do not expose the private approval-token field. Direct remote MCP test-page calls use the same gate; local desktop stdio retains native consent and local execution.
- Tests cover exact prompt contents, rejection without token request, error without token, server-access checks, and token consumption helper behavior. Live provider identity, browser UX, PostgreSQL replay races, and external server effects remain unverified.

## Workflow action preview, revision binding, and HTTP SSRF (2026-11-06 04:56 IST)
- Saved-workflow approval now shows a server-derived manifest containing tool/server labels and HTTP method/host only. Paths, query parameters, headers, bodies, and credentials are not included in the manifest.
- Issuance checks current execute access and exact graph revision. Execution reloads the graph, checks current access/publication/name, hashes the graph deterministically, and consumes the token bound to that revision and exact input.
- Workflow HTTP nodes require HTTPS, a DNS-resolved public destination, and do not follow redirects. IPv6 mapped/NAT64 private addresses and multicast/malformed addresses are rejected by the shared guard.
- Limitation: DNS is resolved for validation and later resolved again by fetch; this leaves a DNS rebinding race. No DNS-pinned transport is implemented. Other workflow execution surfaces remain to be audited.
- Verification: focused approval/review/URL-guard suites passed (23 tests), typecheck passed. No live DB/browser request test.

## n8n workflow execution route (2026-11-06)
- The execution endpoint now checks the caller's session and exact Origin, validates the workflow ID, applies a user-keyed rate limit, and fetches the workflow through that user's n8n client before triggering execution.
- Unavailable workflow IDs are not dispatched. Unexpected n8n/network errors return a generic no-store error without returning upstream messages.
- Verification: route tests cover access-before-dispatch, unauthenticated/cross-origin/malformed/rate-limited calls, and inaccessible workflows. Live n8n testing remains outstanding; internal workflow effects cannot be inspected by this route.

## Saved workflow embedded MCP authorization (2026-11-06)
- A published workflow no longer inherits permission to call the workflow owner's private MCP server on behalf of a different user. Preview, issuance and execution each compare all graph MCP server references with the requesting user's accessible servers.
- Access is revoked immediately if the connection is removed, becomes private to another owner, is disabled, or is renamed from the graph's reviewed identity. The guard fails before approval consumption/dispatch.
- Tests cover available server, unavailable/private server, disabled and stale-name references; execution does not consume token for inaccessible server.
- No live MCP/PostgreSQL/browser verification. Tool parameters are still generated within workflow execution; higher-level graph approval identifies the tool but cannot display runtime-generated arguments.
## Project-brain source authorization recheck (2026-11-06)

- Brain overview reads constrain runs and facts through ready source items, attached project collections, and current collection-owner membership. Detached or no-longer-authorized source history is excluded and responses are no-store.
- Conflict review repeats the source check in the row-locking transaction before either claim is updated; the reviewer must also have current editor/owner project access.
- Regression coverage asserts collection ID, collection owner, and source-ready SQL predicates; an empty-source project cannot open a mutation transaction.
- Limitation: no live PostgreSQL role/detach race test was available. New project-brain data surfaces must apply the same policy.
### Project-brain identity ambiguity

Expert routing no longer maps a shared accepted alias to whichever claim happened to be processed last. It refuses ambiguous alias resolution and includes a regression test. Human review and canonical typed page/merge semantics remain necessary to prevent broader entity identity errors.
## Typed page and alias access controls (2026-11-06)

- Typed pages are listed only through an accepted identity fact joined to a ready source in a currently attached collection owned by a current project member. Alias rows are joined back to their accepted source fact and filtered through the same source boundary.
- Extraction creates page identity only after source-quote grounding. Cross-type title ambiguity does not attach claims to arbitrary pages. Manual merge mutations are not yet implemented; apply editor authorization, same-origin protection, rate limits, row locking, and current-source validation when adding them.
- Migration `0042` is additive and unapplied. No live PostgreSQL migration or role-change race was tested.
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
## F019 resumable-stream security update (2026-11-06)
- Resume HEAD/GET verifies a current authenticated session and exact chat-thread owner before reading the active stream pointer; responses are no-store. Stop POST checks session, UUID, same-origin, thread owner and per-user rate limit before signaling. Redis write errors fail visibly with a generic 503; client notification does not disclose Redis details.
- Remaining security/reliability verification: live Redis ACL/network boundaries, browser reconnect journey, and cross-instance stop behavior. No live Redis or production environment was accessed.
## Voice device commands — security comparison (2026-11-06)
- Reference's audio-command implementation can trigger model-classified side effects directly from device speech. Void-Agent instead validates enrolled-device auth, WAV signature/size/content-type, rate limits and idempotency, then writes the transcript into the authenticated device owner's chat for review; tool and external mutations retain normal approval gates. This intentionally preserves stricter user consent. Persistent session/segment event history is not yet implemented.
## Voice session security update (2026-11-06)
- Voice session APIs derive owner and device exclusively from the enrolled bearer token. Session lookup is scoped by device and owner; transaction row locks serialize segment writes and finalization; unique `(session,event)` and `(session,sequence)` constraints prevent replay/reordering ambiguity. Segment fields are strictly bounded, session size capped at 500 events, final transcript capped at 24k characters, and responses are no-store/rate limited.
- Finalization only persists text in that owner's chat for review; it does not invoke task/workflow/agent/tool execution. No raw audio is stored. Review SQL and actual locks against local PostgreSQL remain pending; migration 0043 has not been applied.
## F026/F027 owner-facing persisted session history (2026-11-06)
- Added a user-session-authenticated, rate-limited, no-store owner API for recent voice-device sessions. Repository query scopes by device and owner and returns no more than 50 sessions with at most 24,000 transcript characters each.
- Device dashboard history now loads both saved reviewable chat transcripts and persisted audio sessions, showing session status, segment count, timestamps, and transcript text.
- Focused sessions/history route tests passed 5/5; focused Biome formatting completed. Full typecheck is running; no PostgreSQL/device/gateway/browser test. F026/F027 remain PARTIAL because firmware/gateway transport is not present and no live integration has been verified. No migration applied, push or deploy.

## F018 attachment ownership and archive parsing review (2026-11-06)
Added defense-in-depth for new document ingestion: owner IDs are validated before entering storage prefixes; path parsing rejects traversal/control characters and protocol-relative forms; chat and ingestion APIs refuse managed files outside the signed-in owner's prefix; direct uploads have size/type constraints; office extraction enforces attachment, decompressed archive, and text limits, and checks OOXML XML prologs against DTD declarations before parser use. Parser errors are returned generically.
Limit: existing storage objects are public under the prior storage design. Prefix checks constrain privileged server-side ingestion, but do not turn public links into private ACLs. Legacy globally keyed objects are denied to the model because ownership cannot be established. No live multi-user storage/browser or hostile remote storage verification was available.

## F010 queued source revision integrity (2026-11-06)
The exact bounded source supplied for analysis is now persisted with the project/source fingerprint and reused by workers. Application code verifies fingerprint/content agreement before insert and before consumption; database constraint caps snapshot characters; NULL legacy snapshots are recovered only after current content reproduces the original fingerprint. A job still requires current project membership, collection attachment/ownership, and a ready source item. Version listings continue to select metadata fields only and do not expose snapshot text. Residual review: PostgreSQL constraints/locking and multi-worker access have not been exercised against a live local database; migration 0044 is unapplied.

## F010 revision text access controls (2026-11-06)
Source snapshots are not included in the normal brain overview response. A dedicated read endpoint rechecks session and project membership, current attached collection IDs and their current owners, and requires the source item to remain ready. It loads one version only, enforces a 60k character cap, validates the source fingerprint and length, rate-limits per user, and sends `Cache-Control: no-store`. A detached collection or removed owner loses access immediately. No live Postgres/browser test has confirmed the query behavior; migration 0044 remains unapplied.

## F021 desktop navigation/download boundary (2026-11-06)
- The configured app origin is compared exactly; only allowlisted export route shapes are classified as application downloads. HTTPS/mailto are the only external schemes opened in the OS handler; all other schemes are blocked.
- Download filenames are sanitized to a basename before path joining. Query strings and fragments are excluded from diagnostic URL labels to avoid leaking signed tokens.
- Focused policy tests cover lookalike hosts, unsafe schemes, path traversal names, and secret-bearing query strings. No actual Electron runtime download was exercised.


## F014 citation output constraints (2026-11-06)
Citation prompts now require exact quotes found in the provided source and tell the model not to invent references. This is a model instruction only; output is not validated against byte/character offsets, so the UI must not represent citations as verified source anchors.


## F010/F011 project brain task proposals (2026-11-06)
- Untrusted source text remains explicitly framed as data; extraction cannot call tools. Tasks are bounded (max 15 per source analysis), exact-evidence filtered against the source snapshot, and deduplicated by title/evidence per run.
- Reads require project access and current attached collection membership, collection owner visibility and ready source state. Mutations require editor role, rate limit, visible ready source, and conditional valid transitions (proposed → accepted/rejected; accepted → completed). External actions are not invoked.
- Auth/route behavior is mock-tested only; additive migration 0045 is unapplied and no PostgreSQL race/transaction test is available.


## F010 connector-sourced project brain boundary (audit, 2026-11-06)
Primary has no project-bound connector sync yet. Any implementation must not treat a user's existing chat connector credential as blanket project authorization. Bind connector use to the attaching credential owner and require that owner to remain in the project; revalidate ownership/current account/server on every sync; allow only explicit read-only operations; keep tool errors out of extracted project facts; bound result size and tool steps; retain source version/provenance; and ensure detach stops future runs and hides stale source-derived records where required. No connector sync was added or executed during this audit.

## Project MCP source-sync controls (2026-11-06)
New sync routes recheck project access and collection attachment, server ownership/enabled state, and current credential-owner project membership. Only the credential owner can initiate MCP reads; editor attach requires own server and own collection; tools must remain in the stored allowlist and currently advertise readOnlyHint=true; caller arguments are validated against a bounded JSON Schema subset; request count/output/strings are bounded; text errors and non-text results are excluded; sync is rate limited and idempotent. Detach transactionally deletes connector-generated collection items, cascading brain facts/todos/versions/runs. MCP readOnlyHint remains advisory and the user explicitly chooses each read; no arbitrary write tool is called. Migration 0046 is not applied and DB/browser behavior is unverified.
### Verification update (2026-11-06)
Attach authorization and read-only discovery boundaries now have route tests; helper tests cover schema constraints, result bounds/errors and allowlist annotation checks. Remaining verification risk is transactional sync/detach behavior on PostgreSQL and current-owner revocation races; no migration was applied to a live DB. Existing in-memory rate-limit deployment warning remains.

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

### F012 conflict audit security (2026-11-06 11:18:20 +05:30)
Conflict resolution remains editor-only and locks both facts after scoping by project, currently attached collection ownership, and ready source status. Conflict history is written transactionally with fact status changes; both fact references cascade on deletion and actor reference is set null on account deletion. The migration is not applied. No cross-user/live PostgreSQL verification was performed.


### F012 classifier and graph visibility controls (2026-11-06 11:42:40 +05:30)
The classifier receives only bounded factual pairs with evidence excerpts and has no tools; source text is explicitly treated as untrusted. Decisions refer to bounded numeric indexes and are checked against candidate count, with duplicate/out-of-range entries discarded. The worker catches optional classifier failure without invalidating successful extraction. API results include a stored contradiction only when both fact IDs are in the current visible set (attached collection, current member owner, ready source, non-rejected fact); editor writes retain the existing project role check, source ownership checks, row locks, and transaction. No live Postgres or provider call performed.


### F007 runtime provider authorization/configuration (2026-11-06 12:04:47 +05:30)
All server model call sites now await registry hydration before resolving a provider. Hydration honors dynamic provider enabled=false, removes deleted/invalid providers, and prevents dynamic IDs from overwriting static or environment-defined providers. Successful admin mutations invalidate provider and runtime-config caches; generation checks prevent a stale in-flight config read from undoing that invalidation. The model list route remains session-protected. No API key material is returned; only the configured boolean is included in the existing authenticated metadata.


## F027 OTA device enrollment security notes (2026-11-06)
- Pairing code and bootstrap secret are stored only as peppered hashes. Completion requires registration UUID, activation code, and the independent 256-bit secret returned only to the device during initial OTA.
- User claim requires authenticated session, same-origin browser request, rate limits, strict bounded JSON, and supported-device registration lookup under row lock. Device creation + claim is one transaction.
- Long-lived device token remains hash-only in `voice_device`; the temporary delivery copy is AES-256-GCM encrypted, status reads do not return it, and a locked transaction clears it before one-time delivery. Owner status access expires abandoned registrations and revokes the undelivered device.
- Residual risks: cannot verify actual firmware storage/TLS behavior; an intercepted initial OTA response could expose its bootstrap proof; one-time delivery response loss requires revoking/re-pairing; rate-limit fallback is process-local when Redis is absent. No live database/hardware test.

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

## F021 desktop auto-update trust boundary (2026-11-06)
- Update metadata is read only from packaged electron-builder metadata. The feed parser enforces HTTPS and rejects credentials, query strings and fragments; updater activation is disabled in development or when metadata is missing/invalid.
- Renderer IPC verifies exact BrowserWindow, main frame and trusted origin. The renderer cannot set the feed or request arbitrary files. UI errors are generic; update download/install is delegated to electron-updater's platform signature checks.
- Release packages require configured Windows/macOS signing and feed validation. Credentials remain external to source. No signed artifact or signature-verification integration run was available; platform assurance remains unverified.

## F010/F012 active-source authorization and provenance (2026-11-06)
- Added an active-version table keyed by project/item. Current-state queries correlate the analysis run's version and item/project to that pointer before exposing or mutating derived claims. This prevents stale facts from older analyzed snapshots from being treated as current or used for knowledge retrieval, entity merges, tasks, and conflict resolution.
- Old fact evidence is retained and remains subject to existing project/source/member visibility checks. Historical version content remains available only through the existing revalidated on-demand source history path.
- New additive migration `0050` is not applied. Live database locking/backfill and transaction boundary behavior have not yet been reviewed; no production DB was touched.

### Source-item freshness guard (2026-11-06)
The active-source query guard requires `active_source.updated_at >= collection_item.updated_at`; callers cannot supply the timestamp. A later source-item mutation therefore removes old derived facts from current graph/knowledge/review/todo surfaces until its exact new revision is selected. Old evidence remains in history. This does not detect content changes that fail to update `collection_item.updated_at`, so ingest writers still need end-to-end review.

## F018 Vercel private Blob access control (2026-11-06)
- Private mode uses SDK-authenticated `get(pathname, { access: "private", useCache: false })` from the server storage driver. It does not expose Blob credentials to the client. Browser downloads continue through authenticated owner checks and no-store response headers.
- The configuration must correspond to a Vercel Private Blob store. Changing the flag alone neither converts an existing store nor revokes access to old public blobs. Operators must migrate/re-upload data and delete public originals before treating it as private.
- Unit mocks verify the selected access mode and private byte retrieval. Live bucket/store ACL checks remain required.

## F018 private S3 owner attachment handling (2026-11-06)
`FILE_STORAGE_S3_PRIVATE=true` changes owner-scoped object URLs returned by the S3 adapter to the app's owner-verified file route. The setting does not block public access at the bucket; the storage operator must enforce block-public-access/bucket policy and provision server IAM. Responses are handled by the existing session/owner check and private/no-store headers. S3-generated non-owner assets remain on their existing provider URL path. No live bucket policy was tested.

## Generic outbound HTTP tool review (2026-11-06 14:42 IST)
- Previously, the general HTTP tool could send arbitrary methods, headers, and bodies without user confirmation or URL filtering. It now fails closed absent a session-bound one-use approval for the exact URL/method/headers/body/timeout.
- The approval endpoint checks session, exact same-origin, per-user rate limit, bounded JSON and strict schema. Stored verification values are token and payload hashes; approvals expire after five minutes and are atomically consumed.
- The request is restricted to HTTPS and the shared public-address guard; redirects are disabled. URL credentials remain visible to the user in the review UI. Headers, body, timeout, and response size are bounded; host/connection/content-length/transfer-encoding/upgrade/proxy headers are refused.
- Residual risk: validation resolves the DNS name before fetch, while Node fetch performs a separate connection-time lookup. A rebinding race is not eliminated until the validated address is pinned at the transport layer. Do not treat this as a complete SSRF proof.

### DNS rebinding mitigation for generic HTTP (2026-11-06)
The generic chat HTTP executor no longer validates one DNS answer and then permits the transport to resolve the hostname again. It pins the HTTPS connection to one of the fully validated public answers while retaining the approved URL hostname for TLS name verification. A bounded DNS lookup, redirect non-following behavior and mock verification are in place. This does not automatically change the distinct webhook delivery transport; review that path separately if extending DNS pinning to all user-configured egress.

## Project-brain revision provenance controls (2026-11-06)
Facts now reference an immutable source revision directly, with a composite DB FK binding source-version ID to the same project and collection item. Historical facts are backfilled from their own run. Existing active-source and item-freshness predicates continue to govern current reads, so provenance does not authorize stale claims as current. Migration 0051 is additive/unapplied; verify its data backfill and constraints on disposable PostgreSQL before use.

### F010/F012 contradiction decision history (2026-11-06)
- Added a read-only closed-decision history view with source revision provenance (revision ID/time, filename, and the evidence stored on each decision's facts). Existing source-content snapshots are not returned.
- Kept the reference-compatible GET contract: GET /brain/contradictions returns open contradiction candidates for currently active source revisions; GET /brain/contradictions?history=true returns closed decisions, including decisions whose source revisions are no longer current. Both flows enforce project access, attached collection and owner visibility, and ready source status. Existing PATCH decision flow was not changed.
- Focused project-brain API/helper suite: 23/23 passed across four files. Root TypeScript no-emit passed after the final route-contract change. Previous project-brain source-lineage DB journal check passed; no schema changed in this batch.
- A fresh production build reached static generation 192/192 and final tracing, but its process handle expired before an exit code was captured. Treat this build as UNVERIFIED; rerun a fresh build before reporting it as passing. No PostgreSQL/browser workflow or migration 0051 application was performed. F010/F012 remain PARTIAL.

### Current migration focus — project-brain dream cycle audit (2026-11-06)
- The reference's manual/nightly dream cycle consists of model-judged page deduplication, cross-source contradiction detection, salience recomputation, and stale-page archival; it records stage metrics and warnings and is separate from source extraction/consolidation.
- Void-Agent has source-version-aware facts, conflict review/history, graph reads, and an audited editor-driven same-type page merge. It does not yet have an equivalent project-wide dedupe/salience/archive scheduler or a verified end-to-end dream cycle. No work on this feature should overwrite user-reviewed fact decisions or auto-merge identities without evidence and review.
- Next action: implement compatible salience refresh and safe stale-page handling in Void-Agent's existing typed-page/fact schema, with project/source visibility checks, role/rate limiting, tests, and explicit UI trigger; then assess whether model-judged automatic dedupe is safe given its user-approved identity merge contract.

## Project-brain salience endpoint review (2026-11-06)
The salience POST requires a signed-in project editor/owner, same-origin request, and per-user rate-limit allowance. It derives collection IDs and owner IDs from server-side project access; SQL independently restricts source rows to those collections/owners, ready status, accepted facts, the currently selected source revision, and a source-state timestamp no older than the source item. The update mutates only page salience; it does not reveal source snapshots or automatically merge/archive identities. Route and SQL scope regression tests pass. No PostgreSQL execution or browser test was available; do not interpret the unit query-shape tests as DB authorization verification.

## Page-pair identity review controls (2026-11-06)
Page-pair “not duplicates” decisions are accepted only from a signed-in editor/owner via same-origin PATCH, bounded JSON, and rate limit. Before persisting, the route requires both page IDs to be active, same-type identity pages with accepted facts backed by the current source revision in an attached ready collection owned by a current project collection owner. Candidate GETs are derived only from already scoped visible pages and bounded saved review rows. Merges remain separately user-confirmed and revalidated in the merge transaction. Tests cover origin/role/malformed/inaccessible cases and SQL scope. Migration 0053 is not applied; production PostgreSQL behavior remains unverified.

## Stale page archive/restore security review (2026-11-06)
Both listing and mutation derive project scope from server-side access. Archive/restore require authenticated editor/owner access, same-origin PATCH, bounded JSON, and per-user rate limiting. Archive candidate and mutation SQL require attached collection/current owner, source item ready, historical source association, page age >=30 days, unmerged/unarchived page, and no active accepted identity fact. Restore SQL requires archived/unmerged page and active accepted identity fact under the same live source scope. The mutation predicates are evaluated in one SQL statement to reject stale/concurrent decisions. Only archived_at changes; facts/content are retained. Unit/query-shape tests and mocked route tests pass. PostgreSQL concurrency and browser behavior remain unverified.

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

### Project status synthesis security notes (2026-11-06)
- Read access requires project membership and uses current attached collection IDs/current collection owners, ready source items, accepted facts/tasks, and active source revisions. Snapshot lookup binds project and exact evidence fingerprint; private summaries are returned with Cache-Control: no-store.
- Generation requires same-origin plus editor/owner authorization and a per-user rate limit. Prompt treats all source/project text as untrusted; AI has no tools or mutation path. Output is schema-bounded. No credentials or raw source documents are sent; bounded claims/evidence and labels are included for the configured model provider.
- Migration 0054 is local and unapplied. No live database, provider, or browser validation was performed. Existing rate limiting falls back to per-instance memory without Upstash; production multi-instance deployments need shared Redis for robust enforcement.

### Project-brain task transitions (2026-11-06)
- The todo transition endpoint now requires a same-origin PATCH and includes active-source-revision validation in its conditional UPDATE, in addition to editor authorization, attached-collection/current-owner visibility and ready-source checks. The source-state predicate closes the stale-source race between preflight visibility and task status mutation.
- Focused regression coverage checks absent/cross-origin Origin rejection and SQL active-source-state filtering. The check is code/mock verified; no concurrent PostgreSQL race test was run.

### Consolidated project task updates (2026-11-06)
- Added grouped task completion with a strict bounded ID list and bounded JSON reader. Caller must be authenticated project editor/owner and same-origin. Preflight verifies active source revision, attached collection, current owner, ready source and accepted status. Every requested task must have the same normalized title/detail; similar tasks cannot be merged by this route.
- Conditional update repeats project/status/source revision and source visibility checks inside a transaction. A partial result throws and rolls back, preventing only part of a displayed group from completing after concurrent source changes. Existing per-task review path retains the same-origin and active-revision checks.
- Focused tests cover hidden/stale/mixed identities, cross-origin, oversized request, and transaction rollback. No live PostgreSQL race test was available.


### Scheduling dashboard and run history (2026-11-06)
- Dashboard reads use existing user-scoped job APIs. Run history verifies the parent job belongs to the session user before selecting runs, validates UUID and clamps the requested limit to 100.
- The API omits stored output and provider error messages to avoid exposing prompt/connector details in the management view. UI mutations use existing owner-scoped PATCH/DELETE handlers; no new execution endpoint was introduced.
- Mock API tests cover authentication, owner scoping, bounded limit and unauthorized job handling. No live PostgreSQL access-control test was available.



### Schedule creation UI follow-up (2026-11-06)
- Schedule creation submits bounded title/prompt/cron or one-time timestamp to the existing authenticated endpoint, which validates normalized job input and persists under the session user. The UI adds no direct execution capability. One-time values are converted to explicit UTC ISO; recurring cron operates in UTC.
- Browser behavior and PostgreSQL persistence were not runtime-verified.



### F024 scheduler diagnostics and edits (2026-11-06)
- Diagnostics requires a session and queries jobs using that user ID; response is private/no-store and exposes only Boolean secret/config presence plus scoped due-state metadata.
- Schedule create, edit, pause/resume and delete require an Origin matching the request origin. Edit reads the job by both ID and session user before normalization/update. Run history and diagnostics never expose stored model output/provider error text.
- Tests cover missing/cross-origin mutation, cross-user job access, and secrets absent from diagnostics response. PostgreSQL concurrency/ownership behavior has not been runtime-tested.


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

### F018 stored-document preview security follow-up (2026-11-06 20:30:13 +05:30)
The new route derives a storage key from the optional upload URL and never performs an outbound fetch. It checks authenticated owner-prefixed keys before storage metadata/download, rate-limits per user, enforces a 5 MiB cap before and after download, bounds extracted content, and sends Cache-Control: private, no-store. Output is plain text (React escaping), not uploaded HTML. DOCX parsing now verifies archive entries against shared OOXML inflation limits before Mammoth extraction. Tests cover auth/ownership, unsupported formats, rate limiting and byte caps. External object-store ACL and public URL behavior are not verified here.

### F018 preview follow-up verification (2026-11-06 20:35:36 +05:30)
The URL-based identity helper parses only the pathname and query/fragment do not influence the extension. The parsed URL is not fetched; route ownership remains independently enforced. DOCX text-only fidelity is surfaced as partial. URL identity unit tests and route tests passed.

### Team-shared collection access controls (2026-11-06 21:12:22 +05:30)
Shared access is opt-in via a user-selected team. The API resolves current membership/role; submitted teamId alone is never trusted. New collection and item mutations require matching Origin. Viewers can read but cannot ingest; deletion requires creator plus writable membership and SQL rechecks membership at deletion. Collection/item lists use database membership predicates; collection source ingestion repeats authorization after parse/fetch before item creation. RAG applies exact collection IDs and an SQL membership/team-owner existence check, so revoked membership cannot be retained by stale client scope. Project routes limit shared collection attachment to the same team. No live Postgres/browser race test; project-brain older owner-ID filters remain a known scope gap. Migration 0057 only adds an index and was not applied.

### Project-brain source scope and credential boundary (2026-11-06)
- Project-brain source-owner expansion is constrained to collection IDs already attached to the authorized project and collection `org_id` equal to that project's team ID. Queries continue to require exact collection IDs and existing ready/active-revision/review filters.
- Active team membership remains the sole source for connector credential ownership authorization. A shared collection creator is never treated as an active member for MCP/Composio credential access.
- Queue creation still requires current editor/owner project access and an exact attached, ready item; the background processor rechecks requester access before analysis.
- Focused tests: 72 passed across 14 project-brain suites. Broader typecheck and production build are pending.

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

## 2026-11-07 security regression checkpoint

- Selected-project POST/DELETE/PATCH mutations now enforce same-origin requests; JSON mutations require `application/json` and a streamed 4 KiB cap, while DELETE rejects any body. Role/team authorization remains in place. Focused route tests passed (13/13).
- Notification href validation rejects raw/decoded backslashes and control characters and verifies resolved-origin equality both at creation and service-worker click handling. This closes the `/\\evil.example` normalization open redirect. Focused service-worker and notification tests passed as part of 30/30 tests across six files.
- Conversation archive export/import was reviewed: authenticated ownership, bounded body/rows/message lengths, strict text-only schema, new owner-bound IDs, same-origin import, and partial-import cleanup are present. No major issue found in the reviewed path.
- `cockpit_push_update` is bound to the current user, validates local hrefs, rate-limits and deduplicates events, and pushes only to that user's subscriptions. Push endpoint SSRF checks remain active.
- Full `pnpm check` and production build passed. No external live delivery, PostgreSQL, browser, or device tests were run; migration files remain unapplied.

## CreateAgent schedule approval review (2026-11-07)
- Approval boundary remains explicit: model output is only a proposal; the user reviews the recurring schedule before agent creation and scheduler POST. There is no autonomous creation from the model proposal.
- The schedule API requires a current authenticated session, same-origin request, bounded body/schema, and exact ownership of any referenced agent. It does not permit scheduling a publicly visible agent owned by another user.
- The durable idempotency hash binds user, agent, name, cron, timezone, trigger prompt, thread context, and exact one-shot time where applicable. On a lost response, same-key/same-payload returns the stored job; altered payload is 409; deleted job replay is 410 with a persistent tombstone. Migration 0061 must be applied before this path is usable.
- No new secrets or public credentials are introduced. No live PostgreSQL transaction/concurrency test or schedule worker execution was performed.

## F015 published-page security and data boundary (2026-11-07)
- Publishing requires same-origin authenticated POST, a per-user rate limit, bounded request/HTML bytes, strict input schema, validated slug, and ownership confirmation for republishing. Dashboard listing is owner-scoped; revocation is owner-scoped and does not disclose another user's page existence.
- Public page response is no-store and served from an unlisted opaque slug; `Content-Security-Policy` applies `sandbox allow-scripts` without same-origin, blocks network fetch/XHR, forms, frames, plugins and base URL changes, and disallows framing. `nosniff` and no-referrer are set.
- Remaining evidence gap: migration 0060 is not applied; no live PostgreSQL or browser security journey was run. The public URL is an unlisted bearer-style link and can be shared by anyone who has it; users must revoke to disable access.

## F025 model pin checkpoint (2026-11-07)
Model selection is implemented in the CreateAgent HITL proposal and runtime. The catalog endpoint is authenticated/permission-gated, no-store, and filters to enabled providers with runtime keys. Agent create/update APIs reject unavailable pins. Runtime uses only the access-scoped selected agent, applies its validated pin before provider resolution, records the effective model, and routes it through the team budget price gate. Stale pins receive a clear 409; unpinned/unauthorized selections preserve the requested model. The CreateAgent family remains PARTIAL due reference file bindings and integrated checks.

## F015 published-page storage quota follow-up (2026-11-07)
- Authenticated publishers are bounded to 50 stored snapshots per owner (approximately 100 MiB maximum HTML at the existing 2 MiB snapshot bound); each slug retains at most its newest 10 versions. Owner-scoped advisory lock precedes slug lock so concurrent publishes to different slugs cannot race the quota check. Existing active pages are never pruned; revoked snapshots may be reclaimed. A full owner quota returns HTTP 409.
- Upstream page-generation instructions explicitly require absolute HTTPS image URLs, so the public CSP continues to allow HTTPS/data images and HTTPS font/media assets. `no-referrer`, `connect-src 'none'`, and opaque-origin sandbox remain. Remote asset hosts can nevertheless observe viewer IP/request metadata; this is documented privacy behavior, not presented as hidden.
- Focused mocks verify quota/retention selection, route/tool errors, and lock use. No PostgreSQL concurrency test or public browser security journey was run; migration 0060 remains unapplied.


## F030 Stripe connection security review (2026-11-07)
- Restricted API keys are encrypted using the existing AES-256-GCM ENCRYPTION_MASTER_KEY helper. Connection projections never select or return encrypted values; decrypt happens only server-side during provider execution.
- Personal reads/changes are keyed by authenticated user ID. Team access resolves membership before lookup; members may read, while owner/editor roles alone may store, probe, or delete. Mutations require same-origin requests and API calls use per-user rate limits; request bodies are streamed and bounded.
- Egress is pinned to https://api.stripe.com/v1, GET-only, with bounded timeout, list pages, row counts and 2 MiB response bodies. Stripe response bodies are not included in errors/logs. No Stripe write or payout-creation action exists.
- Residual verification: migration 0063 is authored but unapplied; no PostgreSQL authorization test, authenticated browser workflow, or live Stripe restricted-key probe was performed. Security behavior has focused mock coverage only.

## F025 file binding security update (2026-11-07)
Treat every agent file binding as a read grant because server-side storage credentials download it into a sandbox. Validate new keys against the authenticated owner prefix, derive existing binding ownership from the stored agent (never request-supplied owner IDs), restrict carried-forward keys to prior bindings, normalize basenames, and bound count/bytes. For staging, preflight metadata and then enforce the byte cap while streaming; delete only safe names recorded in the sandbox manifest. Existing general file downloads retain their prior behavior. Tests cover ownership, bounds, idempotency, size rejection and stream cancellation. No live storage credentials were used; live sandbox isolation remains to verify.

## F021 desktop server-selection security review (2026-11-07)
- Existing profiles with browser data keep the compiled cloud origin; switching is initiated from a trusted native menu and does not clear cookies. Per-origin browser storage remains owned by Electron; after selection, process restart rebuilds appOrigin-dependent auth, navigation, download, updater, notification and MCP trust controls.
- The chooser's preload exposes only `serverPicker.choose`; it has no MCP, OAuth, updater or notification methods. The handler requires the active picker window, its main frame, and its self-contained data URL. The picker blocks navigation/window creation and uses a restrictive CSP.
- Production URLs must normalize to HTTPS origin without embedded credentials. Local HTTP is allowed only for loopback in development and stored HTTP is rejected in packaged startup. The selected origin must answer the primary health identity contract. The fetch is GET without cookies, disables redirects, times out after six seconds, and caps body reads at 8 KiB. Health status 503/degraded is accepted only with `service: flare-ai`; redirections and unrelated service markers fail closed.
- No change was made to local MCP per-launch/per-call consent, allowed tool names, process environment policy, bounds, or audit records. No remote/local tool execution was enabled by server selection.
- Remaining verification: malicious/legacy profile runtime, actual custom host, and packaged Electron UI have not been exercised; F021 remains PARTIAL.


## F030 Vercel connection security review (2026-11-07)
- Vercel API calls are pinned to `https://api.vercel.com`, reject redirects, use GET only, carry the token only in the server-side Authorization header, and have a 20-second timeout. No deploy, promote, cancel, or project mutation calls exist.
- Response streams are capped at 2 MiB before JSON parsing; team/project/deployment enumeration is bounded. Generic failures omit upstream bodies. Config is AES-GCM encrypted as one payload, and status/snapshot projections omit token and ciphertext.
- Personal records are user-scoped; team access checks membership and owner/editor permissions. Same-origin, body-size, and rate-limit guards protect mutation/test endpoints.
- Focused tests cover encrypted config/redaction, viewer restrictions, pagination/config/body bounds, malformed/oversized responses, and GET-only behavior. No live token, PostgreSQL authorization, migration, or authenticated browser validation was performed.

## F029 project health transition implementation addendum (2026-11-07 06:41:22 +05:30)
- Added a generic, deduplicated notification after a project-brain health snapshot is persisted and a known health transition is detected. Recipient resolution follows current personal/team/selected-project access and excludes former team/project members; text contains only the health transition, not project names, summaries, blockers, source content, or model output.
- Reference-equivalent project-consolidation todo digest remains absent; this is an additional health-transition producer, not full notification parity. F029 remains PARTIAL pending the consolidation pipeline, PostgreSQL-backed recipient/persistence checks, browser permission flow, and real VAPID delivery.
- Focused route/helper/generation tests passed 19/19 across 4 files; scoped Biome passed; full suite, whole-project typecheck, db journal check, and production build results are in docs/testing-report.md.

## F030 Vercel integration addendum (2026-11-07 06:41:22 +05:30)
- In addition to the verified Stripe slice, Void-Agent now has a read-only Vercel production-deployment panel for up to six configured projects, with latest status/date/URL and seven-day deployment error counts. Vercel config/token are encrypted as a single payload; migration 0063 remains additive and Stripe's existing secret column remains compatible.
- Egress is fixed-host HTTPS GET-only with redirect rejection, bounded response/time/team/project/deployment limits, rate/origin/body guards, and role-scoped team access. Focused Vercel tests passed 28/28 with scoped Biome and db journal checks.
- Website, Revolut, Superlog, SEO, unified multi-provider finance controls, live database, live provider, and browser workflows remain. F030 remains PARTIAL.

## Security verification addendum � 2026-11-07

- Saved workflow actions are summarized with bounded input/output details and secret redaction. Token issuance and execution both reject unreviewable effects; token consumption is one-use and revision/input-bound, and execute/MCP access is rechecked immediately before the workflow loads. Dynamic HTTP values, runtime LLM prompts, model-generated tool parameters and unknown nodes fail closed.
- Approved MCP results are serialized and capped at 1 MiB. Oversized, cyclic, or non-JSON results do not flow into user-visible chat output.
- Desktop MCP audit IPC requires the registered trusted main frame and expected origin/path; log reads are capped to 256 KiB, strict-schema validated and capped at 100 rows. Returned data omits raw process configuration, arguments and results.
- Slack workspace lookup is global by workspace ID, so the inbound path now verifies that the connector owner equals the configured inbound endpoint owner before parsing signatures or enqueueing work.
- Problem-report screenshots are restricted to allowed image types, bounded size/count and the authenticated user's storage-key prefix. Page URL context only stores same-origin URLs without query/hash.
- Title and agent-generation AI routes have bounded strict request bodies and per-user rate limits. A team-budget bypass is not solved by accepting request team IDs; agent generation remains outside the team ledger until trusted persisted team context exists.
- Tests verify route/unit boundaries, but no real PostgreSQL ACL/migration, provider secrets, desktop GUI, or browser push workflow was available. Migrations 0063�0065 are additive and unapplied.

## F030 Revolut security addendum (2026-11-07)
- Client private key and refresh token are serialized only into the existing AES-GCM encrypted config column; authorization codes are transient. Status responses expose only client ID and boolean credential-presence flags. Errors omit upstream response bodies and credential values.
- OAuth and API egress are pinned to Revolut production/sandbox API origins; redirects are rejected. Only the OAuth token POST and read-only GET endpoints are used. API reads enforce 15-second abort timeouts, 2 MiB streaming response caps, and 1,000-row/30-day bounds.
- Mutations require authenticated same-origin requests with bounded JSON and per-user rate limits. Team membership is required for reads; only team owner/editor may save, test, or remove credentials.
- Token cache keys hash the client/refresh credential tuple; concurrent refresh calls are coalesced in-process. This is not a distributed lock. No actual credential, live Revolut API, or PostgreSQL-backed ACL/migration test was available. F030 remains PARTIAL.

## F030 Superlog security addendum (2026-11-07)
- Superlog egress is pinned to `https://api.superlog.sh/mcp`; query/fragment, other host/path, non-HTTPS destinations and redirects are rejected. This avoids allowing a stored endpoint to target internal services.
- MCP response streams are capped at 1 MiB and each session aborts after six seconds. Tool arguments are filtered to declared schema properties; summaries cap incidents/services and truncate provider strings. Provider error bodies are not surfaced to users.
- The PAT is stored only in the existing AES-GCM encrypted config column and is omitted from status responses. Team reads require membership; only owner/editor can save, test or remove. Mutations enforce same-origin, body bounds, and rate limits.
- Mocked tests cover endpoint rejection, redirects and stream bounds; live Superlog/PostgreSQL/browser verification remains unavailable. Migration 0063 remains unapplied; F030 stays PARTIAL.
## Security verification — workflow effect previews and MCP (2026-11-07)
- Internal workflow approvals remain server-side, one-use, and bound to current graph revision plus exact input. Effect review suppresses approval for dynamic arguments, runtime prompt data, unknown node types, opaque/non-JSON bodies, oversized/deep bodies, and credential-like literals. URLs/headers/query/body structures are redacted before display; a hidden credential value causes fail-closed review rather than a misleading approval summary.
- Standalone cloud MCP and voice execution routes bind approval to the current user and exact server/tool/payload and recheck current access. Local desktop MCP requires trusted IPC, server/process consent, allowlisted tools, and per-call native consent that displays the full accepted bounded arguments; cancel prevents execution.
- Added regression coverage for no approval-token issuance on unsafe HTTP effects, no literal credential leakage, full >3 KiB desktop argument display, and cancelled local execution. Focused suites passed 31/31 across the related workflow, approval API, desktop, and voice paths.
- No external provider/browser/Electron/PostgreSQL security journey was available. No production database or migration was touched.
## F030 SEO security addendum (2026-11-07)
- SEO credentials and configuration are stored only in `config_encrypted`; status returns credential-presence and domain metadata, never login/password. Team reads require membership, while saves/tests/removal require owner/editor. Mutations require same-origin requests, bounded JSON, and per-user rate limits; limiter errors fail closed.
- DataForSEO calls are pinned to `https://mcp.dataforseo.com/v3/mcp`, reject URL variations and redirects, cap the declared and streamed body at 1 MiB, and abort after six seconds. Domain/credential inputs are validated; tool arguments are built from declared schema properties and candidates with common mutation verbs are skipped. Output keywords and nested data traversal are bounded.
- Focused tests cover credential/domain validation, URL rejection, redirect rejection, declared/streamed body cap cancellation, team scope, same-origin mutation, and secret-free status. No live DataForSEO, OAuth MCP, PostgreSQL, or authenticated browser verification. OpenSEO is unimplemented; F030 remains PARTIAL.

## F025 n8n workflow effect approval hardening (2026-11-07)
- n8n run approval now permits only explicitly classified safe logic nodes and literal n8n-nodes-base.httpRequest effects. The preview shows method, full bounded URL, and bounded parameters; configured credentials are identified by type only and their IDs/names/values are not exposed.
- Dynamic expressions, unknown/action integration nodes without a dedicated adapter, inline credential-like keys and header/query name-value pairs, secrets inside JSON/form-style strings, sensitive URL query/userinfo, excess nodes, oversized values, and over-complex payloads fail closed. Preview and approval issuance independently reload and classify the workflow.
- Focused review and approval tests passed 13/13; scoped Biome and diff checks passed. No live n8n execution or credentialed workflow was run. Unsupported integration node types need a node-specific preview adapter before approval can be enabled.
## F030 overview status boundary (2026-11-07)
- The new Cockpit overview calls only authenticated provider connection-status GET endpoints with `cache: no-store`, and parses a four-field allowlist before rendering. It does not call summary APIs or expose extra provider status/config fields. Team scoping is selected from the signed-in user's existing `/api/projects/teams` response, with authorization rechecked separately by each provider route. No new credential or outbound network path was introduced.
## F037 project unlink authorization recheck (2026-11-07 10:22 IST)
- The project document DELETE route now rechecks current project membership/editor role, attached collection, and eligible collection source owner after resolving the item and immediately before unlinking. Tests cover revocation, role downgrade, detachment, and owner-scope loss.
- The mutation only removes `project_document`; it does not delete the shared collection item or object storage bytes. Collection-object garbage collection remains a separate unimplemented lifecycle requiring transactional enqueue/retry semantics.
## F018 private file deletion security (2026-11-07 10:53 IST)
- Source deletion requires a same-origin authenticated request, collection write access, repository-level user and collection scoping, a personal (non-team) collection, file source type, and a storage key matching the signed-in user prefix. A transactional lock plus object-key uniqueness check prevents deleting a blob still attached to another collection item.
- Project, review, and project-brain references fail closed so item deletion cannot cascade away active feature records. F037 remains unlink-only. Storage deletion runs only after a durable outbox transaction commits; worker revalidates ownership, tolerates already-missing objects, and records failed attempts for later cron retry instead of claiming cleanup completed.
- Focused route/worker tests cover unauthenticated and cross-origin requests, insufficient collection role, shared/reference refusal, outbox race/no-claim behavior, owner-prefix rejection, and provider failure retry reporting.

## F024 manual-run security boundary (2026-11-07 10:54 IST)
- Schedule history remains guarded by session authentication and owner-scoped job lookup; the response allowlists run ID, start/completion times, and lifecycle status, excluding output and error text. Regression coverage verifies sensitive fields are not serialized.
- A synchronous run-now endpoint was not introduced. User-triggered execution without a durable idempotency/request record could duplicate side effects on retries; calling execution directly would bypass worker lease fencing. Preserve the worker authorization/claim boundary in any future design.
## F018 source deletion UI completion slice (2026-11-07 11:13 IST)
- Added a per-source Remove action only for writable personal collections and file-backed items. The user must confirm; the component calls the authenticated collection-item DELETE endpoint, refreshes list data, and distinguishes queued cleanup (202) from immediate completion. Team collections and URL sources do not expose this action.
- Focused component tests passed 2/2: confirmation invokes the expected DELETE request and refresh on queued cleanup, and team collections do not offer per-source deletion. Scoped Biome check passed. F018 remains PARTIAL for project/reference blockers, wider multimodal parity, and live PostgreSQL/storage/browser validation.
## F014 regeneration security note (2026-11-07 11:15 IST)
- Whole-grid regeneration is an explicit user action with confirmation. The server validates the request body against a strict schema and applies the existing authenticated owner check, same-origin check, per-user rate limiting, row lock/busy guard, current source ownership and readiness checks, source-text bounds, untrusted-document framing, output bound, and citation quote verification.
- Invalid force values/extra properties fail before database state or provider rate limit is touched. Force does not bypass permissions or allow client-supplied models/prompts/source text.
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


## F024 manual run request boundary (2026-11-07 11:24 IST)
- Manual run writes require a valid session, explicit matching Origin, a mandatory bounded Idempotency-Key, and an owner-scoped schedule lookup. API responses expose request ID/status only. The database keeps an idempotency tombstone and partial unique pending-work constraint.
- AI execution is queued; the endpoint cannot bypass the worker. Manual jobs share persisted scheduler claim/lease fencing, and completion uses the same token. Active/paused are eligible; disabled jobs are rejected. Manual execution preserves nextRunAt.
- The run record is durably linked before chat is invoked. On expired started work, request/run are failed as ambiguous and not replayed, avoiding duplicate manual execution. External completion may be unknown after a crash; no exactly-once guarantee is claimed. Migration 0068 is unapplied; PostgreSQL-backed behavior remains unverified.

## F029 accepted project-brain todo notification (2026-11-07 11:49 IST)
- Added an adapted safe notification event: only a successfully persisted human transition from proposed to accepted calls the notification helper. Rejected, completed, invisible, invalid, denied, and conflicted transitions do not notify.
- The helper resolves current project recipient IDs at send time and stores one in-app notification per recipient with the existing unique (user_id, dedupe_key) constraint. Stable key project-brain-todo-accepted:<todo-id> deduplicates retries per recipient/task. Notification text is generic and omits untrusted model-generated task title/evidence. Web Push runs only after a new notification row is inserted and remains best-effort.
- Focused Vitest passed 7/7 across the todo review API route and notification helper tests; scoped Biome and git diff --check passed. No schema change or migration was needed.
- This is an adapted accepted-task event, not the reference per-run consolidation digest. F029 remains PARTIAL pending broader notification event parity and live PostgreSQL/browser/VAPID delivery validation.
## F018 DOCX preview renderer hardening (2026-11-07 11:51 IST)
- Mammoth receives only an OOXML archive that passed the shared entry/inflation/DOCTYPE verifier. External hyperlinks are rewritten to spans, images are not inlined, rendered HTML is capped, and the client uses srcDoc in sandbox="" with a default-src-none CSP. Authenticated key ownership, storage size limits, no-store response, and user rate limits stay in force; the route extracts storage keys and does not perform caller-controlled URL requests.
- Focused renderer tests verify table output, inert links, and malformed archive rejection. No browser exploit testing or live provider ACL test was run; CSP and sandbox behavior still require browser verification.
## F030 OpenSEO through Navigator OAuth (2026-11-07)
- Added a personal-scope OpenSEO connection path that reuses the existing DataForSEO SEO summary and dashboard. It accepts only a caller-owned, private, enabled MCP server whose URL is exactly `https://app.openseo.so/mcp`; the server must have a stored OAuth token. Team-shared OpenSEO configs are rejected because this repository's MCP OAuth session is server-global rather than user-scoped.
- The dashboard lists only eligible owned OpenSEO server IDs/names plus authorization state. It directs users to Navigator to complete OAuth. SEO execution checks current caller ownership again, requires a connected MCP client, and invokes only tools annotated `readOnlyHint` that match fixed domain overview/keyword/backlink name patterns. Arguments are constructed solely from declared schema properties and saved domain/location/language values. Returned payloads are capped at 1 MB; manager calls retain their configured MCP tool timeout.
- Focused schema, read-only tool selection/argument, route, and server-list tests: pending final integrated verification. Live OAuth/provider, PostgreSQL, browser, and team-sharing journeys were not run. F030 remains PARTIAL.

## F025 approval-boundary audit (2026-11-07)
The latest reference HITL audit found four no-execute proposal/decision tools and no additional reference connector mutation endpoint in that HITL directory. Void-Agent preserves the reference review-card workflow and server-enforces consequential writes with scoped short-lived single-use approval digests; exact payload consumption occurs at the connector execution boundary. No approval control was weakened or bypassed. Read-only SaaS search endpoints using HTTP POST remain classified as read operations, not effectful writes. Focused regression tests for schema, agent, email/Gmail, Calendar and Drive flows passed 31/31. Live browser/PostgreSQL/provider verification remains outstanding; F025 is still PARTIAL.

## F026 Voice Inbox listing review (2026-11-07)
- Access is constrained by an authenticated session and `chat_thread.user_id`; only user-role chat messages tagged `voice_device` or `voice_realtime` are selected. The query uses a bounded 30-row keyset page and an extra sentinel row. Responses are private/no-store and per-user rate limited.
- Message parts are projected to text-only content capped at 8,000 characters. Assistant turns, metadata, images/audio payloads, and raw storage references are omitted. Device links use the existing owner-checking transcript preview/handoff. No automatic AI/tool execution was added.
- Route/query tests verify owner predicate, cursor tie-break, empty/malformed cursor rejection, response bounds, and that item links use the review flow. No live database/browser authorization test was run.

## F021 native menu data boundary (2026-11-07)
The connected-server menu label uses only `URL.host` from the validated selected origin, is limited to 253 characters, and never includes credentials, path, query, or fragment. The new menu only wires existing server-selection and updater actions. Electron DevTools are hidden in packaged builds; the main window continues to use context isolation, disabled Node integration, and sandboxing. No new process-spawn, shell, or network capability was added.

## F037 project DOCX edit controls (2026-11-07)
Project edit proposals are limited to authenticated project members and a private storage backend. The processing path enforces input/output byte limits, OOXML/ZIP and DOCTYPE checks, validates source identity/hash, rejects ambiguous or cross-run anchors, and preserves formatting through true Word tracked revisions. Only generated revision IDs are eligible for accept/reject; existing document revisions are not altered. Candidate resolution is creator-bound; stale/rejected candidates and project/document deletion enqueue blob cleanup transactionally. The original document is never overwritten. Migration 0069 is authored but unapplied. Unit/route/component tests and the integrated typecheck/build passed; live PostgreSQL and storage permission tests remain outstanding.

## Other changes in verified batch (2026-11-07)
Published-page revocation now rate-limits before repository mutation. Voice intent preview is authenticated and read-only and cannot execute a tool. Finance overview reuses existing authorization-protected summaries without adding payment actions. Resumable stream stale-pointer cleanup is covered by a regression test.

## F025 approval policy parity update (2026-11-07)
The reference system prompt distinguishes harmless read-only chains, a single action with its own approval card, and genuinely complex consequential plans. Void-Agent already had the reference proposal tools and server-enforced exact-payload effect tokens, but the shared guidance did not explicitly prevent unnecessary plan-approval cards or say that plan approval cannot authorize an effect. Updated `src/lib/ai/tools/hitl/index.ts` to keep plans proportional, preserve each tool's server-side approval boundary, and collect related missing details in one `requestInput` call. Added guidance-contract tests in `src/lib/ai/tools/hitl/index.test.ts`. Focused Vitest passed 13/13; Biome and `git diff --check` passed. F025 remains PARTIAL because prompt tests do not establish model adherence and live browser/PostgreSQL/provider journeys remain unverified. No permission gate was removed.

## User-owned model provider hardening (2026-11-07)
Personal API keys use the existing AES-256-GCM encryption helper in a dedicated owner-scoped table. CRUD and catalog APIs require a signed-in user, same-origin request, fail-closed rate limit, bounded request body and no-store responses. Discovery and each runtime request validate all DNS answers as public, pin connection lookup to a validated address, retain TLS verification against the original hostname, require HTTPS:443 and reject redirects. Discovery/model counts and request/response byte/time limits are bounded. Exact user/provider/model ownership is rechecked before runtime use. Personal model failures do not forward prompt content to deployment-global fallback providers. Migration 0072 is authored but unapplied; no live destination or provider was contacted during validation.

## Project brain recent-event read boundary - 2026-11-07 20:57 IST
- The project knowledge chat tool's timeline event feed is read-only and bounded to eight entries. The API tool re-fetches current project access on each invocation, intersects conversation collections with current project collections, derives source owner IDs, and filters rows by accepted state, active source revision, and ready source status. Returned candidates are checked against those current scopes before serialization.
- Event strings are capped; no URL is fetched and no write/tool execution is triggered by timeline retrieval. Focused SQL predicate tests verify project, collection, owner, source-status, accepted-state and active-revision constraints. No live PostgreSQL authorization test was available.

## Project status chat tool read boundary - 2026-11-07 21:08 IST
- getProjectStatus is available only in project-attached chat and rechecks project membership on each execution. It intersects thread collection IDs with the current project scope, derives allowed source owners, and builds context only from accepted facts/tasks/events tied to active source revisions and ready sources.
- It returns a status snapshot only when the stored fingerprint matches the current scoped evidence; snapshot query is project + fingerprint bound. Without a current snapshot it returns an explicit unavailable note and does not call a model or claim a status. Output is capped. The tool has no mutation or external-effect path.
- Unit coverage checks revoked access, exact scope derivation, fingerprint-constrained snapshot lookup, empty-current-context behavior, and no-fabricated-snapshot behavior. Live PostgreSQL authorization was not available.


## Voice project status read boundary (2026-11-07 21:23 IST)
- Voice status accepts only a strict UUID `threadId`; no project ID, collection IDs, or user ID are accepted from the client. The server requires same-origin, authenticated user, a per-user rate allowance, and a bounded JSON body.
- The server loads the persisted thread, checks ownership, requires its project association, revalidates project access, and intersects thread collections against current project attachments. The same checks run at session setup (to control tool exposure) and each endpoint call (to authorize data access).
- Status reads use active source revisions and the current evidence fingerprint via the shared reader; no snapshot means no inferred status. Response is private/no-store; query and output remain bounded. Kimi ElevenLabs does not advertise the function because its client has no executor.
- Regression coverage: malformed/extra scope, auth, same-origin, rate limit, missing/foreign/non-project thread, revoked access and collection intersection. No live database or provider run.


### Voice project status final verification (2026-11-07 21:40 IST)
- Malformed or non-object provider tool arguments are rejected before invoking built-in or MCP actions in both browser voice executors. Focused route/scope/tool tests passed 15/15, integrated TypeScript passed with the documented 6 GiB Node heap, scoped Biome passed, and the production build passed with 206/206 pages. Live authorization against PostgreSQL remains untested.


## Workflow HTTP DNS rebinding fix (2026-11-07 21:48 IST)
- Workflow HTTP nodes no longer validate DNS and then hand the hostname to global fetch for an independent resolution. They keep the resolver's public address set and pin the HTTPS socket lookup to the first validated address; URL hostname/TLS certificate checks remain in effect. Every returned DNS address is already rejected by `resolvePublicWebhookUrl` if non-public.
- Automatic redirects are rejected; max response body is 1 MB; timeout remains bounded to 300 seconds. Tests cover pinned address use, unsafe resolver rejection before connection, redirects and bounds.
- Approval audit identified a distinct unresolved bypass: full n8n embedded editor auth grants direct native API controls, and host activation PUT lacks a review token. Do not represent workflow execution approval as complete; scope this as the next task.


### Workflow HTTP build verification (2026-11-07 22:08 IST)
- Focused 21-test suite, scoped Biome, 6 GiB integrated typecheck and production build (206/206 pages) passed. No live outbound request was sent. The n8n embed/activation approval bypass remains a separate unaddressed gap.

## n8n managed editor retirement (2026-11-07)
- Security disposition: the signed native n8n editor session conveys direct edit/run/activation privileges that cannot be constrained by the host's existing approval UI. The embed token endpoint is retired (410), and the client no longer exposes the iframe or direct editor URL.
- The n8n detail page now receives a display-only projection; tests verify credential and node configuration values are not included. Reviewed one-shot execution remains. Activation requests are rejected; deactivation is allowed through same-origin, per-user rate-limited, bounded input.
- This removes the n8n authoring/activation workflow from Void-Agent until a server-enforced approval-safe editor is available. Existing Void-Agent saved-workflow editing remains separate. F023/F025 and workflow feature parity remain PARTIAL.
## Voice project knowledge search (2026-11-07)
- Added project-thread-only search to OpenAI Realtime and KonvO voice clients. It reuses the accepted-fact/event graph tool and the same owned-thread scope resolver as voice project status; project access and active source revisions are rechecked at query time. Kimi remains excluded until its client can execute project tools.
- Server request is same-origin, session authenticated, rate-limited, bounded and strict. Response caps citations and results, strips internal source IDs, reduces URL sources to hostnames, and redacts credential-like fields.
- No duplicate knowledge system or migration. Focused graph/route/tool tests passed 18/18; scoped Biome and TypeScript pass. Live provider/Postgres flow and build remain pending.
## Voice knowledge context hardening (2026-11-07)
- The built-in voice tool menu now follows current project thread metadata; actual tool exposure and every query remain server-verified. The project search description explicitly treats retrieved source evidence as untrusted data.
- Voice transcript persistence accepts an optional context thread UUID. The server checks source-thread ownership and current project membership and copies only the resulting project ID/currently attached collection intersection onto the new voice thread. Foreign, ordinary, or revoked contexts create an unscoped transcript; same-origin is required for transcript writes.
- Tests include project inheritance from verified scope, foreign-context denial in resolver behavior, same-origin rejection, bounded citation output, and project-only tool gating. Current focused suite is 27/27, Biome and integrated typecheck pass. Live provider/database journey is unavailable; build pending.
## Automatic project-brain prompt context (2026-11-07)
- Project chat requests can retrieve up to five query-matched accepted facts and three accepted events from the current active source revisions. Access is rechecked using the owned chat thread's persisted project and collection scope, current project membership, collection owners and ready source state.
- Brain records are injected in a separate escaped, bounded, explicitly untrusted prompt section; ordinary RAG `RetrievedChunk`/citation metadata is unchanged. Embed and scheduler requests are excluded; no evidence means no prompt section. A 1.2s soft timeout omits slow results. No schema or migration.
- Risks: no live PostgreSQL query-plan/latency check, so the bounded `ILIKE` scan needs observation against production-sized data before tuning. Focused tests 20/20; typecheck/Biome pass; fresh build pending.
## Tabular review source revision pinning - 2026-11-07 23:37:39 +05:30
- The new review source table stores one exact document/page ID per review item and an ordinal. Review generation rechecks current collection ownership/readiness before exposing pinned content to the model and fails closed if any pin is deleted, inaccessible, or contentless. A nullable source-document FK preserves the pin slot on deletion; an index supports FK cleanup. Newer reingestion rows are not selected.
- The additive migration backfills all presently extant pages for legacy reviews in stable (created_at,id) order. Existing cell text is retained; previous generation provenance cannot be reconstructed, so these backfilled pins define the source set for future regeneration only.
- Migration remains unapplied; pnpm db:check validates journal consistency but is not a PostgreSQL execution test. No source deletion or live DB query was performed.

## F014 source revision pinning verification (2026-11-07)
- Review generation now reads only pinned source-document IDs, rechecks collection owner and source-ready state, and treats a deleted or inaccessible pin as an incomplete source rather than silently using the remaining pages or latest reingestion.
- Migration 0073 preserves deletion slots via nullable document FK with SET NULL and adds an index for that FK. Existing review cells are not changed. Legacy source pins reflect extant documents at migration time and cannot prove the provenance of previously generated values.
- No PostgreSQL migration was executed. Focused tests/typecheck/build pass; production-sized database constraints and deletion behavior remain unverified.
