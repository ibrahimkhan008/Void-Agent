# Third-party attribution

Reference: https://github.com/keinsaasforever/better-chatbot at 2868c331a760de75f03748e660649cb1d909b4f6; MIT, see reference LICENSE. Existing Void-Agent LICENSE and upstream notices must be preserved. Record each adapted implementation here. Initial auth redirect behavior is independently implemented from reviewed reference behavior; no directory copy and no added dependency. Dependencies retain their individual licenses; this is not a full transitive-license audit.

AssemblyAI live dictation was adapted from behavior and protocol configuration present in the MIT-licensed Better Chatbot reference (repository URL and revision recorded above). Void-Agent's token endpoint, permission/rate checks, audio lifecycle, and composer integration are independently implemented; the reference license notice is retained here.

Project-brain queued extraction continues to use the existing Void-Agent scheduler, PostgreSQL/Drizzle stack, and AI SDK model provider. This batch introduced no third-party dependency.

The Google Calendar review-card and approval-token workflow is an original adaptation in Void-Agent over its existing Google Calendar connector and Better Auth verification store. It adds no copied dependency or external library.

## Project-brain ingestion trigger attribution
The ingestion trigger and queue integration were implemented against Void-Agent's existing collection/RAG and project-brain systems; no Better Chatbot source files were copied. No third-party dependency or schema migration was added in this follow-up.

## Linear approval implementation attribution
The Linear review and approval flow is implemented in Void-Agent using the repository's existing HITL cards, authentication, rate limiting, and verification table. No reference code or third-party package was introduced.

## Slack posting approval attribution
Slack write approval was implemented within Void-Agent's connector and HITL systems. The provider API and `chat:write` OAuth scope are existing dependencies; no reference source or new package was introduced.

## Structured project-brain extraction attribution
The extraction schema and adaptation were independently implemented in Void-Agent against its existing project/fact/graph model, informed by the reference behavior. No reference source files were copied and no external package was added.

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

## Adapted Better Chatbot file-ingestion readers (F018, 2026-11-06)
The following reader/parser files were adapted from the Better Chatbot reference under its MIT license (copyright notice: better-chatbot, 2025). The reference repository's MIT license permits modification and redistribution subject to retaining its copyright and permission notice; retain the source license notice with redistributed copies and include the full license in the distribution's license bundle.
- `src/lib/file-ingest/docx.ts`, `docx-html.ts`, `ooxml.ts`, `pptx.ts`, `xlsx.ts`, `xlsx-preview-limits.ts`, `text.ts` and their reader tests.
- The OOXML validation and Void-Agent chat/storage integration around these readers were independently added/adapted in Void-Agent.
Third-party runtime dependencies added in this batch: `exceljs` and `fast-xml-parser` (see lockfile/package manifest for resolved versions and transitive notices). Existing `mammoth`, `jszip`, and `unpdf` dependencies were reused.
