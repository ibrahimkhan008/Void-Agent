# Integration checkpoint 2 - primary-first migration

## F032 markdown streaming rendering (2026-11-07)

- Adapted reference block-level markdown rendering in `src/components/markdown.tsx` with a fenced-code/display-math-aware splitter, memoized blocks, and a per-block streaming context.
- Main assistant and reasoning markdown mark only their active final block as streaming. Settled blocks bypass word splitting; code blocks defer Shiki until the streaming tail settles.
- Preserved existing ReactMarkdown GFM/KaTeX plugins, table/citation renderers, Shiki/Mermaid/JSON support, raw-HTML-disabled behavior and default URL protocol filtering.
- Verification: 9 focused tests passed across parser and mounted React renderer suites; a 50,000-line blank-run test checks bounded loose-list handling. Scoped Biome and `git diff --check` passed. Integrated typecheck/build pending. F032 remains PARTIAL until root verification.
- No runtime dependency, backend/API, database, migration, push or deployment change. Added `jsdom` as a dev dependency to mount component behavior tests.

This is a saved, incomplete engineering checkpoint. Full inventory semantics and
feature parity are NOT complete. No production or database changes or push.

## Measurable scope

- 1,290 primary and 1,656 reference source/config/test/document files indexed.
- 206 reference route/page/tool surfaces catalogued; these are NOT 206 features.
- Historical initial-triage distribution for F001-F036 (not current parity or
  completion): 12 EXISTING, 10 PARTIAL, 9 MISSING, 4 OPTIONAL, 1 DEPRECATED.
  EXISTING meant source was located, not end-to-end verified. This original
  snapshot is retained here as historical evidence.
- Current primary classification of the F001-F036 rows in the parity matrix
  (2026-11-07): 11 EXISTING, 20 PARTIAL, 2 EXCLUDED, 2 OPTIONAL, 1 DEPRECATED.
  Counts use each row's primary category once; F030 is also explicitly PARTIAL
  at the family level despite its OPTIONAL primary category. No F001-F036 row is
  marked COMPLETE, and this classification does not produce a completion
  percentage: EXISTING is not an end-to-end completion status and the families
  are not a feature-level denominator.
- F037 project document originals was added after the original 36-family
  baseline and is tracked separately; its current status is PARTIAL. Do not
  silently add it to, or use it to reinterpret, the historical 36-family count.
- Initial-checkpoint work count (historical only): 2 reference behaviors
  (secure post-auth destination continuity and bounded history pagination) and
  2 baseline reliability/security fixes (side-effect-free storage diagnostics;
  canonical HMAC signature encoding). Subsequent work is recorded in dated
  entries below; there is no roll-up completion count across those slices.
- Reference content hash comparison: zero changed source files.

## Implementation traceability

| Work | Primary implementation | Verification |
|---|---|---|
| Post-auth destination | src/lib/auth/callback-url.ts; src/middleware.ts; src/app/(auth)/sign-in/page.tsx; src/app/(auth)/sign-up/page.tsx; src/components/auth/sign-in.tsx; src/components/auth/sign-up.tsx | callback-url.test.ts; middleware.test.ts; live protected-route 307 preserves callback |
| Storage diagnosis | src/lib/file-storage/storage-driver.ts; src/lib/file-storage/index.ts; src/app/api/storage/actions.ts | existing storage/actions.test.ts |
| Payment signature canonicalization | src/lib/payments/upgrade-token.ts | upgrade-token.test.ts adds equivalent-byte alias regression |
| Stronger CSP assertions | next.config.test.ts | existing CSP suite, policy unchanged |
| Existing lint blockers | src/components/workflow/workflow-list-page.tsx; src/lib/ai/memory/insights.test.ts | unused bindings renamed only |

All nine requested engineering documents plus repository-discovery.json are new.
The existing OAuth cookie changes, ignore rule and lockfile changes predate this
initiative and were preserved. No wholesale UI rebrand or architecture replacement.

## Next exact checkpoint

1. Complete route/tool/table-level semantic review behind the 36 family entries;
   do not treat same-path absence as behavioral absence. Replace generic API/schema
   notes with reviewed per-feature contracts before implementation.
2. Production build in a separate output/workspace so the live dev server's .next
   is not corrupted; interactive signup/email/Google destination continuity.
3. Exercise bounded history with Postgres-backed UI workflow; verify export and
   insight full-history reads and same-timestamp cursor boundaries.
4. Audit sensitive tool approvals/cancellation, then map projects to existing
   collections/archives/teams before brain ingestion or new tables.

Pending: project brain, graph/contradictions, tabular reviews, stream resumption,
Slack subscriptions, voice transcript gaps, push, desktop/hardware/cockpit.
Optional delivery/model services require credentials; no fabricated verification.
Automatic upstream repository replacement is rejected for the independent product.

## Debt and limits

Surface classifications are preliminary; licensing and security reviews are
incremental. Existing Flare technical identifiers remain to preserve integrations.
No quantitative full-parity percentage can be honestly calculated yet. Preserve
LICENSE and reference attribution. See testing-report.md for check results.

## Checkpoint 2 ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â bounded history (2026-11-05)

- Added 1 feature behavior: bounded newest-message load and on-demand older-message paging, adapted to original Void-Agent contracts.
- `chat-repository.pagination.test.ts`: 2/2 pass. Type check and targeted Biome pass.
- Full-history reads remain unbounded for export, insights, and API callers. No schema or dependency changes.
- Postgres-backed interaction and production build remain pending. Original source repository remains the only edit target.

## Next family reviewed: human tool approvals (audit only)

Reference HITL tools: `proposeEmail`, `askForPlanApproval`, `requestInput`, and `createAgent`, each with a dedicated UI card. Void-Agent has generic manual approve/reject buttons and server-side manual invocation handling, so this family is PARTIAL rather than missing. No new HITL tool was copied in this batch; trust-path/security review is required before expansion.

## Checkpoint 3 - connected HITL workflows

- Added three reference HITL tools: plan approval, user-input collection (bounded to four questions, no secrets), and editable email draft approval. These are no-execute tools with purpose-built cards in the existing chat stream.
- Existing generic manual tool confirmation remains in place. `createAgent` approval and its persistence action remain incomplete. Client cards are not server-side authorization tokens.
- 9 focused tests pass; type check and targeted Biome pass. Full user journeys and production build remain pending.

## Checkpoint 4 - conversation knowledge scope (partial project-brain foundation)

- Reused the existing owner-scoped collections, document ingestion and RAG implementation. Added nullable `chat_thread.collection_ids` and an append-only migration; `NULL` preserves all-user-collection behavior, `[]` explicitly retrieves none, and a non-empty list scopes retrieval.
- Added an authenticated server action that validates UUIDs, verifies collection ownership, and persists scope only for the owning thread. New chat requests are checked before thread creation; later requests use persisted DB scope rather than trusting client-supplied changes.
- Added a chat selector for all collections or a selected subset and passes the initial stored scope to the chat client.
- Focused retrieval/history/HITL suites pass (20 tests). Type check initially found a nullable client-payload mismatch; corrected by omitting the field for legacy/all scope. Final check pending.
- Migration has not been applied; no DB was connected. Project-brain graph, fact extraction, contradictions and project CRUD are still not implemented. Do not count F009 complete.
## Checkpoint 5 - create-agent approval path

- Added the missing reference `createAgent` no-execute tool and an editable review card. The model only proposes; an explicit user click calls Void-Agent's existing authenticated `/api/agent` endpoint, which replaces the submitted user ID with the session identity and enforces `canCreateAgent`.
- The card supports a retry to return the chat tool result after an agent write succeeds, avoiding a second create when only `addToolResult` failed. Network ambiguity where the POST succeeds but its response is lost is still not idempotently resolved.
- Schema validation regression added. F025 remains PARTIAL: schedules, generated files/tools attachment, live browser journey, and durable approval idempotency are not yet integrated or verified.
## Checkpoint 6 - idempotent user-approved agent creation

- Added `agent_approval_request`, scoped by authenticated user and unique tool-call request key. The reservation and agent insert run in one PostgreSQL transaction; concurrent same-key calls converge on one agent, identical payload replays return it, and changed payloads return 409.
- Request key and payload hash are stored outside `agent` so they do not leak through normal agent API projections. Deleting an agent leaves a replay tombstone via `ON DELETE SET NULL`; replay returns 410 rather than recreating a deliberately deleted agent.
- Added route regressions for key validation, authenticated-user override, existing permission enforcement, and payload conflict, plus payload fingerprint tests.
- Migration `0034` is journaled but unapplied. No Postgres concurrency test yet; project/workspace and brain systems remain outstanding.
## Checkpoint 7 - project workspace CRUD and chat integration
- Added personal/team project rows, authenticated CRUD APIs, a Projects management page and sidebar link.
- Project context and explicitly attached existing collections are used by associated chats; team access follows current membership and role. Removed members cannot access shared projects; viewers cannot edit or create; collection retrieval is limited to attached IDs.
- Migration `0035_project_workspaces.sql` is authored and journaled, not applied. Project-brain ingestion, graph/facts, contradictions, and Postgres/browser end-to-end verification remain pending.
- Focused tests: 30/30 pass; TypeScript, targeted formatter-disabled Biome, Drizzle journal check, and diff whitespace check pass. Production build and database integration were not run.

- Follow-up validation: `pnpm build` completed successfully after Checkpoint 7, including project route generation. It emitted existing workspace-root/dependency/dynamic-render/lint warnings; no migration was applied and no deploy/push occurred.

- Full regression follow-up: `pnpm test` passed 996/996 tests across 108 files (exit 0). The output contains expected simulated error logs from failure-path tests.

- Team workspace follow-up: project form now lists only the authenticated user's team memberships and personal team(s); viewers cannot select a team for new projects. Server-side validation remains authoritative.
- Focused follow-up validation: `pnpm check-types` passed; targeted Biome passed; project policy tests 3/3 passed. The full suite 996/996 and production build passed immediately before this small team-selector addition; a second full suite/build was not run.

## Checkpoint 8 - persisted project source analysis and review
- Added project brain run/fact tables and append-only migration `0036_project_brain_facts.sql`. Analysis reads only ready documents from collections attached to the project and owned by the project owner/current team members; request text size, fact count, field sizes, confidence, and per-user request rate are bounded.
- Source text is treated as untrusted model input. Proposed claims include evidence excerpts, remain marked `proposed`, and require a workspace editor/owner to accept or reject. Model failure is stored as a safe generic run error; failures can be retried, duplicate requests reuse the same fingerprint, and abandoned runs older than five minutes can be recovered.
- Added source list/analysis/review UI to project cards, with links back to the collection for evidence inspection. F010 and F012 remain PARTIAL; automatic source triggers, background queue, entity graph, contradiction tracking and consolidation remain outstanding.
- Validation: 999 tests passed across 109 files; typecheck passed; targeted Biome passed; Drizzle journal check passed; production build passed and generated `/projects`; diff check passed with only Git line-ending notices. Migrations remain unapplied; no DB-backed execution.

## Checkpoint 9 - fact-backed graph and potential conflict review
- Added an authenticated graph endpoint derived from non-rejected persisted facts and a React Flow view with source-linked edges. Added a bounded potential-conflict detector that groups on normalized subject/predicate but explicitly treats different values as candidates (which may be temporal/contextual, not contradictory).
- Added an editor-only conflict resolution transaction: both facts are locked and scoped to the project; request IDs must form an actual same-key/different-value pair; one fact is accepted and the other rejected atomically. Graph/claim list refresh after resolution.
- F012/F013 remain PARTIAL: no durable conflict rows, temporal version history, materialized entity/alias graph or rich node drilldown.
- Validation: full suite 1,002/1,002 across 110 files; type check; focused brain/policy tests 9/9; targeted Biome; production build succeeds including graph routes and React Flow page bundle. Migration journal consistency check passed earlier in this batch; no DB-backed verification.

## Checkpoint 10 - private tabular document reviews
- Traced reference schema, chat tool, generation stream, resume behavior, export endpoint, and review card. Built a primary-native workflow over existing collection items and extracted `DocumentTable.content` rather than copying the reference's separate uploaded-document model.
- Added private review/item/cell tables and append-only migration `0037_tabular_reviews.sql`; collection owners can select ready documents, define preset/custom fields, run resumable cell generation with concurrency capped at three, see streamed updates, revisit recent reviews, delete reviews, and download XLSX.
- F014 is PARTIAL because no chat tool entry point/in-chat table card is implemented; shared team reviews, source-offset citations, per-cell editing, and live Postgres/provider/browser journeys remain unverified.
- Security: source IDs are resolved through collection ownership; every review endpoint scopes to its creator; model inputs/outputs are bounded; source is treated as untrusted; rate limits and safe XLSX inline strings are applied.
- Validation: focused tabular and pagination suites 12/12; `pnpm check-types`, `drizzle-kit check`, focused Biome, `git diff --check`, and `pnpm build` passed. Build has existing workspace-root/dependency/dynamic-render/image warnings. Migration is unapplied; no Postgres, provider, push, or deployment action.
- Follow-up: Added chat tool entry: the prompt includes at most 30 authorized ready source IDs, tool execution rechecks current user/project collection access, and an in-chat card links to the review workspace. F014 remains PARTIAL for team-shared records, source-offset citations, cell edits and missing DB/browser/provider execution evidence.

