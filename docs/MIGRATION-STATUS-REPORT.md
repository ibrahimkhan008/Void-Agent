# Void-Agent Migration Status Report

Generated: 2026-11-08 22:29 +05:30

## 1. Executive summary

This is a status snapshot, not a migration-completion claim. The current scoped feature register contains **99 unique workflow candidates** (98 reference candidates plus one Void-Agent-only capability): **0 COMPLETE, 89 PARTIAL, 1 MISSING, 5 EXCLUDED, 2 OPTIONAL, 1 DEPRECATED, and 1 PRIMARY CUSTOM**. C33 is counted once; its historical duplicate discovery note is retained. C36 (DOCX tracked-edit proposal), C37 (secure Morphik image preview), and C38 (Composio write actions with exact-payload approval) are registered. The broader census of 206 routes/pages/tool surfaces is not a complete semantic feature inventory, so no defensible overall parity percentage is available.

The DOCX and Morphik blockers identified in the previous report are fixed. B20 browser execution remains disabled and MISSING because no runtime-level egress boundary is available. C38 adds a review-first Composio write flow with persisted one-use exact-payload approvals; it remains PARTIAL pending live provider, PostgreSQL, and browser verification. The current full suite, typecheck, lint, metadata check, and corrected production build pass. The initial build caught and prompted a fix to an invalid extra App Router export. No push, commit, deployment, or database migration was performed.

## 2. Repository and working-tree state

| Item | Observed state |
|---|---|
| Primary | `C:\Users\Ikra\Desktop\Void-Agent`, branch `main`; HEAD `23a0177397232874689d67100d2e6730b23e6c75` (`docs: add feature-level migration work register`). |
| Primary worktree | At report generation: 315 tracked paths modified, 285 untracked files, 0 staged paths (600 changed/untracked status entries). Extensive local migration work remains uncommitted. `context.md` is ignored by Git and is maintained append-only per repository instructions. |
| Reference | `C:\Users\Ikra\Desktop\Void-Agent-V2`, branch `update/better-chatbot-2.0`, HEAD `8671f31`; Git reports 3,072 staged paths. This pre-existing dirty index means cleanliness cannot be proven from status alone. No reference changes were made intentionally during this batch. |
| GitHub/deployment | No commit, push, merge, or deployment was performed. |
| Audit artifacts | Existing `.audit/` artifacts were left in place; no logs were written under `.git`. |

## 3. What is done — verified itemized list

No migration workflow qualifies as VERIFIED COMPLETE under the register's end-to-end standard. The following fixes and checks have current evidence:

| Task | Evidence | Status / limits |
|---|---|---|
| DOCX chat-tool map and access gates | `src/app/api/chat/route.ts`, `src/lib/ai/tools/project-document.ts`, `src/lib/ai/tools/project-document.test.ts` | FIXED. Tool record no longer carries `undefined`; owners/editors receive proposal access only for available DOCX files, while viewers remain read-only. Proposal persists as a pending review copy; no automatic apply path was added. Focused Plan Mode/DOCX tests pass. Live database/browser review/accept flow remains unverified. |
| DOCX proposal component/test | `src/components/tool-invocation/project-document-edit-proposal.tsx`, `src/components/tool-invocation/project-document-edit-proposal.test.tsx` | FIXED. Explicit React import resolves the Vite JSX runtime failure; test uses native `getAttribute` rather than an unavailable matcher typing. Component remains review-only. |
| Morphik protected-result identity contract | `src/lib/ai/mcp/morphik-media-reference.ts`, `src/lib/ai/mcp/execute-approved-mcp-tool.test.ts` | FIXED. Unchanged results preserve object identity; results containing protected Morphik URLs are still redacted/replaced. Signed URLs remain absent from model/transcript/persistence. Focused wrapper, parser, proxy, and route tests pass. Live S3/browser preview remains unverified. |
| B20 browser automation default-deny | `src/lib/ai/tools/browser/execution-gate.ts`, `browser-agent.ts`, `cloak-browser.ts`, `tool-kit.ts`, `toolkit-catalog.ts` | FIXED mitigation; capability remains MISSING. Browser automation is removed from tool discovery and direct factories fail before network/provider I/O. Adversarial tests verify app-level denial only; provider/VM egress isolation is not established. |
| C38 Composio write approval | `src/lib/ai/composio-write-chat-tools.ts`, `src/lib/ai/tools/hitl/composio-write-approval.ts`, `src/lib/ai/tools/hitl/composio-write-approval-route.ts`, `/api/approvals/composio`, `hitl-tool-cards.tsx` | IMPLEMENTED, NOT FULLY VERIFIED. The exact action/schema/arguments are reviewed and bound to an owner/account-scoped expiring one-use token; execution rechecks current state and consumes atomically before provider dispatch. Mocked tests pass; live provider/PostgreSQL/browser workflow remains unverified. |
| Cloak bridge shared-token fallback | src/lib/ai/tools/browser/cloak-browser.ts, cloak-browser.test.ts | FIXED. Removed the hardcoded fallback; without CLOAK_BRIDGE_TOKEN, execution fails before cache/network access. Tests verify zero dispatch when missing and configured Authorization on session/navigation requests. This does not provide browser egress isolation. |
| Storage diagnostics | `docs/security-review.md` and relevant storage tests | FIXED at unit level per existing evidence; not a complete production storage workflow. |
| Payment signature canonical encoding | `src/lib/payments/dodo.ts` and payment tests | FIXED at unit level; live webhook/provider not exercised. |
| Full unit suite | `pnpm test` | PASS: 588 files, 3,131 tests. |
| Type checking | `NODE_OPTIONS=--max-old-space-size=6144 pnpm check-types` | PASS. |
| Lint | `pnpm lint` | PASS with existing Next lint deprecation, workspace-root inference, and `<img>` warnings. |
| Database metadata | `pnpm db:check` | PASS; Drizzle metadata only, no live database connection or migration application. |
| Production build | 6 GiB heap `pnpm build` | PASS, 205/205 pages. Warnings and local environment limitations are listed in Section 8. |
| Patch whitespace | `git diff --check` | PASS after the final source and documentation updates; Git may report LF/CRLF normalization notices. |

## 4. What is implemented but not fully verified

The register contains **89 PARTIAL** workflows spanning chat/conversations, model/provider routing, files and multimodal ingestion, tools/approvals, memory/RAG/project brain, connectors, notifications, scheduling, tabular reviews, teams/onboarding, voice/desktop, and other integrations. Per-workflow evidence and gaps are in [`feature-work-register.md`](feature-work-register.md); tests and source presence do not constitute end-to-end completion.

C36 DOCX tracked-edit proposals and C37 Morphik image previews have focused unit/mock evidence but lack live PostgreSQL, object-storage, and browser verification. C38 implements Composio write-action discovery, proposal review, persisted expiring single-use approval bound to the exact action/schema/arguments, and a separate approved executor. Focused route/helper/UI tests pass; production PostgreSQL consumption and live provider effects remain unverified. The approval card currently shows the action slug and exact JSON but not the provider full action description, which is a review-clarity improvement. C38 is PARTIAL.

## 5. What was already present in original Void-Agent

A complete count of preserved original capabilities is **not available**. The original baseline was not represented by a clean before-migration worktree in this audit, and the scope inventory is incomplete. The register identifies at least one explicit Void-Agent-only workflow: **A09 bounded text-only conversation archive import/export**. Several current systems are intentionally retained as primary architecture—AI SDK 5, PostgreSQL/node-postgres, Team/site_config, local pgvector/RAG, existing memory, scheduler, billing, connectors, workflows, and existing authentication—but this report does not claim every original customization has been exhaustively diffed and validated.

## 6. What remains — itemized backlog

The scoped ledger contains **99 unique workflow candidates**. Appendix A contains the earlier 98-row captured baseline; C38 is newly appended in the feature register. Exact current source references and gaps are in `feature-work-register.md`. The broader source census and actual upstream capability set are not yet exhaustively mapped, so these 99 entries are not the complete migration denominator. The 206 entries are routes/pages/tools, not independent features.

B20 remains **MISSING** because no available remote-browser provider proves enforceable network-layer egress isolation. Primary execution is now fail-closed in both the tool registry and direct browser factories; the user-facing Browser toolkit was also removed. Adversarial tests prove attempts never reach Steel/Crawl/Cloak for loopback/private IPv4, IPv6 loopback, metadata, rebinding, redirect, subresource, WebSocket, proxy-bypass, and alternate-protocol inputs. They do not test provider network filtering because the browser is not launched. C38 now records the separate Composio write path: a review-first proposal and owner-bound, single-use exact-payload approval. Live provider and database verification are outstanding.

## 7. Security patches preserved and security gaps

The security documentation correctly calls itself incremental, not a completed audit. Controls located in the current tree include:

| Control | Primary evidence | State and remaining gap |
|---|---|---|
| Session/authentication and route access | `src/lib/auth/auth-instance.ts`, `src/middleware.ts`, route-level `getSession`/access helpers | Auth checks are present, but not every route/workflow was independently traced in this status pass. OAuth and browser flows lack live end-to-end verification. |
| Project/user ownership and team access | `src/lib/projects/access.ts`, project/API route checks, owner-scoped repositories | Many focused tests exist; no full Postgres tenant-isolation run was performed. |
| MCP and Composio tool execution/approval | `src/lib/ai/tools/hitl/mcp-tool-approval.ts`, `src/lib/ai/mcp/execute-approved-mcp-tool.ts`, `src/lib/ai/tools/hitl/composio-write-approval.ts`, `src/app/api/approvals/composio/route.ts`; `src/lib/ai/speech/mcp-voice-approval.ts` | MCP and Composio write paths require owner/config or exact-payload one-use approval. Focused tests cover the boundaries; live database/provider workflows remain unverified. |
| Secrets and encryption | `src/lib/security/encryption.ts`, provider routes/repositories | Static tests exist; production key rotation/configuration was not tested. |
| Payment verification | `src/lib/payments/dodo.ts` and payment tests | Canonical Base64 HMAC validation is documented and covered by tests; live webhook/replay checks were not run. |
| Webhook signing and outbound URL checks | `src/lib/webhooks/sign.ts`, `src/lib/webhooks/url-guard.ts` | Unit coverage exists; no live webhook/replay or DNS rebinding exercise in this audit. |
| HTTP security headers/CSP | `next.config.ts`, `src/middleware.ts` | Existing directives are documented as retained; this audit did not execute a deployed-header/browser test. |
| File upload and ingestion | `src/app/api/storage/upload/route.ts`, `src/lib/file-storage/`, `src/lib/ai/ingest/`, `src/lib/file-ingest/` | Bounded validation and ownership controls are documented/tested; full authenticated storage-to-model journey and parser fuzzing are outstanding. |
| SSRF and remote fetch | `src/lib/ai/tools/web/web-search.ts`, workflow fetch/URL guards, desktop pinned-fetch modules | Some bounded/pinned fetch paths exist. `docs/security-review.md` records an unresolved browser egress/isolation gap; do not enable arbitrary browser execution. |
| Rate limiting | `src/lib/rate-limit/` and shared cache | Local build warns about missing Redis/Upstash and memory fallback. Multi-instance production enforcement is unverified. |
| Prompt/tool boundaries | `src/lib/ai/prompts.ts`, project knowledge/RAG formatting, tool approval and sandbox modules | Some content is marked untrusted and tools are allowlisted; no exhaustive prompt-injection test campaign was run. |

The browser tools remain a specific unresolved SSRF/egress boundary: src/lib/ai/tools/browser/browser-agent.ts accepts arbitrary navigation and page actions; cloak-browser.ts allows arbitrary page JavaScript, persistent profiles and HAR retrieval; neither Steel nor Cloak enforces public-only egress for redirects, subresources or WebSockets. V2's remote Kernel execution likewise defaults to direct egress and does not establish VM-process isolation. B20 remains MISSING. The Cloak credential fallback was removed, but this does not mitigate browser network reachability.


### Explicit security-category status

| Category | Evidence located | Audit conclusion |
|---|---|---|
| CORS / CSRF | `src/lib/security/same-origin.ts`; same-origin checks in sensitive project/voice routes; workflow route policy in `src/app/api/workflow/[id]/route.ts` | Selected mutation routes are protected and a previous wildcard-CORS issue is documented as fixed. No repository-wide endpoint-by-endpoint CORS/CSRF audit was completed. |
| XSS | `src/app/api/mcp/oauth/callback/route.ts` escapes interpolated HTML; `src/components/markdown.tsx` uses ReactMarkdown without adding raw-HTML parsing | Specific protections are present; no exhaustive user-content rendering audit was run. |
| Security headers / CSP | `next.config.ts`, `src/middleware.ts` | Existing policy is documented as retained; deployed response headers were not tested. |
| SSRF | `src/lib/webhooks/url-guard.ts`, bounded/pinned remote-fetch paths, `apps/desktop/src/main/pinned-remote-fetch.ts` | Several paths validate/pin remote access; general browser egress isolation remains an explicit gap. |
| Dependency security | `package.json`, `pnpm-lock.yaml` | No current dependency vulnerability scan was run. |
| CSRF coverage, session fixation, secret rotation | `src/lib/security/same-origin.ts`, `src/lib/auth/auth-instance.ts`, `src/lib/security/encryption.ts` | Implementation locations exist, but a complete threat-specific regression assessment was not performed. |
The report cannot count “original Void-Agent security patches preserved” because no complete original patch inventory was reconstructed. Specific fixes supported by current records include storage diagnostics and payment signature canonicalization; many other controls are present but their pre-migration provenance and preservation are not established here. No new security regression suite was run separately.

## 8. Test and build results

