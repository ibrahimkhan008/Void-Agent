# Feature work register

This is the current feature-level progress ledger. A row is one user-visible workflow, not one route, page, tool module, or broad family. `COMPLETE` requires equivalent behavior plus an end-to-end verification trail. A working implementation with only mocked/unit coverage remains `PARTIAL` until the required journey is verified. `EXCLUDED`, `OPTIONAL`, and `DEPRECATED` items are tracked separately from compatible work.

## Current audited-scope count

The three audited scopes below currently contain 71 distinct workflow candidates after deduplicating the chat-audio transcription item and the duplicate workflow authoring/execution family row, then adding the separate table-review workflow:

| Status | Count | Meaning |
|---|---:|---|
| COMPLETE | 0 | No candidate has a complete end-to-end evidence trail yet. This does not mean the code is absent. |
| PARTIAL | 61 | Implementation exists or is underway, but a behavior, security boundary, persistence path, or end-to-end verification remains. |
| MISSING | 1 | No safe equivalent workflow found in Void-Agent. |
| EXCLUDED | 5 | Reference behavior is unsafe or non-executable in the inspected checkout. |
| OPTIONAL | 2 | Secondary integrations not required for core parity. |
| DEPRECATED | 1 | Upstream self-update behavior is unsuitable for the independent product. |
| PRIMARY CUSTOM | 1 | Void-Agent-only archive import/export feature to preserve; not a reference-parity item. |
| **Total** | **71** | Includes 70 reference workflow candidates plus one Void-Agent-only custom capability. |

This is a scoped count, not the full migration denominator. Remaining census surfaces still need to be mapped into workflows and deduplicated. Do not report an overall percentage until that audit is complete.

## A. Chat, models, files, and saved workflows (24 units)

| # | Workflow | Status | Primary evidence and remaining gap |
|---:|---|---|---|
| A01 | Start a conversation, send the first prompt, and persist the thread/messages | PARTIAL | `src/app/api/chat/route.ts`; no live PostgreSQL/provider journey. |
| A02 | Open an owned conversation and load its recent message window | PARTIAL | `src/app/api/chat/actions.ts`; full browser/database journey unverified. |
| A03 | Load older messages while retaining scroll position | PARTIAL | `chat-repository.pagination.test.ts`, chat actions/UI; mock coverage only, no Postgres run. |
| A04 | Rename or delete a conversation | PARTIAL | Chat actions and thread menu exist; persistence and authorization journey lacks end-to-end verification. |
| A05 | Delete one message or later turns from a selected message | PARTIAL | Message parts and chat actions exist; full UI/database journey unverified. |
| A06 | Retry or regenerate an assistant response | PARTIAL | Chat UI/API paths exist; provider-backed retry is unverified. |
| A07 | Share or export a conversation | PARTIAL | User-scoped export API exists; public/browser journey unverified. |
| A08 | Fork a conversation from a selected message | PARTIAL | `/api/thread/[id]/fork` and fork tests exist; browser/Postgres journey unverified. |
| A09 | Import/export a bounded text-only conversation archive | PRIMARY CUSTOM | `/api/chat/archive` and route tests; preserve as a Void-Agent addition, not counted as upstream parity. |
| A10 | Stream an assistant response and persist its final turn | PARTIAL | Chat route and persistence code exist; live provider/DB journey unverified. |
| A11 | Stop an in-progress response | PARTIAL | Stop API/tests exist; browser/Redis and multi-instance journey unverified. |
| A12 | Reconnect and resume a detached response | PARTIAL | Stream API/tests exist; Redis/multi-instance journey unverified. |
| A13 | Browse/select enabled models in the chat picker | PARTIAL | `/api/chat/models`, model selector, availability tests; provider-backed chat unverified. |
| A14 | Resolve a selected model and handle provider fallback | PARTIAL | `src/lib/ai/models.ts`; provider tests use mocks. |
| A15 | Discover, test, update, and remove dynamic providers | PARTIAL | `/api/admin/providers/**`, encrypted key storage and tests; no live provider/database journey. |
| A16 | Add and use a user-owned OpenAI-compatible HTTPS provider | PARTIAL | User-provider API/settings and pinned transport tests; external endpoint not verified. |
| A17 | Use local/LAN Ollama or LM Studio from hosted chat | EXCLUDED | V2 local-model UI has no safe client proxy equivalent; hosted server must not reach the user LAN/loopback. |
| A18 | Automatically select a team model using routing constraints | PARTIAL | Team Auto routing and context-capacity tests exist; no provider-backed journey. |
| A19 | Enforce a team member monthly AI budget | PARTIAL | Atomic reserve/settle implementation and tests exist; default-off rollout and live migration/concurrency remain unverified. |
| A20 | View context-window usage in the composer | PARTIAL | Catalog/meter and helper/UI tests exist; browser/provider journey unverified. |
| A21 | Upload a chat attachment and make it available to the model | PARTIAL | Thread uploader, storage and chat wiring exist; authenticated storage/model journey unverified. |
| A22 | Ingest and preview documents, PDFs, and spreadsheets | PARTIAL | File-ingest/preview code and tests exist; edge formats and live storage/browser path remain. |
| A23 | Transcribe uploaded/stored audio into a chat conversation | PARTIAL | WAV and multiple-MIME paths exist; live provider/browser journey and full format parity remain. This combines duplicate chat and voice audit items. |
| A24 | Render supported video results from workflow execution | PARTIAL | Workflow video preview/extraction tests exist; third-party playback unverified. |