## Checkpoint 11 - cell correction and targeted retry
- Added authenticated creator-scoped cell editing (bounded 4,000-character value) and one-cell regeneration to the tabular review workspace. Server routes validate source/cell membership and prevent edits during active generation; request bodies are capped at 8 KiB.
- Fixed review status aggregation after one-cell retries so other unresolved cells remain represented as error/pending.
- F014 remains PARTIAL for team-shared access and source-offset citations; migrations remain unapplied and no PostgreSQL/browser/provider journey has run.
- Validation: focused tabular tests 9/9, type check and focused Biome pass. `git diff --check` passes with expected line-ending notices.
- Batch regression after the cell actions: full Vitest passed 1,017 tests across 115 files; type check passed; production `pnpm build` passed and emitted both tabular review pages and all four review APIs. Build retained existing workspace root inference, e2b/unpdf dynamic dependency, dynamic server usage, `<img>`, and missing optional Redis/E2B configuration warnings.

## Checkpoint 12 - persist browser voice sessions in chat
- Adapted reference session-to-thread behavior across Void-Agent's existing OpenAI Realtime and KonvO browser voice providers. Completed voice turns are debounced and idempotently upserted into a normal owned chat thread; user speech determines the title and the voice drawer links to the saved conversation.
- Added strict request/body/turn/part caps, per-user rate limiting, thread ownership checks, namespaced message IDs, and bounded tool-output persistence. No audio recording is uploaded or stored.
- F026 remains PARTIAL because device/gateway sessions, AssemblyAI/browser-run paths and a real authenticated browser/provider journey are still missing or unverified. F027 hardware pairing remains separate; the reference websocket bridge source is absent in its checkout.
- Focused voice tests passed 7/7; full suite passed 1,024/1,024 across 117 files; focused Biome and TypeScript passed. The first build attempt failed while prerendering `/` with a webpack runtime error; a clean `pnpm build` rerun succeeded, generated 189/189 static pages, and emitted `/api/voice/session-thread`. No source/config change was made to suppress the first failure.

## Checkpoint 13 - notifications and browser push integration
- Added durable per-user notification and encrypted web-push subscription schemas in append-only migration 0038, user-scoped repository operations, notifications/read and push/subscribe endpoints, endpoint SSRF checks, and optional VAPID send with expired-subscription cleanup.
- Scheduler terminal outcomes now create deduplicated completion/failure notifications and attempt optional push without changing the persisted scheduler status when delivery fails. Added service-worker push/click handling, notifications page and header unread shortcut.
- Pagination behavior was re-reviewed before implementation: bounded server page size, timestamp/id cursor tie-break and ownership check remain intact; no pagination edit was needed.
- Verification and environment-dependent limitations are recorded in the testing report; migration remains unapplied and real browser/VAPID/PostgreSQL workflows have not been exercised.
- Verification result: focused notification tests passed 7/7; full suite passed 1,031/1,031 across 119 files; type checking, Drizzle journal check and focused Biome passed. Build attempt 1 failed during root prerender with webpack `undefined.call`, then an unchanged rerun succeeded and emitted 191/191 static pages and all notification routes. No PostgreSQL/VAPID/browser end-to-end test was available.

## Checkpoint 14 - secure physical voice-device pairing foundation
- Added user-owned device and hashed pairing-code tables in append-only migration 0039. Authenticated users can create 10-minute codes, list devices and revoke them; device redemption atomically consumes the code and creates a device with a one-time random bearer credential whose peppered digest is stored.
- Added per-IP/per-code rate limits, bounded request bodies, strict device metadata contracts, active-token authentication/last-seen helper, and a Voice devices page. The page states that real audio transport still needs a separately deployed gateway because the inspected upstream websocket bridge source is absent.
- F027 changed from MISSING to PARTIAL. Transcript/audio-command endpoints, registration bootstrap, session history and gateway remain unimplemented/unverified.
- Focused token/schema/notification tests passed 11/11; full suite passed 1,035 tests across 121 files. Type check, targeted Biome and Drizzle check passed. Production build passed and generated 192/192 static pages, including `/voice-devices`; existing upstream dynamic-dependency/session-probe/config/img warnings remain.
- Migration 0039 is local and unapplied; no PostgreSQL-backed concurrency, hardware, gateway or deployment was tested.

## Checkpoint 15 — enrolled voice-device transcript delivery
- Added authenticated `POST /api/voice/transcript`; active device token ownership determines the user, request bodies are bounded to 16 KiB, transcript contract fields are strict and capped, and calls are throttled per device.
- Transcript events are stored in the owner's normal chat history using deterministic namespaced thread/message IDs, so retries are idempotent. Existing thread ownership is rechecked; untrusted `deviceId` cannot be supplied. No tools or commands execute from device input.
- F027 remains PARTIAL: no audio-command/STT endpoint, registration bootstrap, device session/history API, websocket gateway, or physical device test. The inspected reference checkout also lacks its bridge script.
- Validation: focused device transcript schema/route tests passed 6/6. Type check result and focused formatter/lint validation are pending the current validation process; DB-backed behavior and build are not yet verified.
- Verification update: focused device transcript schema/route tests passed 6/6; TypeScript and targeted formatter-disabled Biome passed; production build passed and emitted `/api/voice/transcript`. Build logs pre-existing dependency-analysis/image warnings and dynamic-session probes. DB-backed behavior and hardware remain unverified.

## Checkpoint 16 — bounded voice device WAV transcription
- Added a raw WAV audio-command endpoint for active paired devices. It rate-limits per device, requires strict session/event headers, streams the request with a 1 MB cap before concatenation, verifies WAV framing, sends it to the existing Sarvam STT proxy, and persists returned text with the device transcript idempotency helper.
- No audio is stored and no spoken command runs automatically; output goes to owner chat as saved_for_review. F027 remains PARTIAL because reference hardware WebSocket bridge is absent and no local firmware, gateway or action-approval roundtrip is implemented.
- Focused transcript/audio tests 13/13, TypeScript, targeted Biome, and git diff --check passed. Production build after the endpoint addition remains pending; no provider, PostgreSQL, or hardware workflow was tested.
- Files this slice: src/lib/voice/device-transcript-store.ts, src/lib/voice/device-audio.ts and test, src/app/api/voice/audio-command/route.ts and test, and the existing transcript route refactored to the shared persistence helper; parity/inventory/strategy/security/testing/context docs updated.
- Next exact action: production-build this route and review the Sarvam response contract; then continue the major desktop MCP/collaboration gap audit and implementation. Never push or deploy.
- Final source-state production build passed: Next compiled and type/lint checks passed, all 192/192 static pages generated, and the audio-command route emitted. Existing e2b/unpdf dependency, `<img>`, session dynamic-route, Redis/E2B config, workspace root, and PostgreSQL SSL semantics warnings remain. The session route dynamic messages were prerender fallback probes; build exit was 0.

## Desktop MCP architecture audit (2026-11-05)
- User priority elevated F021 from the original optional P3 roadmap to the next P1 implementation system.
- Reference behavior evidence: MCP testing UI chooses window.desktop.mcp only for configs requiring device execution; otherwise it uses the web RPC. The client bridge is used by the MCP test page and is not wired into server-side AI chat/agent tool execution.
- Reference security evidence: Electron main uses context isolation, sandbox and
odeIntegration: false, and constrains navigation to the configured app origin plus external/checkout/download handling. Desktop MCP tool enumeration/calls are nevertheless accepted by IPC handlers with the event sender unused and the raw config/tool args unvalidated at this IPC boundary. The default tool policy only permits named read-style tools, but renderer-provided stdio command, args and env can launch arbitrary local processes, and read tools can disclose local file content to the renderer. Audit events hash payloads but preserve error text.
- Void-Agent evidence: no Electron or native client runtime exists. src/lib/ai/mcp/create-mcp-client.ts supports server-side stdio only outside remote-only runtime; src/app/api/mcp/actions.ts explicitly tells hosted deployments that local stdio requires a local desktop runtime. MCP test UI currently uses server-side endpoint paths.
- Integration strategy: an independent Void-Agent desktop companion can achieve this capability, but porting the reference implementation unchanged would create a renderer-to-process trust boundary and would not complete browser OAuth. The implementation must validate sender origin/frame and strict server config in the main process, bind user consent to a normalized command/config identity, scrub inherited env, constrain exposed tool names/results, and use Void-Agent's system-browser auth handoff so Google sign-in works. Keep local process bridge distinct from cloud chat execution unless a reviewed approval-return protocol exists.
- F021 remains MISSING and is the next prioritized implementation batch. No claim of desktop or chat-tool parity. Reference checkout remained read-only.

## F021 desktop companion implementation update (2026-11-05)

The latest implementation advances F021 from MISSING to PARTIAL. `apps/desktop` now builds a separate Electron companion that restricts navigation to the configured Void-Agent origin, uses sandboxed/context-isolated renderer settings, checks trusted origin and main frame for IPC, and exposes only a narrow preload API. Local stdio MCP is only available on `/mcp/test/[id]`; server chat/agent execution remains cloud-only.

The MCP bridge validates bounded command/args/env and arguments, prompts for the process configuration and every tool invocation, uses a default-deny list of named read-style tools, bounds displayed schemas/results, and writes audit hashes rather than secret values. Prompt copy explicitly states that tool names do not prove safety and that the process can access resources under the desktop user's account. A call timeout now reaches the client/process cleanup path.

Social sign-in from the companion starts in the system browser and carries an allowlisted Google/GitHub/Microsoft provider, random state, bounded return route, and a five-minute hashed Better Auth one-time token back to the app using `voidagent://`. Email/password sign-in is unchanged. The web MCP test page continues using remote MCP as before and requests desktop execution only for stdio configurations.

Verification evidence: desktop TypeScript check and esbuild bundle pass; Electron v35.7.5 binary installed; desktop policy, auth handoff, and bounded chat pagination focused tests pass 11/11; root TypeScript check and targeted formatter-disabled Biome pass. Production Next build is running. OAuth callback, native consent prompts, real local MCP servers, PostgreSQL-backed auth, package signing, auto-update, and chat/agent local MCP invocation have not been live-verified. F021 remains PARTIAL.
- Production build result: first retry attempt failed at root prerender (`webpack-runtime` `undefined.call`); an unchanged retry passed, completing all 192/192 static pages and emitting `/desktop/auth/complete` and `/mcp/test/[id]`. Next compiled and passed lint/type checks. Existing dependency, `<img>`, workspace root, dynamic-session probe, optional Redis/E2B, and PostgreSQL SSL warnings remain. No database or native desktop live journey was exercised.

## F025 durable Gmail effect approval update (2026-11-05)
- The email review card now requests a server-issued one-time authorization when the user explicitly approves. The API requires a signed-in user, same-origin request, bounded schema, and per-user rate limit. It stores only a SHA-256 token digest and exact payload digest in the existing Better Auth `verification` table with a 10-minute expiry.
- Gmail send/reply tools require that token and consume it with one atomic `DELETE ... RETURNING` predicate bound to the authenticated owner and exact action, recipient, subject, body, and reply message ID. Direct tool calls without a token, changed fields, expired tokens, cross-user tokens, and replayed tokens fail before the Gmail send request. Reply subject is rechecked against the original Gmail message; RFC header newlines are rejected/sanitized and message IDs are URL-encoded.
- Focused approval/API/Gmail tests and full suite now pass: 1,064 tests across 131 files. Root typecheck and targeted Biome pass. Production build for this source state is running.
- F025 stays PARTIAL: server enforcement currently covers the built-in Gmail sender and agent creation; other mutating connector, MCP, workflow, calendar, Slack and external tool effects still need individually reviewed approval bindings. No PostgreSQL-backed concurrency or live Gmail call was performed.

- Final source-state build for F025: `pnpm build` exited 0, passed Next compile/lint/type checks, generated all 192/192 static pages and emitted `/api/approvals/email` plus the Gmail tool runtime. Build shows pre-existing optional Redis/E2B and SSL-mode warnings and dynamic-session prerender probe logs; no DB-backed or live Gmail workflow ran.