| Command | Result on current working tree | Details |
|---|---|---|
| Focused DOCX + Morphik suites | **PASS** | 9 files / 50 tests, including DOCX permission gates, Plan Mode exclusion, review-only UI, protected result identity/redaction, parser, proxy route, and image route. |
| Focused Cloak credential regression | **PASS** | 1 file / 2 tests: absent token blocks before cache/network; configured token authenticates session/navigation. |
| Focused B20/C38 tests | **PASS** | B20 adversarial fail-closed cases are included in the 588-file full run. C38 approval route/helper/chat/UI focused run: 4 files / 21 tests. |
| `pnpm test` | **PASS** | 588 files / 3,131 tests. |
| `NODE_OPTIONS=--max-old-space-size=6144 pnpm check-types` | **PASS** | Full typecheck with 6 GiB Node heap. |
| `pnpm lint` | **PASS WITH WARNINGS** | Next lint deprecation, workspace-root inference, and existing `<img>` warnings; Biome checked 2,285 files. |
| `pnpm db:check` | **PASS** | Drizzle metadata check only. No live database connection or migration apply. |
| 6 GiB heap `pnpm build` | **PASS** | The first build identified an invalid exported handler factory in the App Router module; the factory was moved to a non-route library module. The rerun exited 0 and generated 205/205 pages. Warnings include E2B/unpdf dependency analysis, dynamic-session prerender diagnostics, missing local Redis/Upstash and E2B config, PostgreSQL SSL-mode compatibility, and the previously observed local schema mismatch (`agent.preset_id` missing). Build success does not prove the local DB is migrated. Rate limits fall back to per-instance memory without Redis/Upstash; production configuration is unverified. |
| `git diff --check` | **PASS** | PASS after the final source and documentation updates; Git printed LF/CRLF normalization notices only. |
| PostgreSQL-backed integration / Playwright E2E | **NOT RUN** | No safe live database-backed migration or authenticated browser journey was executed. |
| Separate security scan / live provider checks | **NOT RUN** | External credentials/services and production configuration were not exercised. |

Earlier failing results in the prior report are historical and were superseded by the fixes above. Do not interpret current unit/type/build success as full migration parity.

## 9. Blockers and external dependencies

1. The migration remains substantially incomplete: 89 registered workflows are PARTIAL and the semantic inventory is not exhaustive.
2. Live PostgreSQL-backed migration/ownership tests and browser journeys remain unverified. The local build reported a missing `agent.preset_id` column; no database migration was applied.
3. OAuth, model providers, Agentset, Composio, E2B, object storage, notifications, desktop, and production Redis workflows lack live verification where credentials/services are unavailable or were intentionally not used.
4. The reference working tree/index was already dirty with 3,072 staged paths, so its clean baseline cannot be established from Git status; no reference edits were made intentionally.
5. Browser egress isolation remains a security gap for arbitrary browser execution (B20). It is fail-closed in app registries and direct factories, but there is no provider/VM egress enforcement. Do not enable arbitrary browsing until isolation is enforced and tested.

## 10. Feature parity counts and calculation method

| Measure | Count |
|---|---:|
| Individually registered unique candidates | 99 |
| Registered Better Chatbot workflow candidates | 98 |
| Registered Void-Agent-only custom workflows | 1 |
| Verified complete | 0 |
| Partial | 89 |
| Missing | 1 |
| Excluded | 5 |
| Optional | 2 |
| Deprecated | 1 |
| Newly registered current candidates | 3 (C36 DOCX, C37 Morphik, C38 Composio writes; all PARTIAL) |
| Original Void-Agent capabilities fully inventoried and verified | Unknown / not audited |
| Original security patches proven preserved | Unknown / not fully audited |
| Newly integrated workflows verified end-to-end | 0 under the ledger's strict standard |

No percentage is reported. The 99-item register is scoped, while the 206 discovered reference surfaces have not all been mapped to individually verified workflows. Existing Void-Agent features are not counted as newly integrated; test or code presence alone does not satisfy COMPLETE.

## 11. Changed files summary

At report generation, the primary worktree had 315 tracked modified paths and 285 untracked files (0 staged; 600 status entries). Changes span chat/API routes, UI, providers, tools, projects/RAG, voice, scheduler, database schema/repositories/migrations, desktop code, tests, dependencies, and migration documentation. There are eight new PostgreSQL migration files in the working tree (`0074` through `0081`); none were applied. The exact path snapshot is appended below after this report and its progress pointers are written.

## 12. Recommended implementation order

1. Keep B20 disabled and MISSING until an actual network-isolated browser/VM runtime can be proven; the app-level execution gate prevents unsafe use meanwhile.
2. Continue remaining PARTIAL workflows in dependency order, beginning with core end-to-end chat/provider/database journeys; C38 Composio writes now have a server-bound review/approval path, but need a safe live test environment.
3. Run PostgreSQL-backed migration and ownership tests and authenticated browser E2E when a safe test database and credentials are available; do not apply production migrations.
4. Keep the feature register evidence-based and update counts only for individually defined workflows; do not claim a global parity percentage until the upstream semantic inventory is complete.

## 13. Exact next task

**Next: advance A01, the P0 chat creation/send/persistence workflow, against an isolated PostgreSQL test environment and verify ownership, message persistence, and provider failure handling end to end.** Keep B20 disabled; current tests prove only that the app declines to launch browser tools, not that the remote provider enforces egress restrictions. Do not use production data or apply production migrations.

## 14. Report generation time

2026-11-08 22:29 +05:30

## Appendix A — Workflow evidence

The 98 baseline ledger rows are reproduced below from `docs/feature-work-register.md`. Status/evidence are the ledger's current claims, not independent E2E certification. Exact source paths and per-row known gaps appear in each row; use the linked inventory/matrix for reference-side surface mapping.