## B. Projects, knowledge, voice, and devices (21 units)

| # | Workflow | Status | Primary evidence and remaining gap |
|---:|---|---|---|
| B01 | Create, list, edit, and delete projects | PARTIAL | `/api/projects/**`, projects dashboard; no full DB/browser journey. |
| B02 | Manage project members and access | PARTIAL | Project member/access APIs and tests; role/invitation parity and live authorization unverified. |
| B03 | Create project threads and restrict their knowledge scope | PARTIAL | Chat thread scope and project access helpers; live scoped retrieval unverified. |
| B04 | Add project documents and ingest them | PARTIAL | Project document/source APIs and RAG ingest; live storage/source journey unverified. |
| B05 | Browse, download, unlink, and edit project documents | PARTIAL | Document routes, unlink/download and tracked DOCX edits exist; project-independent spaces and destructive cleanup remain. |
| B06 | Run project-brain extraction in the background and inspect status | PARTIAL | Brain queue/dream/status routes and tests; no PostgreSQL-backed job journey. |
| B07 | Search project sources and use evidence in chat | PARTIAL | RAG plus query-matched brain context exist; live retrieval/citation behavior unverified. |
| B08 | Browse project knowledge graph and source details | PARTIAL | Graph APIs/UI and route tests exist; live DB/browser graph journey unverified. |
| B09 | Review facts, source versions, contradictions, and timeline events | PARTIAL | Fact/version/contradiction/timeline APIs and tests exist; full review journey unverified. |
| B10 | Review generated todos, insights, and project status | PARTIAL | Status/todo tools and routes exist; scheduled refresh and end-to-end status workflow unverified. |
| B11 | Connect and sync project MCP/Composio tools | PARTIAL | Connector routes/sync tests exist; provider authorization/run unverified. |
| B12 | Associate agents/workflows with projects | PARTIAL | Some project association paths exist; complete authoring/execution parity unverified. |
| B13 | Automatically add project-brain evidence to project chat context | PARTIAL | Bounded current-source evidence injection and tests exist; live Postgres/browser verification remains. |
| B14 | Use project-scoped status and knowledge tools in voice | PARTIAL | OpenAI Realtime/KonvO tools and scope checks exist; live provider/Postgres flow unverified; Kimi unsupported. |
| B15 | Save completed realtime voice turns to a conversation | PARTIAL | Session-to-thread persistence and tests exist; provider/browser journey unverified. |
| B16 | Review voice transcripts and create a handoff | PARTIAL | Voice inbox/review and user-triggered draft handoff exist; live workflow and wider provider paths unverified. |
| B17 | Pair a voice device and submit its transcript | PARTIAL | Pairing, hashed tokens, owner checks and tests exist; hardware/database journey unverified. |
| B18 | Use device session/segment history and live transport | PARTIAL | Primary has persisted session pieces; device gateway/hardware flow not verified. V2 WebSocket requires absent external bridge. |
| B19 | Execute device voice commands as actions | EXCLUDED | V2 direct dispatch is unsafe; Void-Agent keeps transcripts review-first. Safe equivalent requires explicit action approval. |
| B20 | Run browser automation from voice | MISSING | No primary equivalent found. Needs cancellation, URL/SSRF controls, prompt-injection handling, ownership and safe live view. |
| B21 | Operate the physical-device audio gateway/firmware flow | EXCLUDED | Inspected V2 checkout lacks the bridge script and its WebSocket endpoint returns 426; reference workflow is non-executable here. |

## C. Agents, tools, integrations, accounts, and desktop (25 units)