## Checkpoint 17 - project knowledge in chat
- Added `searchProjectKnowledgeGraph` to project-associated chat tool sets. It searches only accepted claims, returns bounded source/evidence citations, and performs fresh project membership, collection attachment, collection owner and ready-document checks at execution.
- Existing document RAG remains the unstructured source retrieval path. F013/F017 gain a parity slice but remain PARTIAL: no reference-style entity/alias graph traversal, node detail, broader semantic search tool, or browser/Postgres-backed chat journey is implemented/verified.
- Validation: project graph/tool tests 6/6; root `pnpm check-types` passed; new modules Biome clean; chat route Biome passed with formatter disabled; `git diff --check` passed. `pnpm build` passed with 192/192 generated pages. Existing dependency, `<img>`, Redis/E2B, SSL-mode and dynamic-session probe warnings remain. No database migration/application, push or deploy.

- Project graph hardening follow-up: added a second in-process result filter for accepted facts, ready sources, currently attached collection IDs, and current collection owners, in addition to the database predicates. Focused tests (6/6) and root typecheck passed after this change; the final `pnpm build` passed and generated 192/192 pages. No Postgres/browser workflow was run.

## F028 reference completeness audit (2026-11-05)
- Source files show only Slack connection/subscription/task table declarations and a settings UI. The app route tree has no `/api/slack` handlers, and a repository-wide search found no consumers of the subscription/task tables, event signature/replay verification, task runner, or Slack response delivery.
- Void-Agent's existing OAuth and read-only channel/message tool are functional counterparts for basic Slack read access, but not inbound channel automation.
- We are not recreating an upstream schema/UI stub and calling it migration. F028 is marked EXCLUDED as an upstream-incomplete candidate pending executable reference behavior. The matrix explicitly says Void-Agent does not have inbound subscription parity.

## F026 AssemblyAI chat dictation update (2026-11-06)
Void-Agent now optionally adds a microphone dictation control to the chat composer when `ASSEMBLYAI_API_KEY` is configured. The authenticated API issues a maximum-10-minute AssemblyAI streaming token and never returns/stores the account key. Browser PCM is streamed directly to AssemblyAI over WSS; only finalized bounded transcript turns are appended to the user's draft. Dictation never sends the message or runs a command, and raw audio is not persisted. The control hides itself when the service is not configured.
- Evidence: `/api/assemblyai/token`, `src/lib/voice/assemblyai-stream.ts`, `src/hooks/use-assemblyai-dictation.ts`, `src/components/assemblyai-dictation-button.tsx`, `src/components/prompt-input.tsx`.
- Focused token/audio contract tests: 7/7 passed; `pnpm check-types`, targeted Biome, and `git diff --check` passed. Final production `pnpm build` passed and generated all 192/192 pages, including `/api/assemblyai/token`.
- F026 remains PARTIAL: no AssemblyAI key/provider/browser microphone session was available for live verification; not all reference voice modes, device gateway, long-capture workflow, or full voice-agent behavior are integrated. `ASSEMBLYAI_API_KEY` is an optional blank entry in `.env.example`.

## Checkpoint 18 - optional AssemblyAI browser dictation
- Added a signed-in, same-origin, rate-limited API for 10-minute AssemblyAI ephemeral tokens; the account key remains server-side. The composer conditionally exposes a microphone button only when configured.
- Audio is resampled/encoded to 16 kHz PCM and sent directly to the fixed AssemblyAI WSS endpoint. Finalized bounded turns append to the draft; recordings are not stored and voice text never auto-sends or executes commands. Rapid-click session creation is guarded.
- F026 advances but remains PARTIAL: no real provider key/microphone browser journey, device gateway, or all voice session behaviors verified. Optional `ASSEMBLYAI_API_KEY` is documented in `.env.example`.
- Validation: 7 focused tests pass; `pnpm check-types`, targeted Biome and `git diff --check` pass; final `pnpm build` passes with all 192/192 pages and `/api/assemblyai/token` output. Existing warning set remains.

## Checkpoint 19 - durable project-brain source queue (2026-11-05)
- Manual project source analysis now persists as queued work and returns immediately. The existing cron scheduler claims one oldest queued run using a row lock with `SKIP LOCKED`; crashed runs are recoverable after a five-minute lease.
- Added requester ownership, append-only migration `0040_project_brain_queue.sql`, run status polling in the project UI, and execution-time checks for current editor access, attached collection ownership, source readiness, and source-content fingerprint.
- Model extraction has a 45-second abort bound; successful facts and run completion persist atomically. Failures expose a generic retry message and do not persist source text or provider errors.
- F010/F011 remain PARTIAL: no automatic source-ingestion triggers, multi-step pipeline, entity/alias graph traversal, consolidation, live Postgres worker test, or live model/browser journey.
- Verification: focused suite 8/8; full Vitest 1,076/1,076 across 134 files; typecheck, Drizzle journal check, focused Biome, `git diff --check`, and exact-source production build passed. Migration remains unapplied. No push or deploy.

## Checkpoint 20 - Google Calendar mutation approvals (2026-11-05)
- Expanded the existing Google Calendar connector with create/update/delete event actions and a `proposeCalendarChange` review tool/card. The card supports editable create/update details and explicit deletion review; only the returned server token can authorize a write.
- `/api/approvals/calendar` requires authentication, exact same-origin, bounded input, per-user rate limiting, and stores a random short-lived token digest plus canonical action/payload digest in the existing verification table. The connector atomically consumes it before provider writes.
- Updates use PATCH and the provider's ETag to protect against a concurrent edit. Deletion requires reviewed event ID/title/start/end, compares against the current provider record, and uses If-Match when an ETag is available.
- F025 remains PARTIAL: no PostgreSQL/browser/Google OAuth live journey, all-day event handling, or approvals for other mutating connectors/MCP/workflow effects. No schema or package changes.
- Verification: focused approval tests 14/14, full Vitest 1,086/1,086 across 137 files, root typecheck, focused formatter-disabled Biome, `git diff --check`, and production build passed (192/192 pages). No push/deploy.

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
## F025 Productboard create_feature approval (2026-11-06)
- `create_feature` now requires reviewed product ID, feature name and description with a one-use token; mismatches/replays fail closed before network writes.
- Desktop MCP local test route audit confirmed trusted frame/origin gating, native consent, default-deny read-style tool allowlist, bounded process/tool inputs and outputs, and hash-only audit records. Desktop package typecheck and build pass.
- Root full test suite: 1,167/1,167 across 169 files. Desktop policy and chat pagination focused cases passed. Root typecheck, desktop typecheck/build, targeted Biome, `git diff --check`, and production build passed (192/192 pages).
- Remaining: exhaustive MCP/workflow external-effect review and live Postgres/provider/browser/native desktop workflows. No push/deploy or database apply.
## F010/F013 accepted-claim path query (2026-11-06)
- Added shortest path lookup between two graph entity names in the existing brain UI. It uses only accepted facts after current source visibility checks; traversal is undirected and capped at six hops/200 nodes.
- Focused graph/API tests passed 11/11; full suite passed 1,170/1,170 over 169 files; root typecheck, targeted Biome, diff check and production build passed (192/192 pages).
- F010/F013 remain PARTIAL; no live PostgreSQL/browser test, typed-page lifecycle, expert routing or consolidation.
## F010 typed page/merge audit (2026-11-06)
- Reference `merge-pages.ts` and dedupe flow inspected read-only. It transactionally repoints multiple foreign-key families, archives a loser with stable merge lineage, recompiles truth, snapshots versions, and re-embeds the survivor.
- Primary remains a flat reviewed-fact graph; no equivalent canonical entity/page lifecycle. A direct port is incompatible without an additive data layer. Keep status PARTIAL and next design a Void-Agent-native page/alias model plus transactional merge tests before any dedupe automation.
## F010/F013 expert routing slice (2026-11-06)
- Implemented topic-to-person routing using accepted typed-person, alias, and relationship claims in the project fact graph. Alias resolution applies to both person and topic endpoints; every query term must match after bounded normalization. Results include source evidence and collection links, with a UI note that connections do not verify expertise.
- API reuses project access and attached/current/ready source filters; accepted facts alone establish relationships; responses are no-store. No schema or dependency changes.
- Validation: focused tests 14/14; full suite 1,173/1,173 across 169 files; root TypeScript no-emit passed; targeted Biome passed; `pnpm build` passed and generated 192/192 pages.
- Remaining: no live PostgreSQL/browser test; canonical typed-page/alias lifecycle, transactional merges, historical page versions, and consolidation remain absent. F010/F013 remain PARTIAL.

## F025 Windmill/Activepieces run approval (2026-11-06)
- Audited the app-default workflow tool and closed a direct-write path: non-read `run` requires an authenticated, same-origin, rate-limited review card and an exact platform/target/canonical JSON payload token. Repository stores only the user-scoped token and payload digests; token is short-lived and one-use. Windmill scripts and Activepieces flows can still be listed without approval.
- Added tests for canonical payload hashing, payload/target validation, digest-only storage, one-use consumption, API origin/session checks, no-token denial before fetch, exact approval before Windmill request, and read-only discovery.
- Validation: focused workflow approval tests 9/9; full suite 1,182/1,182 across 173 files; root TypeScript no-emit and targeted Biome passed; fresh production build passed and generated 192/192 pages.
- Remaining: approval binds the external automation request but does not verify the semantic side effects inside a third-party flow. Saved chat workflow MCP nodes, direct MCP calls, and workflow editor execution are outside this slice; F025 remains PARTIAL. No live Windmill/Activepieces/PostgreSQL/browser test.

## F021/F025 direct remote MCP approval (2026-11-06)
- Added editable exact-call HITL approval for direct remote MCP tools in chat. Approval binds server UUID/name, tool name, and all JSON arguments; only the token digest and payload digest are persisted under the current user. Tokens expire after ten minutes and are consumed before MCP dispatch. Manual user confirmation issues an exact token and runs through the same gate.
- Added authenticated, same-origin, rate-limited no-store issuance API; approval card; per-tool schema token; fail-closed wrapper; focused schema/repository/API/execution tests.
- Validation: focused tests 9/9; full `pnpm test` passed 1,191/1,191 across 177 files; root TypeScript no-emit passed with 4 GB heap; targeted Biome passed; fresh production build passed and generated 192/192 pages.
- Remaining: no live MCP server/browser or PostgreSQL replay/race workflow. Saved workflow graphs, voice MCP dispatch and standalone MCP test UI are separate effect paths. F021/F025 remain PARTIAL.

## Saved chat workflow execution gate (2026-11-06)
- Implemented current-user access/publication checks at approval issuance and execution; exact user input and workflow identity use a single-use server token before graph execution.
- Verification: focused suite 13/13; isolated `next.config.test.ts` 1/1; typecheck passed; targeted Biome passed; full production build passed with 192/192 pages.
- Full Vitest run: 1,197 passed, 1 failed due `next.config.test.ts` exceeding its 5-second timeout under parallel load. The same test passed alone in 2.42s. Rerun the suite under controlled concurrency before final acceptance.
- Remaining risk: approval UI does not summarize workflow node effects, and graph definition is not fingerprint-bound. Voice MCP and MCP test-page paths still require end-to-end authorization review.

## Voice MCP and MCP test approval extension (2026-11-06)
- Routed OpenAI Realtime, Groq/Konvo and ElevenLabs model-proposed MCP calls through an exact server/tool/arguments review prompt, authenticated approval issuance, and server-side one-use token consumption.
- Added MCP access/name verification during token issuance. Voice-facing model schemas omit the reserved internal approval property; chat-facing tools keep it required.
- Remote MCP test-page calls now require review and token; local desktop stdio remains on the native-consent bridge.
- Validation: full Vitest passed 1,202/1,202 across 179 files with `--maxWorkers=2`; latest focused approval suite 11/11; 4 GB typecheck passed before the small schema-helper refactor and final production build type-check passed after it; targeted Biome passed; current `pnpm build` passed with 192/192 pages.
- No live voice provider/browser, remote MCP, or PostgreSQL replay/race verification. F021/F025 remain PARTIAL.

## Saved workflow effect review + workflow HTTP SSRF (2026-11-06 04:56 IST)
- Complete in source/mock coverage: approval UI fetches an authenticated preview and displays a non-sensitive manifest; graph revision is included in the one-use approval digest and checked against the graph at execution time.
- Complete in source/mock coverage: workflow HTTP nodes call the shared HTTPS/public-address guard and use edirect: "error"; IPv6 checks include compressed hex mapped IPv4 and NAT64, multicast, and malformed forms.
- Validation: 23 focused tests passed across five files; pnpm check-types passed. No live browser/PostgreSQL/HTTP integration was run.
- Remaining: fetch does a separate DNS lookup after validation, so rebinding is still a TOCTOU risk; workflow editor/other execution surfaces need audit and authorization coverage. Overall workflow/tool approval family remains partial.
- Follow-up verification (2026-11-06 05:08 IST): after replacing unsupported BigInt literals detected by Next's build compiler, full pnpm build passed through lint/type checking and 192/192 page generation. Only previously documented non-fatal warnings remain.