- **A01 — Start a conversation, send the first prompt, and persist the thread/messages** — **PARTIAL** (provisional P0, Medium/Large): `src/app/api/chat/route.ts`; no live PostgreSQL/provider journey.
- **A02 — Open an owned conversation and load its recent message window** — **PARTIAL** (provisional P0, Medium/Large): `src/app/api/chat/actions.ts`; full browser/database journey unverified.
- **A03 — Load older messages while retaining scroll position** — **PARTIAL** (provisional P0, Medium/Large): `chat-repository.pagination.test.ts`, chat actions/UI; mock coverage only, no Postgres run.
- **A04 — Rename or delete a conversation** — **PARTIAL** (provisional P0, Medium/Large): Chat actions and thread menu exist; persistence and authorization journey lacks end-to-end verification.
- **A05 — Delete one message or later turns from a selected message** — **PARTIAL** (provisional P0, Medium/Large): Single-message deletion and selected-message truncation now bind the final SQL DELETE to the authenticated owner's thread, closing the read/write ownership race. Truncation uses PostgreSQL-side timestamp precision and (createdAt,id) ordering, deletes the selected message and following turn history in the same thread, and reports whether rows were removed so project-brain refresh only follows an actual delete. Focused action/repository SQL tests pass (13/13), covering owner rejection, owner predicate, stable cursor, no-op refresh behavior, and existing project-source refresh. Live PostgreSQL/browser edit-regeneration journey remains unverified.
- **A06 — Retry or regenerate an assistant response** — **PARTIAL** (provisional P0, Medium/Large): Mounted the existing recovery hook in chat: it probes the owner-scoped resume endpoint with HEAD, resumes only a live buffer, reconciles persisted output before generating again, and exposes Retry for transport errors and persisted failed/timed-out/cancelled/incomplete turns. Regeneration carries the previous assistant turn's recorded provider/model and tool mode instead of silently switching to newly selected composer settings; the existing chat route continues to enforce current model access and team budget. Focused tests pass 16/16 (recovery, retry UI, settings retention); Postgres/provider-backed browser journey remains unverified. Evidence: `src/components/chat-bot.tsx`, `src/components/message.tsx`, `src/hooks/use-run-recovery.ts`, `src/lib/chat/retry-settings.ts` and tests.| PARTIAL
- **A07 — Share or export a conversation** — **PARTIAL** (provisional P0, Medium/Large): Preserved existing snapshots and legacy UUID links while adding owner-only share creation, rotation, and revocation. New 256-bit base64url bearer links return once; only SHA-256 is stored. Rotation/revocation disables the old UUID path, and old links remain compatible until changed. Public rendering is dynamic/noindex/no-store, text-only, removes file/source/tool parts, metadata, IDs, and private signed/storage URLs; new hashed links are read-only (legacy comments remain). API creation is bounded, same-origin, authenticated, rate-limited, and no-store; owner checks are atomic in repository updates. Focused tests pass 21/21. Migration `0077_chat_export_share_tokens.sql` is additive and unapplied. PostgreSQL/browser deployment verification remains. Evidence: `src/lib/chat/public-share.ts`, `src/lib/chat/export-share-service.ts`, `src/lib/chat/load-public-export.ts`, share routes/page, repository, and tests.| PARTIAL
- **A08 — Fork a conversation from a selected message** — **PARTIAL** (provisional P0, Medium/Large): Primary already had this Void-Agent-specific workflow; Better Chatbot `main` at `6f41835` has no equivalent. Hardened it with current project/team editor checks, preservation of project/org/collection/model context, an atomic thread+message transaction, and SQL-side bounds of 200 messages / 5 MiB prefix content. Focused route/repository/limit tests pass 20/20. UI action exists in `src/components/message-parts.tsx`; live PostgreSQL/browser journey remains unverified.
- **A09 — Import/export a bounded text-only conversation archive** — **PRIMARY CUSTOM** (provisional P0, Medium/Large): `/api/chat/archive` and route tests; preserve as a Void-Agent addition, not counted as upstream parity.
- **A10 — Stream an assistant response and persist its final turn** — **PARTIAL** (provisional P0, Medium/Large): Chat route and persistence code exist; live provider/DB journey unverified.
- **A11 — Stop an in-progress response** — **PARTIAL** (provisional P0, Medium/Large): Stop API/tests exist; browser/Redis and multi-instance journey unverified.
- **A12 — Reconnect and resume a detached response** — **PARTIAL** (provisional P0, Medium/Large): Stream API/tests exist; Redis/multi-instance journey unverified.
- **A13 — Browse/select enabled models in the chat picker** — **PARTIAL** (provisional P1, Medium/Large): Added separate admin-curated developer/country/badge/USD catalog metadata, an authenticated model-list projection, picker badges and Hidden gem/Fast/Thinking metadata filters. USD display prices remain separate from EUR budget enforcement; no values are guessed or preseeded. Tests cover schema validation, admin save/merge, no provider-secret leakage, picker filtering and display. Full provider-backed chat and live admin/browser journey remain unverified. Evidence: `src/lib/ai/model-display-metadata.ts`, `src/app/api/admin/config/route.ts`, `src/app/api/chat/models/route.ts`, `src/components/admin/model-display-metadata-settings.tsx`, `src/components/select-model.tsx`.
- **A14 — Resolve a selected model and handle provider fallback** — **PARTIAL** (provisional P1, Medium/Large): `src/lib/ai/models.ts`; provider tests use mocks.
- **A15 — Discover, test, update, and remove dynamic providers** — **PARTIAL** (provisional P1, Medium/Large): Admin model settings now expose a stable-ID edit workflow for name/base URL/model refresh and optional API-key rotation. Discovery reuses a saved encrypted key server-side only when the endpoint matches; endpoint changes require a newly entered key. Existing dynamic-provider hydration and admin-curated default/fallback IDs are retained. Provider status recognizes a legacy credential stored only in `tools.apiKeysSecrets[dyn_${id}]`, returns only a boolean, and never decrypts it. Focused discovery/provider tests: 32/32 across 5 files; scoped Biome passes. Live provider/database/admin-browser journey remains unverified. Evidence: `src/app/(chat)/(admin)/admin/settings/models/page.tsx`, `/api/admin/providers/discover`, `/api/admin/providers`, `src/lib/admin/provider-discovery-request.ts`, `src/lib/ai/models.ts`.
- **A16 — Add and use a user-owned OpenAI-compatible HTTPS provider** — **PARTIAL** (provisional P1, Medium/Large): User-provider API/settings and pinned transport tests; external endpoint not verified.
- **A17 — Use local/LAN Ollama or LM Studio from hosted chat** — **EXCLUDED** (provisional P1, Medium/Large): V2 local-model UI has no safe client proxy equivalent; hosted server must not reach the user LAN/loopback.
- **A18 — Automatically select a team model using routing constraints** — **PARTIAL** (provisional P1, Medium/Large): Team Auto routing and context-capacity tests exist; no provider-backed journey.
- **A19 — Enforce a team member monthly AI budget** — **PARTIAL** (provisional P1, Medium/Large): Atomic reserve/settle implementation and tests exist; default-off rollout and live migration/concurrency remain unverified.
- **A20 — View context-window usage in the composer** — **PARTIAL** (provisional P1, Medium/Large): Catalog/meter and helper/UI tests exist; browser/provider journey unverified.
- **A21 — Upload a chat attachment and make it available to the model** — **PARTIAL** (provisional P1, Medium/Large): Primary retains its 15 MiB per-file cap and owner-scoped storage keys. The upload route now rejects declared multipart bodies over 16 MiB before parsing, validates file objects/size, blocks active SVG/HTML/script MIME types, and passes the authenticated owner to storage; the client error now matches 15 MiB. Six upload-route tests cover auth, body/file size, active MIME, owner id, and storage configuration. The extracted ownership boundary is used by chat and has tests proving foreign managed attachments/message parts are blocked before privileged ingestion while owner files, inline images and source links remain usable. Authenticated storage-to-model journey remains unverified.
- **A22 — Ingest and preview documents, PDFs, and spreadsheets** — **PARTIAL** (provisional P1, Medium/Large): Primary already extracts bounded text/OOXML with owner-scoped keys, 15 MiB office processing cap, and ZIP entry/inflation/DOCTYPE defenses. Adapted upstream PDF visual-context behavior from Better Chatbot 2.0 commit `61e47d8`: owner-scoped PDFs are downloaded with a streamed 15 MiB limit, checked for a PDF signature, text-extracted with 50-page/8,000-character limits, and (only for models supporting native image input) rendered as PNG page parts with a five-page cap, 2 MP/page, 2 MiB/page, 6 MiB/message caps. PDF.js image decode limits, no auto-fetch/XFA/eval, and cleanup are enforced; no archive extraction is attempted for PDFs. Focused PDF/Office tests: 17/17; full 6 GB typecheck and frozen-lockfile validation pass. Live storage/model/browser path and scanned-PDF answer quality remain unverified; legacy binary Office files and full spreadsheet previews remain outside this batch.
- **A23 — Transcribe uploaded/stored audio into a chat conversation** — **PARTIAL** (provisional P1, Medium/Large): Reference audit found no uploaded-chat-audio transcription or long/batch transcription workflow in Better Chatbot V2. Its `apps/web/src/components/media/media-preview.tsx` renders tool-provided audio with native controls (`preload="metadata"`); live voice input is a separate OpenAI Realtime path (`apps/web/src/lib/ai/speech/open-ai/realtime-session-config.ts`) using `gpt-4o-transcribe`, not a stored-upload transcription API. Void-Agent exceeds that reference behavior: it validates owner-scoped storage, MIME/container signatures, and the 15 MiB per-file cap, then sends only clips with verified duration â‰¤30 seconds through synchronous Sarvam REST; unknown/long clips remain playable but are not transcribed. Transcripts enter model context only as bounded untrusted text. AAC/AIFF/FLAC/AMR/WMA are excluded; no compatible upstream batch-upload behavior was found to port. Live provider/browser verification remains. Evidence: primary `src/lib/ai/ingest/audio-attachment.ts`, `audio-metadata.ts`, `uploaded-audio.ts`, `src/app/api/storage/audio/transcribe/route.ts`; reference media preview and realtime session config above. This combines duplicate chat and voice audit items.
- **A24 — Render supported video results from workflow execution** — **PARTIAL** (provisional P1, Medium/Large): Void-Agent recognizes bounded legacy/n8n/direct HTTPS video URLs and now uses lazy `hls.js` for HLS on Chromium, with native HLS fallback and native direct-file playback. Playback rejects non-HTTPS, credentialed, IP-literal/local/private-suffix, and nonstandard-port sources; hls.js child requests must stay on the validated manifest origin, carry no credentials, and use capped buffers/retries. Focused playback-selection/source tests pass 7/7; scoped Biome and diff-check pass. The full 6 GB typecheck now passes after the image tool's concurrent type issue was corrected. The V2 legacy `/analyze/{videoId}` resolver has no corresponding route in the inspected checkout and is not copied. Live external CDN CORS/HLS and browser verification remain unverified. Evidence: `src/components/tool-invocation/workflow-video-media.ts`, `workflow-video-player.tsx`, `workflow-invocation.tsx`.
- **A25 — Generate, edit, composite, and reuse images in chat** — **PARTIAL** (provisional P1, Medium/Large): Preserves Flare generation/single-image edits, prompt optimization, quotas, direct generation and owner-scoped storage. Previous generated image reuse and bounded owner-source checks remain. Added an optional AI Gateway path (disabled unless `AI_GATEWAY_API_KEY` is configured) for explicit multi-reference composition and masked inpainting. Composition uses `bfl/flux-2-pro`; masked fill uses `bfl/flux-pro-1.0-fill`. The brush editor exports a bounded PNG mask, uploads it as an owner-managed file, and records an explicit source-file/mask-file association in the persisted user message. The route rechecks both managed owner keys, applies an owner-keyed 20/hour limit before image downloads while preserving free-tier quotas, enforces 15 MiB combined source/mask bytes, raster signatures, dimension/pixel bounds, normalizes both to identical dimensions and an opaque black/white mask (white regenerates), and passes abort signals. Provider output URL/poll handling rejects redirects/untrusted origins and bounds time, bytes, MIME and signatures. AI 7/Gateway 4 are exact upstream-version aliases so primary's app AI 5 remains unchanged. Focused image/API tests pass 47/47, scoped Biome passes, and 6 GiB typecheck passes. Live Gateway credentials/provider/browser verification is unavailable; Flare and masked feature user journey remain unverified. Evidence: `src/components/image-mask-editor.tsx`, `src/components/prompt-input.tsx`, `src/lib/ai/image/gateway-inpaint.ts`, `gateway-multi-reference.ts`, `provider-image.ts`, `src/app/api/images/edit/route.ts` and tests.
- **A26 — Export generated sandbox files into private chat attachments with previews/downloads** — **PARTIAL** (provisional P1, Medium/Large): The existing persistent E2B sandbox exports only bounded (15 MiB) workspace files from a strict extension allowlist; absolute/traversal paths, symlinks, non-files, oversized/racing reads, SVG, scripts, and unknown types fail closed. HTML is exposed only through the authenticated owner-key preview route: parse5 allowlist removes scripts, links, forms, frames, event handlers, and non-data/active image sources; the response is private/no-store with CSP `sandbox`, `default-src 'none'`, `script-src 'none'`, no external network/forms/frames/navigation, and the parent iframe has an empty sandbox attribute. Export bytes are stored through `serverFileStorage` with caller ownership, then use existing private downloads and bounded document/sheet previews. Chat results render owner-scoped image, HTML, document, spreadsheet, audio and WebM video previews. Focused resolver/export/HTML sanitizer/route tests pass 26/26; scoped Biome and diff checks pass. E2B and configured object-storage/browser journey remain unverified. Evidence: `src/lib/sandbox/artifact-export.ts`, `src/lib/ai/tools/sandbox/sandbox-tool.ts`, `src/lib/file-ingest/sandbox-html-preview.ts`, `/api/storage/html-preview`, `src/components/message-parts.tsx`, existing `/api/storage/download`, `/api/storage/document`, `/api/storage/sheet` routes.
- **A27 — Automatically select a model for a personal chat** — **PARTIAL** (provisional P1, Medium/Large): Better Chatbot V2 resolves Auto for unscoped personal chats through `apps/web/src/lib/ai/routing/service.ts`. Void-Agent now offers Personal Auto through administrator-entered task scores/priority in existing model metadata. Server candidates must be enabled and keyed deployment providers, exclude user-owned endpoints, satisfy tool/vision requirements, and have a known built-in or explicitly admin-verified context size; a prior resolved thread model is reused when still eligible. Team Auto remains a separate path. Focused routing/catalog/admin-selector tests pass 32/32 across 6 files; 6 GiB `pnpm check-types` passes. Live provider/browser journey remains unverified. Evidence: `src/lib/ai/personal-auto-routing.ts`, `src/app/api/chat/route.ts`, `src/components/select-model.tsx`, and model catalog settings/tests.
- **A28 — Slim old chat history only in the provider request** — **PARTIAL** (provisional P1, Medium/Large): Added deterministic model-request-only slimming for older ingestion previews, settled tool outputs, and duplicate document file parts while preserving the persisted transcript and two latest user turns. Focused helper tests pass; chat-route integration is wired. Live provider/browser token and answer-quality validation remains. Evidence: `src/lib/chat/outbound-history-slimming.ts`, `src/app/api/chat/route.ts`.
- **A29 — Compact long multi-step tool loops safely** — **PARTIAL** (provisional P1, Medium/Large): Added AI SDK 5 `prepareStep` integration that compacts only messages created in the current model tool loop, keeps the submitted conversation prefix intact, and preserves tool call/result pairs. Focused tests validate orphan prevention, recent-tail retention, and prefix preservation. Live provider loop is unverified. Evidence: `src/lib/chat/compact-tool-loop.ts`, `src/app/api/chat/route.ts`.
- **A30 — Repair provider tool-name aliases against bound tools** — **PARTIAL** (provisional P1, Medium/Large): Added bounded namespace/case/index normalization that can resolve only to one exact tool already bound for this request; ambiguous and unbound names are rejected. Wired into AI SDK 5 repair callback; focused helper tests pass. Live custom-provider behavior remains unverified. Evidence: `src/lib/chat/repair-bound-tool-name.ts`, `src/app/api/chat/route.ts`.
- **A31 — Enforce one aggregate context budget across mixed attachments** — **PARTIAL** (provisional P1, Medium/Large): Chat ingestion now processes attachments in request order with a shared 40,000-character cap, ten-attachment cap, eight generated file-preview cap, deterministic omission notice, and keeps generated previews out of persisted user parts. Existing per-format validation remains. Focused ingestion suites pass; live storage/provider/browser verification remains. Evidence: `src/lib/ai/ingest/chat-message-budget.ts`, `src/app/api/chat/route.ts`.
- **A32 — Browse the reusable skills catalog and import a reviewed skill** — **PARTIAL** (provisional P1, Medium/Large): Added authenticated skills.sh search and registry import preview to Void-Agent personal skills. Search accepts bounded query metadata; imports validate owner/repo and slug, use fixed HTTPS skills.sh/GitHub hosts with redirects disabled, apply streamed response caps/timeouts, require an approved repository SPDX license plus retained license-notice text, strip frontmatter into bounded instructions, and return a non-persistent draft. The UI presents the source, SPDX license and license notice, requires review and rights confirmation before saving, and persists repository attribution. Skill mutations are same-origin and request bodies are streamed under a 512 KB cap. Imported prompts are escaped and labeled untrusted; they cannot change tool access or approval requirements. Focused tests pass 17/17; live skills.sh/GitHub and browser workflow remain unverified. Evidence: src/lib/skills/registry.ts; /api/skills/search; /api/skills/import; src/components/skills-search-dialog.tsx; src/lib/ai/skills/index.ts.| PARTIAL
- **A33 — Generate and persist a safe, stable title for a new conversation** — **PARTIAL** (provisional P1, Medium/Large): Adapted V2 title behavior while preserving Void-Agent's authentication, same-origin check, per-user rate limit, free-tier gate, team-budget lease, selected provider, and failure fallback. Model output and client title projection are normalized to one line and capped at 80 characters; unusable output falls back to bounded first-user text. Persistence is an atomic owner-scoped insert-or-fill-empty operation, so replay/racing generations cannot overwrite a nonempty title or another user's thread. Focused route/helper/repository tests pass 17/17, including same-origin enforcement. Live model/PostgreSQL/browser title refresh remains unverified. Evidence: `src/app/api/chat/title/route.ts`, `src/hooks/queries/use-generate-thread-title.ts`, `src/lib/chat/thread-title.ts`, `src/types/chat.ts`, `src/lib/db/pg/repositories/chat-repository.pg.ts`, and focused tests.
- **B01 — Create, list, edit, and delete projects** — **PARTIAL** (provisional P1, Medium/Large): `/api/projects/**`, projects dashboard; no full DB/browser journey.
- **B02 — Manage project members and access** — **PARTIAL** (provisional P1, Medium/Large): Compared upstream project People tab/API with primary. Upstream adds existing organization members (it does not send project-specific email invitations); primary already adds current team members and additionally supports viewer/editor roles plus selected-vs-team access. Added access-roster visibility for the implicit project creator and team owner as locked Owner entries, while preserving the current project-access gate and preventing those principals from being re-roled/removed. Focused API/UI tests pass 18/18. Team email invitations are team-level through the canonical `team` model (C28); neither project implementation has a separate project-specific invitation workflow. Live DB/auth/browser authorization remains unverified. Evidence: `src/app/api/projects/[id]/members/route.ts`, `src/components/project-collaborators-panel.tsx`, and focused tests.
- **B03 — Create project threads and restrict their knowledge scope** — **PARTIAL** (provisional P1, Medium/Large): Primary chat creation checks current project access and restricts requested collection IDs to collections attached to that project; saved-thread collection changes use an owner-scoped dedicated action with current project/collection checks. Generic `updateThreadAction` cannot change project/scope fields. Added project thread history API/UI adapted from upstream, capped at 50 and scoped to the authenticated thread owner so project membership cannot expose another user's private conversations. Assigning an existing chat through the project selector now snapshots and queues its existing text into the target project's brain after the ownership/access-checked update; changing/detaching revokes the previous project source. Focused lifecycle/history tests pass 13/13. Live PostgreSQL/browser verification remains. Evidence: `src/app/api/chat/actions.ts`, `src/app/api/projects/[id]/threads/route.ts`, `src/components/project-thread-history.tsx`, and focused tests.
- **B04 — Add project documents and ingest them** — **PARTIAL** (provisional P1, Medium/Large): Project document/source APIs and RAG ingest; live storage/source journey unverified.
- **B05 — Browse, download, unlink, and edit project documents** — **PARTIAL** (provisional P1, Medium/Large): Primary provides owner/project-scoped private byte downloads with safe attachment headers and rate limits; editor-only unlink removes only the project mapping after access/source-owner rechecks, retaining the underlying collection document; tracked DOCX edits are source-revision-bound proposals that preserve the original until accepted. Ported the upstream document-action confirmation with explicit safe unlink wording; UI tests verify cancel sends no write and confirm unlinks then refreshes. Upstream destructive document deletion was not copied. Independent project storage spaces and live PostgreSQL/browser verification remain. Evidence: project document API routes, tracked edit repository/routes, `src/components/project-documents-panel.tsx` and tests.
- **B06 — Run project-brain extraction in the background and inspect status** — **PARTIAL** (provisional P1, Medium/Large): Source UI now shows attempts, sanitized failure cause, stale worker state, and editor-only retry for failed/stale-running jobs using the API's five-minute recovery lease. Existing owner/source checks and budgeted worker remain; stale queued runs report that the scheduler is waiting. PostgreSQL-backed job journey remains unverified.
- **B07 — Search project sources and use evidence in chat** — **PARTIAL** (provisional P1, Medium/Large): Chat fuses already-scoped vector-RAG source ranks with lexical accepted fact/event matches and adds at most two one-hop accepted graph facts after rechecking project, collection owner, ready state, and active source revision. Semantic hints are capped at five after collection-scope filtering; candidate result sets are capped at 12. Local chunk retrieval now requires the source item be `ready`, preventing residual chunks from failed/partial ingestion from being cited; numbered prompt excerpts and labels are XML-escaped inside source boundaries with explicit untrusted-instruction handling. Upstream per-document analysis is available in project chat as read-only `readProjectDocument`; inventory selects metadata only and each content read rechecks current project membership, attached collection, allowed source owner, and ready status before returning at most 30,000 characters as escaped untrusted evidence. Project-chat RAG citation cards now expose a download link only after a bounded server lookup confirms the hit is still a linked project document backed by a ready document row and current owner/collection scope; the existing download route repeats those checks and serves private/no-store bytes. Project citations never fall back to raw storage/source URLs; non-project URLs are linkable only for credential-free HTTP(S). Accepted project facts are now filtered and ranked in SQL by bounded query terms before the 300-row cap, so older matching facts are not lost behind the previous newest-500 window. Search remains inside project, attached collection, permitted owner, ready-source, accepted-review, and active-revision predicates; parameters are escaped/bound and existing alias expansion remains. Focused SQL-scope regression tests pass 4/4. Fact-level vector/FTS indexing, richer inline citation/source navigation, realistic Postgres EXPLAIN/latency, and live provider/browser verification remain; citation/document-tool tests separately pass 10/10. Evidence: `src/lib/rag/retrieve.ts`, `src/lib/rag/format.ts`, `src/app/api/chat/route.ts`, `src/components/chat/citation.tsx`, `src/lib/ai/tools/project-document.ts`, `src/lib/projects/project-brain-context.ts`, and focused tests.
- **B08 — Browse project knowledge graph and source details** — **PARTIAL** (provisional P1, Medium/Large): Adapted upstream linked-entity navigation: related graph neighbors are now buttons that open the selected node's existing authenticated source detail. API tests assert project, current collection/owner allowlists, ready status and active source-revision predicate. Focused graph/detail/UI suites 14/14; live DB/browser journey remains unverified.
- **B09 — Review facts, source versions, contradictions, and timeline events** — **PARTIAL** (provisional P1, Medium/Large): Timeline exposes the exact source revision behind current events with active-run, project, collection-owner, ready, fingerprint, and length checks. Current contradiction pairs now show each authorized claim's source label, observation timestamp, and evidence, adapted from upstream's provenance-first review card; the graph query still filters attached collections, current active revisions, ready status, and source owners before returning claims. Focused timeline/version tests 8/8 and graph/provenance/UI tests 12/12; live DB/browser review journey remains.
- **B10 — Review generated todos, insights, and project status** — **PARTIAL** (provisional P1, Medium/Large): Status/todo tools and routes exist; scheduled refresh and end-to-end status workflow unverified.
- **B11 — Connect and sync project MCP/Composio tools** — **PARTIAL** (provisional P1, Medium/Large): Connector routes/sync tests exist; provider authorization/run unverified.
- **B12 — Associate agents/workflows with projects** — **PARTIAL** (provisional P1, Medium/Large): Some project association paths exist; complete authoring/execution parity unverified.
- **B13 — Automatically add project-brain evidence to project chat context** — **PARTIAL** (provisional P1, Medium/Large): Bounded current-source evidence injection and tests exist; live Postgres/browser verification remains.
- **B14 — Use project-scoped status and knowledge tools in voice** — **PARTIAL** (provisional P1, Medium/Large): Ported upstream voice status lookup by project ID or unique exact accessible project name. Resolution uses the authenticated user's project list and rechecks current project ACL; status is limited to current attached collections/source owners and current fingerprints. Status remains read-only and is explicitly described as untrusted evidence. Knowledge search stays bound to an owned project thread. Focused status/voice tests pass 19/19; scoped Biome and typecheck pass. Live provider/Postgres/browser journey remains unverified; Kimi lacks a project-tool executor. Evidence: `src/lib/voice/project-status.ts`, `src/app/api/voice/project-status/route.ts`, `src/lib/ai/speech/index.ts`, OpenAI Realtime/KonvO handlers.
- **B15 — Save completed realtime voice turns to a conversation** — **PARTIAL** (provisional P1, Medium/Large): Session-to-thread persistence and tests exist; provider/browser journey unverified.
- **B16 — Review voice transcripts and create a handoff** — **PARTIAL** (provisional P1, Medium/Large): Voice inbox/review and user-triggered draft handoff exist; live workflow and wider provider paths unverified.
- **B17 — Pair and manage voice devices** — **PARTIAL** (provisional P1, Medium/Large): Existing owner-scoped listing/revocation retained; added credential rotation for active owned devices. New bearer is returned once with no-store headers while only its peppered hash is persisted; UI confirms immediate invalidation and exposes copy/hide controls. Route/repository/UI tests 8/8; hardware/PostgreSQL journey unverified.
- **B18 — Use device session/segment history and live transport** — **PARTIAL** (provisional P1, Medium/Large): Added owner-scoped keyset pagination for persisted session history and a Load older sessions UI; ordered segments remain inspectable on demand with bounded text. Focused route/repository/UI tests 15/15; no live DB/device run. Reference checkout lacks paired-device session routes and the required WebSocket bridge, so hardware/live transport remains unavailable.
- **B19 — Execute device voice commands as actions** — **EXCLUDED** (provisional P1, Medium/Large): V2 direct dispatch is unsafe; Void-Agent keeps transcripts review-first. Safe equivalent requires explicit action approval.
- **B20 — Run browser automation from voice** — **MISSING** (provisional P0, Large): Upstream wraps its isolated Kernel browser with credential-vault resolution, organization policy/credit checks, abortable streamed status, teardown, and read-only live view. Primary has only Steel/Crawl/Cloak tools; the Steel loop can follow redirects, navigate arbitrary URLs, perform form actions, retain thread sessions, and expose an interactive viewer without equivalent network egress isolation or prompt-injection boundaries. Exposing it to voice is unsafe until those controls and end-to-end cancellation/cleanup verification exist. Safe public search is tracked separately as B23 and is not browser parity. Evidence: `docs/voice-web-search.md`, `src/lib/ai/tools/browser/browser-agent.ts`, upstream `apps/web/src/lib/voice/browser-run.ts`.
- **B21 — Operate the physical-device audio gateway/firmware flow** — **EXCLUDED** (provisional P1, Medium/Large): Inspected V2 checkout lacks the bridge script and its WebSocket endpoint returns 426; reference workflow is non-executable here.
- **B22 — Delegate a voice request to another available agent** — **PARTIAL** (provisional P1, Medium/Large): Added same-origin authenticated `/api/voice/run-agent`, owner-accessible agent/model resolution, 30s/1,000-token/6,000-character bounds, rate limiting, and team-budget reserve/settlement. The selected agent's currently authorized MCP mentions are provided as schema-only tools with no `execute`; at most three exact, bounded proposals are returned. The voice client shows a separate confirmation for every proposed action, obtains the existing persisted 10-minute one-use approval token, then dispatches through `callApprovedVoiceMcpToolAction`. Approval issuance binds agent ID, server/tool, exact arguments, and current config fingerprint; issuance and dispatch both recheck current agent access and tool mention, while the existing MCP approval executor rechecks MCP access/config and consumes the token before dispatch. Only non-error MCP results are reported as approved; fulfilled `{isError:true}` results are reported as failed. When any tool proposal is returned, model-authored answer text is replaced by a neutral review status so it cannot claim unapproved work completed. Secret-like argument fields are redacted in the first review and require a second confirmation displaying exact values. Composio actions are not exposed. No new migration was needed: approval tokens use the existing verification table. Focused suites pass; live voice/provider/PostgreSQL/browser flow remains unverified, so B22 stays PARTIAL. Evidence: `src/app/api/voice/run-agent/route.ts`, `src/lib/ai/speech/run-agent.ts`, `src/lib/ai/speech/mcp-voice-approval.ts`, `src/lib/ai/speech/voice-agent-mcp-access.ts`, `src/app/api/approvals/mcp-tool/route.ts`, and `src/app/api/mcp/actions.ts`.
- **B23 — Search public web sources by voice** — **PARTIAL** (provisional P1, Medium/Large): `searchWeb` is present in the default voice tool schema returned by the ElevenLabs session route and is bound to the ElevenLabs SDK `clientTools.searchWeb` callback; OpenAI Realtime and Konvo also dispatch the tool. The callback calls the authenticated same-origin `/api/voice/web-search` route, which caps request/results/excerpts, forwards cancellation with a 12-second timeout, filters local/private result URLs, marks excerpts untrusted, rate limits by owner, and never fetches arbitrary user-supplied URLs or mutates a page. Focused route/client/tool tests: 9/9 passed. Correction: the earlier note that the ElevenLabs client callback was missing was inaccurate; executable wiring is present. The ElevenLabs Conversational AI agent must still be configured externally with a matching blocking client-tool schema as documented in `docs/voice-web-search.md`; no live ElevenLabs session or provider-backed search was verified. This read-only workflow does not satisfy B20 browser automation. Evidence: `src/lib/ai/speech/index.ts` (`DEFAULT_VOICE_TOOLS`), `src/app/api/voice/kimi-elevenlabs/session/route.ts` (`bindingTools`), `src/lib/ai/speech/elevenlabs/use-voice-chat-elevenlabs.ts` (`clientTools.searchWeb`), `src/lib/ai/speech/web-search.ts`, and `src/app/api/voice/web-search/route.ts`.
- **B24 — Learn and review project facts from completed chats** — **PARTIAL** (provisional P1, Medium/Large): Added bounded text-only chat-source snapshots, queue-time owner/project/thread/fingerprint checks, active-revision invalidation, refresh after completion/edit/truncation/project assignment and revocation after delete/detach. Current accepted chat facts/events feed project context; owner-scoped brain GET/review APIs and panel show source labels/status. Focused tests: 32/32 across 6 files plus assignment lifecycle coverage; typecheck, `pnpm db:check`, scoped Biome and diff check pass. Migration 0075 remains unapplied; no live PostgreSQL worker/review or browser E2E.
- **C01 — Create/edit/delete agents, including preset creation** — **PARTIAL** (provisional P2, Medium/Large): Ported the executable upstream six-preset catalog, idempotent per-owner `preset_id` storage, authenticated/permission-checked/same-origin/rate-limited create-from-preset API, and an Agents-page library entrypoint. Focused route/repository/schema tests: 7/7 across 3 files in local rerun. Migration 0076 is additive and unapplied; live database/browser adoption remains unverified.
- **C02 — Generate an agent from a prompt** — **PARTIAL** (provisional P2, Medium/Large): `/api/agent/ai` now reserves and settles team monthly-budget usage from the authenticated active organization, rejects stale/nonmember organizations, avoids hidden fallback for budgeted calls, and releases only unspent reservations. Route tests: 11/11. Live PostgreSQL budget lifecycle and provider-backed journey remain unverified.
- **C03 — Publish, browse, install, and uninstall agents** — **PARTIAL** (provisional P2, Medium/Large): Added separate clone-to-owned-copy flow: current publication is locked/rechecked; copied agent is private and owner-scoped, publisher integrations/files/model pins are omitted, and retries are idempotent. Gallery Install records/count behavior remains separate and unchanged. Clone/install/gallery suites 33/33 pass; live PostgreSQL/browser journey unverified.
- **C04 — Register/edit/remove and OAuth-connect MCP servers** — **PARTIAL** (provisional P2, Medium/Large): Filled a missing config-edit path: existing MCP editor now calls authenticated owner/manager-authorized `PUT /api/mcp/[id]`, validates the config, prevents same-owner name collisions, and reuses the existing persistence/connectivity path. Endpoint URL changes first delete every OAuth session for that server so old tokens/PKCE state cannot be reused against a different host; same-endpoint header edits preserve OAuth state. OAuth callback requires a live server/state, explicitly adopts the stored state, and does not report success for a missing client; cached dynamic registrations with a callback URI different from the configured exact callback are discarded. Callback HTML is no-store and callback payload JSON is safe for inline-script context. Focused API/provider tests pass 16/16. Still unverified: live PostgreSQL, provider OAuth round-trip, and browser editor journey. Evidence: `src/app/api/mcp/[id]/route.ts`, its tests, `src/app/api/mcp/oauth/callback/route.ts`, `src/lib/ai/mcp/pg-oauth-provider.ts`, `src/lib/db/pg/repositories/mcp-oauth-repository.pg.ts`.
- **C05 — Customize MCP server and tool behavior** — **PARTIAL** (provisional P2, Medium/Large): Compared against Better Chatbot 2.0: the existing per-user server/tool customization UI and routes persist prompts in the customization repositories, invalidate the user's customization cache after writes/deletes, and load them into chat and voice system prompts. `filterMcpServerCustomizations` limits tool-level guidance to tools currently bound for the request; prompt construction occurs before `streamText` receives the tool set. This is functionally equivalent by source trace, so no duplicate code was added. Still unverified: live PostgreSQL-backed save/delete and authenticated browser-to-MCP invocation. Evidence: `src/components/mcp-customization-popup.tsx`, `src/components/tool-detail-popup.tsx`, `src/app/api/mcp/server-customizations/[server]/route.ts`, `src/app/api/mcp/tool-customizations/[server]/[tool]/route.ts`, `src/app/api/chat/actions.ts`, `src/app/api/chat/shared.chat.ts`, `src/app/api/chat/route.ts`.
- **C06 — Invoke MCP tools from chat** — **PARTIAL** (provisional P2, Medium/Large): Result handling includes bounded inline raster images, explicit MCP `isError` status, HTTPS resource links, and now playable inline audio. Images remain limited to PNG/JPEG/WebP/GIF (max 3, 512 KiB each); audio is limited to 2 allowlisted base64 clips, max 2 MiB each, rendered with native controls and `preload=none`. Audio/image bytes are redacted from transcript JSON. Resource links are capped at 10, length/label bounded, HTTPS-only, reject credentials, do not trigger automatic fetches, display destination host, and use `noopener noreferrer`. Unsafe, malformed, or oversized payloads are omitted. Focused media/UI tests pass 12/12; scoped Biome and diff checks pass. Existing C13 exact-configuration/argument approval, one-use token dispatch, server ownership, and authorization paths were not changed. Remaining: broader MIME/resource behavior and live authenticated MCP execution/browser verification. Evidence: `src/lib/ai/mcp/mcp-result-media.ts`, `src/components/tool-invocation/mcp-tool-result.tsx`.
- **C07 — Create/edit/save workflow graphs** — **PARTIAL** (provisional P2, Medium/Large): Saved-workflow editor/CRUD/structure tests exist. Ported upstream recursive TipTap conversion from nested workflow inputs, preserving mentions and hard breaks and rendering nested bullet lists; focused conversion tests pass. Live persistence/browser path unverified.
- **C08 — Run saved workflows with effect approval** — **PARTIAL** (provisional P2, Medium/Large): Primary's durable execution/checkpoint/resume system remains stronger than Better Chatbot 2.0's in-memory node event logging (`apps/web/src/lib/ai/workflow/executor/workflow-executor.ts` at `6f41835`); upstream has no durable owner execution-history API. Added owner-scoped recent-history and detail GET APIs plus a Saved Workflows recovery panel. Summaries expose only status and completed-node count; detail returns a redacted pending action only for its owner, and rechecks current workflow/MCP access before enabling approve. Owners can still reject a pending action if access has been revoked. Approval/resume still uses the existing exact effect hash, encrypted payload, atomic repository transition, and permission checks; expired reviews cannot be resumed. Focused C08 tests pass 25/25 across 6 files; full typecheck, scoped Biome and diff checks pass. No new migration. Live PostgreSQL and authenticated browser journeys remain unverified.
- **C09 — Create/edit/enable/delete scheduled jobs** — **PARTIAL** (provisional P2, Medium/Large): Dashboard create/edit/pause-resume/delete remains backed by same-origin and owner-scoped CRUD; create UI uses a stable payload-bound `Idempotency-Key` so a lost response can be safely retried. Creation now lists only the current userâ€™s agents and persists the selected `agentId`; the public schedule projection retains it for display/edit, and agent selection is immutable on edit. Durable worker execution/cancel/history remain. Focused dashboard/route/helper tests pass 26/26 across 3 files; scoped Biome passes. Live DB/browser/worker journey unverified.
- **C10 — Execute cron jobs and inspect scheduler diagnostics** — **PARTIAL** (provisional P2, Medium/Large): Existing cron worker and diagnostics are preserved; diagnostics expose only configuration presence and per-owner due/next-run state. Safe history failure categories now clarify common execution failures without exposing raw provider/error text. Focused scheduler suite passes; deployed worker behavior unverified.
- **C11 — Manually run a scheduled job and review run history** — **PARTIAL** (provisional P2, Medium/Large): Durable owner-bound manual requests retain idempotent replay and concurrent-run protection. Run history now shows safe categorical failure diagnostics; raw output/error remains redacted, with `private, no-store` on every response. Focused API/repository/UI tests pass; live worker/DB result flow unverified.
- **C12 — Connect, resume, pause, and disconnect external app accounts** — **PARTIAL** (provisional P2, Medium/Large): Pause/resume/disconnect now use the shared 60-provider registry and reject unknown route values before DB access. Resume covers the expanded catalog; pause is an idempotent explicit state transition, both require an owned connected row, preserve tokens, and guard the update against a concurrent disconnect; disconnect remains owner-scoped, best-effort revokes, then clears stored credentials. Nine route tests cover expanded-provider support, unknown-provider/auth rejection, ownership predicates, missing/disconnected states, and revocation/token cleanup. Live PostgreSQL/provider OAuth lifecycle remains unverified.
- **C13 — Approve connector write actions** — **PARTIAL** (provisional P2, Medium/Large): MCP approvals bind exact arguments to a keyed fingerprint of canonical server configuration. Proposal, UI review, token consumption, and dispatch validate current configuration; the manager now also requires the reviewed server name, rejects disabled/renamed/replaced rows, rechecks stored and active config immediately before dispatch, and returns inert `ApprovalRequired` results from generic `tools()` definitions so they cannot bypass the approved wrapper. Only the approval-bound chat wrapper and separately authorized workflow/project read-only paths dispatch. Existing combined batch suite: 73/73 across 8 files; this C13 follow-up: 43/43 across 3 focused suites; scoped Biome and diff-check pass. Other connector/workflow mutation coverage and live MCP/PostgreSQL/browser journey remain unverified. Evidence: `src/lib/ai/mcp/create-mcp-clients-manager.ts`, `src/app/api/chat/shared.chat.ts`, `src/app/api/mcp/actions.ts`, `src/app/api/approvals/mcp-tool/route.ts`, `src/lib/ai/mcp/execute-approved-mcp-tool.ts`.
- **C14 — Subscribe Slack channels to agent tasks** — **EXCLUDED** (provisional P2, Medium/Large): V2 checkout has declarations but no executable handlers/event/delivery path.
- **C15 — List notifications and mark them read** — **PARTIAL** (provisional P2, Medium/Large): Ported upstream type-filtered feed behavior, including filtering unread counts, and explicit `{all:true}` mark-all behavior through the existing authenticated, origin-checked, rate-limited, owner-scoped APIs. Empty or false mark-all payloads are rejected; only non-empty IDs or explicit `{all:true}` are accepted. DB errors and no-store responses are handled. The Cockpit now includes an agent Updates feed backed by the same owner-scoped inbox: it polls the latest eight update notifications, shows severity/read state, validates links with `safeNotificationHref`, and supports mark-read. UI/route/type suites pass 20/20 combined (13 notification route/contract + 7 Cockpit UI); scoped Biome passes. Browser/live PostgreSQL journey remains unverified.
- **C16 — Register and receive browser push notifications** — **PARTIAL** (provisional P2, Medium/Large): Existing owner-scoped VAPID API and service worker now use a tested push client for permission, subscribe, key-refresh and server-first unsubscribe; denied/dismissed/unsupported states get recovery guidance. Focused push suite: 19/19; real browser permission and VAPID delivery unverified.
- **C17 — Manage profile, password, recovery, and sessions** — **PARTIAL** (provisional P2, Medium/Large): Ported upstream's lazy-on-open settings-context workflow: authenticated, owner-scoped, no-store endpoint returns only profile and safe account-provider summary. Also ported upstream Better Chatbot commit `113a86d` (#377): password-update mode now derives only from server-side `isOwnResource`, not a client-submitted `isCurrentUser` flag; self-service always requires current-password verification, while authorized admin reset revokes the target's other sessions. Password validation/action tests pass (27/27) and scoped Biome passes. Live email/DB/browser flow remains unverified.
- **C18 — Checkout, inspect subscription, and process billing webhooks** — **PARTIAL** (provisional P2, Medium/Large): Upstream `better-chatbot/main` at `6f4183566bc48616303cb84055f11f79578c82fe` disables checkout/subscription and has no live billing webhook flow, so Void-Agent's Dodo checkout, subscription reconciliation, and signature-verified webhook remain the stronger existing implementation. Added self-service Dodo customer portal creation using the stored customer on the authenticated user's subscription; the route is same-origin, rate-limited, owner-derived, secret-protected, and only returns an HTTPS provider link. Focused Dodo suite: 28/28 across 5 files; 6 GB full typecheck passes. Live Dodo, PostgreSQL, and browser navigation remain unverified; no production billing or DB calls.
- **C19 — Use desktop auth handoff, download/update, and packaged app** — **PARTIAL** (provisional P2, Medium/Large): Preserved existing HTTPS-only feed validation, signing preflight, Electron updater signature verification policy, auth handoff, and download flow. Added a bounded local updater.log wired to electron-updater, redacting URL paths/query strings and common credential fields, plus a native Help-menu action to open the log folder. Focused updater/menu tests pass (12/12); desktop typecheck and main build pass. No signed installer/feed credentials or packaged GUI/update journey available; that remains unverified.
- **C20 — Configure and test local/remote desktop MCP servers** — **PARTIAL** (provisional P2, Medium/Large): Primary bridge keeps origin/main-frame checks, native consent bound to config fingerprints, default-deny tool names, timeout/result bounds, pinned remote DNS and hash-only audit. Fixed remote consent copy to show the HTTPS origin and disclose that exact arguments go to the remote server and results return as untrusted, without displaying credential values. Desktop MCP consent fingerprints now retain only SHA-256 digests of canonical configurations, not stdio environment or remote header credentials; regressions prove secrets are absent. Full desktop main suite passes 68/68 across 17 files, package typecheck, scoped Biome, and diff-check. Live Electron/remote-server journey remains unverified; V2's weaker bridge is not used by chat. Live Electron/remote-server journey remains unverified; V2's weaker bridge is not used by chat.
- **C21 — Connect external services in Cockpit** — **OPTIONAL** (provisional P2, Medium/Large): Stripe vertical slice exists; wider provider console is secondary.
- **C22 — Submit and triage problem reports** — **PARTIAL** (provisional P2, Medium/Large): Primary already has owner-scoped admin status triage; added optional, escaped, configurable notification after persistence to match upstream submission behavior. Upstream has no admin assignment/status workflow. Live delivery and persisted browser journey remain unverified.
- **C23 — Use telemetry and observability integrations** — **OPTIONAL** (provisional P2, Medium/Large): Logging exists; opt-in external telemetry parity is not established.
- **C24 — Automatically update from upstream** — **DEPRECATED** (provisional P2, Medium/Large): Not appropriate for independent Void-Agent product.
- **C25 — Use managed workflow generation and dashboard hosting** — **EXCLUDED** (provisional P2, Medium/Large): Inspected V2 checkout has schema/UI references but no executable generator, worker, hosting or provisioning path.
- **C27 — Add registered users to an existing team** — **PARTIAL** (provisional P2, Medium/Large): Preserved the owner/admin-only `/team-members` flow to immediately add an existing Void-Agent account as `member` or `viewer`. The endpoint checks exact team owner/admin status, validates body/team/email, rate-limits/no-store, and uses a transaction with unique-conflict handling to create membership and default budget policy. The same screen now also supports pending email invitations in C28. Focused team/scheduler tests pass; live PostgreSQL/browser verification remains. Evidence: `/api/teams/[teamId]/members`, `src/components/team-members-settings.tsx`, `src/lib/db/pg/repositories/team-repository.pg.ts`.
- **C28 — Invite a team member by email and accept into the canonical team** — **PARTIAL** (provisional P2, Medium/Large): Added dedicated pending-invitation persistence, email delivery status, manager list/create/revoke APIs, one-time 256-bit hash-only bearer tokens, fragment-only accept links, verified-email matching, and transactional membership plus budget-policy acceptance. UI includes pending invite management and a sign-in-preserving acceptance page. Focused invitation/API/UI tests pass; local additive migrations 0080/0081 are unapplied. Live PostgreSQL, Resend, sign-in callback, and browser journey remain unverified. Evidence: `src/lib/db/pg/schema.pg.ts`, `src/lib/db/pg/repositories/team-invitation-repository.pg.ts`, `/api/teams/[teamId]/invitations`, `/api/team-invitations/accept`, `/team-invitations/accept`.
- **C29 — Select and persist the active team metering context per session** — **PARTIAL** (provisional P2, Medium/Large): Fresh audit found primary had enabled the Better Auth organization plugin while its organization/member/invitation tables and session active-organization field were not mapped. Replaced that unsupported path with app-owned `session.activeTeamId`, an owner-session-only same-origin selector validated against current team membership, cache-bypassing use in AI/voice budgeted routes, and stale selection clearing. Additive migration 0081 is unapplied; route/UI/unit tests pass, but live PostgreSQL auth-session reload and over-cap provider journeys remain unverified. Evidence: `src/lib/auth/auth-instance.ts`, `/api/user/active-team`, `src/app/api/agent/ai/route.ts`, `src/app/api/voice/run-agent/route.ts`.
- **C30 — Create a plan-only artifact with read-only research tools** — **PARTIAL** (provisional P2, Medium/Large): Added a persisted composer toggle and `planMode` chat request field. The server ignores client mentions/tool choices in this mode and binds only allowlisted read-only web/project research tools plus one bounded `createPlan` artifact; MCP, workflows, approvals, image generation, publishing, code execution, schedule dispatch, and other effectful tools are excluded even if the client forges them. The route rejects models without tool calling with `plan-mode-model-unsupported`. Plan artifacts render from saved tool-call parts. Focused tests: 11/11 across six files, including tool allowlist, model capability rejection, request schema, preference rehydration, composer toggle, schema bounds, and rendering. Live provider/browser journey remains unverified. Evidence: `src/lib/ai/planning/plan-mode.ts`, `create-plan-tool.ts`, `/api/chat`, `src/components/tool-mode-dropdown.tsx`, `src/components/tool-invocation/plan-artifact-card.tsx`.
- **C31 — Discover and execute connected-app read-only actions in chat** — **PARTIAL** (provisional P2, Medium/Large): Added owner-scoped Composio chat tools behind authenticated, non-embed, tool-enabled chat. Search derives active private accounts server-side and returns request-local opaque account refs plus bounded safe read-action schemas; execution requires a previously listed action/ref pair, validates its JSON schema, rechecks the active owner connection, applies per-user rate limiting and per-chat call/result budgets, then strips credential-named fields from bounded results and labels returned data untrusted. Mutating actions are tracked separately in C38 with a server-bound approval-token workflow; Composio provider-backed journey remains unverified. Focused tests: 12/12 across the chat helper and account-list suites; scoped Biome and diff-check pass. Full `pnpm check-types` passes with 6 GiB Node heap after explicit AI SDK input/output and JSONSchema7 types; scoped Biome and diff-check pass. Evidence: `src/lib/ai/composio-chat-tools.ts`, `src/lib/ai/composio-chat-tools.test.ts`, `src/app/api/chat/route.ts`, `src/lib/ai/composio.ts`.| PARTIAL
- **C32 — Record a scheduled chat run only after a verified terminal completion** — **PARTIAL** (provisional P2, Medium/Large): Primary's scheduler previously treated any HTTP 2xx as success without consuming the `/api/chat` stream. It now requires `text/event-stream`, drains with a 2 MiB ceiling while retaining only a 64 KiB tail, enforces a five-minute fetch-plus-stream deadline, and accepts only a parseable terminal `finish` frame with `finishReason: "stop"` and no blocked metadata. Redirect/auth bounce, non-2xx, invalid content type, missing/malformed/truncated finish, blocked runs, errors, other finish reasons, oversized streams and timeouts become safe failure categories and failure notifications. Focused suite: 15/15 tests. Live worker/PostgreSQL/browser/provider journey remains unverified. Evidence: `src/lib/scheduler/chat-response.ts`, `chat-response.test.ts`, `worker.ts`.
- **D01 — Create a multi-source review, generate/edit/retry cells, cite evidence, and export XLSX** — **PARTIAL** (provisional P1, Medium/Large): Generation keeps exact-quote validation; verified citations map to ordered pinned source segments and render in both review UIs and XLSX export. Shared upstream review presets now drive the dashboard and AI-created reviews, including list-formatted key dates and server-resolved preset prompts; custom AI columns still require bounded prompts. Evidence remains caller-owned, ready, and revision-pinned. Tabular focused tests: 41/41 across 10 files; live PostgreSQL/browser flow remains unverified and migration 0073 remains unapplied.
- **C33 — Configure chat-alert delivery and suppress alerts for the currently viewed thread** — **PARTIAL** (provisional P2, Medium/Large): This is separate from C15's notification inbox/read-state workflow and C16's push subscription/delivery workflow. V2 source: `apps/web/src/hooks/use-agent-alert-notifications.ts`, `apps/web/src/lib/agent-alerts/maybe-notify-agent-alert.ts`, `apps/web/src/components/agent-alerts/notification-settings-content.tsx`; it suppresses alerts for the visible current thread and supports only-when-away. Primary adds `chatAlertsOnlyWhenAway` to existing owner preferences, suppresses the visible current thread, and routes away alerts through the existing desktop/browser notification channels while retaining generic private copy. Focused helper/hook tests: 17/17; live browser settings persistence and desktop/browser notification delivery remain unverified. Root should reconcile this addendum into global counts before reporting a parity percentage.
- **E01 — Complete first-run setup and optionally connect apps** — **PARTIAL** (provisional P1, Medium/Large): Added authenticated `/onboarding` page with resumable overview/connect-app steps, direct skip/agent/workflow choices, and Composio pagination/connect/disconnect through the existing owner-scoped `/api/integrations/composio` API. Added a same-origin, rate-limited onboarding-state endpoint backed by an atomic JSONB key update, preserving notes, skills, and notification preferences. The chat-layout gate uses the device cookie as a fast path and the database preference as authority; completion cookie is HttpOnly/SameSite and can only be minted after the server confirms `step: done`. Focused onboarding tests pass 23/23 across 7 files; 6 GB typecheck and scoped Biome pass. Real browser/OAuth and live PostgreSQL verification remain unverified, so E01 is PARTIAL. Evidence: `src/app/onboarding/page.tsx`, `src/components/onboarding/onboarding-wizard.tsx`, `src/app/api/user/onboarding/route.ts`, `src/app/api/onboarding/complete/route.ts`, `src/app/(chat)/layout.tsx`.
- **E02 — Create and resume project setup across goal, knowledge, documents, tools, people, and agents** — **PARTIAL** (provisional P1, Medium/Large): Added a project-card wizard that opens after creation and resumes from a persisted step; goal/knowledge save through existing project PATCH, documents use the existing private project upload/API, tools use existing brain connectors, people use current team collaborator ACLs, and agent assignments use a metadata-safe API. Team projects accept only public agents; personal projects accept caller-owned or public agents. Same-origin editor-only progress and completion API persists the step; Skip for now retains resume state. Authorized project editors can remove an existing assignment if its agent later becomes private, without reading agent metadata; GET/available/POST visibility restrictions remain. Additive migration 0078 adds the progress field and project-agent join table; unapplied. **Project-agent assignment is configuration-only in both repositories:** V2 has the join table, authenticated GET/POST/DELETE routes, onboarding and collaborator UI, but repository-wide usage shows no project-chat or agent-execution path reads assigned rows. Primary likewise stores/displays assignments only. This is not an upstream execution-parity gap; no implicit agent execution or prompt injection was added. Latest focused agent-route suite passes 8/8; prior combined `pnpm db:check` and 6 GB typecheck passed; scoped Biome passes. Live PostgreSQL/browser and migration application remain unverified. Evidence: V2 `apps/web/src/app/api/projects/[id]/agents/route.ts`, `apps/web/src/components/projects/onboarding-step-agents.tsx`, and `apps/web/src/components/projects/project-collaborators-dialog.tsx`; primary `src/components/project-setup-wizard.tsx`, `src/components/project-assigned-agents.tsx`, `src/app/api/projects/[id]/agents/route.ts`, `src/app/api/projects/[id]/onboard/route.ts`.
- **B25 — Tune OpenAI Realtime voice activity and background-noise handling** — **PARTIAL** (provisional P1, Medium/Large): Persisted sensitivity, pause, and noise-reduction controls are clamped/allowlisted on the server before session creation. Focused normalization tests pass 3/3; live provider/browser verification remains.
- **C26 — Answer agent follow-up questions with structured choices or typed values** — **PARTIAL** (provisional P2, Medium/Large): RequestInput supports legacy string choices, bounded descriptive choices, multi-select, placeholders, and text/number/email/URL fields. Password input remains prohibited. Focused schema/UI tests pass 16/16; model-to-user browser journey remains.
- **C34 — Search an optional Agentset project knowledge namespace** — **PARTIAL** (provisional P2, Medium/Large): Added a disabled-by-default, fixed-origin server adapter and same-origin authenticated project route. Results are bounded and rechecked against current project access, attached collections, source owners, ready item state, and local document IDs. Focused adapter/source/route tests: 11/11. Remote ingestion mirroring/job lifecycle, management UI, chat/project-brain context injection, and live credentials/PostgreSQL/browser verification remain. Evidence: `src/lib/rag/agentset-provider.ts`, `src/lib/rag/agentset-source-access.ts`, `src/app/api/projects/[id]/search/route.ts`, `docs/features/agentset-project-search.md`.| PARTIAL
- **C35 — Search and execute connected-app read actions in OpenAI Realtime voice** — **PARTIAL** (provisional P2, Medium/Large): Added owner-bound encrypted short-lived account references; active account recheck; read-only action and schema validation; per-user limits; bounded/redacted results marked untrusted; authenticated same-origin execution route; and Realtime tool dispatch. Mutating actions remain unavailable pending an approval-bound workflow. Focused helper/route/chat-helper tests: 22/22. Live Composio/provider/browser verification remains. Evidence: `src/lib/ai/composio-voice-tools.ts`, `src/app/api/voice/composio-tool/route.ts`, `src/app/api/chat/openai-realtime/route.ts`, `src/lib/ai/speech/open-ai/use-voice-chat.openai.ts`.| PARTIAL