| # | Workflow | Status | Primary evidence and remaining gap |
|---:|---|---|---|
| C01 | Create/edit/delete agents, including preset creation | PARTIAL | Agent routes/tests exist; equivalent preset route not found. |
| C02 | Generate an agent from a prompt | PARTIAL | `/api/agent/ai` exists; this route remains outside team-budget enforcement. |
| C03 | Publish, browse, install, and uninstall agents | PARTIAL | Published/installed routes/tests exist; browser/database journey unverified. |
| C04 | Register/edit/remove and OAuth-connect MCP servers | PARTIAL | Server/OAuth routes and tests exist; live OAuth/MCP journey unverified. |
| C05 | Customize MCP server and tool behavior | PARTIAL | Customization routes exist; end-to-end journey unverified. |
| C06 | Invoke MCP tools from chat | PARTIAL | Reviewed approval routes/tests exist; not all dynamic tool workflows are covered. |
| C07 | Create/edit/save workflow graphs | PARTIAL | Saved-workflow editor/CRUD/structure tests exist; live persistence/browser path unverified. |
| C08 | Run saved workflows with effect approval | PARTIAL | One-use review checks access/revision; dynamic arguments need persisted pause/review/resume. V2 execution lacks equivalent approval and must not be copied. |
| C09 | Create/edit/enable/delete scheduled jobs | PARTIAL | Scheduler job APIs/tests exist; production DB/browser journey unverified. |
| C10 | Execute cron jobs and inspect scheduler diagnostics | PARTIAL | Worker/diagnostic code exists; deployed worker behavior unverified. |
| C11 | Manually run a scheduled job and review run history | PARTIAL | Durable manual requests/history APIs/tests exist; live worker/DB result flow unverified. |
| C12 | Connect, resume, pause, and disconnect external app accounts | PARTIAL | Many provider OAuth/token lifecycles exist; live account coverage incomplete. |
| C13 | Approve connector write actions | PARTIAL | Exact-payload approvals/cards cover multiple providers; connector/MCP/workflow mutations remain unaudited or uncovered. |
| C14 | Subscribe Slack channels to agent tasks | EXCLUDED | V2 checkout has declarations but no executable handlers/event/delivery path. |
| C15 | List notifications and mark them read | PARTIAL | User-scoped APIs/tests exist; full browser/database journey unverified. |
| C16 | Register and receive browser push notifications | PARTIAL | Registration/delivery implementation exists; real browser permission and endpoint delivery unverified. |
| C17 | Manage profile, password, recovery, and sessions | PARTIAL | Primary equivalents plus password-reset hardening exist; live email/DB/browser flow unverified. |
| C18 | Checkout, inspect subscription, and process billing webhooks | PARTIAL | Dodo routes/webhook checks exist; live provider/database lifecycle unverified. |
| C19 | Use desktop auth handoff, download/update, and packaged app | PARTIAL | Desktop auth/updater/download tests exist; packaged GUI install/update unverified. |
| C20 | Configure and test local/remote desktop MCP servers | PARTIAL | Primary test-screen bridge has origin checks, native consent and bounds; no live Electron/server journey. V2 bridge is weaker and not used by chat. |
| C21 | Connect external services in Cockpit | OPTIONAL | Stripe vertical slice exists; wider provider console is secondary. |
| C22 | Submit and triage problem reports | PARTIAL | User/admin routes/tests exist; persisted browser journey unverified. |
| C23 | Use telemetry and observability integrations | OPTIONAL | Logging exists; opt-in external telemetry parity is not established. |
| C24 | Automatically update from upstream | DEPRECATED | Not appropriate for independent Void-Agent product. |
| C25 | Use managed workflow generation and dashboard hosting | EXCLUDED | Inspected V2 checkout has schema/UI references but no executable generator, worker, hosting or provisioning path. |

## D. Tabular review (1 unit)

| # | Workflow | Status | Primary evidence and remaining gap |
|---:|---|---|---|
| D01 | Create a multi-source review, generate/edit/retry cells, cite evidence, and export XLSX | PARTIAL | Table-review routes/UI/citation checks exist; exact multi-page source pins are now in migration 0073, but it is unapplied and live Postgres/browser workflow remains unverified. |

## Next register work

1. Audit the remaining unclassified entries from the 206-surface census, map them into workflows, and deduplicate against A01-D01.
2. Reconcile the provisional 71-unit status counts with a second evidence review before publishing a project-wide percentage.
3. Select the next compatible PARTIAL/MISSING workflow group and implement it end to end, preserving the primary's security boundaries.
4. Move rows to COMPLETE only after implementation and verification evidence is recorded here.