## n8n workflow execution route hardening (2026-11-06)
- Implemented session + strict same-origin checks, bounded workflow IDs, per-user rate limiting, per-user n8n `getWorkflow` before `runWorkflow`, no-store results, and generic failure responses.
- Validation: route tests 3/3; root typecheck passed; focused Biome lint and `git diff --check` passed.
- No live n8n verification. n8n graph side effects are opaque; the route-level security slice does not imply full automation parity.

## Embedded workflow MCP access guard (2026-11-06)
- Added one shared server-only guard that checks current per-user MCP visibility, enabled state and server identity against every saved graph MCP node. Invoked for approval preview, approval token issuance, and graph return at execution.
- Tests: 13/13 helper + load + API cases. `pnpm check-types` with 4 GB heap passed. Full `pnpm build` passed and generated 192/192 pages. Targeted Biome lint passed.
- The default 2 GB typecheck process exceeded its heap; rerunning with `NODE_OPTIONS=--max-old-space-size=4096` passed. A full production build also passed; only existing non-fatal warnings remain.
- F025 remains PARTIAL: runtime-generated MCP arguments are not individually staged for review; no browser, Postgres, or live MCP check was available.
## Project-brain source visibility security batch (2026-11-06)

- Fixed an authorization leak in the brain overview endpoint: stored runs and claims are now returned only while their source is ready, belongs to a currently attached collection, and that collection owner is still a current project member. Empty current source access returns no source-derived records. Responses use `Cache-Control: no-store`.
- Applied the same visibility filter inside the transaction that locks and resolves conflicting claims, so stale/inaccessible source records cannot be changed through a guessed fact ID.
- Pagination review: newest-window reads are bounded to 50, ordered by `(created_at, id)`, and older-page comparison stays in PostgreSQL with a same-thread cursor subquery and deterministic equal-timestamp tie-break. The cursor action verifies thread ownership. Existing focused pagination suite passed 6/6; live PostgreSQL cursor testing remains unavailable.
- Validation: brain route + conflict route + pagination tests 15/15; TypeScript check passed with 4 GB heap; focused Biome passed after import-order correction; `pnpm build` passed and generated 192/192 pages. Existing optional Redis/E2B, Next dynamic rendering/workspace, dependency-analysis, PostgreSQL SSL semantics, and image optimization warnings remain.
- No migration applied, production DB accessed, push, or deploy. F010/F012 remain PARTIAL. Next: implement additive canonical typed-page/alias lifecycle with manual review and safe merge semantics; do not add automatic dedupe until transaction rollback invariants are covered.
### Accepted alias collision handling (2026-11-06)

Expert routing now indexes each accepted alias to all canonical labels and resolves it only if exactly one distinct canonical label remains. Added regression coverage for two people sharing an alias; ambiguous alias queries return no arbitrary expert, while topic routing continues to return both experts when the topic itself is unambiguous. F010/F013 remain PARTIAL pending canonical page IDs and merge history.
## F010/F011 typed page and accepted alias foundation (2026-11-06)

- Added project-scoped `ProjectBrainPageTable` and provenance-linked `ProjectBrainAliasTable`, nullable subject/object page links, stable merge-lineage fields, and append-only migration `0042_project_brain_typed_pages.sql` with explicit-claim backfill. Migration journal validation (`pnpm db:check`) passes; migration remains unapplied.
- Queue processing creates pages only for source-grounded `entity type` claims. Pure association helper ties claims to page IDs only for explicit typed identity/relation mapping or unambiguous labels; cross-type ambiguity and ungrounded entities remain unlinked. Alias rows retain source fact IDs; review state is not duplicated.
- Added `GET /api/projects/[id]/brain/pages` and an accepted entity-page panel. Both recheck current attached collection IDs, current member-owned collections, ready source items, and accepted identity/alias fact status. Responses are no-store; page results are distinct/bounded.
- Validation: focused schema/graph/brain route suites 29/29; typecheck passed at 4 GB; targeted Biome passed; `pnpm db:check` passed; fresh `pnpm build` passed and generated 192/192 pages. Existing environment/configuration, dynamic rendering/workspace root, E2B/unpdf dependency, Redis, PostgreSQL SSL, and image warnings remain.
- No PostgreSQL migration was applied, no live database/browser test, no push/deploy. Rollback remains app rollback while leaving additive schema/data intact; destructive down migration is not prepared.
- Still missing: manual user-reviewed merge endpoint/history, graph-wide stable page IDs, page version history/consolidation, and full upstream parity. Next implement merge transactions with same-type and current-source checks plus rollback/idempotence evidence; automatic dedupe remains excluded until then.
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
## F019 â€” Redis-backed resumable chat (2026-11-06)
- Implemented: resumable stream buffering and active thread pointers; owner/session-checked HEAD/GET reconnect; rate-limited same-origin POST cancellation; client resume/stop integration; truthful 503 on stop-signal failure; TCP Redis configuration documentation.
- Verification: 10 focused tests passed across context/resume/stop; targeted Biome passed; `pnpm check-types` passed with 4 GB heap; `git diff --check` passed. Fresh build passed before the final stop failure display refinement (192/192 pages).
- Remaining: live Redis outage/reconnect behavior, browser UX, multi-instance execution, and DB-backed owner path. F019 PARTIAL; no external service or production data accessed.
## Voice session and command audit (2026-11-06)
- Verified current end-to-end device audio behavior: pair/authorize device, bounded WAV validation, transcribe, persist message in device owner's chat, return `saved_for_review`, expose recent history; normal approval pathways remain the route to side effects.
- Reference voice session/segment persistence and finalization/command classifier dispatch are not equivalent. Automatic unreviewed action dispatch remains excluded as a security redesign. Persistent session lifecycle is the next implementation target. F026/F027 PARTIAL.
## F026/F027 â€” Persistent device voice sessions (2026-11-06)
- Implemented session start/replay, authenticated device-owned segment append with deterministic idempotency/conflict handling, serialized finalize, and final transcript persistence into owner chat for review. Added per-device route rate limits, strict bounded schemas, no-store replies, and additive migration 0043.
- Verification: new API/schema focused tests 9/9; existing audio/transcript/history tests 10/10; `pnpm check-types` passed (4 GB heap); `pnpm db:check` passed; final targeted Biome check passed; `pnpm build` passed with 192/192 pages. Formatter-only normalization followed the build and passed Biome; type/build semantics were unchanged by formatting.
- Limitations: no live PostgreSQL transactions/locks, firmware, gateway, hardware or provider test. No audio bytes stored; voice actions remain review-only. Migration unapplied. Families remain PARTIAL.
## F026/F027 owner-facing persisted session history (2026-11-06)
- Added a user-session-authenticated, rate-limited, no-store owner API for recent voice-device sessions. Repository query scopes by device and owner and returns no more than 50 sessions with at most 24,000 transcript characters each.
- Device dashboard history now loads both saved reviewable chat transcripts and persisted audio sessions, showing session status, segment count, timestamps, and transcript text.
- Focused sessions/history route tests passed 5/5; focused Biome formatting completed. Full typecheck is running; no PostgreSQL/device/gateway/browser test. F026/F027 remain PARTIAL because firmware/gateway transport is not present and no live integration has been verified. No migration applied, push or deploy.

## F026/F027 owner-facing session history verification (2026-11-06 08:03 IST)
- Correction to the preceding checkpoint note: 4 GB `pnpm check-types` completed successfully (exit 0).
- Focused session/history route tests passed 5/5. Targeted Biome passed. Fresh `pnpm build` exited 0, compiled with existing dependency warnings, passed type/lint validation and generated 192/192 static pages. Build-time logs continue to include known dynamic-server usage diagnostics for authenticated routes, optional Redis/E2B configuration warnings, PostgreSQL SSL mode notice, and image/dependency warnings.
- No PostgreSQL query/migration, device, gateway or browser journey was run; migration 0043 remains unapplied. The session query and hardware workflow still need live local verification. No push or deploy.

## F018 office document ingestion and owner isolation (2026-11-06)
Implemented bounded TXT/Markdown/JSON/DOCX/XLSX/PPTX extraction in chat using owner-scoped managed attachment keys. Hardened OOXML archive validation against oversized expansion and XML DTD declarations. New managed upload paths receive authenticated owner context; ingestion rejects foreign-owner keys. Kept existing CSV/PDF/Konvo paths.
Validation: focused reader/storage tests 82/82 across 10 test files; 4 GB `pnpm check-types` exit 0; scoped Biome check passed; `git diff --check` passed with existing line-ending warnings; `pnpm build` exit 0 and generated 192/192 pages. Existing build warnings include configured-workspace/lockfile detection, optional Redis/Upstash/E2B settings, authenticated dynamic-render diagnostics, PostgreSQL SSL semantics, dependency analysis and `<img>` optimization.
F018 remains PARTIAL: old global-key files cannot be owner-verified and are rejected for privileged AI ingestion; underlying objects are still public under the existing storage policy; no browser/live backend/PostgreSQL workflow or spreadsheet preview was verified. No DB migration, push, or deploy.

## F010 immutable project-brain content snapshots (2026-11-06)
Added a nullable `content_snapshot` to existing source-version records. New queue/enqueue paths record exact source text capped at 60,000 chars after fingerprint validation. Workers recheck present source ownership/readiness, then analyze the stored snapshot; historical metadata-only rows are hydrated only when current content still matches the recorded fingerprint. This removes the changed-document race between enqueue and model execution.
Validation: source snapshot + brain API tests 13/13; `pnpm db:check` passed; scoped Biome passed; 4 GB heap `pnpm check-types` passed; fresh `pnpm build` exited 0 and generated 192/192 pages. Build emitted the established dynamic server/config/dependency/image warnings.
Limitations: additive migration 0044 is unapplied; no live PostgreSQL, multi-worker, browser, or provider test. Snapshot is capped and exists only for project-brain revisions, not a general historical upload archive. F010/F011 remain PARTIAL.

## F010 owner-visible revision history (2026-11-06)
Added an on-demand revision preview to the project source panel and a dedicated API that returns only one retained snapshot. API access is rechecked against the current project, collection attachments, present collection owners, and ready source item; snapshots are fingerprint/length-verified, capped at 60k, rate-limited and no-store. Legacy versions without text remain metadata-only.
Validation: revision endpoint, brain overview and source-version tests 16/16; `pnpm check-types` passed with 4 GB heap; focused Biome passed; fresh `pnpm build` exited 0 and generated 192/192 pages. Established nonfatal build warnings remain (dynamic route rendering/config/dependency/image notices).
No real Postgres or browser flow was run; snapshot migration 0044 remains unapplied. F010 remains PARTIAL.

## F021 desktop native navigation and downloads (2026-11-06 09:04 IST)
- Integrated safe native download routing for the existing desktop companion's known same-origin export endpoints; retained the sandboxed BrowserWindow, system OAuth handoff, and consent-gated local MCP bridge.
- Navigation permits the configured app origin; opens HTTPS/mailto externally; blocks unsafe schemes; classifies only exact export paths as downloads. Download names are sanitized and URL logs omit query/fragment credentials.
- Validation: focused tests 6/6; desktop typecheck/build passed; focused Biome and git diff check passed. F021 remains PARTIAL: no Electron interactive/export run, updater, or signed releases.


## F014 reference citation column parity (2026-11-06 09:08 IST)
- Added reference-compatible citation instructions only when a citation column is selected: inline [N] markers and a <CITATIONS> block mapping to exact short source quotes; model is told not to invent quotes/references.
- Tests: schema/cell plus tabular route tests 10/10; focused Biome passed. Citation claims are not independently offset-validated; F014 stays PARTIAL.


## F010/F011 source-grounded task proposals (2026-11-06 09:20 IST)
- Source analysis now extracts up to 15 actionable task proposals with exact bounded evidence and optional explicit due dates. Evidence must match the immutable source snapshot; repeated run writes are protected by a run-scoped dedupe key.
- Added durable project/source/run-linked task rows; editor-only accept/reject and accepted-only complete transitions; current source-owner/access checks; source-linked UI with evidence and due-date display. Tasks remain reviewable metadata and never trigger external actions.
- Validation: focused tests 19/19; `pnpm db:check`, 4 GB root typecheck, targeted Biome, and `pnpm build` passed with 192/192 pages. Migration 0045 authored and journaled but unapplied. No live Postgres/provider/browser workflow. F010/F011 remain PARTIAL.


## F014 parity-matrix evidence correction (2026-11-06)
A closer read of the reference tabular review schema and routes confirms that reviews are owner-private, and citation values are plain model-generated text with [N]/<CITATIONS> formatting; the reference does not provide source-offset anchors. These are not missing parity features. The matrix now records this correction; F014 remains PARTIAL for unverified live Postgres/browser workflow and any other documented differences.