- **C36 — Propose tracked DOCX edits from an authorized project chat and explicitly review the candidate** — **PARTIAL**: Owner/editor and DOCX-only tool exposure; proposal persists as a tracked review copy and requires user review; no automatic apply. Live PostgreSQL and browser accept/reject flow remain unverified. Evidence: src/app/api/chat/route.ts, src/lib/ai/tools/project-document.ts, src/lib/documents/project-document-edit-proposal.ts, src/components/tool-invocation/project-document-edit-proposal.tsx.
- **C37 — Render secure Morphik image previews from MCP tool results** — **PARTIAL**: Short-lived owner-bound references replace signed URLs before model/transcript/persistence; authenticated proxy bounds and allowlists retrieval. Live S3/browser rendering remains unverified. Evidence: src/lib/ai/mcp/morphik-media-reference.ts, src/lib/ai/mcp/execute-approved-mcp-tool.ts, src/app/api/mcp/media/morphik-image/route.ts, src/components/tool-invocation/morphik-image-preview.tsx.

- **C38 - Propose and execute connected-app write actions after exact-payload approval** - **PARTIAL**: `src/lib/ai/composio-write-chat-tools.ts`, `src/lib/ai/tools/hitl/composio-write-approval.ts`, `src/lib/ai/tools/hitl/composio-write-approval-route.ts`, `src/app/api/approvals/composio/route.ts`, `src/components/tool-invocation/hitl-tool-cards.tsx`, and `src/components/message-parts.tsx`. Approval binds current user/account/action/version/schema/exact arguments and is single-use. Focused tests pass 21/21 across four files; live Composio/PostgreSQL/browser execution remains unverified.

