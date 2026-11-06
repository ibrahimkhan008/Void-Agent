# Void-Agent architecture and baseline

Primary: `C:/Users/Ikra/Desktop/Void-Agent`; reference: sibling `Void-Agent-V2`.
The primary remains a single Next.js 15.5.19 / React 19 application on TypeScript,
AI SDK 5, pnpm 10, Tailwind/Radix, Zustand/SWR, Better Auth, Drizzle with node-postgres
and PostgreSQL/pgvector. Node engine currently declares >=18; actual compatibility
must be checked against dependencies. Runtime deployment remains systemd on port
4000; local development is port 3000. Do not introduce Docker deployment.

Reference: upstream 2.0 monorepo, Next.js 15.4.11, AI SDK 7, postgres.js,
workspace MCP packages and Electron. Its schema and message parts are not drop-in
replacements. V2 stays stopped and unchanged by this initiative.

Primary subsystem evidence: `src/app/api/chat`, `src/lib/ai/models.ts`,
`src/lib/ai/mcp`, `src/lib/ai/workflow`, `src/lib/ai/memory`, `src/lib/scheduler`,
`src/lib/db/pg/schema.pg.ts`, `src/lib/security`, `src/lib/auth`,
`src/components/canvas`, and `src/components/admin`.
Existing integrations include encrypted dynamic providers, local/RAG documents,
connectors, scheduler/outbox, teams, Dodo billing and sandbox/build jobs. Their
presence is source evidence; external credentials and every journey are not yet
validated in this audit. Keep the existing saved display-name provider contract.

Baseline working-copy changes predate this directive: OAuth cookie-prefix fixes,
middleware regression tests, credential ignore rule and legacy lockfile repair.
Preserve these changes. The source still contains historical Flare identifiers;
do not mass-rename provider IDs, environment variables or migration history.

## Conversation history loading

Chat thread pages fetch the newest 50 messages. Older messages are requested through an authenticated, ownership-checked server action and prepended by the client with scroll anchoring. The repository supports optional bounded keyset reads while keeping the no-options path unbounded for exports, insights, and existing API consumers.

## Human-in-the-loop decisions

The chat route conditionally provides no-execute tools for plan approval, bounded user questions, and editable email draft review. Dedicated chat cards return decisions through the existing AI SDK tool-result mechanism. These decisions guide model behavior and do not replace the connected tool's server-side authorization. User answers are persisted in chat history; the input workflow is explicitly not for secrets.

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