## F010 project connector source-sync audit (2026-11-06 09:23 IST)
- Traced the reference attach â†’ manual sync â†’ read-only gather â†’ bounded persisted source â†’ brain analysis path and the detach/todo cleanup behavior. Compared it with primary's per-user chat connectors and existing document-backed queue.
- Confirmed project-scoped external source sync is still MISSING; ordinary connectors available to chat are not equivalent. Integration needs a new project/source lineage design and current credential-owner membership checks; MCP sync must require explicit read-only hints, while Composio actions need stored/revalidated read allowlists.
- No code was changed in this audit. Next implementation target: design the additive project connector/source model and implement one end-to-end MCP read-only attach/sync path with owner/member revocation, bounded output persistence, and task/fact analysis; then adapt Composio.

## F010 project MCP read-only sync slice (2026-11-06)
Implemented migration 0046, connector/sync/source lineage schema, owner-owned server + attached collection checks, editor attach/detach, stored read-only tool allowlist, manual bounded sync, argument validation, per-user rate limiting, idempotency, credential-owner-only execution, untrusted text-only source capture, duplicate-content reuse and project brain queue integration. UI exposes attach, explicit JSON arguments, sync state and detach. Status: PARTIAL pending route/database/browser verification and Composio parity.
### Verification update (2026-11-06)
Route-level attach tests added; combined focused coverage is 34/34. A content fingerprint unique per connector now prevents duplicate generated source documents under concurrent identical syncs. Typecheck, drizzle check, targeted Biome and production build pass. No PostgreSQL-backed route test or browser flow; migration 0046 unapplied; F010 stays PARTIAL.

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

## Continuation handoff (2026-11-06 11:13:21 +05:30)
Request: continue the full Better Chatbot-to-Void-Agent migration, verify pagination, and proceed through major feature systems; keep all work local and the reference checkout unchanged.
Actions this batch: reviewed chat pagination SQL + ownership + stable equal-timestamp ordering; added tie-boundary test. Implemented Composio project-brain multi-step read-only gather with current allowlist/schema checks and explicit UI action. Hardened notification/push mutations against cross-origin requests and corrected zero-delivery success behavior. Audited connector write actions against one-use approval contracts.
Files edited in this batch: src/lib/ai/composio.ts; src/lib/projects/composio-gather.ts and its tests; Composio sync route and project brain panel; pagination repository test; notification contracts, push/read routes and route tests; seven migration documents and this context log. Additive Composio schema/migration 0047 was part of the preceding already-local batch and remains unapplied.
Validation: project connector/MCP + pagination tests 54/54; notification/push tests 12/12; connector approval/API suites 57/57; full TypeScript passed; Drizzle journal check passed; scoped Biome passed; fresh production build passed and generated 192/192 pages. git diff --check reported no whitespace errors (only existing CRLF notices).
Remaining: broad compatibility migration remains incomplete; F010/F012/F025/F029 and other families stay PARTIAL where recorded. No live PostgreSQL/provider/browser tests, no DB migrations applied, no push or deployment. The checkout already contained extensive unrelated dirty/untracked files; they were preserved.
Next exact action: inspect reference F012 contradiction persistence/judgment lifecycle and reconcile it with Void-Agent's derived potential-conflict graph + keep/reject route; implement a durable, source-scoped resolution/history slice if compatible, with additive migration and focused tests. Then continue the unresolved surface inventory.

### F012 continuation (2026-11-06 11:18:20 +05:30)
- Added schema/migration for durable conflict records (migration 0048; unapplied).
- Editor keep-first/keep-second action now upserts a conflict resolution record in the same transaction as fact review updates.
- Focused graph and route tests: 13 passed; pnpm db:check passed. TypeScript was still running when this entry was prepared; see testing report/context for final result.
- Remaining: ingestion-time candidate materialization, resolved/dismissed history retrieval/UI, temporal revisions and reference model adjudication.


### F012 adjudication batch (2026-11-06 11:42:40 +05:30)
- Bounded candidate generator and structured model judge added; no tools, candidate IDs, or source scope are model-controlled.
- Queue follow-up is isolated: classification/provider failure does not mark extraction failed.
- Confirmed contradiction rows are durable and visible with explanation/evidence; compatible/unknown rows are retained closed; keep and dismiss actions are editor-only and transactional.
- Focused contradiction/graph suite: 27 passed. TypeScript, scoped Biome, migration journal check, production build passed. Build generated 192/192 pages.
- Remaining: temporal/source-version linkage, closed-review history UI, PostgreSQL integration/live model verification. Migration 0048 remains unapplied.


### F007 dynamic provider lifecycle batch (2026-11-06 12:04:47 +05:30)
- Async provider resolution now waits for DB hydration across chat, agent, workflow, tools, memory, project, canvas, sandbox and document-review model call paths.
- Model-list/admin config/health/site-config/model stats paths hydrate before reading metadata. Provider POST/DELETE mutations invalidate dynamic registry and runtime config caches.
- Hydration removes disabled, deleted, invalid or empty providers; prevents static/environment provider slug overwrite; handles in-flight cache invalidation safely.
- Tests: full Vitest 211 files, 1,373 passed; full TypeScript passed; scoped Biome passed; Drizzle consistency check passed; production build passed with 192/192 pages.
- F007 remains PARTIAL pending live custom provider and fallback verification. F012 remains PARTIAL pending historical review UI and source-version-linked fact comparison.


## F027 OTA enrollment implementation checkpoint (2026-11-06)
- Implemented: additive registration schema/migration 0049; firmware OTA activation code + challenge + device-held bootstrap secret; authenticated dashboard claim; transactional device creation; encrypted token-at-rest staging; one-time completion endpoint; owner-scoped status polling and timeout cleanup/revocation.
- Validation: 50 tests passed across 19 voice-related files; full TypeScript passed; `pnpm db:check` passed; scoped Biome passed. Fresh build was running when first noted and its final status is recorded in context.md.
- Status: PARTIAL. Physical firmware, live Postgres, browser journey, and websocket gateway not validated/available. Migration remains unapplied.

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
- Added electron-updater through an ESM/CommonJS interop adapter, bounded update-check policy, secure packaged HTTPS feed parsing, main-frame/origin-bound IPC, menu action, user-facing update toast, and Void-Agent electron-builder targets.
- Added packaging preflight for feed and Windows/macOS signing configuration; dist/out directories are ignored. Desktop README documents local packaging setup.
- Validation: updater/feed/policy + desktop MCP focused suite passed 19/19; desktop TypeScript passed; desktop bundle build passed; scoped Biome passed. Root production build was still running when this entry was drafted; final outcome will be appended separately.
- Release limitations: no signing credentials, staging feed, packaging, actual artifacts, or live update run. No push/deploy/reference writes. F021 remains PARTIAL.
- Final verification update: root `pnpm build` exited 0 and generated 192/192 static pages. The full output includes previously documented environment/dynamic-render warnings (missing optional Redis/Upstash/E2B configuration, routes accessing request headers during static probes, dependency-analysis and PostgreSQL SSL-mode notices, and existing `<img>` lint warnings); no updater-related compilation/type errors occurred.

## F010/F012 active source revision (2026-11-06)
- Added migration `0050` with current source-state per project/item and backfilled latest existing run; validated source-version insertion/reactivation atomically updates the pointer.
- Active-revision SQL guard now scopes by run, project and source item. Applied to graph, node detail, page/alias list, fact review, conflict review/classification, knowledge tool retrieval, task list, and page merge identity verification.
- Verification: focused suites 44/44 across 8 files, root TypeScript passed (6 GB heap), Drizzle journal check passed, scoped Biome passed, production build passed (192/192 pages).
- Migration remains unapplied; no disposable PostgreSQL backfill/transaction or browser source-update journey. F010/F012 remain PARTIAL.

### Source-item mutation freshness follow-up (2026-11-06)
Current brain reads additionally ensure the active revision selection is no older than the source item's update timestamp. This hides older derived claims immediately after a source mutation while a refreshed analysis is queued. The timestamp rule is enforced server-side in the correlated run/source-state predicate. Focused suite 44/44, typecheck, Drizzle journal check, and fresh 192/192-page production build passed. Live DB behavior remains unverified.

### Collection source freshness writer verification (2026-11-06)
- Audited collection item mutation callsites: the RAG ingest path transitions an item to `ready`/`failed` through `pgCollectionRepository.updateItemStatus`, which writes a fresh `updated_at`; project connector refreshes create a new source item and activate the new source revision during the sync transaction.
- Added `collection-repository.pg.test.ts` verifying status transitions always include a current `Date` timestamp. Combined focused source/version/queue + repository tests pass 10/10; scoped Biome and `git diff --check` pass.
- This verifies the application writer contract, not PostgreSQL precision, race behavior or browser re-ingestion. Migration `0050` remains unapplied.

## F018 private Blob implementation checkpoint (2026-11-06)
Implemented opt-in Vercel private Blob operations and a local migration guide. Focused tests passed 12/12 across three files. Full typecheck and production build are pending. Public mode remains the default. No external storage config or existing object was changed. The feature remains PARTIAL pending a private staging store and complete browser/model attachment verification; private S3 remains outstanding.

## F018 private object storage checkpoint (2026-11-06)
Implemented optional private Vercel Blob and private S3 URL behavior. S3 owner upload and subsequent URL lookup share the authenticated route; public generated assets retain provider URLs. Focused storage suite passed 31/31 across six files; whole-project TypeScript passed; fresh build was started after S3 changes. No storage credentials/bucket policy/browser/provider integration were available. F018 remains PARTIAL pending live staging verification.

## F018 final private-storage code validation (2026-11-06)
- Final focused storage suite: 31/31 passed across six files; whole-project TypeScript no-emit passed; scoped Biome and `git diff --check` passed.
- Fresh `pnpm build` after both Vercel Blob and S3 changes exited 0 and generated all 192/192 pages. Existing warnings remain for workspace-root inference, dependency analysis, `<img>`, optional Redis/E2B configuration, PostgreSQL SSL mode, and dynamic authenticated routes.
- Private storage remains locally code-verified only. Existing deployments/stores are not migrated. F018 remains PARTIAL until real private Vercel/S3 store, browser, and provider attachment workflows are exercised.

## 2026-11-06 14:42 IST â€” Generic HTTP action review
- Implemented user-visible exact request review, authenticated same-origin rate-limited approval issuance, user-bound one-time exact-payload token persistence, and fail-closed HTTP execution.
- Added HTTPS/public-host validation, redirect rejection, restricted headers, 30-second maximum timeout, 64 KB response cap, and no-user-context static tool refusal.
- Verification: five focused test files, 22/22 passed; whole-project TypeScript passed; focused Biome passed after import ordering correction; scoped diff whitespace check passed.
- Open: DNS connection pinning; actual browser and live provider/PostgreSQL execution. No live outbound call, deployment, push, reference edit, or production data operation was performed.

### 2026-11-06 15:02 IST â€” DNS-pinned HTTP transport verification
- The generic HTTP tool now pins its HTTPS socket to a validated DNS address and applies a five-second DNS lookup timeout; redirect responses are returned without following the Location.
- Focused tests: 24/24; TypeScript no-emit: passed; full production build: passed (192/192 static pages). Existing dependency-analysis, image, dynamic-route, optional-service and PostgreSQL SSL warnings remain.
- Still required for F025: browser user journey, disposable PostgreSQL issue/consume/replay verification, and safe provider check. No live outbound request performed.

### 2026-11-06 15:03 IST â€” Project-brain immutable fact provenance
- Added a direct source-version identity to extracted facts and binds it to the exact project/source item with a composite FK; extraction records the run's source version, and migration 0051 backfills existing rows.
- Focused tests: 38/38 across six suites; pnpm db:check and full TypeScript pass.
- Migration 0051 remains local and unapplied; production build is running. F010/F012 remain PARTIAL pending disposable PostgreSQL, source re-ingestion/history browser journey and contradiction lifecycle verification.

### F010/F012 build verification follow-up (2026-11-06 15:10 IST)
The post-change production build exited 0 and generated 192/192 static pages. Existing dynamic-session/prerender diagnostics, optional Redis/E2B configuration, PostgreSQL SSL mode, dependency-analysis, and <img> warnings remain. Migration 0051 was not applied; no PostgreSQL data verification was performed.

