# Void Agent Migration Status Report

> **Repository roles corrected 2026-11-09:** Canonical upstream is [`keinsaasforever/better-chatbot`](https://github.com/keinsaasforever/better-chatbot) `main`; customized destination is [`ibrahimkhan008/Void Agent`](https://github.com/ibrahimkhan008/Void Agent). Earlier `Void Agent-V2` references below describe a historical local checkout or prior audit evidence, not the canonical upstream identity. For current ports, compare the live upstream branch with the destination and preserve Void Agent customizations. The current instruction is to keep changes local: no commit, push, or deployment.

Generated: 2026-11-08 22:29 +05:30

## 1. Executive summary

This is a status snapshot, not a migration-completion claim. The current scoped feature register contains **99 unique workflow candidates** (98 reference candidates plus one Void Agent-only capability): **0 COMPLETE, 89 PARTIAL, 1 MISSING, 5 EXCLUDED, 2 OPTIONAL, 1 DEPRECATED, and 1 PRIMARY CUSTOM**. C33 is counted once; its historical duplicate discovery note is retained. C36 (DOCX tracked-edit proposal), C37 (secure Morphik image preview), and C38 (Composio write actions with exact-payload approval) are registered. The broader census of 206 routes/pages/tool surfaces is not a complete semantic feature inventory, so no defensible overall parity percentage is available.

The DOCX and Morphik blockers identified in the previous report are fixed. B20 browser execution remains disabled and MISSING because no runtime-level egress boundary is available. C38 adds a review-first Composio write flow with persisted one-use exact-payload approvals; it remains PARTIAL pending live provider, PostgreSQL, and browser verification. The current full suite, typecheck, lint, metadata check, and corrected production build pass. The initial build caught and prompted a fix to an invalid extra App Router export. No push, commit, deployment, or database migration was performed.

## 2. Repository and working-tree state

| Item | Observed state |
|---|---|
| Primary | `C:\Users\Ikra\Desktop\Void Agent`, branch `main`; HEAD `23a0177397232874689d67100d2e6730b23e6c75` (`docs: add feature-level migration work register`). |
| Primary worktree | At report generation: 315 tracked paths modified, 285 untracked files, 0 staged paths (600 changed/untracked status entries). Extensive local migration work remains uncommitted. `context.md` is ignored by Git and is maintained append-only per repository instructions. |
| Reference | `C:\Users\Ikra\Desktop\Void Agent-V2`, branch `update/better-chatbot-2.0`, HEAD `8671f31`; Git reports 3,072 staged paths. This pre-existing dirty index means cleanliness cannot be proven from status alone. No reference changes were made intentionally during this batch. |
| GitHub/deployment | No commit, push, merge, or deployment was performed. |
| Audit artifacts | Existing `.audit/` artifacts were left in place; no logs were written under `.git`. |

## 3. What is done â€” verified itemized list

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

## 5. What was already present in original Void Agent

A complete count of preserved original capabilities is **not available**. The original baseline was not represented by a clean before-migration worktree in this audit, and the scope inventory is incomplete. The register identifies at least one explicit Void Agent-only workflow: **A09 bounded text-only conversation archive import/export**. Several current systems are intentionally retained as primary architectureâ€”AI SDK 5, PostgreSQL/node-postgres, Team/site_config, local pgvector/RAG, existing memory, scheduler, billing, connectors, workflows, and existing authenticationâ€”but this report does not claim every original customization has been exhaustively diffed and validated.

## 6. What remains â€” itemized backlog

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
The report cannot count â€œoriginal Void Agent security patches preservedâ€ because no complete original patch inventory was reconstructed. Specific fixes supported by current records include storage diagnostics and payment signature canonicalization; many other controls are present but their pre-migration provenance and preservation are not established here. No new security regression suite was run separately.

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
| Registered Void Agent-only custom workflows | 1 |
| Verified complete | 0 |
| Partial | 89 |
| Missing | 1 |
| Excluded | 5 |
| Optional | 2 |
| Deprecated | 1 |
| Newly registered current candidates | 3 (C36 DOCX, C37 Morphik, C38 Composio writes; all PARTIAL) |
| Original Void Agent capabilities fully inventoried and verified | Unknown / not audited |
| Original security patches proven preserved | Unknown / not fully audited |
| Newly integrated workflows verified end-to-end | 0 under the ledger's strict standard |

No percentage is reported. The 99-item register is scoped, while the 206 discovered reference surfaces have not all been mapped to individually verified workflows. Existing Void Agent features are not counted as newly integrated; test or code presence alone does not satisfy COMPLETE.

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

## Appendix A â€” Workflow evidence

The 98 baseline ledger rows are reproduced below from `docs/feature-work-register.md`. Status/evidence are the ledger's current claims, not independent E2E certification. Exact source paths and per-row known gaps appear in each row; use the linked inventory/matrix for reference-side surface mapping.

- **A01 â€” Start a conversation, send the first prompt, and persist the thread/messages** â€” **PARTIAL** (provisional P0, Medium/Large): `src/app/api/chat/route.ts`; no live PostgreSQL/provider journey.
- **A02 â€” Open an owned conversation and load its recent message window** â€” **PARTIAL** (provisional P0, Medium/Large): `src/app/api/chat/actions.ts`; full browser/database journey unverified.
- **A03 â€” Load older messages while retaining scroll position** â€” **PARTIAL** (provisional P0, Medium/Large): `chat-repository.pagination.test.ts`, chat actions/UI; mock coverage only, no Postgres run.
- **A04 â€” Rename or delete a conversation** â€” **PARTIAL** (provisional P0, Medium/Large): Chat actions and thread menu exist; persistence and authorization journey lacks end-to-end verification.
- **A05 â€” Delete one message or later turns from a selected message** â€” **PARTIAL** (provisional P0, Medium/Large): Single-message deletion and selected-message truncation now bind the final SQL DELETE to the authenticated owner's thread, closing the read/write ownership race. Truncation uses PostgreSQL-side timestamp precision and (createdAt,id) ordering, deletes the selected message and following turn history in the same thread, and reports whether rows were removed so project-brain refresh only follows an actual delete. Focused action/repository SQL tests pass (13/13), covering owner rejection, owner predicate, stable cursor, no-op refresh behavior, and existing project-source refresh. Live PostgreSQL/browser edit-regeneration journey remains unverified.
- **A06 â€” Retry or regenerate an assistant response** â€” **PARTIAL** (provisional P0, Medium/Large): Mounted the existing recovery hook in chat: it probes the owner-scoped resume endpoint with HEAD, resumes only a live buffer, reconciles persisted output before generating again, and exposes Retry for transport errors and persisted failed/timed-out/cancelled/incomplete turns. Regeneration carries the previous assistant turn's recorded provider/model and tool mode instead of silently switching to newly selected composer settings; the existing chat route continues to enforce current model access and team budget. Focused tests pass 16/16 (recovery, retry UI, settings retention); Postgres/provider-backed browser journey remains unverified. Evidence: `src/components/chat-bot.tsx`, `src/components/message.tsx`, `src/hooks/use-run-recovery.ts`, `src/lib/chat/retry-settings.ts` and tests.| PARTIAL
- **A07 â€” Share or export a conversation** â€” **PARTIAL** (provisional P0, Medium/Large): Preserved existing snapshots and legacy UUID links while adding owner-only share creation, rotation, and revocation. New 256-bit base64url bearer links return once; only SHA-256 is stored. Rotation/revocation disables the old UUID path, and old links remain compatible until changed. Public rendering is dynamic/noindex/no-store, text-only, removes file/source/tool parts, metadata, IDs, and private signed/storage URLs; new hashed links are read-only (legacy comments remain). API creation is bounded, same-origin, authenticated, rate-limited, and no-store; owner checks are atomic in repository updates. Focused tests pass 21/21. Migration `0077_chat_export_share_tokens.sql` is additive and unapplied. PostgreSQL/browser deployment verification remains. Evidence: `src/lib/chat/public-share.ts`, `src/lib/chat/export-share-service.ts`, `src/lib/chat/load-public-export.ts`, share routes/page, repository, and tests.| PARTIAL
- **A08 â€” Fork a conversation from a selected message** â€” **PARTIAL** (provisional P0, Medium/Large): Primary already had this Void Agent-specific workflow; Better Chatbot `main` at `6f41835` has no equivalent. Hardened it with current project/team editor checks, preservation of project/org/collection/model context, an atomic thread+message transaction, and SQL-side bounds of 200 messages / 5 MiB prefix content. Focused route/repository/limit tests pass 20/20. UI action exists in `src/components/message-parts.tsx`; live PostgreSQL/browser journey remains unverified.
- **A09 â€” Import/export a bounded text-only conversation archive** â€” **PRIMARY CUSTOM** (provisional P0, Medium/Large): `/api/chat/archive` and route tests; preserve as a Void Agent addition, not counted as upstream parity.
- **A10 â€” Stream an assistant response and persist its final turn** â€” **PARTIAL** (provisional P0, Medium/Large): Chat route and persistence code exist; live provider/DB journey unverified.
- **A11 â€” Stop an in-progress response** â€” **PARTIAL** (provisional P0, Medium/Large): Stop API/tests exist; browser/Redis and multi-instance journey unverified.
- **A12 â€” Reconnect and resume a detached response** â€” **PARTIAL** (provisional P0, Medium/Large): Stream API/tests exist; Redis/multi-instance journey unverified.
- **A13 â€” Browse/select enabled models in the chat picker** â€” **PARTIAL** (provisional P1, Medium/Large): Added separate admin-curated developer/country/badge/USD catalog metadata, an authenticated model-list projection, picker badges and Hidden gem/Fast/Thinking metadata filters. USD display prices remain separate from EUR budget enforcement; no values are guessed or preseeded. Tests cover schema validation, admin save/merge, no provider-secret leakage, picker filtering and display. Full provider-backed chat and live admin/browser journey remain unverified. Evidence: `src/lib/ai/model-display-metadata.ts`, `src/app/api/admin/config/route.ts`, `src/app/api/chat/models/route.ts`, `src/components/admin/model-display-metadata-settings.tsx`, `src/components/select-model.tsx`.
- **A14 â€” Resolve a selected model and handle provider fallback** â€” **PARTIAL** (provisional P1, Medium/Large): `src/lib/ai/models.ts`; provider tests use mocks.
- **A15 â€” Discover, test, update, and remove dynamic providers** â€” **PARTIAL** (provisional P1, Medium/Large): Admin model settings now expose a stable-ID edit workflow for name/base URL/model refresh and optional API-key rotation. Discovery reuses a saved encrypted key server-side only when the endpoint matches; endpoint changes require a newly entered key. Existing dynamic-provider hydration and admin-curated default/fallback IDs are retained. Provider status recognizes a legacy credential stored only in `tools.apiKeysSecrets[dyn_${id}]`, returns only a boolean, and never decrypts it. Focused discovery/provider tests: 32/32 across 5 files; scoped Biome passes. Live provider/database/admin-browser journey remains unverified. Evidence: `src/app/(chat)/(admin)/admin/settings/models/page.tsx`, `/api/admin/providers/discover`, `/api/admin/providers`, `src/lib/admin/provider-discovery-request.ts`, `src/lib/ai/models.ts`.
- **A16 â€” Add and use a user-owned OpenAI-compatible HTTPS provider** â€” **PARTIAL** (provisional P1, Medium/Large): User-provider API/settings and pinned transport tests; external endpoint not verified.
- **A17 â€” Use local/LAN Ollama or LM Studio from hosted chat** â€” **EXCLUDED** (provisional P1, Medium/Large): V2 local-model UI has no safe client proxy equivalent; hosted server must not reach the user LAN/loopback.
- **A18 â€” Automatically select a team model using routing constraints** â€” **PARTIAL** (provisional P1, Medium/Large): Team Auto routing and context-capacity tests exist; no provider-backed journey.
- **A19 â€” Enforce a team member monthly AI budget** â€” **PARTIAL** (provisional P1, Medium/Large): Atomic reserve/settle implementation and tests exist; default-off rollout and live migration/concurrency remain unverified.
- **A20 â€” View context-window usage in the composer** â€” **PARTIAL** (provisional P1, Medium/Large): Catalog/meter and helper/UI tests exist; browser/provider journey unverified.
- **A21 â€” Upload a chat attachment and make it available to the model** â€” **PARTIAL** (provisional P1, Medium/Large): Primary retains its 15 MiB per-file cap and owner-scoped storage keys. The upload route now rejects declared multipart bodies over 16 MiB before parsing, validates file objects/size, blocks active SVG/HTML/script MIME types, and passes the authenticated owner to storage; the client error now matches 15 MiB. Six upload-route tests cover auth, body/file size, active MIME, owner id, and storage configuration. The extracted ownership boundary is used by chat and has tests proving foreign managed attachments/message parts are blocked before privileged ingestion while owner files, inline images and source links remain usable. Authenticated storage-to-model journey remains unverified.
- **A22 â€” Ingest and preview documents, PDFs, and spreadsheets** â€” **PARTIAL** (provisional P1, Medium/Large): Primary already extracts bounded text/OOXML with owner-scoped keys, 15 MiB office processing cap, and ZIP entry/inflation/DOCTYPE defenses. Adapted upstream PDF visual-context behavior from Better Chatbot 2.0 commit `61e47d8`: owner-scoped PDFs are downloaded with a streamed 15 MiB limit, checked for a PDF signature, text-extracted with 50-page/8,000-character limits, and (only for models supporting native image input) rendered as PNG page parts with a five-page cap, 2 MP/page, 2 MiB/page, 6 MiB/message caps. PDF.js image decode limits, no auto-fetch/XFA/eval, and cleanup are enforced; no archive extraction is attempted for PDFs. Focused PDF/Office tests: 17/17; full 6 GB typecheck and frozen-lockfile validation pass. Live storage/model/browser path and scanned-PDF answer quality remain unverified; legacy binary Office files and full spreadsheet previews remain outside this batch.
- **A23 â€” Transcribe uploaded/stored audio into a chat conversation** â€” **PARTIAL** (provisional P1, Medium/Large): Reference audit found no uploaded-chat-audio transcription or long/batch transcription workflow in Better Chatbot V2. Its `apps/web/src/components/media/media-preview.tsx` renders tool-provided audio with native controls (`preload="metadata"`); live voice input is a separate OpenAI Realtime path (`apps/web/src/lib/ai/speech/open-ai/realtime-session-config.ts`) using `gpt-4o-transcribe`, not a stored-upload transcription API. Void Agent exceeds that reference behavior: it validates owner-scoped storage, MIME/container signatures, and the 15 MiB per-file cap, then sends only clips with verified duration Ã¢â€°Â¤30 seconds through synchronous Sarvam REST; unknown/long clips remain playable but are not transcribed. Transcripts enter model context only as bounded untrusted text. AAC/AIFF/FLAC/AMR/WMA are excluded; no compatible upstream batch-upload behavior was found to port. Live provider/browser verification remains. Evidence: primary `src/lib/ai/ingest/audio-attachment.ts`, `audio-metadata.ts`, `uploaded-audio.ts`, `src/app/api/storage/audio/transcribe/route.ts`; reference media preview and realtime session config above. This combines duplicate chat and voice audit items.
- **A24 â€” Render supported video results from workflow execution** â€” **PARTIAL** (provisional P1, Medium/Large): Void Agent recognizes bounded legacy/n8n/direct HTTPS video URLs and now uses lazy `hls.js` for HLS on Chromium, with native HLS fallback and native direct-file playback. Playback rejects non-HTTPS, credentialed, IP-literal/local/private-suffix, and nonstandard-port sources; hls.js child requests must stay on the validated manifest origin, carry no credentials, and use capped buffers/retries. Focused playback-selection/source tests pass 7/7; scoped Biome and diff-check pass. The full 6 GB typecheck now passes after the image tool's concurrent type issue was corrected. The V2 legacy `/analyze/{videoId}` resolver has no corresponding route in the inspected checkout and is not copied. Live external CDN CORS/HLS and browser verification remain unverified. Evidence: `src/components/tool-invocation/workflow-video-media.ts`, `workflow-video-player.tsx`, `workflow-invocation.tsx`.
- **A25 â€” Generate, edit, composite, and reuse images in chat** â€” **PARTIAL** (provisional P1, Medium/Large): Preserves Void Agent generation/single-image edits, prompt optimization, quotas, direct generation and owner-scoped storage. Previous generated image reuse and bounded owner-source checks remain. Added an optional AI Gateway path (disabled unless `AI_GATEWAY_API_KEY` is configured) for explicit multi-reference composition and masked inpainting. Composition uses `bfl/flux-2-pro`; masked fill uses `bfl/flux-pro-1.0-fill`. The brush editor exports a bounded PNG mask, uploads it as an owner-managed file, and records an explicit source-file/mask-file association in the persisted user message. The route rechecks both managed owner keys, applies an owner-keyed 20/hour limit before image downloads while preserving free-tier quotas, enforces 15 MiB combined source/mask bytes, raster signatures, dimension/pixel bounds, normalizes both to identical dimensions and an opaque black/white mask (white regenerates), and passes abort signals. Provider output URL/poll handling rejects redirects/untrusted origins and bounds time, bytes, MIME and signatures. AI 7/Gateway 4 are exact upstream-version aliases so primary's app AI 5 remains unchanged. Focused image/API tests pass 47/47, scoped Biome passes, and 6 GiB typecheck passes. Live Gateway credentials/provider/browser verification is unavailable; Void Agent and masked feature user journey remain unverified. Evidence: `src/components/image-mask-editor.tsx`, `src/components/prompt-input.tsx`, `src/lib/ai/image/gateway-inpaint.ts`, `gateway-multi-reference.ts`, `provider-image.ts`, `src/app/api/images/edit/route.ts` and tests.
- **A26 â€” Export generated sandbox files into private chat attachments with previews/downloads** â€” **PARTIAL** (provisional P1, Medium/Large): The existing persistent E2B sandbox exports only bounded (15 MiB) workspace files from a strict extension allowlist; absolute/traversal paths, symlinks, non-files, oversized/racing reads, SVG, scripts, and unknown types fail closed. HTML is exposed only through the authenticated owner-key preview route: parse5 allowlist removes scripts, links, forms, frames, event handlers, and non-data/active image sources; the response is private/no-store with CSP `sandbox`, `default-src 'none'`, `script-src 'none'`, no external network/forms/frames/navigation, and the parent iframe has an empty sandbox attribute. Export bytes are stored through `serverFileStorage` with caller ownership, then use existing private downloads and bounded document/sheet previews. Chat results render owner-scoped image, HTML, document, spreadsheet, audio and WebM video previews. Focused resolver/export/HTML sanitizer/route tests pass 26/26; scoped Biome and diff checks pass. E2B and configured object-storage/browser journey remain unverified. Evidence: `src/lib/sandbox/artifact-export.ts`, `src/lib/ai/tools/sandbox/sandbox-tool.ts`, `src/lib/file-ingest/sandbox-html-preview.ts`, `/api/storage/html-preview`, `src/components/message-parts.tsx`, existing `/api/storage/download`, `/api/storage/document`, `/api/storage/sheet` routes.
- **A27 â€” Automatically select a model for a personal chat** â€” **PARTIAL** (provisional P1, Medium/Large): Better Chatbot V2 resolves Auto for unscoped personal chats through `apps/web/src/lib/ai/routing/service.ts`. Void Agent now offers Personal Auto through administrator-entered task scores/priority in existing model metadata. Server candidates must be enabled and keyed deployment providers, exclude user-owned endpoints, satisfy tool/vision requirements, and have a known built-in or explicitly admin-verified context size; a prior resolved thread model is reused when still eligible. Team Auto remains a separate path. Focused routing/catalog/admin-selector tests pass 32/32 across 6 files; 6 GiB `pnpm check-types` passes. Live provider/browser journey remains unverified. Evidence: `src/lib/ai/personal-auto-routing.ts`, `src/app/api/chat/route.ts`, `src/components/select-model.tsx`, and model catalog settings/tests.
- **A28 â€” Slim old chat history only in the provider request** â€” **PARTIAL** (provisional P1, Medium/Large): Added deterministic model-request-only slimming for older ingestion previews, settled tool outputs, and duplicate document file parts while preserving the persisted transcript and two latest user turns. Focused helper tests pass; chat-route integration is wired. Live provider/browser token and answer-quality validation remains. Evidence: `src/lib/chat/outbound-history-slimming.ts`, `src/app/api/chat/route.ts`.
- **A29 â€” Compact long multi-step tool loops safely** â€” **PARTIAL** (provisional P1, Medium/Large): Added AI SDK 5 `prepareStep` integration that compacts only messages created in the current model tool loop, keeps the submitted conversation prefix intact, and preserves tool call/result pairs. Focused tests validate orphan prevention, recent-tail retention, and prefix preservation. Live provider loop is unverified. Evidence: `src/lib/chat/compact-tool-loop.ts`, `src/app/api/chat/route.ts`.
- **A30 â€” Repair provider tool-name aliases against bound tools** â€” **PARTIAL** (provisional P1, Medium/Large): Added bounded namespace/case/index normalization that can resolve only to one exact tool already bound for this request; ambiguous and unbound names are rejected. Wired into AI SDK 5 repair callback; focused helper tests pass. Live custom-provider behavior remains unverified. Evidence: `src/lib/chat/repair-bound-tool-name.ts`, `src/app/api/chat/route.ts`.
- **A31 â€” Enforce one aggregate context budget across mixed attachments** â€” **PARTIAL** (provisional P1, Medium/Large): Chat ingestion now processes attachments in request order with a shared 40,000-character cap, ten-attachment cap, eight generated file-preview cap, deterministic omission notice, and keeps generated previews out of persisted user parts. Existing per-format validation remains. Focused ingestion suites pass; live storage/provider/browser verification remains. Evidence: `src/lib/ai/ingest/chat-message-budget.ts`, `src/app/api/chat/route.ts`.
- **A32 â€” Browse the reusable skills catalog and import a reviewed skill** â€” **PARTIAL** (provisional P1, Medium/Large): Added authenticated skills.sh search and registry import preview to Void Agent personal skills. Search accepts bounded query metadata; imports validate owner/repo and slug, use fixed HTTPS skills.sh/GitHub hosts with redirects disabled, apply streamed response caps/timeouts, require an approved repository SPDX license plus retained license-notice text, strip frontmatter into bounded instructions, and return a non-persistent draft. The UI presents the source, SPDX license and license notice, requires review and rights confirmation before saving, and persists repository attribution. Skill mutations are same-origin and request bodies are streamed under a 512 KB cap. Imported prompts are escaped and labeled untrusted; they cannot change tool access or approval requirements. Focused tests pass 17/17; live skills.sh/GitHub and browser workflow remain unverified. Evidence: src/lib/skills/registry.ts; /api/skills/search; /api/skills/import; src/components/skills-search-dialog.tsx; src/lib/ai/skills/index.ts.| PARTIAL
- **A33 â€” Generate and persist a safe, stable title for a new conversation** â€” **PARTIAL** (provisional P1, Medium/Large): Adapted V2 title behavior while preserving Void Agent's authentication, same-origin check, per-user rate limit, free-tier gate, team-budget lease, selected provider, and failure fallback. Model output and client title projection are normalized to one line and capped at 80 characters; unusable output falls back to bounded first-user text. Persistence is an atomic owner-scoped insert-or-fill-empty operation, so replay/racing generations cannot overwrite a nonempty title or another user's thread. Focused route/helper/repository tests pass 17/17, including same-origin enforcement. Live model/PostgreSQL/browser title refresh remains unverified. Evidence: `src/app/api/chat/title/route.ts`, `src/hooks/queries/use-generate-thread-title.ts`, `src/lib/chat/thread-title.ts`, `src/types/chat.ts`, `src/lib/db/pg/repositories/chat-repository.pg.ts`, and focused tests.
- **B01 â€” Create, list, edit, and delete projects** â€” **PARTIAL** (provisional P1, Medium/Large): `/api/projects/**`, projects dashboard; no full DB/browser journey.
- **B02 â€” Manage project members and access** â€” **PARTIAL** (provisional P1, Medium/Large): Compared upstream project People tab/API with primary. Upstream adds existing organization members (it does not send project-specific email invitations); primary already adds current team members and additionally supports viewer/editor roles plus selected-vs-team access. Added access-roster visibility for the implicit project creator and team owner as locked Owner entries, while preserving the current project-access gate and preventing those principals from being re-roled/removed. Focused API/UI tests pass 18/18. Team email invitations are team-level through the canonical `team` model (C28); neither project implementation has a separate project-specific invitation workflow. Live DB/auth/browser authorization remains unverified. Evidence: `src/app/api/projects/[id]/members/route.ts`, `src/components/project-collaborators-panel.tsx`, and focused tests.
- **B03 â€” Create project threads and restrict their knowledge scope** â€” **PARTIAL** (provisional P1, Medium/Large): Primary chat creation checks current project access and restricts requested collection IDs to collections attached to that project; saved-thread collection changes use an owner-scoped dedicated action with current project/collection checks. Generic `updateThreadAction` cannot change project/scope fields. Added project thread history API/UI adapted from upstream, capped at 50 and scoped to the authenticated thread owner so project membership cannot expose another user's private conversations. Assigning an existing chat through the project selector now snapshots and queues its existing text into the target project's brain after the ownership/access-checked update; changing/detaching revokes the previous project source. Focused lifecycle/history tests pass 13/13. Live PostgreSQL/browser verification remains. Evidence: `src/app/api/chat/actions.ts`, `src/app/api/projects/[id]/threads/route.ts`, `src/components/project-thread-history.tsx`, and focused tests.
- **B04 â€” Add project documents and ingest them** â€” **PARTIAL** (provisional P1, Medium/Large): Project document/source APIs and RAG ingest; live storage/source journey unverified.
- **B05 â€” Browse, download, unlink, and edit project documents** â€” **PARTIAL** (provisional P1, Medium/Large): Primary provides owner/project-scoped private byte downloads with safe attachment headers and rate limits; editor-only unlink removes only the project mapping after access/source-owner rechecks, retaining the underlying collection document; tracked DOCX edits are source-revision-bound proposals that preserve the original until accepted. Ported the upstream document-action confirmation with explicit safe unlink wording; UI tests verify cancel sends no write and confirm unlinks then refreshes. Upstream destructive document deletion was not copied. Independent project storage spaces and live PostgreSQL/browser verification remain. Evidence: project document API routes, tracked edit repository/routes, `src/components/project-documents-panel.tsx` and tests.
- **B06 â€” Run project-brain extraction in the background and inspect status** â€” **PARTIAL** (provisional P1, Medium/Large): Source UI now shows attempts, sanitized failure cause, stale worker state, and editor-only retry for failed/stale-running jobs using the API's five-minute recovery lease. Existing owner/source checks and budgeted worker remain; stale queued runs report that the scheduler is waiting. PostgreSQL-backed job journey remains unverified.
- **B07 â€” Search project sources and use evidence in chat** â€” **PARTIAL** (provisional P1, Medium/Large): Chat fuses already-scoped vector-RAG source ranks with lexical accepted fact/event matches and adds at most two one-hop accepted graph facts after rechecking project, collection owner, ready state, and active source revision. Semantic hints are capped at five after collection-scope filtering; candidate result sets are capped at 12. Local chunk retrieval now requires the source item be `ready`, preventing residual chunks from failed/partial ingestion from being cited; numbered prompt excerpts and labels are XML-escaped inside source boundaries with explicit untrusted-instruction handling. Upstream per-document analysis is available in project chat as read-only `readProjectDocument`; inventory selects metadata only and each content read rechecks current project membership, attached collection, allowed source owner, and ready status before returning at most 30,000 characters as escaped untrusted evidence. Project-chat RAG citation cards now expose a download link only after a bounded server lookup confirms the hit is still a linked project document backed by a ready document row and current owner/collection scope; the existing download route repeats those checks and serves private/no-store bytes. Project citations never fall back to raw storage/source URLs; non-project URLs are linkable only for credential-free HTTP(S). Accepted project facts are now filtered and ranked in SQL by bounded query terms before the 300-row cap, so older matching facts are not lost behind the previous newest-500 window. Search remains inside project, attached collection, permitted owner, ready-source, accepted-review, and active-revision predicates; parameters are escaped/bound and existing alias expansion remains. Focused SQL-scope regression tests pass 4/4. Fact-level vector/FTS indexing, richer inline citation/source navigation, realistic Postgres EXPLAIN/latency, and live provider/browser verification remain; citation/document-tool tests separately pass 10/10. Evidence: `src/lib/rag/retrieve.ts`, `src/lib/rag/format.ts`, `src/app/api/chat/route.ts`, `src/components/chat/citation.tsx`, `src/lib/ai/tools/project-document.ts`, `src/lib/projects/project-brain-context.ts`, and focused tests.
- **B08 â€” Browse project knowledge graph and source details** â€” **PARTIAL** (provisional P1, Medium/Large): Adapted upstream linked-entity navigation: related graph neighbors are now buttons that open the selected node's existing authenticated source detail. API tests assert project, current collection/owner allowlists, ready status and active source-revision predicate. Focused graph/detail/UI suites 14/14; live DB/browser journey remains unverified.
- **B09 â€” Review facts, source versions, contradictions, and timeline events** â€” **PARTIAL** (provisional P1, Medium/Large): Timeline exposes the exact source revision behind current events with active-run, project, collection-owner, ready, fingerprint, and length checks. Current contradiction pairs now show each authorized claim's source label, observation timestamp, and evidence, adapted from upstream's provenance-first review card; the graph query still filters attached collections, current active revisions, ready status, and source owners before returning claims. Focused timeline/version tests 8/8 and graph/provenance/UI tests 12/12; live DB/browser review journey remains.
- **B10 â€” Review generated todos, insights, and project status** â€” **PARTIAL** (provisional P1, Medium/Large): Status/todo tools and routes exist; scheduled refresh and end-to-end status workflow unverified.
- **B11 â€” Connect and sync project MCP/Composio tools** â€” **PARTIAL** (provisional P1, Medium/Large): Connector routes/sync tests exist; provider authorization/run unverified.
- **B12 â€” Associate agents/workflows with projects** â€” **PARTIAL** (provisional P1, Medium/Large): Some project association paths exist; complete authoring/execution parity unverified.
- **B13 â€” Automatically add project-brain evidence to project chat context** â€” **PARTIAL** (provisional P1, Medium/Large): Bounded current-source evidence injection and tests exist; live Postgres/browser verification remains.
- **B14 â€” Use project-scoped status and knowledge tools in voice** â€” **PARTIAL** (provisional P1, Medium/Large): Ported upstream voice status lookup by project ID or unique exact accessible project name. Resolution uses the authenticated user's project list and rechecks current project ACL; status is limited to current attached collections/source owners and current fingerprints. Status remains read-only and is explicitly described as untrusted evidence. Knowledge search stays bound to an owned project thread. Focused status/voice tests pass 19/19; scoped Biome and typecheck pass. Live provider/Postgres/browser journey remains unverified; Kimi lacks a project-tool executor. Evidence: `src/lib/voice/project-status.ts`, `src/app/api/voice/project-status/route.ts`, `src/lib/ai/speech/index.ts`, OpenAI Realtime/KonvO handlers.
- **B15 â€” Save completed realtime voice turns to a conversation** â€” **PARTIAL** (provisional P1, Medium/Large): Session-to-thread persistence and tests exist; provider/browser journey unverified.
- **B16 â€” Review voice transcripts and create a handoff** â€” **PARTIAL** (provisional P1, Medium/Large): Voice inbox/review and user-triggered draft handoff exist; live workflow and wider provider paths unverified.
- **B17 â€” Pair and manage voice devices** â€” **PARTIAL** (provisional P1, Medium/Large): Existing owner-scoped listing/revocation retained; added credential rotation for active owned devices. New bearer is returned once with no-store headers while only its peppered hash is persisted; UI confirms immediate invalidation and exposes copy/hide controls. Route/repository/UI tests 8/8; hardware/PostgreSQL journey unverified.
- **B18 â€” Use device session/segment history and live transport** â€” **PARTIAL** (provisional P1, Medium/Large): Added owner-scoped keyset pagination for persisted session history and a Load older sessions UI; ordered segments remain inspectable on demand with bounded text. Focused route/repository/UI tests 15/15; no live DB/device run. Reference checkout lacks paired-device session routes and the required WebSocket bridge, so hardware/live transport remains unavailable.
- **B19 â€” Execute device voice commands as actions** â€” **EXCLUDED** (provisional P1, Medium/Large): V2 direct dispatch is unsafe; Void Agent keeps transcripts review-first. Safe equivalent requires explicit action approval.
- **B20 â€” Run browser automation from voice** â€” **MISSING** (provisional P0, Large): Upstream wraps its isolated Kernel browser with credential-vault resolution, organization policy/credit checks, abortable streamed status, teardown, and read-only live view. Primary has only Steel/Crawl/Cloak tools; the Steel loop can follow redirects, navigate arbitrary URLs, perform form actions, retain thread sessions, and expose an interactive viewer without equivalent network egress isolation or prompt-injection boundaries. Exposing it to voice is unsafe until those controls and end-to-end cancellation/cleanup verification exist. Safe public search is tracked separately as B23 and is not browser parity. Evidence: `docs/voice-web-search.md`, `src/lib/ai/tools/browser/browser-agent.ts`, upstream `apps/web/src/lib/voice/browser-run.ts`.
- **B21 â€” Operate the physical-device audio gateway/firmware flow** â€” **EXCLUDED** (provisional P1, Medium/Large): Inspected V2 checkout lacks the bridge script and its WebSocket endpoint returns 426; reference workflow is non-executable here.
- **B22 â€” Delegate a voice request to another available agent** â€” **PARTIAL** (provisional P1, Medium/Large): Added same-origin authenticated `/api/voice/run-agent`, owner-accessible agent/model resolution, 30s/1,000-token/6,000-character bounds, rate limiting, and team-budget reserve/settlement. The selected agent's currently authorized MCP mentions are provided as schema-only tools with no `execute`; at most three exact, bounded proposals are returned. The voice client shows a separate confirmation for every proposed action, obtains the existing persisted 10-minute one-use approval token, then dispatches through `callApprovedVoiceMcpToolAction`. Approval issuance binds agent ID, server/tool, exact arguments, and current config fingerprint; issuance and dispatch both recheck current agent access and tool mention, while the existing MCP approval executor rechecks MCP access/config and consumes the token before dispatch. Only non-error MCP results are reported as approved; fulfilled `{isError:true}` results are reported as failed. When any tool proposal is returned, model-authored answer text is replaced by a neutral review status so it cannot claim unapproved work completed. Secret-like argument fields are redacted in the first review and require a second confirmation displaying exact values. Composio actions are not exposed. No new migration was needed: approval tokens use the existing verification table. Focused suites pass; live voice/provider/PostgreSQL/browser flow remains unverified, so B22 stays PARTIAL. Evidence: `src/app/api/voice/run-agent/route.ts`, `src/lib/ai/speech/run-agent.ts`, `src/lib/ai/speech/mcp-voice-approval.ts`, `src/lib/ai/speech/voice-agent-mcp-access.ts`, `src/app/api/approvals/mcp-tool/route.ts`, and `src/app/api/mcp/actions.ts`.
- **B23 â€” Search public web sources by voice** â€” **PARTIAL** (provisional P1, Medium/Large): `searchWeb` is present in the default voice tool schema returned by the ElevenLabs session route and is bound to the ElevenLabs SDK `clientTools.searchWeb` callback; OpenAI Realtime and Konvo also dispatch the tool. The callback calls the authenticated same-origin `/api/voice/web-search` route, which caps request/results/excerpts, forwards cancellation with a 12-second timeout, filters local/private result URLs, marks excerpts untrusted, rate limits by owner, and never fetches arbitrary user-supplied URLs or mutates a page. Focused route/client/tool tests: 9/9 passed. Correction: the earlier note that the ElevenLabs client callback was missing was inaccurate; executable wiring is present. The ElevenLabs Conversational AI agent must still be configured externally with a matching blocking client-tool schema as documented in `docs/voice-web-search.md`; no live ElevenLabs session or provider-backed search was verified. This read-only workflow does not satisfy B20 browser automation. Evidence: `src/lib/ai/speech/index.ts` (`DEFAULT_VOICE_TOOLS`), `src/app/api/voice/kimi-elevenlabs/session/route.ts` (`bindingTools`), `src/lib/ai/speech/elevenlabs/use-voice-chat-elevenlabs.ts` (`clientTools.searchWeb`), `src/lib/ai/speech/web-search.ts`, and `src/app/api/voice/web-search/route.ts`.
- **B24 â€” Learn and review project facts from completed chats** â€” **PARTIAL** (provisional P1, Medium/Large): Added bounded text-only chat-source snapshots, queue-time owner/project/thread/fingerprint checks, active-revision invalidation, refresh after completion/edit/truncation/project assignment and revocation after delete/detach. Current accepted chat facts/events feed project context; owner-scoped brain GET/review APIs and panel show source labels/status. Focused tests: 32/32 across 6 files plus assignment lifecycle coverage; typecheck, `pnpm db:check`, scoped Biome and diff check pass. Migration 0075 remains unapplied; no live PostgreSQL worker/review or browser E2E.
- **C01 â€” Create/edit/delete agents, including preset creation** â€” **PARTIAL** (provisional P2, Medium/Large): Ported the executable upstream six-preset catalog, idempotent per-owner `preset_id` storage, authenticated/permission-checked/same-origin/rate-limited create-from-preset API, and an Agents-page library entrypoint. Focused route/repository/schema tests: 7/7 across 3 files in local rerun. Migration 0076 is additive and unapplied; live database/browser adoption remains unverified.
- **C02 â€” Generate an agent from a prompt** â€” **PARTIAL** (provisional P2, Medium/Large): `/api/agent/ai` now reserves and settles team monthly-budget usage from the authenticated active organization, rejects stale/nonmember organizations, avoids hidden fallback for budgeted calls, and releases only unspent reservations. Route tests: 11/11. Live PostgreSQL budget lifecycle and provider-backed journey remain unverified.
- **C03 â€” Publish, browse, install, and uninstall agents** â€” **PARTIAL** (provisional P2, Medium/Large): Added separate clone-to-owned-copy flow: current publication is locked/rechecked; copied agent is private and owner-scoped, publisher integrations/files/model pins are omitted, and retries are idempotent. Gallery Install records/count behavior remains separate and unchanged. Clone/install/gallery suites 33/33 pass; live PostgreSQL/browser journey unverified.
- **C04 â€” Register/edit/remove and OAuth-connect MCP servers** â€” **PARTIAL** (provisional P2, Medium/Large): Filled a missing config-edit path: existing MCP editor now calls authenticated owner/manager-authorized `PUT /api/mcp/[id]`, validates the config, prevents same-owner name collisions, and reuses the existing persistence/connectivity path. Endpoint URL changes first delete every OAuth session for that server so old tokens/PKCE state cannot be reused against a different host; same-endpoint header edits preserve OAuth state. OAuth callback requires a live server/state, explicitly adopts the stored state, and does not report success for a missing client; cached dynamic registrations with a callback URI different from the configured exact callback are discarded. Callback HTML is no-store and callback payload JSON is safe for inline-script context. Focused API/provider tests pass 16/16. Still unverified: live PostgreSQL, provider OAuth round-trip, and browser editor journey. Evidence: `src/app/api/mcp/[id]/route.ts`, its tests, `src/app/api/mcp/oauth/callback/route.ts`, `src/lib/ai/mcp/pg-oauth-provider.ts`, `src/lib/db/pg/repositories/mcp-oauth-repository.pg.ts`.
- **C05 â€” Customize MCP server and tool behavior** â€” **PARTIAL** (provisional P2, Medium/Large): Compared against Better Chatbot 2.0: the existing per-user server/tool customization UI and routes persist prompts in the customization repositories, invalidate the user's customization cache after writes/deletes, and load them into chat and voice system prompts. `filterMcpServerCustomizations` limits tool-level guidance to tools currently bound for the request; prompt construction occurs before `streamText` receives the tool set. This is functionally equivalent by source trace, so no duplicate code was added. Still unverified: live PostgreSQL-backed save/delete and authenticated browser-to-MCP invocation. Evidence: `src/components/mcp-customization-popup.tsx`, `src/components/tool-detail-popup.tsx`, `src/app/api/mcp/server-customizations/[server]/route.ts`, `src/app/api/mcp/tool-customizations/[server]/[tool]/route.ts`, `src/app/api/chat/actions.ts`, `src/app/api/chat/shared.chat.ts`, `src/app/api/chat/route.ts`.
- **C06 â€” Invoke MCP tools from chat** â€” **PARTIAL** (provisional P2, Medium/Large): Result handling includes bounded inline raster images, explicit MCP `isError` status, HTTPS resource links, and now playable inline audio. Images remain limited to PNG/JPEG/WebP/GIF (max 3, 512 KiB each); audio is limited to 2 allowlisted base64 clips, max 2 MiB each, rendered with native controls and `preload=none`. Audio/image bytes are redacted from transcript JSON. Resource links are capped at 10, length/label bounded, HTTPS-only, reject credentials, do not trigger automatic fetches, display destination host, and use `noopener noreferrer`. Unsafe, malformed, or oversized payloads are omitted. Focused media/UI tests pass 12/12; scoped Biome and diff checks pass. Existing C13 exact-configuration/argument approval, one-use token dispatch, server ownership, and authorization paths were not changed. Remaining: broader MIME/resource behavior and live authenticated MCP execution/browser verification. Evidence: `src/lib/ai/mcp/mcp-result-media.ts`, `src/components/tool-invocation/mcp-tool-result.tsx`.
- **C07 â€” Create/edit/save workflow graphs** â€” **PARTIAL** (provisional P2, Medium/Large): Saved-workflow editor/CRUD/structure tests exist. Ported upstream recursive TipTap conversion from nested workflow inputs, preserving mentions and hard breaks and rendering nested bullet lists; focused conversion tests pass. Live persistence/browser path unverified.
- **C08 â€” Run saved workflows with effect approval** â€” **PARTIAL** (provisional P2, Medium/Large): Primary's durable execution/checkpoint/resume system remains stronger than Better Chatbot 2.0's in-memory node event logging (`apps/web/src/lib/ai/workflow/executor/workflow-executor.ts` at `6f41835`); upstream has no durable owner execution-history API. Added owner-scoped recent-history and detail GET APIs plus a Saved Workflows recovery panel. Summaries expose only status and completed-node count; detail returns a redacted pending action only for its owner, and rechecks current workflow/MCP access before enabling approve. Owners can still reject a pending action if access has been revoked. Approval/resume still uses the existing exact effect hash, encrypted payload, atomic repository transition, and permission checks; expired reviews cannot be resumed. Focused C08 tests pass 25/25 across 6 files; full typecheck, scoped Biome and diff checks pass. No new migration. Live PostgreSQL and authenticated browser journeys remain unverified.
- **C09 â€” Create/edit/enable/delete scheduled jobs** â€” **PARTIAL** (provisional P2, Medium/Large): Dashboard create/edit/pause-resume/delete remains backed by same-origin and owner-scoped CRUD; create UI uses a stable payload-bound `Idempotency-Key` so a lost response can be safely retried. Creation now lists only the current userÃ¢â‚¬â„¢s agents and persists the selected `agentId`; the public schedule projection retains it for display/edit, and agent selection is immutable on edit. Durable worker execution/cancel/history remain. Focused dashboard/route/helper tests pass 26/26 across 3 files; scoped Biome passes. Live DB/browser/worker journey unverified.
- **C10 â€” Execute cron jobs and inspect scheduler diagnostics** â€” **PARTIAL** (provisional P2, Medium/Large): Existing cron worker and diagnostics are preserved; diagnostics expose only configuration presence and per-owner due/next-run state. Safe history failure categories now clarify common execution failures without exposing raw provider/error text. Focused scheduler suite passes; deployed worker behavior unverified.
- **C11 â€” Manually run a scheduled job and review run history** â€” **PARTIAL** (provisional P2, Medium/Large): Durable owner-bound manual requests retain idempotent replay and concurrent-run protection. Run history now shows safe categorical failure diagnostics; raw output/error remains redacted, with `private, no-store` on every response. Focused API/repository/UI tests pass; live worker/DB result flow unverified.
- **C12 â€” Connect, resume, pause, and disconnect external app accounts** â€” **PARTIAL** (provisional P2, Medium/Large): Pause/resume/disconnect now use the shared 60-provider registry and reject unknown route values before DB access. Resume covers the expanded catalog; pause is an idempotent explicit state transition, both require an owned connected row, preserve tokens, and guard the update against a concurrent disconnect; disconnect remains owner-scoped, best-effort revokes, then clears stored credentials. Nine route tests cover expanded-provider support, unknown-provider/auth rejection, ownership predicates, missing/disconnected states, and revocation/token cleanup. Live PostgreSQL/provider OAuth lifecycle remains unverified.
- **C13 â€” Approve connector write actions** â€” **PARTIAL** (provisional P2, Medium/Large): MCP approvals bind exact arguments to a keyed fingerprint of canonical server configuration. Proposal, UI review, token consumption, and dispatch validate current configuration; the manager now also requires the reviewed server name, rejects disabled/renamed/replaced rows, rechecks stored and active config immediately before dispatch, and returns inert `ApprovalRequired` results from generic `tools()` definitions so they cannot bypass the approved wrapper. Only the approval-bound chat wrapper and separately authorized workflow/project read-only paths dispatch. Existing combined batch suite: 73/73 across 8 files; this C13 follow-up: 43/43 across 3 focused suites; scoped Biome and diff-check pass. Other connector/workflow mutation coverage and live MCP/PostgreSQL/browser journey remain unverified. Evidence: `src/lib/ai/mcp/create-mcp-clients-manager.ts`, `src/app/api/chat/shared.chat.ts`, `src/app/api/mcp/actions.ts`, `src/app/api/approvals/mcp-tool/route.ts`, `src/lib/ai/mcp/execute-approved-mcp-tool.ts`.
- **C14 â€” Subscribe Slack channels to agent tasks** â€” **EXCLUDED** (provisional P2, Medium/Large): V2 checkout has declarations but no executable handlers/event/delivery path.
- **C15 â€” List notifications and mark them read** â€” **PARTIAL** (provisional P2, Medium/Large): Ported upstream type-filtered feed behavior, including filtering unread counts, and explicit `{all:true}` mark-all behavior through the existing authenticated, origin-checked, rate-limited, owner-scoped APIs. Empty or false mark-all payloads are rejected; only non-empty IDs or explicit `{all:true}` are accepted. DB errors and no-store responses are handled. The Cockpit now includes an agent Updates feed backed by the same owner-scoped inbox: it polls the latest eight update notifications, shows severity/read state, validates links with `safeNotificationHref`, and supports mark-read. UI/route/type suites pass 20/20 combined (13 notification route/contract + 7 Cockpit UI); scoped Biome passes. Browser/live PostgreSQL journey remains unverified.
- **C16 â€” Register and receive browser push notifications** â€” **PARTIAL** (provisional P2, Medium/Large): Existing owner-scoped VAPID API and service worker now use a tested push client for permission, subscribe, key-refresh and server-first unsubscribe; denied/dismissed/unsupported states get recovery guidance. Focused push suite: 19/19; real browser permission and VAPID delivery unverified.
- **C17 â€” Manage profile, password, recovery, and sessions** â€” **PARTIAL** (provisional P2, Medium/Large): Ported upstream's lazy-on-open settings-context workflow: authenticated, owner-scoped, no-store endpoint returns only profile and safe account-provider summary. Also ported upstream Better Chatbot commit `113a86d` (#377): password-update mode now derives only from server-side `isOwnResource`, not a client-submitted `isCurrentUser` flag; self-service always requires current-password verification, while authorized admin reset revokes the target's other sessions. Password validation/action tests pass (27/27) and scoped Biome passes. Live email/DB/browser flow remains unverified.
- **C18 â€” Checkout, inspect subscription, and process billing webhooks** â€” **PARTIAL** (provisional P2, Medium/Large): Upstream `better-chatbot/main` at `6f4183566bc48616303cb84055f11f79578c82fe` disables checkout/subscription and has no live billing webhook flow, so Void Agent's Dodo checkout, subscription reconciliation, and signature-verified webhook remain the stronger existing implementation. Added self-service Dodo customer portal creation using the stored customer on the authenticated user's subscription; the route is same-origin, rate-limited, owner-derived, secret-protected, and only returns an HTTPS provider link. Focused Dodo suite: 28/28 across 5 files; 6 GB full typecheck passes. Live Dodo, PostgreSQL, and browser navigation remain unverified; no production billing or DB calls.
- **C19 â€” Use desktop auth handoff, download/update, and packaged app** â€” **PARTIAL** (provisional P2, Medium/Large): Preserved existing HTTPS-only feed validation, signing preflight, Electron updater signature verification policy, auth handoff, and download flow. Added a bounded local updater.log wired to electron-updater, redacting URL paths/query strings and common credential fields, plus a native Help-menu action to open the log folder. Focused updater/menu tests pass (12/12); desktop typecheck and main build pass. No signed installer/feed credentials or packaged GUI/update journey available; that remains unverified.
- **C20 â€” Configure and test local/remote desktop MCP servers** â€” **PARTIAL** (provisional P2, Medium/Large): Primary bridge keeps origin/main-frame checks, native consent bound to config fingerprints, default-deny tool names, timeout/result bounds, pinned remote DNS and hash-only audit. Fixed remote consent copy to show the HTTPS origin and disclose that exact arguments go to the remote server and results return as untrusted, without displaying credential values. Desktop MCP consent fingerprints now retain only SHA-256 digests of canonical configurations, not stdio environment or remote header credentials; regressions prove secrets are absent. Full desktop main suite passes 68/68 across 17 files, package typecheck, scoped Biome, and diff-check. Live Electron/remote-server journey remains unverified; V2's weaker bridge is not used by chat. Live Electron/remote-server journey remains unverified; V2's weaker bridge is not used by chat.
- **C21 â€” Connect external services in Cockpit** â€” **OPTIONAL** (provisional P2, Medium/Large): Stripe vertical slice exists; wider provider console is secondary.
- **C22 â€” Submit and triage problem reports** â€” **PARTIAL** (provisional P2, Medium/Large): Primary already has owner-scoped admin status triage; added optional, escaped, configurable notification after persistence to match upstream submission behavior. Upstream has no admin assignment/status workflow. Live delivery and persisted browser journey remain unverified.
- **C23 â€” Use telemetry and observability integrations** â€” **OPTIONAL** (provisional P2, Medium/Large): Logging exists; opt-in external telemetry parity is not established.
- **C24 â€” Automatically update from upstream** â€” **DEPRECATED** (provisional P2, Medium/Large): Not appropriate for independent Void Agent product.
- **C25 â€” Use managed workflow generation and dashboard hosting** â€” **EXCLUDED** (provisional P2, Medium/Large): Inspected V2 checkout has schema/UI references but no executable generator, worker, hosting or provisioning path.
- **C27 â€” Add registered users to an existing team** â€” **PARTIAL** (provisional P2, Medium/Large): Preserved the owner/admin-only `/team-members` flow to immediately add an existing Void Agent account as `member` or `viewer`. The endpoint checks exact team owner/admin status, validates body/team/email, rate-limits/no-store, and uses a transaction with unique-conflict handling to create membership and default budget policy. The same screen now also supports pending email invitations in C28. Focused team/scheduler tests pass; live PostgreSQL/browser verification remains. Evidence: `/api/teams/[teamId]/members`, `src/components/team-members-settings.tsx`, `src/lib/db/pg/repositories/team-repository.pg.ts`.
- **C28 â€” Invite a team member by email and accept into the canonical team** â€” **PARTIAL** (provisional P2, Medium/Large): Added dedicated pending-invitation persistence, email delivery status, manager list/create/revoke APIs, one-time 256-bit hash-only bearer tokens, fragment-only accept links, verified-email matching, and transactional membership plus budget-policy acceptance. UI includes pending invite management and a sign-in-preserving acceptance page. Focused invitation/API/UI tests pass; local additive migrations 0080/0081 are unapplied. Live PostgreSQL, Resend, sign-in callback, and browser journey remain unverified. Evidence: `src/lib/db/pg/schema.pg.ts`, `src/lib/db/pg/repositories/team-invitation-repository.pg.ts`, `/api/teams/[teamId]/invitations`, `/api/team-invitations/accept`, `/team-invitations/accept`.
- **C29 â€” Select and persist the active team metering context per session** â€” **PARTIAL** (provisional P2, Medium/Large): Fresh audit found primary had enabled the Better Auth organization plugin while its organization/member/invitation tables and session active-organization field were not mapped. Replaced that unsupported path with app-owned `session.activeTeamId`, an owner-session-only same-origin selector validated against current team membership, cache-bypassing use in AI/voice budgeted routes, and stale selection clearing. Additive migration 0081 is unapplied; route/UI/unit tests pass, but live PostgreSQL auth-session reload and over-cap provider journeys remain unverified. Evidence: `src/lib/auth/auth-instance.ts`, `/api/user/active-team`, `src/app/api/agent/ai/route.ts`, `src/app/api/voice/run-agent/route.ts`.
- **C30 â€” Create a plan-only artifact with read-only research tools** â€” **PARTIAL** (provisional P2, Medium/Large): Added a persisted composer toggle and `planMode` chat request field. The server ignores client mentions/tool choices in this mode and binds only allowlisted read-only web/project research tools plus one bounded `createPlan` artifact; MCP, workflows, approvals, image generation, publishing, code execution, schedule dispatch, and other effectful tools are excluded even if the client forges them. The route rejects models without tool calling with `plan-mode-model-unsupported`. Plan artifacts render from saved tool-call parts. Focused tests: 11/11 across six files, including tool allowlist, model capability rejection, request schema, preference rehydration, composer toggle, schema bounds, and rendering. Live provider/browser journey remains unverified. Evidence: `src/lib/ai/planning/plan-mode.ts`, `create-plan-tool.ts`, `/api/chat`, `src/components/tool-mode-dropdown.tsx`, `src/components/tool-invocation/plan-artifact-card.tsx`.
- **C31 â€” Discover and execute connected-app read-only actions in chat** â€” **PARTIAL** (provisional P2, Medium/Large): Added owner-scoped Composio chat tools behind authenticated, non-embed, tool-enabled chat. Search derives active private accounts server-side and returns request-local opaque account refs plus bounded safe read-action schemas; execution requires a previously listed action/ref pair, validates its JSON schema, rechecks the active owner connection, applies per-user rate limiting and per-chat call/result budgets, then strips credential-named fields from bounded results and labels returned data untrusted. Mutating actions are tracked separately in C38 with a server-bound approval-token workflow; Composio provider-backed journey remains unverified. Focused tests: 12/12 across the chat helper and account-list suites; scoped Biome and diff-check pass. Full `pnpm check-types` passes with 6 GiB Node heap after explicit AI SDK input/output and JSONSchema7 types; scoped Biome and diff-check pass. Evidence: `src/lib/ai/composio-chat-tools.ts`, `src/lib/ai/composio-chat-tools.test.ts`, `src/app/api/chat/route.ts`, `src/lib/ai/composio.ts`.| PARTIAL
- **C32 â€” Record a scheduled chat run only after a verified terminal completion** â€” **PARTIAL** (provisional P2, Medium/Large): Primary's scheduler previously treated any HTTP 2xx as success without consuming the `/api/chat` stream. It now requires `text/event-stream`, drains with a 2 MiB ceiling while retaining only a 64 KiB tail, enforces a five-minute fetch-plus-stream deadline, and accepts only a parseable terminal `finish` frame with `finishReason: "stop"` and no blocked metadata. Redirect/auth bounce, non-2xx, invalid content type, missing/malformed/truncated finish, blocked runs, errors, other finish reasons, oversized streams and timeouts become safe failure categories and failure notifications. Focused suite: 15/15 tests. Live worker/PostgreSQL/browser/provider journey remains unverified. Evidence: `src/lib/scheduler/chat-response.ts`, `chat-response.test.ts`, `worker.ts`.
- **D01 â€” Create a multi-source review, generate/edit/retry cells, cite evidence, and export XLSX** â€” **PARTIAL** (provisional P1, Medium/Large): Generation keeps exact-quote validation; verified citations map to ordered pinned source segments and render in both review UIs and XLSX export. Shared upstream review presets now drive the dashboard and AI-created reviews, including list-formatted key dates and server-resolved preset prompts; custom AI columns still require bounded prompts. Evidence remains caller-owned, ready, and revision-pinned. Tabular focused tests: 41/41 across 10 files; live PostgreSQL/browser flow remains unverified and migration 0073 remains unapplied.
- **C33 â€” Configure chat-alert delivery and suppress alerts for the currently viewed thread** â€” **PARTIAL** (provisional P2, Medium/Large): This is separate from C15's notification inbox/read-state workflow and C16's push subscription/delivery workflow. V2 source: `apps/web/src/hooks/use-agent-alert-notifications.ts`, `apps/web/src/lib/agent-alerts/maybe-notify-agent-alert.ts`, `apps/web/src/components/agent-alerts/notification-settings-content.tsx`; it suppresses alerts for the visible current thread and supports only-when-away. Primary adds `chatAlertsOnlyWhenAway` to existing owner preferences, suppresses the visible current thread, and routes away alerts through the existing desktop/browser notification channels while retaining generic private copy. Focused helper/hook tests: 17/17; live browser settings persistence and desktop/browser notification delivery remain unverified. Root should reconcile this addendum into global counts before reporting a parity percentage.
- **E01 â€” Complete first-run setup and optionally connect apps** â€” **PARTIAL** (provisional P1, Medium/Large): Added authenticated `/onboarding` page with resumable overview/connect-app steps, direct skip/agent/workflow choices, and Composio pagination/connect/disconnect through the existing owner-scoped `/api/integrations/composio` API. Added a same-origin, rate-limited onboarding-state endpoint backed by an atomic JSONB key update, preserving notes, skills, and notification preferences. The chat-layout gate uses the device cookie as a fast path and the database preference as authority; completion cookie is HttpOnly/SameSite and can only be minted after the server confirms `step: done`. Focused onboarding tests pass 23/23 across 7 files; 6 GB typecheck and scoped Biome pass. Real browser/OAuth and live PostgreSQL verification remain unverified, so E01 is PARTIAL. Evidence: `src/app/onboarding/page.tsx`, `src/components/onboarding/onboarding-wizard.tsx`, `src/app/api/user/onboarding/route.ts`, `src/app/api/onboarding/complete/route.ts`, `src/app/(chat)/layout.tsx`.
- **E02 â€” Create and resume project setup across goal, knowledge, documents, tools, people, and agents** â€” **PARTIAL** (provisional P1, Medium/Large): Added a project-card wizard that opens after creation and resumes from a persisted step; goal/knowledge save through existing project PATCH, documents use the existing private project upload/API, tools use existing brain connectors, people use current team collaborator ACLs, and agent assignments use a metadata-safe API. Team projects accept only public agents; personal projects accept caller-owned or public agents. Same-origin editor-only progress and completion API persists the step; Skip for now retains resume state. Authorized project editors can remove an existing assignment if its agent later becomes private, without reading agent metadata; GET/available/POST visibility restrictions remain. Additive migration 0078 adds the progress field and project-agent join table; unapplied. **Project-agent assignment is configuration-only in both repositories:** V2 has the join table, authenticated GET/POST/DELETE routes, onboarding and collaborator UI, but repository-wide usage shows no project-chat or agent-execution path reads assigned rows. Primary likewise stores/displays assignments only. This is not an upstream execution-parity gap; no implicit agent execution or prompt injection was added. Latest focused agent-route suite passes 8/8; prior combined `pnpm db:check` and 6 GB typecheck passed; scoped Biome passes. Live PostgreSQL/browser and migration application remain unverified. Evidence: V2 `apps/web/src/app/api/projects/[id]/agents/route.ts`, `apps/web/src/components/projects/onboarding-step-agents.tsx`, and `apps/web/src/components/projects/project-collaborators-dialog.tsx`; primary `src/components/project-setup-wizard.tsx`, `src/components/project-assigned-agents.tsx`, `src/app/api/projects/[id]/agents/route.ts`, `src/app/api/projects/[id]/onboard/route.ts`.
- **B25 â€” Tune OpenAI Realtime voice activity and background-noise handling** â€” **PARTIAL** (provisional P1, Medium/Large): Persisted sensitivity, pause, and noise-reduction controls are clamped/allowlisted on the server before session creation. Focused normalization tests pass 3/3; live provider/browser verification remains.
- **C26 â€” Answer agent follow-up questions with structured choices or typed values** â€” **PARTIAL** (provisional P2, Medium/Large): RequestInput supports legacy string choices, bounded descriptive choices, multi-select, placeholders, and text/number/email/URL fields. Password input remains prohibited. Focused schema/UI tests pass 16/16; model-to-user browser journey remains.
- **C34 â€” Search an optional Agentset project knowledge namespace** â€” **PARTIAL** (provisional P2, Medium/Large): Added a disabled-by-default, fixed-origin server adapter and same-origin authenticated project route. Results are bounded and rechecked against current project access, attached collections, source owners, ready item state, and local document IDs. Focused adapter/source/route tests: 11/11. Remote ingestion mirroring/job lifecycle, management UI, chat/project-brain context injection, and live credentials/PostgreSQL/browser verification remain. Evidence: `src/lib/rag/agentset-provider.ts`, `src/lib/rag/agentset-source-access.ts`, `src/app/api/projects/[id]/search/route.ts`, `docs/features/agentset-project-search.md`.| PARTIAL
- **C35 â€” Search and execute connected-app read actions in OpenAI Realtime voice** â€” **PARTIAL** (provisional P2, Medium/Large): Added owner-bound encrypted short-lived account references; active account recheck; read-only action and schema validation; per-user limits; bounded/redacted results marked untrusted; authenticated same-origin execution route; and Realtime tool dispatch. Mutating actions remain unavailable pending an approval-bound workflow. Focused helper/route/chat-helper tests: 22/22. Live Composio/provider/browser verification remains. Evidence: `src/lib/ai/composio-voice-tools.ts`, `src/app/api/voice/composio-tool/route.ts`, `src/app/api/chat/openai-realtime/route.ts`, `src/lib/ai/speech/open-ai/use-voice-chat.openai.ts`.| PARTIAL

- **C36 â€” Propose tracked DOCX edits from an authorized project chat and explicitly review the candidate** â€” **PARTIAL**: Owner/editor and DOCX-only tool exposure; proposal persists as a tracked review copy and requires user review; no automatic apply. Live PostgreSQL and browser accept/reject flow remain unverified. Evidence: src/app/api/chat/route.ts, src/lib/ai/tools/project-document.ts, src/lib/documents/project-document-edit-proposal.ts, src/components/tool-invocation/project-document-edit-proposal.tsx.
- **C37 â€” Render secure Morphik image previews from MCP tool results** â€” **PARTIAL**: Short-lived owner-bound references replace signed URLs before model/transcript/persistence; authenticated proxy bounds and allowlists retrieval. Live S3/browser rendering remains unverified. Evidence: src/lib/ai/mcp/morphik-media-reference.ts, src/lib/ai/mcp/execute-approved-mcp-tool.ts, src/app/api/mcp/media/morphik-image/route.ts, src/components/tool-invocation/morphik-image-preview.tsx.

- **C38 - Propose and execute connected-app write actions after exact-payload approval** - **PARTIAL**: `src/lib/ai/composio-write-chat-tools.ts`, `src/lib/ai/tools/hitl/composio-write-approval.ts`, `src/lib/ai/tools/hitl/composio-write-approval-route.ts`, `src/app/api/approvals/composio/route.ts`, `src/components/tool-invocation/hitl-tool-cards.tsx`, and `src/components/message-parts.tsx`. Approval binds current user/account/action/version/schema/exact arguments and is single-use. Focused tests pass 21/21 across four files; live Composio/PostgreSQL/browser execution remains unverified.

## Appendix B â€” Changed path snapshot

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
- `src/lib/ai/image/generate-void-agent-image.test.ts`
- `src/lib/ai/image/generate-void-agent-image.ts`
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
- `void-agentai-app-spec.md`
- `void-agentai-rebuild-spec.md`
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

## Publish-time validation checkpoint â€” 2026-11-08 23:02 IST

The committed implementation tree was revalidated before publication: 588 test files / 3,131 tests passed; 6 GiB typecheck passed; lint passed with warnings; pnpm db:check passed as metadata-only; production build exited 0 with 205/205 pages generated; diff checks passed. The build's page-data phase logged a read-only PostgreSQL query error (column "preset_id" does not exist) for the published-agents endpoint. No migration or database write was performed; treat the DB schema/runtime as unverified. Focused DOCX/Morphik/C38/B20 tests passed 112/112 across 18 files. Keep B20 MISSING/disabled and C38 PARTIAL pending live integration verification. See docs/testing-report.md for commands and verification limits.

## A01 implementation and verification update - 2026-11-09 00:08 IST

**A01 status: PARTIAL.** This addendum supersedes the previous Ã¢â‚¬Å“no live PostgreSQL journeyÃ¢â‚¬Â statement for repository-level verification, but does not claim a complete route/provider/browser journey.

- New threads and their first user message now persist in a single PostgreSQL transaction. The route validates user-role messages, atomically claims client message IDs before provider/side-effect execution, returns a generic 409 on duplicates/collisions, and records retryable stream failures. Server-generated `runAttemptId` compare-and-swap checks prevent stale failure/completion callbacks from changing newer retries. User terminal state and assistant persistence finalize in one transaction. `/schedule` and unknown-skill responses follow the same claim/finalization policy. Draft URL navigation happens only after a successful, non-redirected POST response with a body.
- Fixed migrations `0042_project_brain_typed_pages.sql` (`min(uuid)` unsupported on PostgreSQL) and `0068_scheduled_job_manual_run_requests.sql` (leading UTF-8 BOM caused syntax error).
- **Real PostgreSQL:** PostgreSQL 17.11 + pgvector 0.8.7, local-only cluster at `127.0.0.1:55432`, databases `void_agent_a01_test` and fresh `void_agent_a01_fresh_test`. Full migrations succeeded on the fresh database; the A01 suite ran migration setup itself and passed 10/10 tests. Coverage: transactional first message, real inserts/updates/reads, chronological ordering/cursor pagination, rollback on foreign message ID, cross-thread and same-thread role collision protection, concurrent claim winner/replay rejection, retry, stale attempt fencing, atomic user+assistant finalization, owner check. No production DB URL or data was used.
- Focused A01: 5 files / 26 tests passed. Full `pnpm test`: 593 files / 3,157 tests passed. 6 GiB `pnpm check-types`: PASS. `pnpm lint`: PASS with existing Next lint deprecation/workspace-root and `<img>` warnings; Biome checked 2,292 files. `pnpm db:check`: PASS. 6 GiB `pnpm build`: PASS, 205/205 static pages. `git diff --check`: PASS before this documentation addendum; rerun after docs.
- **Still unverified:** authenticated `POST /api/chat` end-to-end, actual provider streaming, provider-timeout propagation, route-level client cancellation, browser-based send/retry/history behavior, and real provider credentials. Tests cover repository state transitions and existing stream/stop helpers, not a live chat session. A01 must remain PARTIAL until route-level integration with a controlled provider and authenticated UI/API workflow verifies those paths.
- Latest A01 changed files: route, chat-bot transport, chat types, PostgreSQL chat repository, migration 0042, migration 0068; `src/lib/chat/new-chat-navigation.{ts,test.ts}`, `persist-failed-chat-run.{ts,test.ts}`, and PostgreSQL A01/upsert/run-claim tests. Two untracked user files `void-agentai-app-spec.md` and `void-agentai-rebuild-spec.md` were preserved. No commit or push was created; branch/remote status recorded after final validation.

## A01 final validation update - 2026-11-09 00:26 IST

**Status remains PARTIAL.** The earlier 00:08 addendum is updated by these latest counts and tests.

- PostgreSQL: fresh isolated PostgreSQL 17.11 + pgvector 0.8.7 database `void_agent_a01_fresh_test`; test harness verified loopback/database identity and applied all migrations. 12/12 real DB tests passed: atomic new thread + first message, ordering/pagination including equal-timestamp tie breaks, cross-thread and same-thread role collision protection, transactional rollback, concurrent duplicate thread creation, concurrent message-claim winner, replay rejection, retry, stale attempt failure/finalization rejection, atomic user+assistant finalization, and owner predicate.
- HTTP/UI supporting tests: route file 4/4 (401 unauthenticated, 400 invalid role, 403 foreign thread, atomic insert call wiring); transport file 9/9 (successful draft navigation only, auth redirect/error/empty-body rejection, GET reconnect, abort signal passthrough, network error). Focused A01: 7 files / 41 tests.
- Final full suite: 595 files / 3,172 tests PASS. 6 GiB typecheck PASS. Lint PASS with existing warnings (Next lint deprecation/workspace-root, `<img>`); Biome checked 2,295 files. `pnpm db:check` PASS. `pnpm build` PASS with 205/205 pages. `git diff --check` PASS before this append; rerun after it.
- The route tests mock auth/repository/provider dependencies; the atomic insert case stops at an intentional mocked model lookup failure. No authenticated HTTP flow was taken through provider streaming/tool continuations, timeout/error/cancellation finalization, or a mounted browser conversation/retry/history journey. No real provider credentials were used. This is why A01 remains PARTIAL.
- Latest change set includes route, transport/UI, types/repository, two migration fixes, A01 helpers and tests, and migration docs. Untracked user files `void-agentai-app-spec.md` and `void-agentai-rebuild-spec.md` remain preserved. No local commit, push, or deployment.

## A01 run-claim collision fix and callback verification â€” 2026-11-09 00:44 IST

- Independent concurrency review found and fixed a repository conflict predicate gap: claimMessageRun now requires an existing row to match both the requested thread and role=user before retryable upsert. This prevents a retryable assistant row from being overwritten by a client-submitted user turn using the same message ID.
- Added real PostgreSQL regression coverage asserting the claim is rejected and assistant role/content/metadata remain unchanged. The unit SQL assertion now verifies the role predicate as well.
- Added mocked route callback coverage for successful terminal finalization, sanitized retryable provider failure state, and aborted partial-response persistence. These invoke route callbacks directly; they do not verify AI SDK callback scheduling, provider stream bytes, real provider calls, or browser E2E.
- Isolated PostgreSQL lifecycle suite: PASS, 13/13. Focused A01 suite: PASS, 7 files / 45 tests. Full suite: PASS, 595 files / 3,176 tests using only the local A01 test database URL override.
- NODE_OPTIONS=--max-old-space-size=6144 pnpm check-types: PASS (also included in the successful production build after test updates). pnpm lint: PASS with existing Next deprecation/workspace-root and img warnings. pnpm db:check: PASS (metadata only). 6 GiB pnpm build: PASS, exit 0, generated 205/205 pages; existing dependency-analysis and dynamic-session warnings remain. git diff --check is to be rerun after this documentation append.
- A01 remains PARTIAL. Real provider streaming, SDK callback execution order, actual timeout/cancellation over HTTP, and browser send/retry/history remain unverified. The route has a Next maxDuration=300 setting, but this is not proof that timeout state is persisted on every deployment runtime.
- No commit, push, deployment, production database access, or reference-repository edit. Original untracked user-owned files remain untouched.
---

## A01 completion checkpoint — 2026-11-09 01:24 IST

**A01 remains PARTIAL.** This checkpoint supersedes earlier A01 test counts while retaining their historical entries.

- Fixed the PostgreSQL `claimMessageRun` conflict predicate so a retryable assistant message cannot be overwritten using a client-supplied user-message ID. The predicate now requires matching thread and `role='user'`; a real PostgreSQL regression test verifies preserved assistant content/metadata.
- Added an explicit chat generation deadline: request generation aborts at 285 seconds, leaving 15 seconds inside the route's 300-second platform limit for persistence. Timeout failures persist retryable `timed_out`; explicit user stop takes precedence if it races with the timeout. Timeout classification is unit-tested; live HTTP deadline/cancellation persistence is not.
- Added stream failure-persistence coordination so `onFinish` waits for an in-flight retryable failure write and cannot subsequently mark that run completed.
- Added an AI SDK 5 controlled `LanguageModelV2` integration test which uses the real `streamText`, UI-message stream construction, and SSE serializer. It verifies streamed text deltas, successful finish persistence, and sanitized retryable provider-stream failure. Auth, repository, RAG, and provider selection are mocked; this is not live provider or PostgreSQL-backed route verification.
- Isolated PostgreSQL: PostgreSQL 17.11 + pgvector 0.8.7; fresh migration chain had already succeeded. The real DB lifecycle suite remains 13/13. Combined A01 focus: 9 files / 55 tests PASS. Full `pnpm test` against the isolated local DB URL: 597 files / 3,186 tests PASS.
- Validation on current working tree: `NODE_OPTIONS=--max-old-space-size=6144 pnpm check-types` PASS; `pnpm lint` PASS with existing Next lint deprecation/workspace-root and `<img>` warnings (Biome checked 2,298 files); `pnpm db:check` PASS (Drizzle metadata only); `pnpm build` PASS, generated 205/205 pages, with existing dynamic-session/dependency warnings; `git diff --check` PASS before this documentation update and must be rerun.
- Independent reviewers found no blocking persistence/callback defect. The Playwright harness's default global setup/teardown can seed/delete test-domain accounts from its configured database. `.env.test` and auth state are absent, so it was not run against default dotenv configuration. Do not point that harness at anything except the isolated A01 DB.
- Still not verified: a mounted browser send/retry/history flow; authenticated `POST /api/chat` using real PostgreSQL repository persistence; actual deployment runtime behavior for deadline/cancellation; real provider credentials. A01 stays PARTIAL until those relevant workflows are exercised safely. No production database was used.
- No commit, push, deployment, production migration, or reference-repository edit. Preserve `void-agentai-app-spec.md` and `void-agentai-rebuild-spec.md` as untracked user files.

## A01 continued implementation and verification — 2026-11-09 02:30 IST

**A01 remains PARTIAL.** The core persistence and route workflows now have stronger evidence, but a single authenticated browser send/retry journey through the real DB-backed route is not yet verified.

- Implemented atomic first-turn persistence, owner checks, conflict-safe run claims, `runAttemptId` compare-and-swap, stable ordering/pagination, retry/replay behavior, cancellation/partial persistence, and a 285-second generation deadline within the route's 300-second limit.
- Independent review found completed tool effects could be replayed if final persistence failed. The route now retries the exact same finalization transaction once, without rerunning the model/tools. If both attempts fail, it stores a terminal `persistence_failed` state with `retryable:false`; PostgreSQL claim SQL refuses to reclaim explicitly non-retryable failed rows. The same recovery helper protects schedule and unknown-skill finalization.
- Isolated PostgreSQL 17.11 + pgvector 0.8.7: fresh migration chain and real repository lifecycle tests passed. `POST /api/chat` integration tests use the real PostgreSQL repository with a controlled AI SDK model for creation/stream/persistence, foreign-owner rejection, provider failure→retry→completed replay rejection, and cancellation/partial output. No production database was used.
- Browser tests passed: authenticated initial send with controlled 503→Retry→rendered SSE response (chat POST mocked), and PostgreSQL-backed owned conversation hydration/reload with uniquely seeded test data and cleanup. The browser tests are not the same journey as the route-to-PostgreSQL integration test.
- Fixed a timing race in the onboarding test: wait for the effect-driven Composio request after the step heading renders. The isolated test and the final full suite pass.
- Final validation: A01 focused 11 files / 66 tests PASS; PostgreSQL claim/lifecycle subset 2 files / 17 tests PASS; Playwright 3 tests PASS; full `pnpm test` 599 files / 3,197 tests PASS; 6 GiB typecheck PASS; lint PASS with existing warnings; `pnpm db:check` PASS (metadata check only); production build PASS with 205/205 static pages generated; final `git diff --check` PASS.
- Remaining evidence gaps: browser send/retry still mocks POST; no single browser workflow proves that the UI's submitted response is the same row persisted and reloaded. No live provider credentials, deployment-runtime timeout proof, or browser tool-continuation journey. Keep A01 PARTIAL until these are verified.
- B20 remains MISSING with browser execution disabled. C38 remains PARTIAL pending live Composio/PostgreSQL/browser verification. No commits or pushes were created.

## Canonical upstream sync checkpoint — 2026-11-09 03:13:43 +05:30
Current source is keinsaasforever/better-chatbot main 6f4183566bc48616303cb84055f11f79578c82fe; destination is ibrahimkhan008/Void Agent main 589fa48f3c323d049e51d566f3b8ddff95d59bc5 with preserved local A01 changes. There is no shared Git merge-base, so the exact original fork commit is unknown. The unrelated remote named upstream must not be used; better-chatbot is the correct remote. Mention-chip behavior from upstream 989dc36 was already present. Ported the 945d3da lifetime member AI cap into Void Agent's existing locked PostgreSQL ledger; legacy monthly_cap_micros column remains for compatibility, while all periods count against the lifetime cap. Removed TTL-only automatic hold release after independent security review. Four isolated PostgreSQL tests passed for rollover, concurrent reservations, outsider isolation, and stale-hold accounting. Project-brain dispatch from 93fdb8e is partially ported: document and chat enqueue paths schedule targeted request-bound queue processing after commit; manual and connector paths still require a scheduler. Project-brain focused tests: 23 passed. Full unit suite: 597 files/3183 tests passed, 3 files/21 tests skipped. Typecheck, lint (existing warnings), database metadata check passed. Production build was still running when this note was written. No live provider or production verification. No commit, push, or deploy.


Validation follow-up: production build result will be recorded in the next context.md entry.
Production build completed successfully after the prior pending note; Next.js emitted dependency warnings and existing route dynamic-render diagnostics. Current validation completed on 2026-11-09: full unit suite 3183 passed/21 skipped; isolated budget PostgreSQL tests 4/4; type/lint/db metadata checks passed; git diff --check exit 0. No changes were published.
Upstream dispatch scope update (2026-11-09 06:01:14 +05:30): MCP and Composio connector sync routes now also schedule newly inserted project-brain runs after their transactions commit. Focused connector suites passed 16/16. Document, chat, and both connector dispatch are covered; manual project-brain analysis remains dependent on the scheduler. Current production build after these route changes completed successfully; current git diff --check exit 0.
Upstream sync final-state update (2026-11-09 06:11:05 +05:30): The B06 queue dispatch port now covers all five ProjectBrainRun insertion paths: document ingest, project chat refresh, manual analysis/retry, MCP connector sync, and Composio connector sync. Each only schedules after durable insert/commit, with the existing database claim retained. Manual analysis is no longer pending; B06 remains PARTIAL for unverified real provider/PostgreSQL/browser lifecycle. Upstream TensorX models are now wired as direct optional provider routes. New provider feature A34 makes the register 100 workflows. Current provider/auth resolution rejects missing or masked server keys and the catalog filters absent credentials. Focused combined tests pass 50/50; TensorX-focused suite 17/17, manual route 8/8, connector suites 16/16, project brain queue suite 23/23. Current 6 GiB typecheck and production build passed; full suite result 3183 passed/21 skipped was run before the final small TensorX/manual route additions. No live TensorX verification.
Superseding sync update (2026-11-09 06:13:05 +05:30): Project-brain dispatch now also covers manual analysis and stale retry; together with document ingestion, chat refresh, MCP sync, and Composio sync, every current ProjectBrainRun insert path schedules after commit. Focused tests show targeted dispatch and no duplicate dispatch for active runs. B06 remains PARTIAL only for real provider/PostgreSQL/browser lifecycle verification. TensorX direct provider/model port from upstream 2.0 is tracked as A34; 100 individually listed workflows. Focused relevant tests 50/50; isolated budget PostgreSQL tests 4/4; final 6 GiB typecheck, production build, scoped Biome, and git diff --check passed. Full suite last run before manual/TensorX edits: 597 files/3183 tests passed, 3 files/21 tests skipped. No live TensorX credentials/provider verification. No commit/push/deploy.

> Current repository identities, pinned source snapshots, desktop provenance, and staging status are maintained in [current-source-roles.md](current-source-roles.md). Historical Void Agent-V2 references in this file are retained as prior audit evidence and do not identify the current canonical sources.

## Current staging execution update — 2026-11-11 00:00 IST

Independent recheck confirmed all 1,768 tracked paths from Better Chatbot `6f4183566bc48616303cb84055f11f79578c82fe` are present in the separate staging workspace. This is path completeness only; changed file content and intentional custom deltas still need a final baseline comparison. The upstream clone remains clean. The destination is still on `main` at `589fa48f3c323d049e51d566f3b8ddff95d59bc5`; its modified and untracked files were preserved and no staging overlay was applied.

Verified current focused results: Dodo repository test 3/3; Notes/Collections selected tests 27; eCanvas 26; Community 13; Archive 11; staging A01 helper/repository/guard tests 44; connector/provider/approval selected tests 44. Community/archive/connector 6 GiB typechecks passed on their stated snapshots; connector lint and desktop typecheck/build passed; migration metadata checks passed after migrations through idx79. No full suite/build was run against the fully combined current workspace. No real current-session PostgreSQL, provider, storage, or browser E2E verification is claimed.

Community and Archive are implemented in staging. The desktop security/transport port stays in upstream `apps/desktop`; the duplicate `apps/Void Agent-desktop` is temporary and must not ship. Connector tools have tested Gmail, Drive, and Teams write approval flows, but the remaining original source write actions still need mapping/testing. Per-thread insights has started. AI app builder, bug bounty, and chat challenge controls remain open. A01 remains PARTIAL until its current staged end-to-end evidence is completed; current host has no PostgreSQL service, binaries, or listener, and Docker is prohibited. B20 remains MISSING/disabled; C38 remains PARTIAL pending live verification.

The staging `.env` must never be copied. No commit, push, deploy, production DB access, production migration, or primary source overlay occurred. Next task: complete and independently review these in-progress batches, then run aggregate validation before considering promotion.

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

## 2026-11-11 00:17 IST — staged migration follow-up

### Newly verified / current implementation
- A01 staging UI now promotes the draft URL only after a successful, non-redirected streaming POST. Mocked route tests cover auth, invalid role, ownership, atomic new-thread wiring and duplicate claim conflict. Controlled AI SDK tests cover success SSE, sanitized provider failure, timeout, cancellation and finalization retry. Focused counts: 3 files / 15 tests and 4 persistence/recovery files / 16 tests; typecheck and scoped Biome passed. No live PostgreSQL/provider/browser verification.
- Thread Insights has a reachable thread-page control, owner-scoped bounded transcript, strict output schema, per-thread rate limit, timeout and stale-result detection; 4 focused files / 11 tests, 6 GiB typecheck, `db:check`, scoped Biome passed.
- Connector read coverage exists for Gmail, Drive, Calendar, GitHub, Outlook, Slack, Notion and Teams. Mocked approved write paths verified for Gmail send/reply, Drive create, Teams send, Asana create_task, ClickUp create_task, Linear create_issue (latest 6 files / 39 tests).

### Remaining/security status
- Jira/Zendesk write edits are unverified. Productboard, Freshdesk create_ticket/add_reply, Discord send_message, Zulip send_message remain unsupported or blocked on provider contract work.
- C45 cryptographic chat challenge is absent in staging; source security mechanisms and implementation requirements are documented. Keep it open until verified.
- AI app builder has started design; it needs an owner-scoped durable job model and constrained E2B template/file lifecycle. Bug bounty still pending.
- No full current-tree test suite, monorepo build, real PostgreSQL migration application, live provider, or browser E2E has been run. Current Windows environment lacks PostgreSQL service/binaries/listener; Docker is prohibited. Do not promote.

## 2026-11-11 00:20 IST — connector verification update

- Connector write paths now have mocked approval coverage for Gmail send/reply, Drive create, Teams send, Asana `create_task`, ClickUp `create_task`, Linear `create_issue`, Jira `add_comment`, and Zendesk `add_comment`; latest suite 7 files / 44 tests PASS.
- Jira uses PKCE OAuth 3LO with fixed official API origin and validated cloudId. Zendesk host comes only from validated server-side subdomain config; tokens are owner-bound and encrypted. No live provider or PostgreSQL verification.
- Still unresolved: Productboard config-driven exact write schema; Freshdesk safe encrypted API-key/subdomain onboarding and two approved actions; Discord's Bot-token-only contract; Zulip's per-user realm/token with strict host pinning.
- Current 6 GiB typecheck is blocked by C45's in-progress `ChatRequestSecuritySchema` export, not connector code. Re-run after guard merge.

### Typecheck snapshot correction — 2026-11-11 00:22 IST
Connector agent reports the missing C45 `ChatRequestSecuritySchema` export is now present and a 6 GiB web typecheck passed on that intermediate staging snapshot. C45 route/client edits continued after that run and are not covered by it; a fresh typecheck is pending after those edits. Connector-focused status remains 7 files / 44 tests PASS. Do not call the current combined tree typechecked until the final post-edit run completes.

## AI app-builder schema checkpoint — 2026-11-11 00:28 IST

The staging workspace now has an additive `app_build` persistence model and migration `0080_void_agent_app_builder.sql` (journal idx81), plus a repository and initial runner/generator. `pnpm --filter web db:check` passes through 0080; this validates Drizzle metadata only and does not apply SQL to PostgreSQL. API/UI, lifecycle tests, owner-thread DB constraint review, sandbox cleanup and full feature verification remain unfinished. Do not count C43 complete or promote this partial vertical slice.

## Connector status update — 2026-11-11 00:32 IST

- Latest connector focused suite: 9 files / 51 tests PASS, including Freshdesk API-key profile and exact approval-gated ticket creation/reply. Mocked approval writes cover Gmail send/reply, Drive create, Teams send, Asana task, ClickUp task, Linear issue, Jira comment, Zendesk comment, Freshdesk ticket/reply (11 actions). No live credentials/provider/PostgreSQL.
- Productboard is being adapted to official v2 hierarchy/config: explicit Component parent selection and workspace-field validation. Discord Bot token and Zulip realm/API token remain unresolved contracts.
- Current shared typecheck fails only at the app-builder `route.test.ts` missing `afterAll` import; C45 export/wiring has cleared the prior error. Re-run after that fix and current C45 changes.
- App builder 0080 remains incomplete; A01/C45 tests and full aggregate checks/build remain pending. No promotion.

## 2026-11-11 00:37 IST — app builder implementation progress

The staging app now has a standalone build create/detail UI and APIs, owner-scoped persistence (migration 0080), bounded plan generation and E2B runner, cancellation/cleanup path, and tests (2 files / 11 tests passed). Database schema enforces owner/thread relation, active-build cap and sandbox uniqueness. The build tool is currently not registered in chat; route integration is being coordinated with the C45 owner. Resume/cleanup edge tests and combined typecheck/db:check/Biome are still pending. No real PostgreSQL, E2B credentials, or browser E2E.

## Independent migration status audit — 2026-11-11 01:05 IST

This current status supersedes earlier claims of 60% overall completion. That figure is overstated as an overall claim. Estimated implementation is 58%, verified functional behavior 31%, weighted overall about 44% (reasonable range 38–50%).

### Repositories and workspace

- Original custom source: Ayushprtp/zip-main at aa9fce0f545afb18b9a191724be092887f83630b; read-only remote and local Git object were accessible. Feature parity is not exhaustively audited.
- Upstream: keinsaasforever/better-chatbot at 6f4183566bc48616303cb84055f11f79578c82fe; upstream main matched this SHA.
- Destination: ibrahimkhan008/Void Agent, main 589fa48f3c323d049e51d566f3b8ddff95d59bc5, matching origin/main; 61 dirty/untracked entries must be preserved.
- Staging: C:/Users/Ikra/Desktop/Void Agent-integration-staging, no Git metadata, not promoted.

### Comparison findings

- Staging has all 1,768 upstream tracked paths: 1,609 exact contents, 159 different contents, zero missing. All 159 differences need semantic explanation.
- zip-main has 1,213 tracked src/ files. Mechanical path mapping to staging apps/web/src: 28 identical, 622 different, 563 unmatched. This does not prove those unmatched paths are lost, but equivalence is unresolved.
- Bug Bounty is confirmed absent in staging.
- Original App Builder agent/VibeSDK modes are absent; staging implements a static-only substitute.
- B20 browser/VM egress isolation is blocked; arbitrary browser execution remains disabled.
- Staging .env exists; its contents were not read and must never be copied or documented. apps/Void Agent-desktop is a temporary duplicate requiring explicit handling.
- No staging promotion has occurred.

### Weighted calculation

Weights are assigned to functional areas by relative scope/risk and sum to 100. For each area, implementation and verification are scored separately. Earned points = weight × average of those two scores. Documentation/file presence alone earns no completion credit. Focused mocked tests earn partial verification; full credit requires relevant end-to-end evidence. The estimate is provisional because semantic equivalence across differently structured paths is incomplete.

| Feature area | Weight | Status | Implementation | Verified | Earned points |
|---|---:|---|---:|---:|---:|
| Pinned upstream app | 10 | IMPLEMENTED BUT NOT FULLY VERIFIED | 65% | 15% | 4.00 |
| Original auth/admin/branding/security | 9 | PARTIALLY IMPLEMENTED | 50% | 25% | 3.38 |
| Providers/model catalog | 5 | PARTIALLY IMPLEMENTED | 50% | 30% | 2.00 |
| Billing/payments | 3 | PARTIALLY IMPLEMENTED | 60% | 30% | 1.35 |
| A01 chat lifecycle | 8 | PARTIALLY IMPLEMENTED | 70% | 35% | 4.20 |
| Desktop | 4 | IMPLEMENTED BUT NOT FULLY VERIFIED | 85% | 55% | 2.80 |
| Collections/knowledge | 5 | IMPLEMENTED BUT NOT FULLY VERIFIED | 80% | 50% | 3.25 |
| eCanvas | 2 | IMPLEMENTED BUT NOT FULLY VERIFIED | 80% | 50% | 1.30 |
| Community | 4 | IMPLEMENTED BUT NOT FULLY VERIFIED | 85% | 45% | 2.60 |
| Archives | 3 | IMPLEMENTED BUT NOT FULLY VERIFIED | 85% | 45% | 1.95 |
| Thread Insights | 3 | IMPLEMENTED BUT NOT FULLY VERIFIED | 80% | 40% | 1.80 |
| C45 security challenge | 4 | IMPLEMENTED BUT NOT FULLY VERIFIED | 90% | 60% | 3.00 |
| Direct connectors | 5 | PARTIALLY IMPLEMENTED | 65% | 45% | 2.75 |
| C38 Composio approvals | 3 | IMPLEMENTED BUT NOT FULLY VERIFIED | 80% | 50% | 1.95 |
| App Builder | 4 | PARTIALLY IMPLEMENTED | 75% | 45% | 2.40 |
| Bug Bounty | 3 | NOT IMPLEMENTED | 0% | 0% | 0.00 |
| Scheduler | 3 | PARTIALLY IMPLEMENTED | 50% | 25% | 1.13 |
| Voice/devices/realtime | 4 | PARTIALLY IMPLEMENTED | 50% | 30% | 1.60 |
| MCP and B20 isolation | 4 | BLOCKED | 45% | 20% | 1.30 |
| Other custom APIs | 4 | PARTIALLY IMPLEMENTED | 45% | 20% | 1.30 |
| Combined validation and promotion | 10 | NOT IMPLEMENTED | 0% | 0% | 0.00 |
| **Total** | **100** |  | **57.6%** | **30.5%** | **44.05 / 100** |

### Evidence and verification boundaries

- App Builder: helper-agent report after its changes says 5 files / 25 tests, 6 GiB typecheck, db:check and scoped Biome passed. No live PostgreSQL/E2B/provider/browser run. Its source agent/VibeSDK modes were omitted. The tool is wired through tool-loading; no sidebar link was found in inspected paths.
- C45: helper-agent reports 6 files / 35 focused tests and 6 GiB typecheck. No live shared-cache/DB/browser verification.
- Connectors: helper-agent reports 12 files / 60 tests and scoped Biome. Productboard and Zulip remain open; Discord Bot-token workflow unresolved. No live provider verification.
- Desktop: earlier report says 20 files / 124 tests, typecheck, build and scoped Biome passed; not rerun on combined staging.
- Community 5 files / 13 tests; Archive 4 files / 11; Insights 4 files / 11; Collections 7 files / 34; eCanvas 9 files / 26 are prior agent-reported focused results. No current live DB/storage/provider/browser validation.
- The auditor did not rerun tests, typecheck, lint, builds, database checks or migrations. db:check reports are metadata validation only. The audited host has no PostgreSQL service, process or listener.

### Audit exception

A previously active helper agent modified 21 staging App Builder files during the read-only audit. These changes were not reverted. The helper did not modify destination or upstream. Review the changes before relying on or promoting them.

### Next work, in order

1. Inspect/validate the 21 App Builder changes and source-mode omissions.
2. Explain all 159 upstream content differences.
3. Finish semantic comparison of original custom features; port missing security/admin/provider/payment/API workflows.
4. Implement Bug Bounty and restore/replace original App Builder modes.
5. Resolve Productboard/Zulip and safely disposition Discord.
6. Keep B20 disabled until browser and VM egress isolation is enforceable and adversarially verified.
7. Run combined web/desktop tests, typecheck, lint, db metadata check, production builds and security tests.
8. Prepare recoverable backup/non-destructive promotion; preserve 61 destination changes; exclude staging .env and handle duplicate desktop.
9. Promote only after validation, then validate the actual destination.

No commit, push, deploy or production migration is authorized.

## 15. Controller session update — 2026-11-11 05:15 IST

Implementation session completing handoff items 1-5 from Section "Next work, in order". Detailed evidence is appended to docs/feature-work-register.md; per-file dispositions in docs/upstream-diff-classification.md and docs/zip-main-*.md.

| Item | Result (controller-verified) |
|---|---|
| C45 chat security | COMPLETE at unit level: pkh binding fix + AES envelope port; 12 files/70 tests PASS |
| C44 Bug Bounty | PORTED: 6 files/56 tests PASS; migration 0081 metadata-checked only |
| C43 App Builder | COMPLETE at unit level: 8 files/67 tests PASS; agent/static modes; vibesdk=503 documented |
| C42 connectors | Productboard+Zulip implemented, Discord excluded: 25 files/112 tests PASS (mocked) |
| Upstream 159 diffs | Classified + repaired: 0 unresolved; 2 missing-upstream restored; 5 accidental fixed |
| zip-main parity | 483 paths dispositioned; ~25 files ported incl. admin console core + legal routes |
| Staging typechecks | Exit 0 at each batch boundary (6 GiB heap) |
| Destination backup | Created + restorability verified (58/58 dirty entries, byte-identical) |

Still outstanding before promotion: WP7 full-suite green (rerunning after 2 compile fixes), desktop duplicate resolution, destination post-promotion validation. B20 remains disabled/MISSING. No PostgreSQL on host: all DB evidence is metadata-only.

## 16. Promotion complete — 2026-11-11 06:20 IST

The staged integration was promoted into the destination after all gates passed. The destination is now the single monorepo (upstream `better-chatbot@6f41835` shape + all ported custom functionality): `apps/web` (Next.js app), `apps/desktop` (Electron, canonical merged tree), `packages/*`, `servers/*`, `e2b/*`, plus primary-owned extras (`context.md`, migration docs, void-agentai specs, A01 Playwright assets, env files).

Gates at promotion time:
1. zip-main parity: 1,213 original src paths mapped (304 identical, 366 same-path-different, 129 moved, 414 unmatched) and every family dispositioned with evidence in `docs/zip-main-parity-map.md` + three triage docs — ported or excluded with written technical justification. Documented omissions are NOT claimed as preserved functionality; see the exclusion lists.
2. Upstream reconciliation: 159/159 differing files classified, 0 unresolved; 2 missing-upstream items restored (Azure branch), 5 accidental differences repaired (locale mojibake, package.json serialization, snapshot bytes).
3. Migration safety: staging chain 0000–0081 structurally inspected (naming/FK/conventions/collisions); nothing applied to any database (none available; none authorized).
4. Full validation green in staging AND in the promoted destination (see `docs/testing-report.md` controller section: 498 files / 3,361 tests, typecheck, lint, db:check, build, desktop 132 tests — all PASS).
5. Backup: `Void Agent-backup-20261111/` (verified restorable) + superseded-old-tree relocation for recoverability.
6. B20 browser execution: still MISSING and fail-closed/disabled.

Final destination git state: HEAD `8b7b128` (uncommitted working tree on top; matches `origin/main`), ~2,580 uncommitted deletions (old-tree relocation), ~81 modified, ~88 untracked additions. Nothing committed, pushed, deployed, or migrated.

Remaining work (all documented with follow-up specs in the triage/register docs): runtime consumption of stored models/tools/canvas/artifacts site_config sections; admin console secondary pages (branding/email/oauth/mcp/chat/community, audit/health/problem-reports, dashboard stats); model-display metadata + team member AI budget admin; landing/marketing redesign + /plans; scheduler chat tool (migration spec written); agent_view + team tables (migration specs written); 28 zip-main connector providers (per-provider justifications; 10 gated on a `/token-connect` onboarding route); memory auto-extraction (chat `onFinish` hook + model-key decision); locale translator pass on en-fallback values; production env for C45 (REDIS/Upstash + origin allowlist) and Productboard OAuth.