## Appendix B — Changed path snapshot

Current snapshot after this batch: 643 changed or untracked paths (context.md is ignored).

- `.env.example`
- `apps/desktop/src/main/application-menu.test.ts`
- `apps/desktop/src/main/application-menu.ts`
- `apps/desktop/src/main/auto-updater.ts`
- `apps/desktop/src/main/index.ts`
- `apps/desktop/src/main/mcp-audit-log.test.ts`
- `apps/desktop/src/main/mcp-audit-log.ts`
- `apps/desktop/src/main/mcp-ipc.test.ts`
- `apps/desktop/src/main/mcp-ipc.ts`
- `apps/desktop/src/main/mcp-policy.test.ts`
- `apps/desktop/src/main/mcp-policy.ts`
- `apps/desktop/src/main/mcp-spawner.remote.test.ts`
- `apps/desktop/src/main/mcp-spawner.ts`
- `apps/desktop/src/main/pinned-remote-fetch.test.ts`
- `apps/desktop/src/main/pinned-remote-fetch.ts`
- `apps/desktop/src/preload/index.ts`
- `docs/better-chatbot-feature-inventory.md`
- `docs/feature-parity-matrix.md`
- `docs/feature-work-register.md`
- `docs/features/gallery.md`
- `docs/integration-progress.md`
- `docs/integration-roadmap.md`
- `docs/integration-strategy.md`
- `docs/migration-handoff.md`
- `docs/security-review.md`
- `docs/testing-report.md`
- `next.config.test.ts`
- `next.config.ts`
- `package.json`
- `pnpm-lock.yaml`
- `src/app/(chat)/(admin)/admin/settings/models/page.tsx`
- `src/app/(chat)/agent/[id]/page.tsx`
- `src/app/(chat)/layout.tsx`
- `src/app/(chat)/mcp/test/[id]/page.tsx`
- `src/app/(chat)/settings/connectors/connectors-settings-view.tsx`
- `src/app/(public)/export/[id]/page.tsx`
- `src/app/api/admin/config/route.ts`
- `src/app/api/admin/providers/discover/route.test.ts`
- `src/app/api/admin/providers/discover/route.ts`
- `src/app/api/admin/providers/route.ts`
- `src/app/api/agent/ai/route.test.ts`
- `src/app/api/agent/ai/route.ts`
- `src/app/api/approvals/mcp-tool/route.test.ts`
- `src/app/api/approvals/mcp-tool/route.ts`
- `src/app/api/chat/actions.ts`
- `src/app/api/chat/export/route.ts`
- `src/app/api/chat/models/route.test.ts`
- `src/app/api/chat/models/route.ts`
- `src/app/api/chat/openai-realtime/route.ts`
- `src/app/api/chat/route.ts`
- `src/app/api/chat/shared.chat.ts`
- `src/app/api/chat/title/route.test.ts`
- `src/app/api/chat/title/route.ts`
- `src/app/api/cockpit/revolut/summary/route.ts`
- `src/app/api/cockpit/seo/summary/route.ts`
- `src/app/api/cockpit/superlog/summary/route.ts`
- `src/app/api/cockpit/vercel/deployments/route.ts`
- `src/app/api/cockpit/website/summary/route.ts`
- `src/app/api/connectors/[provider]/disconnect/route.ts`
- `src/app/api/connectors/[provider]/pause/route.ts`
- `src/app/api/connectors/[provider]/resume/route.ts`
- `src/app/api/connectors/route.ts`
- `src/app/api/export/[id]/og-image/route.ts`
- `src/app/api/images/edit/route.ts`
- `src/app/api/integrations/composio/route.test.ts`
- `src/app/api/integrations/composio/route.ts`
- `src/app/api/mcp/[id]/route.ts`
- `src/app/api/mcp/actions.ts`
- `src/app/api/mcp/oauth/callback/route.ts`
- `src/app/api/mcp/route.ts`
- `src/app/api/notifications/read/route.test.ts`
- `src/app/api/notifications/read/route.ts`
- `src/app/api/notifications/route.ts`
- `src/app/api/problem-report/route.test.ts`
- `src/app/api/problem-report/route.ts`
- `src/app/api/projects/[id]/brain/composio/[connectorId]/sync/route.test.ts`
- `src/app/api/projects/[id]/brain/composio/[connectorId]/sync/route.ts`
- `src/app/api/projects/[id]/brain/composio/route.test.ts`
- `src/app/api/projects/[id]/brain/composio/route.ts`
- `src/app/api/projects/[id]/brain/contradictions/route.ts`
- `src/app/api/projects/[id]/brain/facts/[factId]/route.test.ts`
- `src/app/api/projects/[id]/brain/facts/[factId]/route.ts`
- `src/app/api/projects/[id]/brain/graph/nodes/[nodeId]/route.test.ts`
- `src/app/api/projects/[id]/brain/graph/nodes/[nodeId]/route.ts`
- `src/app/api/projects/[id]/brain/graph/route.test.ts`
- `src/app/api/projects/[id]/brain/graph/route.ts`
- `src/app/api/projects/[id]/brain/pages/[pageId]/route.ts`
- `src/app/api/projects/[id]/brain/pages/dedupe/route.ts`
- `src/app/api/projects/[id]/brain/pages/route.ts`
- `src/app/api/projects/[id]/brain/route.test.ts`
- `src/app/api/projects/[id]/brain/route.ts`
- `src/app/api/projects/[id]/brain/timeline/[eventId]/route.ts`
- `src/app/api/projects/[id]/brain/timeline/route.test.ts`
- `src/app/api/projects/[id]/brain/timeline/route.ts`
- `src/app/api/projects/[id]/brain/todos/[todoId]/route.test.ts`
- `src/app/api/projects/[id]/brain/todos/[todoId]/route.ts`
- `src/app/api/projects/[id]/brain/todos/consolidated/route.test.ts`
- `src/app/api/projects/[id]/brain/todos/consolidated/route.ts`
- `src/app/api/projects/[id]/brain/versions/[versionId]/route.test.ts`
- `src/app/api/projects/[id]/brain/versions/[versionId]/route.ts`
- `src/app/api/projects/[id]/documents/route.test.ts`
- `src/app/api/projects/[id]/documents/route.ts`
- `src/app/api/projects/[id]/members/route.test.ts`
- `src/app/api/projects/[id]/members/route.ts`
- `src/app/api/published-page/route.ts`
- `src/app/api/push/subscribe/route.test.ts`
- `src/app/api/push/subscribe/route.ts`
- `src/app/api/scheduler/diagnostics/route.test.ts`
- `src/app/api/scheduler/diagnostics/route.ts`
- `src/app/api/scheduler/jobs/[jobId]/route.test.ts`
- `src/app/api/scheduler/jobs/[jobId]/route.ts`
- `src/app/api/scheduler/jobs/[jobId]/runs/route.test.ts`
- `src/app/api/scheduler/jobs/[jobId]/runs/route.ts`
- `src/app/api/scheduler/jobs/route.ts`
- `src/app/api/skills/route.ts`
- `src/app/api/storage/audio/transcribe/route.test.ts`
- `src/app/api/storage/audio/transcribe/route.ts`
- `src/app/api/storage/download/route.test.ts`
- `src/app/api/storage/download/route.ts`
- `src/app/api/storage/upload-url/route.ts`
- `src/app/api/storage/upload/route.ts`
- `src/app/api/tabular-reviews/[id]/export/route.ts`
- `src/app/api/tabular-reviews/[id]/route.ts`
- `src/app/api/tabular-reviews/route.ts`
- `src/app/api/thread/[id]/fork/route.test.ts`
- `src/app/api/thread/[id]/fork/route.ts`
- `src/app/api/user/actions.ts`
- `src/app/api/user/providers/route.test.ts`
- `src/app/api/user/providers/route.ts`
- `src/app/api/user/validations.test.ts`
- `src/app/api/user/validations.ts`
- `src/app/api/voice/devices/[id]/route.ts`
- `src/app/api/voice/devices/[id]/sessions/route.test.ts`
- `src/app/api/voice/devices/[id]/sessions/route.ts`
- `src/app/api/voice/groq-konvo/session/route.ts`
- `src/app/api/voice/kimi-elevenlabs/session/route.ts`
- `src/app/api/voice/project-status/route.test.ts`
- `src/app/api/voice/project-status/route.ts`
- `src/app/api/voice/transcript/preview/route.test.ts`
- `src/app/api/voice/transcript/task-command/route.test.ts`
- `src/app/store/index.ts`
- `src/components/agent-alerts/background-chat-alert-settings.tsx`
- `src/components/agent-gallery.tsx`
- `src/components/agent/agents-list.tsx`
- `src/components/agent/edit-agent.tsx`
- `src/components/audio-attachment-transcription.tsx`
- `src/components/chat-bot-voice.tsx`
- `src/components/chat-bot.tsx`
- `src/components/chat-preferences-content.tsx`
- `src/components/chat/citation.tsx`
- `src/components/cockpit/cockpit-overview.tsx`
- `src/components/composio-app-connections.test.tsx`
- `src/components/composio-app-connections.tsx`
- `src/components/export/chat-export-popup.tsx`
- `src/components/export/chat-preview.tsx`
- `src/components/layouts/app-popup-provider.tsx`
- `src/components/layouts/app-sidebar-menus.tsx`
- `src/components/mcp-editor.tsx`
- `src/components/message-parts.tsx`
- `src/components/message.tsx`
- `src/components/notifications-center.tsx`
- `src/components/payments/dodo/dodo-upgrade-card.tsx`
- `src/components/project-brain-panel.tsx`
- `src/components/project-brain-timeline.test.tsx`
- `src/components/project-brain-timeline.tsx`
- `src/components/project-collaborators-panel.test.tsx`
- `src/components/project-collaborators-panel.tsx`
- `src/components/project-documents-panel.test.tsx`
- `src/components/project-documents-panel.tsx`
- `src/components/projects-dashboard.tsx`
- `src/components/prompt-input.tsx`
- `src/components/scheduled-jobs-dashboard.tsx`
- `src/components/select-model-auto-routing.test.tsx`
- `src/components/select-model.tsx`
- `src/components/tabular-review-detail.tsx`
- `src/components/tabular-reviews-dashboard.test.tsx`
- `src/components/tabular-reviews-dashboard.tsx`
- `src/components/tool-invocation/hitl-tool-cards.tsx`
- `src/components/tool-invocation/tabular-review-tool.tsx`
- `src/components/tool-invocation/workflow-invocation.tsx`
- `src/components/tool-invocation/workflow-video-media.test.ts`
- `src/components/tool-invocation/workflow-video-media.ts`
- `src/components/tool-mode-dropdown.test.tsx`
- `src/components/tool-mode-dropdown.tsx`
- `src/components/tool-select-dropdown.tsx`
- `src/components/user-model-providers-settings.tsx`
- `src/components/user/user-detail/user-settings-popup.tsx`
- `src/components/voice-devices-dashboard.test.tsx`
- `src/components/voice-devices-dashboard.tsx`
- `src/components/workflow/saved-workflows-page.test.tsx`
- `src/components/workflow/saved-workflows-page.tsx`
- `src/hooks/queries/use-chat-models.ts`
- `src/hooks/queries/use-generate-thread-title.ts`
- `src/hooks/queries/use-projects.ts`
- `src/hooks/use-chat-background-alerts.test.ts`
- `src/hooks/use-chat-background-alerts.ts`
- `src/hooks/use-thread-file-uploader.ts`
- `src/lib/admin/provider-discovery-request.ts`
- `src/lib/admin/provider-discovery.test.ts`
- `src/lib/agent-alerts/chat-background-alerts.test.ts`
- `src/lib/agent-alerts/chat-background-alerts.ts`
- `src/lib/ai/chat-stream-context.test.ts`
- `src/lib/ai/chat-stream-context.ts`
- `src/lib/ai/composio.ts`
- `src/lib/ai/image/edit-image.test.ts`
- `src/lib/ai/image/edit-image.ts`
- `src/lib/ai/image/generate-flare-image.test.ts`
- `src/lib/ai/image/generate-flare-image.ts`
- `src/lib/ai/ingest/audio-attachment.test.ts`
- `src/lib/ai/ingest/audio-attachment.ts`
- `src/lib/ai/ingest/pdf-ingest.ts`
- `src/lib/ai/mcp/create-mcp-clients-manager.test.ts`
- `src/lib/ai/mcp/create-mcp-clients-manager.ts`
- `src/lib/ai/mcp/execute-approved-mcp-tool.test.ts`
- `src/lib/ai/mcp/execute-approved-mcp-tool.ts`
- `src/lib/ai/mcp/pg-oauth-provider.ts`
- `src/lib/ai/models.test.ts`
- `src/lib/ai/models.ts`
- `src/lib/ai/prompts.test.ts`
- `src/lib/ai/prompts.ts`
- `src/lib/ai/skills/index.ts`
- `src/lib/ai/speech/elevenlabs/use-voice-chat-elevenlabs.ts`
- `src/lib/ai/speech/index.ts`
- `src/lib/ai/speech/konvo/use-voice-chat-konvo.ts`
- `src/lib/ai/speech/mcp-voice-approval.test.ts`
- `src/lib/ai/speech/mcp-voice-approval.ts`
- `src/lib/ai/speech/open-ai/openai-realtime-event.ts`
- `src/lib/ai/speech/open-ai/use-voice-chat.openai.ts`
- `src/lib/ai/speech/voice-tools.test.ts`
- `src/lib/ai/tools/browser/browser-agent.ts`
- `src/lib/ai/tools/browser/cloak-browser.ts`
- `src/lib/ai/tools/hitl/index.test.ts`
- `src/lib/ai/tools/hitl/index.ts`
- `src/lib/ai/tools/hitl/mcp-tool-approval.test.ts`
- `src/lib/ai/tools/hitl/mcp-tool-approval.ts`
- `src/lib/ai/tools/image/index.ts`
- `src/lib/ai/tools/index.ts`
- `src/lib/ai/tools/project-knowledge.test.ts`
- `src/lib/ai/tools/project-knowledge.ts`
- `src/lib/ai/tools/project-status.test.ts`
- `src/lib/ai/tools/project-status.ts`
- `src/lib/ai/tools/sandbox/sandbox-tool.ts`
- `src/lib/ai/tools/tabular-review.ts`
- `src/lib/ai/tools/tool-kit.ts`
- `src/lib/ai/tools/toolkit-catalog.ts`
- `src/lib/ai/tools/web/web-search.ts`
- `src/lib/ai/workflow/executor/node-executor.test.ts`
- `src/lib/ai/workflow/executor/node-executor.ts`
- `src/lib/ai/workflow/executor/workflow-executor.test.ts`
- `src/lib/ai/workflow/executor/workflow-executor.ts`
- `src/lib/ai/workflow/shared.workflow.ts`
- `src/lib/auth/auth-instance.ts`
- `src/lib/connectors/credentials.ts`
- `src/lib/connectors/providers-list.ts`
- `src/lib/connectors/refresh.ts`
- `src/lib/db/migrations/pg/meta/_journal.json`
- `src/lib/db/pg/repositories/agent-install-repository.pg.ts`
- `src/lib/db/pg/repositories/agent-repository.pg.ts`
- `src/lib/db/pg/repositories/chat-export-repository.pg.ts`
- `src/lib/db/pg/repositories/chat-repository.pg.ts`
- `src/lib/db/pg/repositories/mcp-oauth-repository.pg.ts`
- `src/lib/db/pg/repositories/mcp-tool-approval-repository.pg.test.ts`
- `src/lib/db/pg/repositories/mcp-tool-approval-repository.pg.ts`
- `src/lib/db/pg/repositories/notification-repository.pg.ts`
- `src/lib/db/pg/repositories/team-repository.pg.ts`
- `src/lib/db/pg/repositories/user-model-provider-repository.pg.test.ts`
- `src/lib/db/pg/repositories/user-model-provider-repository.pg.ts`
- `src/lib/db/pg/repositories/user-repository.pg.ts`
- `src/lib/db/pg/repositories/voice-device-repository.pg.ts`
- `src/lib/db/pg/schema.pg.ts`
- `src/lib/db/repository.ts`
- `src/lib/file-ingest/pdf-preview.test.ts`
- `src/lib/file-ingest/pdf-preview.ts`
- `src/lib/file-storage/local-file-storage.ts`
- `src/lib/file-storage/storage-utils.ts`
- `src/lib/notifications/contracts.ts`
- `src/lib/payments/dodo.ts`
- `src/lib/projects/access.ts`
- `src/lib/projects/brain-dream.ts`
- `src/lib/projects/brain-page-archive.ts`
- `src/lib/projects/brain-queue.ts`
- `src/lib/projects/brain-schema.ts`
- `src/lib/projects/brain-source-state.ts`
- `src/lib/projects/consolidate-brain-todos.test.ts`
- `src/lib/projects/consolidate-brain-todos.ts`
- `src/lib/projects/merge-brain-pages.ts`
- `src/lib/projects/project-brain-context.test.ts`
- `src/lib/projects/project-brain-context.ts`
- `src/lib/projects/project-brain-status.ts`
- `src/lib/projects/source-versions.test.ts`
- `src/lib/rag/format.test.ts`
- `src/lib/rag/format.ts`
- `src/lib/rag/parse.ts`
- `src/lib/rag/retrieve.test.ts`
- `src/lib/rag/retrieve.ts`
- `src/lib/scheduler/jobs.test.ts`
- `src/lib/scheduler/jobs.ts`
- `src/lib/scheduler/worker.ts`
- `src/lib/tabular/review-columns.test.ts`
- `src/lib/tabular/review-columns.ts`
- `src/lib/tabular/review-schema.test.ts`
- `src/lib/tabular/review-schema.ts`
- `src/lib/tabular/review-source.test.ts`
- `src/lib/tabular/review-source.ts`
- `src/lib/voice/handoff.test.ts`
- `src/lib/voice/handoff.ts`
- `src/lib/voice/project-status.test.ts`
- `src/lib/voice/project-status.ts`
- `src/middleware.ts`
- `src/types/admin-config.ts`
- `src/types/chat-export.ts`
- `src/types/chat.ts`
- `src/types/mcp.ts`
- `src/types/user.ts`
- `src/types/workflow.ts`
- `apps/desktop/src/main/bounded-json.test.ts`
- `apps/desktop/src/main/bounded-json.ts`
- `apps/desktop/src/main/updater-log.test.ts`
- `apps/desktop/src/main/updater-log.ts`
- `cognixai-app-spec.md`
- `cognixai-rebuild-spec.md`
- `docs/MIGRATION-STATUS-REPORT.md`
- `docs/features/agentset-project-search.md`
- `docs/voice-agent-delegation.md`
- `docs/voice-web-search.md`
- `src/app/(chat)/agents/presets/page.tsx`
- `src/app/(chat)/team-members/page.tsx`
- `src/app/api/admin/config/route.test.ts`
- `src/app/api/admin/providers/route.test.ts`
- `src/app/api/agent/[id]/clone/route.test.ts`
- `src/app/api/agent/[id]/clone/route.ts`
- `src/app/api/agent/[id]/publish/route.test.ts`
- `src/app/api/agent/[id]/publish/route.ts`
- `src/app/api/agent/from-preset/route.test.ts`
- `src/app/api/agent/from-preset/route.ts`
- `src/app/api/approvals/composio/route.test.ts`
- `src/app/api/approvals/composio/route.ts`
- `src/app/api/chat/actions.message-delete.test.ts`
- `src/app/api/chat/actions.project-brain.test.ts`
- `src/app/api/chat/export/route.test.ts`
- `src/app/api/cockpit/summary-cache.test.ts`
- `src/app/api/cockpit/vercel/deployments/route.test.ts`
- `src/app/api/connectors/[provider]/disconnect/route.test.ts`
- `src/app/api/connectors/[provider]/pause/route.test.ts`
- `src/app/api/connectors/[provider]/resume/route.test.ts`
- `src/app/api/export/[id]/share/route.test.ts`
- `src/app/api/export/[id]/share/route.ts`
- `src/app/api/images/edit/route.test.ts`
- `src/app/api/mcp/[id]/route.test.ts`
- `src/app/api/mcp/actions.voice.test.ts`
- `src/app/api/mcp/media/morphik-image/route.test.ts`
- `src/app/api/mcp/media/morphik-image/route.ts`
- `src/app/api/mcp/oauth/callback/route.test.ts`
- `src/app/api/mcp/route.test.ts`
- `src/app/api/notifications/route.test.ts`
- `src/app/api/onboarding/complete/route.test.ts`
- `src/app/api/onboarding/complete/route.ts`
- `src/app/api/payments/dodo/portal/route.test.ts`
- `src/app/api/payments/dodo/portal/route.ts`
- `src/app/api/projects/[id]/agents/route.test.ts`
- `src/app/api/projects/[id]/agents/route.ts`
- `src/app/api/projects/[id]/onboard/route.test.ts`
- `src/app/api/projects/[id]/onboard/route.ts`
- `src/app/api/projects/[id]/search/route.test.ts`
- `src/app/api/projects/[id]/search/route.ts`
- `src/app/api/projects/[id]/threads/route.test.ts`
- `src/app/api/projects/[id]/threads/route.ts`
- `src/app/api/projects/[id]/workflows/route.test.ts`
- `src/app/api/projects/[id]/workflows/route.ts`
- `src/app/api/skills/import/route.test.ts`
- `src/app/api/skills/import/route.ts`
- `src/app/api/skills/route.test.ts`
- `src/app/api/skills/search/route.test.ts`
- `src/app/api/skills/search/route.ts`
- `src/app/api/storage/html-preview/route.test.ts`
- `src/app/api/storage/html-preview/route.ts`
- `src/app/api/storage/upload/route.test.ts`
- `src/app/api/team-invitations/accept/route.test.ts`
- `src/app/api/team-invitations/accept/route.ts`
- `src/app/api/teams/[teamId]/invitations/[invitationId]/route.ts`
- `src/app/api/teams/[teamId]/invitations/route.test.ts`
- `src/app/api/teams/[teamId]/invitations/route.ts`
- `src/app/api/teams/[teamId]/members/route.test.ts`
- `src/app/api/teams/[teamId]/members/route.ts`
- `src/app/api/user/actions.password.test.ts`
- `src/app/api/user/active-team/route.test.ts`
- `src/app/api/user/active-team/route.ts`
- `src/app/api/user/onboarding/route.test.ts`
- `src/app/api/user/onboarding/route.ts`
- `src/app/api/user/settings-context/route.test.ts`
- `src/app/api/user/settings-context/route.ts`
- `src/app/api/voice/composio-tool/route.test.ts`
- `src/app/api/voice/composio-tool/route.ts`
- `src/app/api/voice/devices/[id]/rotate-credential/route.test.ts`
- `src/app/api/voice/devices/[id]/rotate-credential/route.ts`
- `src/app/api/voice/devices/[id]/route.test.ts`
- `src/app/api/voice/run-agent/route.test.ts`
- `src/app/api/voice/run-agent/route.ts`
- `src/app/api/voice/web-search/route.test.ts`
- `src/app/api/voice/web-search/route.ts`
- `src/app/api/workflow/executions/[executionId]/decision/route.test.ts`
- `src/app/api/workflow/executions/[executionId]/decision/route.ts`
- `src/app/api/workflow/executions/[executionId]/route.test.ts`
- `src/app/api/workflow/executions/[executionId]/route.ts`
- `src/app/api/workflow/executions/route.test.ts`
- `src/app/api/workflow/executions/route.ts`
- `src/app/onboarding/page.test.ts`
- `src/app/onboarding/page.tsx`
- `src/app/store/plan-mode-persistence.test.ts`
- `src/app/team-invitations/accept/page.tsx`
- `src/components/active-team-selector.test.tsx`
- `src/components/active-team-selector.tsx`
- `src/components/admin/model-display-metadata-settings.test.tsx`
- `src/components/admin/model-display-metadata-settings.tsx`
- `src/components/agent-presets.tsx`
- `src/components/agent/gallery-publish-control.tsx`
- `src/components/audio-attachment-transcription.test.tsx`
- `src/components/chat/citation.test.ts`
- `src/components/cockpit/cockpit-updates.test.tsx`
- `src/components/cockpit/cockpit-updates.tsx`
- `src/components/image-mask-editor.tsx`
- `src/components/message-error.test.tsx`
- `src/components/message-parts/user-message-text.test.tsx`
- `src/components/message-parts/user-message-text.tsx`
- `src/components/onboarding/automation-overview-step.tsx`
- `src/components/onboarding/onboarding-cookie-sync.tsx`
- `src/components/onboarding/onboarding-wizard.test.tsx`
- `src/components/onboarding/onboarding-wizard.tsx`
- `src/components/payments/dodo/dodo-upgrade-card.test.tsx`
- `src/components/project-assigned-agents.tsx`
- `src/components/project-assigned-workflows.test.tsx`
- `src/components/project-assigned-workflows.tsx`
- `src/components/project-brain-claim-evidence.test.tsx`
- `src/components/project-brain-claim-evidence.tsx`
- `src/components/project-brain-node-neighbors.test.tsx`
- `src/components/project-brain-node-neighbors.tsx`
- `src/components/project-setup-wizard.test.tsx`
- `src/components/project-setup-wizard.tsx`
- `src/components/project-thread-history.test.tsx`
- `src/components/project-thread-history.tsx`
- `src/components/scheduled-jobs-dashboard.test.tsx`
- `src/components/skills-search-dialog.tsx`
- `src/components/tabular-review-citation.test.tsx`
- `src/components/tabular-review-citation.tsx`
- `src/components/team-invitation-acceptance.test.tsx`
- `src/components/team-invitation-acceptance.tsx`
- `src/components/team-members-settings.test.tsx`
- `src/components/team-members-settings.tsx`
- `src/components/tool-invocation/hitl-tool-cards.composio.test.tsx`
- `src/components/tool-invocation/mcp-tool-result.test.tsx`
- `src/components/tool-invocation/mcp-tool-result.tsx`
- `src/components/tool-invocation/morphik-image-preview.tsx`
- `src/components/tool-invocation/plan-artifact-card.test.tsx`
- `src/components/tool-invocation/plan-artifact-card.tsx`
- `src/components/tool-invocation/project-document-edit-proposal.test.tsx`
- `src/components/tool-invocation/project-document-edit-proposal.tsx`
- `src/components/tool-invocation/request-input-card.test.tsx`
- `src/components/tool-invocation/request-input-card.tsx`
- `src/components/tool-invocation/workflow-video-player.tsx`
- `src/components/user-model-providers-settings.test.tsx`
- `src/components/user/user-detail/user-settings-content.test.tsx`
- `src/components/user/user-detail/user-settings-content.tsx`
- `src/components/workflow/workflow-execution-history.test.tsx`
- `src/components/workflow/workflow-execution-history.tsx`
- `src/lib/ai/agent/generation-apps.test.ts`
- `src/lib/ai/agent/generation-apps.ts`
- `src/lib/ai/agent/presets.test.ts`
- `src/lib/ai/agent/presets.ts`
- `src/lib/ai/composio-chat-tools.test.ts`
- `src/lib/ai/composio-chat-tools.ts`
- `src/lib/ai/composio-voice-tools.test.ts`
- `src/lib/ai/composio-voice-tools.ts`
- `src/lib/ai/composio-write-chat-tools.test.ts`
- `src/lib/ai/composio-write-chat-tools.ts`
- `src/lib/ai/composio.test.ts`
- `src/lib/ai/image/gateway-inpaint.test.ts`
- `src/lib/ai/image/gateway-inpaint.ts`
- `src/lib/ai/image/gateway-multi-reference.test.ts`
- `src/lib/ai/image/gateway-multi-reference.ts`
- `src/lib/ai/image/image-edit-request.ts`
- `src/lib/ai/image/image-mask-message.test.ts`
- `src/lib/ai/image/image-mask-message.ts`
- `src/lib/ai/image/provider-image.test.ts`
- `src/lib/ai/image/provider-image.ts`
- `src/lib/ai/ingest/audio-format.test.ts`
- `src/lib/ai/ingest/audio-format.ts`
- `src/lib/ai/ingest/audio-metadata.test.ts`
- `src/lib/ai/ingest/audio-metadata.ts`
- `src/lib/ai/ingest/chat-message-budget.test.ts`
- `src/lib/ai/ingest/chat-message-budget.ts`
- `src/lib/ai/ingest/pdf-ingest.test.ts`
- `src/lib/ai/ingest/pdf-rasterize.test.ts`
- `src/lib/ai/ingest/pdf-rasterize.ts`
- `src/lib/ai/ingest/uploaded-audio.test.ts`
- `src/lib/ai/ingest/uploaded-audio.ts`
- `src/lib/ai/mcp/mcp-approval-target.ts`
- `src/lib/ai/mcp/mcp-result-media.test.ts`
- `src/lib/ai/mcp/mcp-result-media.ts`
- `src/lib/ai/mcp/morphik-media-reference.test.ts`
- `src/lib/ai/mcp/morphik-media-reference.ts`
- `src/lib/ai/mcp/morphik-media.test.ts`
- `src/lib/ai/mcp/morphik-media.ts`
- `src/lib/ai/mcp/pg-oauth-provider.test.ts`
- `src/lib/ai/model-display-metadata.test.ts`
- `src/lib/ai/model-display-metadata.ts`
- `src/lib/ai/personal-auto-routing.test.ts`
- `src/lib/ai/personal-auto-routing.ts`
- `src/lib/ai/planning/create-plan-tool.test.ts`
- `src/lib/ai/planning/create-plan-tool.ts`
- `src/lib/ai/planning/plan-mode.test.ts`
- `src/lib/ai/planning/plan-mode.ts`
- `src/lib/ai/skills/index.test.ts`
- `src/lib/ai/speech/match-agent.test.ts`
- `src/lib/ai/speech/match-agent.ts`
- `src/lib/ai/speech/open-ai/openai-realtime-settings.test.ts`
- `src/lib/ai/speech/open-ai/openai-realtime-settings.ts`
- `src/lib/ai/speech/run-agent.test.ts`
- `src/lib/ai/speech/run-agent.ts`
- `src/lib/ai/speech/voice-agent-mcp-access.test.ts`
- `src/lib/ai/speech/voice-agent-mcp-access.ts`
- `src/lib/ai/speech/web-search.test.ts`
- `src/lib/ai/speech/web-search.ts`
- `src/lib/ai/tools/browser/browser-agent.test.ts`
- `src/lib/ai/tools/browser/cloak-browser.test.ts`
- `src/lib/ai/tools/browser/execution-gate.ts`
- `src/lib/ai/tools/hitl/composio-write-approval-route.ts`
- `src/lib/ai/tools/hitl/composio-write-approval.test.ts`
- `src/lib/ai/tools/hitl/composio-write-approval.ts`
- `src/lib/ai/tools/image/image-mode.test.ts`
- `src/lib/ai/tools/image/image-mode.ts`
- `src/lib/ai/tools/image/image-source.test.ts`
- `src/lib/ai/tools/image/image-source.ts`
- `src/lib/ai/tools/project-document.test.ts`
- `src/lib/ai/tools/project-document.ts`
- `src/lib/ai/tools/sandbox/sandbox-tool.test.ts`
- `src/lib/ai/tools/tabular-review.test.ts`
- `src/lib/ai/tools/tool-kit.test.ts`
- `src/lib/ai/user-model-provider-capabilities.test.ts`
- `src/lib/ai/user-model-provider-capabilities.ts`
- `src/lib/ai/workflow/execution-state.test.ts`
- `src/lib/ai/workflow/execution-state.ts`
- `src/lib/ai/workflow/run-saved-workflow.test.ts`
- `src/lib/ai/workflow/run-saved-workflow.ts`
- `src/lib/ai/workflow/shared.workflow.test.ts`
- `src/lib/chat/compact-tool-loop.test.ts`
- `src/lib/chat/compact-tool-loop.ts`
- `src/lib/chat/error-display.test.ts`
- `src/lib/chat/error-display.ts`
- `src/lib/chat/export-share-service.test.ts`
- `src/lib/chat/export-share-service.ts`
- `src/lib/chat/fork-limits.test.ts`
- `src/lib/chat/fork-limits.ts`
- `src/lib/chat/load-public-export.test.ts`
- `src/lib/chat/load-public-export.ts`
- `src/lib/chat/message-mentions.test.ts`
- `src/lib/chat/message-mentions.ts`
- `src/lib/chat/outbound-history-slimming.test.ts`
- `src/lib/chat/outbound-history-slimming.ts`
- `src/lib/chat/public-share.test.ts`
- `src/lib/chat/public-share.ts`
- `src/lib/chat/repair-bound-tool-name.test.ts`
- `src/lib/chat/repair-bound-tool-name.ts`
- `src/lib/chat/retry-settings.test.ts`
- `src/lib/chat/retry-settings.ts`
- `src/lib/chat/thread-title.test.ts`
- `src/lib/chat/thread-title.ts`
- `src/lib/cockpit/updates.test.ts`
- `src/lib/cockpit/updates.ts`
- `src/lib/db/migrations/pg/0074_workflow_executions.sql`
- `src/lib/db/migrations/pg/0075_project_brain_chat_sources.sql`
- `src/lib/db/migrations/pg/0076_agent_preset_library.sql`
- `src/lib/db/migrations/pg/0077_chat_export_share_tokens.sql`
- `src/lib/db/migrations/pg/0078_project_setup_agents.sql`
- `src/lib/db/migrations/pg/0079_project_workflows.sql`
- `src/lib/db/migrations/pg/0080_team_invitations.sql`
- `src/lib/db/migrations/pg/0081_session_active_team.sql`
- `src/lib/db/pg/repositories/agent-clone-repository.pg.test.ts`
- `src/lib/db/pg/repositories/agent-clone-repository.pg.ts`
- `src/lib/db/pg/repositories/agent-install-publication.pg.test.ts`
- `src/lib/db/pg/repositories/agent-preset-repository.pg.test.ts`
- `src/lib/db/pg/repositories/chat-fork-repository.pg.test.ts`
- `src/lib/db/pg/repositories/chat-message-delete.pg.test.ts`
- `src/lib/db/pg/repositories/chat-title-repository.pg.test.ts`
- `src/lib/db/pg/repositories/team-invitation-repository.pg.test.ts`
- `src/lib/db/pg/repositories/team-invitation-repository.pg.ts`
- `src/lib/db/pg/repositories/team-repository.pg.test.ts`
- `src/lib/db/pg/repositories/user-onboarding-preference.pg.test.ts`
- `src/lib/db/pg/repositories/voice-device-credential-rotation.pg.test.ts`
- `src/lib/db/pg/repositories/voice-device-session-pagination.pg.test.ts`
- `src/lib/db/pg/repositories/workflow-execution-repository.pg.test.ts`
- `src/lib/db/pg/repositories/workflow-execution-repository.pg.ts`
- `src/lib/documents/project-document-edit-proposal.test.ts`
- `src/lib/documents/project-document-edit-proposal.ts`
- `src/lib/email/team-invitation-email.test.ts`
- `src/lib/email/team-invitation-email.ts`
- `src/lib/file-ingest/sandbox-html-preview.test.ts`
- `src/lib/file-ingest/sandbox-html-preview.ts`
- `src/lib/file-storage/chat-attachment-ownership.test.ts`
- `src/lib/file-storage/chat-attachment-ownership.ts`
- `src/lib/http/with-private-no-store.test.ts`
- `src/lib/http/with-private-no-store.ts`
- `src/lib/notifications/browser-push.test.ts`
- `src/lib/notifications/browser-push.ts`
- `src/lib/onboarding/gate.test.ts`
- `src/lib/onboarding/gate.ts`
- `src/lib/payments/dodo.customer-portal.test.ts`
- `src/lib/problem-report/notification.test.ts`
- `src/lib/problem-report/notification.ts`
- `src/lib/projects/agent-access.ts`
- `src/lib/projects/brain-graph-search.test.ts`
- `src/lib/projects/brain-graph-search.ts`
- `src/lib/projects/brain-queue.chat-source.test.ts`
- `src/lib/projects/brain-run-state.test.ts`
- `src/lib/projects/brain-run-state.ts`
- `src/lib/projects/project-chat-brain-source.lifecycle.test.ts`
- `src/lib/projects/project-chat-brain-source.test.ts`
- `src/lib/projects/project-chat-brain-source.ts`
- `src/lib/projects/workflow-access.test.ts`
- `src/lib/projects/workflow-access.ts`
- `src/lib/rag/agentset-provider.test.ts`
- `src/lib/rag/agentset-provider.ts`
- `src/lib/rag/agentset-source-access.test.ts`
- `src/lib/rag/agentset-source-access.ts`
- `src/lib/rag/parse.test.ts`
- `src/lib/sandbox/artifact-export.test.ts`
- `src/lib/sandbox/artifact-export.ts`
- `src/lib/scheduler/chat-response.test.ts`
- `src/lib/scheduler/chat-response.ts`
- `src/lib/scheduler/create-request-key.test.ts`
- `src/lib/scheduler/create-request-key.ts`
- `src/lib/scheduler/run-diagnostics.test.ts`
- `src/lib/scheduler/run-diagnostics.ts`
- `src/lib/scheduler/schedule-diagnostics.test.ts`
- `src/lib/scheduler/schedule-diagnostics.ts`
- `src/lib/skills/registry.test.ts`
- `src/lib/skills/registry.ts`
- `src/lib/tabular/review-presets.ts`
- `src/lib/team-invitations.test.ts`
- `src/lib/team-invitations.ts`
- `src/lib/voice/device-session-cursor.ts`
- `src/lib/voice/public-web-url.ts`
- `src/types/chat.test.ts`
- `src/types/user.onboarding.test.ts`