### F010/F012 contradiction decision history (2026-11-06)
- Added a read-only closed-decision history view with source revision provenance (revision ID/time, filename, and the evidence stored on each decision's facts). Existing source-content snapshots are not returned.
- Kept the reference-compatible GET contract: GET /brain/contradictions returns open contradiction candidates for currently active source revisions; GET /brain/contradictions?history=true returns closed decisions, including decisions whose source revisions are no longer current. Both flows enforce project access, attached collection and owner visibility, and ready source status. Existing PATCH decision flow was not changed.
- Focused project-brain API/helper suite: 23/23 passed across four files. Root TypeScript no-emit passed after the final route-contract change. Previous project-brain source-lineage DB journal check passed; no schema changed in this batch.
- A fresh production build reached static generation 192/192 and final tracing, but its process handle expired before an exit code was captured. Treat this build as UNVERIFIED; rerun a fresh build before reporting it as passing. No PostgreSQL/browser workflow or migration 0051 application was performed. F010/F012 remain PARTIAL.

### Current migration focus â€” project-brain dream cycle audit (2026-11-06)
- The reference's manual/nightly dream cycle consists of model-judged page deduplication, cross-source contradiction detection, salience recomputation, and stale-page archival; it records stage metrics and warnings and is separate from source extraction/consolidation.
- Void-Agent has source-version-aware facts, conflict review/history, graph reads, and an audited editor-driven same-type page merge. It does not yet have an equivalent project-wide dedupe/salience/archive scheduler or a verified end-to-end dream cycle. No work on this feature should overwrite user-reviewed fact decisions or auto-merge identities without evidence and review.
- Next action: implement compatible salience refresh and safe stale-page handling in Void-Agent's existing typed-page/fact schema, with project/source visibility checks, role/rate limiting, tests, and explicit UI trigger; then assess whether model-judged automatic dedupe is safe given its user-approved identity merge contract.

### F010/F012 contradiction history and salience batch (2026-11-06)
- Added revision-aware closed conflict history, preserving reference open-conflict GET semantics and existing PATCH behavior. Added editor-triggered salience recomputation/storage on accepted facts, guarded by active revision, attached collection, current owner, ready item, same-origin, role and rate-limit checks.
- Verification: 28/28 focused project-brain tests; typecheck passed with 6 GB heap; Drizzle journal check passed; scoped Biome and diff checks passed; fresh production build exited 0 (192/192 static pages).
- Migrations 0051 and 0052 remain unapplied. No disposable PostgreSQL or browser workflow. Dream-cycle scheduling, dedupe, archival remain incomplete. F010/F012 remain PARTIAL.

### 2026-11-06 15:53:03 +05:30 â€” final exact-source verification update
The accepted project-brain entity page list now sorts by salience so the refreshed score affects the visible ranking. After that final UI/API source change, the focused pages/salience suites passed 10/10 and a fresh pnpm build exited 0 with all 192 static pages generated. Build still emits existing workspace-root, dependency-analysis, <img>, optional Redis/E2B, SSL-mode and authenticated dynamic-route diagnostics. Migration 0052 remains unapplied; no live PostgreSQL/browser run was done.

### F010 page-identity candidate and durable rejection checkpoint (2026-11-06)
- Candidate discovery supports same-type approximate title and alias matches, with a 20-candidate output bound. Editor decisions that a pair is distinct persist in a new review table/migration 0053; dismissed pairs no longer return as suggestions. Review-merge remains a user-confirmed operation through the existing transactional page merge.
- Route revalidates project role and current source visibility; request has same-origin check, size guard and user rate limit. Focused project-brain suite 20/20; Drizzle journal check and scoped Biome passed; exact-source production build passed (192/192 pages); diff check passed.
- No automatic/model merge, stale archival, migration application, or browser/Postgres runtime check. F010 remains PARTIAL.

### F010 reversible stale-page archive/restore batch (2026-11-06)
- Added stale identity candidates (30+ days old; historical visible source fact; no current accepted identity fact), archive and restorable lists, editor-confirmed archive, and current-evidence-gated restoration. Archive writes only the existing archived_at field, rechecks visibility/freshness in the SQL UPDATE, excludes merged redirects, and preserves all facts. Read lists cap at 100. New source analysis can make an archived page restorable once current accepted identity evidence exists.
- Verification: focused suites 24/24; 6 GB root typecheck passed; Drizzle journal check, scoped Biome and diff check passed; production build exited 0 (192/192 pages).
- No new migration. PostgreSQL/browser behavior and scheduled dream orchestration remain unverified; F010 remains PARTIAL.

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


## F024 schedule management interface (2026-11-06 18:12 IST)
- Added /schedules and sidebar navigation. Owners can view their jobs, pause/resume active jobs, delete jobs, and expand the latest 20 run states.
- Added authenticated owner-checked GET run history with UUID/limit validation. Response deliberately excludes provider output and error strings; UI only shows lifecycle status and timestamps. No schema migration.
- Files: src/app/api/scheduler/jobs/[jobId]/runs/route.ts, its test, src/app/(chat)/schedules/page.tsx, src/components/scheduled-jobs-dashboard.tsx, src/components/layouts/app-sidebar-menus.tsx.
- Verification: 4 focused route tests passed; pnpm check-types passed; scoped Biome passed; pnpm build exited 0, 192/192 pages. Existing warnings include workspace root, E2B/unpdf dependencies, image elements, caught dynamic session diagnostics, missing shared Redis/E2B env, and PG SSL mode.
- Limitations: no browser or PostgreSQL runtime; no schedule create/edit, diagnostics, or explicit run-now control. F024 remains PARTIAL. No push, deployment, or production database changes.



## F024 schedule creation form (2026-11-06 18:30 IST)
- The dashboard now creates one-time jobs from a required future datetime and recurring jobs from a five-field cron expression, using the existing POST /api/scheduler/jobs endpoint. Names are optional; prompts are required and bounded. UI labels UTC semantics to match the current schema/worker contract.
- Final-source verification: focused run-history API tests 4/4; `pnpm check-types` passed with Node heap set to 6 GB (default 2 GB attempt ran out of heap); scoped Biome passed; fresh `pnpm build` exited 0 with 192/192 pages. Existing warning classes remain as recorded above.
- Still partial: schedule editing, timezone-aware recurrence/DST, diagnostics, manual triggering and live browser/PostgreSQL validation.



## F024 diagnostics, editing, and mutation hardening (2026-11-06 18:53 IST)
- Added authenticated GET /api/scheduler/diagnostics and a dashboard panel. It reports only the current user's job names/status/next run/due-now state and Boolean presence for cron/internal secrets/base URL; response uses private, no-store.
- Added prompt/timing edit through owner-scoped PATCH. Re-normalization validates cron or one-time timestamp/lead time, recomputes nextRunAt and preserves agent ID, thread association, and creation source. Schedule create, edit, pause/resume and deletion now fail closed without a same-origin Origin header.
- Focused Vitest: 5 files / 25 tests passed (diagnostics auth and secret redaction, create/mutation Origin checks, job ownership/history bounds, recurring/one-shot normalization). Whole-project typecheck with 6 GB heap passed, scoped Biome passed, fresh production build exited 0 and generated 192/192 pages.
- No browser or PostgreSQL runtime. UTC-only recurrence remains, and no safe run-now endpoint exists. F024 remains PARTIAL; no migration/push/deploy/production DB action.


### F024 IANA timezone recurrence and DST support (2026-11-06 19:16:29 +05:30)
- Added additive local migration 0055 (scheduled_job.timezone, default UTC); migration journal check passes and the migration was not applied.
- Recurring schedules now validate IANA zones and compute next occurrences across DST with cron-parser. Dashboard creation/edit, the chat scheduler tool, and /schedule --timezone <IANA> all carry timezone metadata. Existing UTC recurrence retains Void-Agent's legacy AND behavior when both day-of-month and day-of-week are constrained; this behavior is tested for UTC and New York.
- Verification: scheduler/slash/API focused tests 53/53, whole-project pnpm check-types with 6 GB heap, pnpm db:check, and scoped Biome all passed. Production build was attempted but exited 1 after Webpack repeatedly failed to restore cache entries (UNKNOWN: unknown error, read) and ended with Cannot read properties of undefined (reading 'length'); no source-level compile error was reported. Build remains unverified pending a clean cache retry.
- No browser, PostgreSQL runtime, migration apply, push, deployment, or production DB action. F024 remains PARTIAL: atomic worker claiming/lease protection and safe manual-run semantics remain open.

### F024 durable job claim lease update
- Scheduler due-job claims now use a PostgreSQL transaction with `FOR UPDATE SKIP LOCKED`, persist a per-tick UUID claim token and expiry, heartbeat active work, and fence final schedule advancement/release by token. Expired claims are recoverable after worker termination; pause/reschedule clears the lease. Claim requests with non-positive or non-finite limits return no rows.
- Focused scheduler/API suites passed 51 tests across 7 files; TypeScript, `pnpm db:check`, and scoped Biome passed. PostgreSQL-backed concurrency and worker crash tests remain unavailable; migrations 0055/0056 are authored but unapplied. The system remains at-least-once if the process dies after causing the chat side effect but before persisting completion. Manual run remains unimplemented.

## F019/F025 status correction and n8n review gate (2026-11-06)
- Corrected stale base classifications: F004, F010â€“F013, F019 and F021 were marked MISSING despite later implementation evidence in this matrix. They are now PARTIAL; later implementation notes remain authoritative.
- F019 evidence: `src/lib/ai/chat-stream-context.ts`, `src/app/api/chat/[id]/stream/route.ts`, `src/app/api/chat/route.ts`, and `src/components/chat-bot.tsx` implement Redis-buffered stream resumption, owner-scoped HEAD/GET, stop signaling, and client resume. Redis is optional and no live Redis/browser journey was performed; status PARTIAL.
- F025: Void-Agent Run controls for n8n now fetch a bounded effect manifest and executable-definition hash, show an explicit review, issue a user-scoped one-use token bound to platform/workflow/revision/input, re-fetch and revalidate immediately before execution, and consume before calling n8n. Manual-trigger JSON is passed through `triggerToStartFrom`; output is reduced to a bounded acknowledgement so execution data is not returned.
- F025 evidence: `src/lib/n8n/workflow-review.ts`, `browser-approval.ts`, `client.ts`, workflow approval API, execute API, `workflow-list-page.tsx`, `n8n-workflow-embed.tsx`, and `node-config/execute-tab.tsx`. Payloads have a 24-level JSON nesting cap, a 20 KB request bound, owner session, same-origin validation and rate limits. No database schema change; approvals reuse atomic one-use verification deletion.
- Security boundary: this gate applies to Void-Agent's Run controls and app test runner. The embedded external n8n editor still permits its own explicit Run action outside this gate; manifest classification is heuristic and workflow GET/revision check cannot be atomic with n8n's subsequent execution POST.
- Verification: 20 focused approval tests across 6 files passed; 6 GB TypeScript check, scoped Biome, and Drizzle journal check passed. Production build completed with 192/192 static pages after fixing JSX lint; existing E2B/unpdf critical-dependency, `<img>`, dynamic-server, optional Redis/E2B, workspace-root and PostgreSQL SSL warnings remain. No live n8n/browser/PostgreSQL test, no push/deploy.

## F026 reviewed voice transcript handoff (2026-11-06)
- Added a user-selected handoff from enrolled-device transcript history into the saved conversation. The chat page loads the transcript from the database through an owner/thread/message/source-checked server action, then displays the exact transcript in a review card. Only a second explicit â€œSend to assistantâ€ click creates a normal user chat message.
- Device audio/transcript routes remain side-effect-free. Any subsequent model tool call goes through normal chat authorization and the existing exact-payload approvals; no voice-triggered tool, agent, schedule, or workflow is executed directly.
- The transcript handoff accepts only `source: voice_device`, matching owner/thread/message, plain text only, capped at 24,000 characters. A forged URL query can only open the review card; it cannot submit the transcript automatically. The query is removed before loading.
- Evidence: `src/lib/voice/handoff.ts` and tests, `loadVoiceTranscriptForHandoffAction` in `src/app/api/chat/actions.ts`, the device dashboard handoff affordance, and the `processVoice` review flow in `src/components/chat-bot.tsx`.
- Verification: voice/chat regression set 23/23 across 8 files; handoff/audio/finalize subset 7/7; TypeScript passed with 6 GB heap; scoped Biome passed; production build passed and generated 192/192 static pages. Existing warnings remain for optional Redis/E2B configuration, multi-instance memory rate limiting, PostgreSQL SSL mode, dynamic session routes, E2B/unpdf dependencies, `<img>` use and workspace-root inference.
- F026 remains PARTIAL: no live device/audio provider, browser journey, or PostgreSQL test; the referenceâ€™s automated voice intent classifier and draft workflows are not yet replicated. Direct side-effect dispatch was intentionally not adopted because the reference invokes tools before history dedupe, allowing retries to repeat side effects. No schema migration, push, deploy or reference change.

### Final F026 interstitial build verification (2026-11-06)
- Final voice handoff behavior is review-only on page load: the `processVoice` URL marker retrieves an owner-checked transcript and renders an exact-text review card; a separate Send to assistant button submits it. This was added after the earlier voice validation run.
- Final `pnpm build` passed after this UI change and generated 192/192 static pages. Existing warnings remain: E2B/unpdf critical-dependency traces, `<img>` optimization warnings, dynamic-session prerender diagnostics, optional Redis/E2B config, memory-rate-limit multi-instance notice, PostgreSQL SSL-mode notice, and Next workspace root inferred from multiple lockfiles. Scoped voice tests 23/23, TypeScript and Biome passed. No live browser/device/PostgreSQL verification.

### F018 stored-document preview slice (2026-11-06 20:30:13 +05:30)
Implemented /api/storage/document and attachment preview dialog for DOCX/PPTX/TXT/MD/JSON. Added DOCX archive inflation validation before Mammoth extraction and API regression coverage. Focused tests: 30 passed; pnpm check-types, pnpm db:check, and production build passed (192/192 pages). F018 remains PARTIAL because no browser/live storage run occurred and this does not cover PDF/audio preview or all attachment/multimodal workflows.

### F018 audit corrections (2026-11-06 20:35:36 +05:30)
Parallel review identified and corrected two preview edge cases: report DOCX as a partial text extraction and derive filename extensions from URL path rather than signed query text. Added focused tests for URL decoding/query handling and the DOCX partial flag. Final correction tests passed 33/33; TypeScript passed.

### F025 connector mutation audit (2026-11-06 20:35:36 +05:30)
A full static pass over src/lib/ai/tools/connectors/*-tool.ts found no uncovered external write action. Each listed connector mutation consumes a one-use exact-payload approval before calling the provider. Read-only POST searches are not gated as writes. Remaining approval work is outside these connector modules: saved workflow internal effects and the native n8n editor bypass.

### F017 team-shared collection implementation (2026-11-06 21:12:22 +05:30)
Added explicit team sharing through the existing collection orgId. Team owners/editors can create; current members can read; viewers are read-only; item ingestion rechecks access after parsing. Collection listing/item reads and deletion include current membership predicates. Team shared collections can be attached only to same-team projects. Chat validates saved explicit selections and RAG repeats current team membership in SQL. Added migration 0057 for collection.org_id index (unapplied). Validation: 25 focused tests across six files passed; TypeScript, Drizzle check, and production build passed (192/192 pages). F017 remains PARTIAL pending live DB/browser tests, team-visibility controls, and complete project-brain org-source reconciliation.

### F017 project-brain source-scope follow-up (2026-11-06)
Project-brain reads now add the owner of an explicitly attached same-team shared collection to the source-owner scope, while personal collection owners remain limited to current project members. Exact attached collection IDs remain mandatory on every query. Active team-member IDs remain a separate credential authorization scope. Authorized editors can enqueue ready items from attached team-shared collections. Focused project-brain suites passed 72/72 across 14 files; typecheck and build remain pending. The worker still requires the original requester to retain project edit access, intentionally failing queued work after that requester's membership is revoked.

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

## 2026-11-07 verified batch checkpoint

Completed and verified since the previous checkpoint: project selected-member access backend/UI (including role changes and CSRF hardening); CreateAgent built-in tool selection; text-only conversation archive import/export; tabular review inline streaming/citation integrity; dynamic provider model catalog enforcement; finalized voice capture summaries and transcript race guards; desktop exact-config MCP consent; notification unsubscribe, user-scoped agent updates, and service-worker URL hardening.

Verification: full `pnpm check` passed (1,666 tests / 283 files); production build passed (193 pages). Focused results and limitations are in `docs/testing-report.md` and the relevant family addenda above. Migrations are local and unapplied. Overall parity remains incomplete; no final completion percentage is claimed from the family-level matrix.

Next: reconcile these entries against every reference route/page/tool surface, prioritize remaining major families (including provider quotas, desktop bridges, voice gateway modes, and event coverage), run database-backed/browser journeys when configured, and only then revise per-feature completion status.

### GitHub checkpoint (2026-11-07 00:15 +05:30)
Verified migration snapshot pushed to private ibrahimkhan008/Void-Agent as commit 23589b8 on main. The local workspace retains only the two unrelated untracked CognixAI specification files; no code changes remain unpushed. No deployment or production database migration was performed.

## F015 published page implementation checkpoint (2026-11-07)
- Added append-only `published_page` version storage in migration 0060. Owners can publish/republish an HTML snapshot under an unlisted slug, manage their pages, and revoke them; the tool card links the published version.
- Public reads at `/p/[slug]` return uncached HTML with a restrictive CSP sandbox (opaque origin, scripts allowed for static interactivity, network/form/frame/object access blocked). Publish requests are same-origin, authenticated, rate-limited, bounded, strict-schema parsed, and owner-checked when republishing an existing slug.
- Evidence files: `src/app/api/published-page/route.ts`, `src/app/api/published-pages/route.ts`, `src/app/p/[slug]/route.ts`, `src/components/published-pages-dashboard.tsx`, `src/components/tool-invocation/published-page-tool.tsx`, `src/lib/published-page/schema.ts`, `src/lib/published-page/slug.ts`, `src/lib/published-page/slug-validation.ts`, `src/lib/db/pg/repositories/published-page-repository.pg.ts`, `src/lib/db/pg/schema.pg.ts`, migration `0060_published_pages.sql`.
- Agent-reported verification: focused tests 20/20 across 7 files; `pnpm db:check`, scoped Biome, and `git diff --check` passed. Typecheck/build and live database/browser workflow are pending; migration 0060 remains unapplied. F015 stays PARTIAL.

## 2026-11-07 status addendum
- **F024 / CreateAgent schedule:** Optional recurring schedule review now feeds the existing scheduler. Durable idempotency and exact agent owner check are implemented; 38 focused tests pass. Migration 0061 is local/unapplied, and typecheck currently has two unrelated shared-work errors; no build/live scheduler test. F024 and CreateAgent remain PARTIAL.
- **F015 / published pages:** Versioned HTML publishing, owner management, revoke and CSP-sandboxed public reader are implemented in 0060 with 20 reported focused tests. Integrated type/build and live database/browser checks remain pending. F015 remains PARTIAL.

## F008 team-member monthly AI budget implementation (2026-11-07)
- Added explicit admin-managed provider/model input and output rates in the `models.modelPricing` config section, stored as EUR micros per million tokens. No model prices are guessed. A capped member selecting a missing or wrong-currency rate fails closed before chat generation; uncapped users retain current model behavior.
  - Added default €15 monthly hard-stop policies for non-owner team memberships, with owners/personal teams uncapped, plus persistent UTC monthly usage periods and per-run idempotent reservations. Enforcement is opt-in through admin model config `teamMemberBudgetsEnabled` (default false), preserving existing chat behavior until enabled. Configure trusted model rates before enabling. The main chat path derives scope from the authenticated thread/project, verifies team membership, reserves before model execution, finalizes from provider token usage, releases on abort/error, and expires orphan reservations after 15 minutes.
- Files: `src/lib/ai/model-pricing.ts`, `model-pricing.server.ts`, `team-member-ai-budget.ts`, `team-member-ai-budget-core.ts`, `src/app/api/admin/config/route.ts`, `src/app/api/chat/route.ts`, `src/lib/db/pg/schema.pg.ts`, `src/lib/db/pg/repositories/team-repository.pg.ts`, `src/lib/db/pg/repositories/chat-repository.pg.ts`, `src/types/chat.ts`, migration `0062_team_member_ai_budget.sql`, and the two focused test files.
- Verification: focused pricing/budget tests 8/8; scoped Biome passed; `pnpm check-types` passed with a 6 GB Node heap. No PostgreSQL test URL was configured, so migration execution, advisory-lock concurrency, and DB-backed authorization were not exercised. Migration 0062 remains unapplied.
- F008 remains PARTIAL. The admin Models page now includes explicit opt-in and trusted per-model EUR rate controls. No per-member cap editor exists in the reference; it seeds the fixed €15 monthly cap for members and leaves owners uncapped. Current cost enforcement covers main `/api/chat` team-scoped threads/projects only; temporary chat, titles, agent generation, embeds, skills, canvas/artifacts/browser helper calls, tabular review calls and direct image generation remain outside this ledger. Their actual route/model pricing and team scope need separate adaptations before whole-product cost parity can be claimed.

### F008 final rollout-gate build verification (2026-11-07)
- Post-gate focused checks: rollout/pricing/budget tests passed 13/13; scoped Biome passed; 6 GB `pnpm check-types` exited 0.
- Post-gate production build exited 0 and generated 193/193 pages; log: `.audit/build-20261107-rollout.log`. The integrated 1,699-test / 291-file suite was run before the rollout-gate correction and must not be attributed to this final gate state.
- Migration 0062 remains unapplied; live PostgreSQL concurrency/migration verification remains pending. F008 remains PARTIAL for lack of admin pricing/cap UI, DB-backed verification, and route coverage outside main team-scoped `/api/chat`. No push or deploy.

## F025 model-pin integration checkpoint (2026-11-07)
- Adapted the optional reference provider/model pin without changing the agent table: store it in existing instructions JSON, validate against the authenticated enabled-model catalog at create/update time, and bind the reviewed value into approval idempotency hashing.
- The chat route resolves the mentioned agent through the existing authorized lookup before resolving the model. It uses the agent pin as the effective model, rejects stale pins with HTTP 409, and preserves request-selected behavior for unauthorized/no-pin agents. Existing model fallback continues for normal runtime failures; it is not used to hide a disabled stored pin.
- Verification: 27 focused tests across 5 files passed; scoped Biome checks for the seven isolated/new helper and API test files passed; scoped `git diff --check` passed. Shared `chat/route.ts` and HITL card have broader concurrent changes; whole-file formatting checks report existing formatting deltas and were not auto-applied. Integrated typecheck/build is pending with root.

### F015 bounded publication storage (2026-11-07)
- Added transactional storage bounds using existing rows only: 50 snapshots per owner and 10 versions per slug. Republish removes oldest version history first; new-page publication can reclaim revoked snapshots. If no safe prune can make room, route returns 409 and the tool reports the snapshot quota.
- Owner lock is acquired before slug lock to serialize quota checks across concurrent different-slug publishes. Active pages are not deleted to satisfy quota. No schema change or migration application.
- HTTPS remote assets remain allowed as required by the upstream page-generation instructions; referrer is omitted, but remote asset servers can still see requests/viewer IPs. F015 remains PARTIAL pending live PostgreSQL concurrency and browser testing.

## Integrated verification checkpoint (2026-11-07)
- Root integrated `pnpm check-types` exited 0. Full Vitest suite passed 1,743 tests across 299 files.
- First two production build attempts failed during the compile stage with `undefined.length` and no stack/module attribution. The generated `.next` directory was preserved recoverably at ignored `.audit/next-failed-20261107-0130`; it was not destructively deleted. A clean production build (session 42765) then exited 0 and generated 194/194 pages.
- The successful build still emitted known warnings: inferred workspace root, dependency critical-dependency diagnostics, existing `<img>` lint warnings, caught dynamic-server/session diagnostics during static generation, optional Redis/Upstash and E2B configuration warnings, and PostgreSQL SSL-mode warning. These did not fail the build.
- No source changes in this checkpoint; no production DB operation/migration application, push, or deployment. F008 and F015 remain PARTIAL pending DB-backed/live journeys and migration application. CreateAgent remains PARTIAL pending file-binding parity; model-pin and optional schedule slices have focused test evidence. F032 implementation/build/type evidence is complete; retain PARTIAL only if a browser performance workload is required for acceptance.

## 2026-11-07 integrated quality gate
- Root integrated `pnpm check-types` exited 0; full test suite passed 1,743/1,743 across 299 files.
- Two production build runs failed in compile with `undefined.length` and no stack. The generated `.next` tree was moved recoverably to ignored `.audit/next-failed-20261107-0130` for investigation. Clean build session 42765 passed and generated 194/194 pages. Non-fatal known warning categories are recorded in the testing report.
- Status review: F032 implementation is complete under code/type/build verification; keep PARTIAL only if browser performance benchmarking is an explicit acceptance requirement. F008 remains PARTIAL (unapplied 0062, DB journey and broader route coverage). F015 remains PARTIAL (unapplied 0060 and no browser/Postgres lifecycle test). CreateAgent remains PARTIAL because file bindings and full end-to-end journeys are incomplete, despite model pin/schedule slices.
- No source changes, migration application, production DB operation, push, or deployment in this verification batch.

## F023 managed generator/dashboard adjudication (2026-11-07)
- The reference community source has no executable hosted workflow generator or dashboard. Its registered `generate_workflow` tool calls a stub that explicitly returns `null`; dashboard URL/database fields exist only in schema and migration 0064, with no provisioning, session route, UI, or worker.
- Classification: managed generator/dashboard EXCLUDED as source-incomplete/hosted-only. Ordinary workflow list/create/editor/execute remains a separate implemented capability in both projects. Primary additionally retains internal graph workflows and its authenticated n8n integration. No live deployment/provider workflow was run.

## F010/F014 verified implementation update (2026-11-07)
Project-brain queue completions now run scoped salience refresh and bounded stale-page archiving once per affected project per queue batch. Table review manual creation now supports multiple typed custom extraction columns, including citation, with an eight-column ceiling. See matrix evidence files/tests. Both families remain PARTIAL: F010 still lacks full scheduled dream/dedupe and live DB workflow verification; F014 still lacks live DB/browser/provider workflow verification.

## F027 voice-device review path (2026-11-07)
Finalized nonempty device sessions now expose the deterministic saved transcript message ID to the authenticated owner dashboard. The link opens the existing explicit assistant review/preview workflow; there is no automatic command execution. Focused route tests (7/7), scoped Biome, and diff check pass. Reference WebSocket transport requires an external gateway absent from the community checkout, and hardware/browser/PostgreSQL journeys remain unverified; F027 remains PARTIAL.

## F030 Stripe Cockpit slice (2026-11-07)
- Implemented an end-to-end Stripe-only connection and finance overview in `src/lib/cockpit/stripe.ts`, the `/api/cockpit/stripe/*` routes, and `/cockpit` UI. Personal connections belong to the signed-in user; team connections are readable by current members and manageable/testable/removable only by owner/editor roles.
- Added AES-256-GCM secret storage and migration 0063 with separate partial unique keys for personal and team scope. Secrets are not returned. Stripe egress is fixed-host HTTPS GET, request-rate-limited, timeout-bounded, limited to 10 pages × 100 list records, and response-body capped at 2 MiB.
- Focused tests pass 17/17, scoped Biome lint passes, `pnpm db:check` passes, and the 6 GB project typecheck passes after fixing the status type. No PostgreSQL migration was applied; no authenticated browser journey or live Stripe call was run.
- Scope is one of six discovered Cockpit providers. Website, Vercel, Revolut, Superlog, SEO, unified finance composition and reference console controls remain; F030 stays PARTIAL pending remaining provider work and DB/browser verification.


## F030 Stripe Cockpit slice (2026-11-07)
- Implemented an end-to-end Stripe-only connection and finance overview in src/lib/cockpit/stripe.ts, the /api/cockpit/stripe/* routes, and /cockpit UI. Personal connections belong to the signed-in user; team connections are readable by current members and manageable/testable/removable only by owner/editor roles.
- Added AES-256-GCM secret storage and migration 0063 with separate partial unique keys for personal and team scope. Secrets are not returned. Stripe egress is fixed-host HTTPS GET, request-rate-limited, timeout-bounded, limited to 10 pages x 100 list records, and response-body capped at 2 MiB.
- Focused tests pass 17/17, scoped Biome lint passes, pnpm db:check passes, and the 6 GB project typecheck passes. No PostgreSQL migration was applied; no authenticated browser journey or live Stripe call was run.
- Scope is one of six discovered Cockpit providers. Website, Vercel, Revolut, Superlog, SEO, unified finance composition and reference console controls remain; F030 stays PARTIAL pending remaining provider work and DB/browser verification.

## F025 CreateAgent file binding implementation update (2026-11-07)
Agent file bindings are now validated server-side using the authenticated user's storage prefix; existing valid creator-owned bindings can be retained when editing a shared agent, with owner metadata sourced from the server record. At runtime, bindings flow into sandbox tool construction and stage into a persistent workspace with bounded safe names, an idempotent manifest, safe cleanup, 50 MiB per-file and 100 MiB aggregate caps. FileStorage's new metadata-preflight + streamed `downloadLimited` prevents oversized objects from being fully buffered before the cap. Focused tests pass 35/35 across 6 files; scoped Biome passes. CreateAgent remains PARTIAL pending integrated check after all changes and live storage/E2B/browser journey.

## F021 desktop server chooser implementation checkpoint (2026-11-07)
- Added reference-backed first-run and Change Server selection for the standalone Electron companion. New user profiles choose configured cloud or a self-hosted Void-Agent server; legacy profiles with existing browser data keep the configured cloud origin and cookies through upgrade. Explicit choices persist and restart the main process so all origin-bound policies are rebound.
- Custom server URLs are HTTPS-only in production, reject URL credentials, are identity-checked against the primary `/api/health` marker with bounded no-credential/no-redirect probing, and accept the recognized degraded health response. Development may choose loopback HTTP only.
- A dedicated minimal preload and trusted data-page IPC isolate server selection. Existing desktop MCP local consent, default-deny tool policy, and audit controls remain unchanged. The upstream `/api/auth/ok` endpoint was not copied because it is absent in primary.
- Verification: 16 focused tests; desktop typecheck, desktop build, and scoped Biome pass. No live Electron/server/OAuth/package journey. F021 remains PARTIAL; next verification is first-run, server switch, and legacy-profile behavior in an actual desktop runtime.


## F030 Vercel provider checkpoint (2026-11-07)
- Added a Vercel read-only connection/dashboard slice: encrypted token+configuration, optional team discovery, up to six projects, production deployment status/date/URL, and seven-day ERROR counts. It does not claim spend/margin support.
- Generalized unapplied migration 0063 with encrypted config while preserving Stripe's existing encrypted-secret path and personal/team uniqueness. Team members may read; only owner/editor may manage/test/remove.
- Focused tests pass 28/28 across five files; scoped Biome lint passes (15 files); `pnpm db:check` passes. Whole-project typecheck has no F030 errors and is blocked by concurrent project-brain error at `src/app/api/projects/[id]/brain/status/route.ts:172`.
- No database migration, live Vercel call, or browser workflow was run. Other providers, unified console and PostgreSQL authorization remain. F030 stays PARTIAL.

## F029 project health transition implementation addendum (2026-11-07 06:41:22 +05:30)
- Added a generic, deduplicated notification after a project-brain health snapshot is persisted and a known health transition is detected. Recipient resolution follows current personal/team/selected-project access and excludes former team/project members; text contains only the health transition, not project names, summaries, blockers, source content, or model output.
- Reference-equivalent project-consolidation todo digest remains absent; this is an additional health-transition producer, not full notification parity. F029 remains PARTIAL pending the consolidation pipeline, PostgreSQL-backed recipient/persistence checks, browser permission flow, and real VAPID delivery.
- Focused route/helper/generation tests passed 19/19 across 4 files; scoped Biome passed; full suite, whole-project typecheck, db journal check, and production build results are in docs/testing-report.md.

## F030 Vercel integration addendum (2026-11-07 06:41:22 +05:30)
- In addition to the verified Stripe slice, Void-Agent now has a read-only Vercel production-deployment panel for up to six configured projects, with latest status/date/URL and seven-day deployment error counts. Vercel config/token are encrypted as a single payload; migration 0063 remains additive and Stripe's existing secret column remains compatible.
- Egress is fixed-host HTTPS GET-only with redirect rejection, bounded response/time/team/project/deployment limits, rate/origin/body guards, and role-scoped team access. Focused Vercel tests passed 28/28 with scoped Biome and db journal checks.
- Website, Revolut, Superlog, SEO, unified multi-provider finance controls, live database, live provider, and browser workflows remain. F030 remains PARTIAL.

## Checkpoint 17 � verified cross-family implementation batch (2026-11-07)

- Completed local implementation slices for F008, F010/F011, F014, F020/F021, F022, F026, F028, F029, F030, and F031; see the per-family addenda in the feature matrix and security review. They remain PARTIAL where full provider/Postgres/browser verification or additional reference behavior is absent.
- F008 agent-generation route remains unbilled because it has no persisted server-side team scope. Do not trust a client team ID to fill this gap.
- Full verification for the resulting source snapshot: typecheck passed; full Vitest passed **1,921/1,921 across 331 files**; `pnpm lint` passed with existing `<img>` and workspace-root warnings; `pnpm db:check` and `git diff --check` passed; production build passed and generated **198/198 static pages**.
- Build still emits existing E2B/unpdf dependency-analysis, Next dynamic-session/static-probe, PostgreSQL SSL, memory-cache/Upstash, and optional E2B warnings. No migration was applied and no live Postgres/provider/browser workflow was run.
- Local only. No commit/push/deploy. Reference checkout was not written; its read-only status query showed 3,072 staged entries whose previous baseline could not be independently established, so these are preserved untouched. Two untracked CognixAI specification files in primary remain unrelated and excluded.
- Next: continue the remaining feature roadmap; current full checks only certify this snapshot, not global reference parity.
- F030 Revolut slice: encrypted OAuth client ID/private key/refresh token persistence, server-side RS256 assertion and refresh flow, fixed-host read-only balances/30-day transactions, bounded response handling, same-origin/rate-limited writes, personal/team ACLs, and dashboard are implemented. Focused tests 6/6, scoped Biome, and db journal check passed. Migration 0063, live provider/Postgres/browser verification remain outstanding; F030 PARTIAL.

## F030 Superlog provider checkpoint (2026-11-07)
- Added an encrypted, read-only Superlog MCP connection and dashboard using the fixed hosted endpoint; the workflow includes incident search, firing alerts, error logs, and per-service counts, filtered to the actual declared MCP arguments.
- Focused tests: 8/8; scoped Biome and diff check passed. Integrated project typecheck/build are pending root verification. Migration 0063 is not applied, and live provider/Postgres/browser journeys were not run.
- F030 remains PARTIAL: SEO and unified Cockpit/data/alert behavior plus environment-backed end-to-end checks are not complete. No push or deployment.
## F028 lifecycle audit follow-up (2026-11-07 09:20 IST)
- Rechecked complete reference sources: Slack subscription/task schema and migration plus settings UI calls exist, but no `/api/slack` route tree or table consumers implement event validation/replay protection, task execution, or response delivery. The reference channel lifecycle is therefore source-stub-only and EXCLUDED; no imitation code or migration was added.
- Primary inbound processing remains PARTIAL and separate: owner binding and HMAC validation protect its existing queue delivery. Focused current owner/HMAC tests passed 8/8; this is not reference channel-lifecycle parity. Overall F028 remains PARTIAL.
## F030 additional SEO provider (2026-11-07)
- Added DataForSEO domain overview, ranked-keyword list and optional backlink summary on Cockpit's encrypted credential store; added personal/team scoped connection APIs, same-origin/rate-limited writes, manager-only mutations and `/cockpit/seo` dashboard.
- Fixed egress host, redirect rejection, timeout, streamed body cap, validated bare domain, filtered MCP arguments to declared properties, and reject obviously mutating tool names. Added SEO to Cockpit provider allowlist in `schema.pg.ts` and migration `0063_cockpit_connections.sql`.
- Focused SEO + Superlog tests pass 15/15; scoped Biome and `pnpm db:check` pass. OpenSEO/Navigator OAuth, unified Cockpit, PostgreSQL-backed checks and live provider/browser verification remain. F030 remains PARTIAL.
### F030 SEO rate-limit regression verification (2026-11-07)
- Added coverage for GET, POST, and DELETE returning 503 when rate-limit storage fails, with no save/remove action. Final SEO + Superlog focused suite passed 16/16 across 4 files; scoped Biome and diff check passed. F030 remains PARTIAL.

## F025 verification batch — n8n approval (2026-11-07)
- Completed and locally verified the n8n blind-approval fix: only understood logic and literal HTTP effects are reviewable; exact bounded method/URL/parameters appear in the effect preview; credential references are type-only; unsafe dynamic, unknown, secret-bearing, oversized, and complex effects cannot receive approval tokens.
- Focused tests 13/13; scoped Biome and git diff --check passed. No live n8n or credentialed execution. F025 remains PARTIAL for unsupported integration adapters and broader agent/tool parity.
## F008 project-brain status budget slice (2026-11-07)
- Added server-authoritative team-budget handling to project status generation: unchanged fingerprints reuse snapshots; current project team scope and enabled model selection are server-derived; successful calls settle actual usage or the reserved estimate; pinned billable model calls do not retry; authorization and evidence are rechecked before persistence.
- Fixed settlement failure handling so successful inference cannot release its reservation on a later ledger error. Focused status/service/runtime tests pass 25/25; integrated typecheck passes.
- F008 remains PARTIAL: 0062 is unapplied, live PostgreSQL verification is unavailable, and the remaining AI route/model surface is not all billed through this budget.
## Integrated verification after F008/F025 security follow-ups (2026-11-07)
- Current combined worktree: 1,988/1,988 tests passed across 348 files; 6 GiB integrated typecheck passed; lint exited 0 with existing `<img>` and multiple-lockfile warnings; Drizzle journal check passed; production build exited 0 with 202/202 pages; `git diff --check` passed with line-ending notices.
- This verifies the local source snapshot only. Database migrations remain unapplied and external provider, live PostgreSQL, browser, voice-device and Electron GUI journeys remain unverified. Families with documented gaps remain PARTIAL/EXCLUDED; no overall parity completion percentage is claimed.