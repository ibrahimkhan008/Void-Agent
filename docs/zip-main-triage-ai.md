# zip-main -> staging semantic triage: AI / payments / sandbox families (WP6b-T1)

Generated: 2026-11-11 by WP6b-T1. Feeds the promotion gate defined in `zip-main-parity-map.md`.

- ORIGINAL: zip-main @ `aa9fce0f545afb18b9a191724be092887f83630b` (read via `git show` / `git archive`).
- DESTINATION (secondary reference): `Void-Agent` working tree `src/`.
- STAGING: `Void-Agent-integration-staging` @ working tree, web app rooted at `apps/web`.
- Scope: the 119 UNMATCHED parity-map paths in families `lib/ai` (96), `components/payments` (7), `lib/payments` (4), `lib/sandbox` (5), `lib/email` (3), `lib/validations` (3), `types` (1).

Dispositions: `EQUIVALENT-AT <staging path>` (staging already provides the capability), `PORTED-NOW` (ported into staging this pass), `EXCLUDED` (dead in the origin itself), or `EXCLUDED-FOR-NOW` (missing but not a small self-contained port; a concrete follow-up is stated). Every path lands in exactly one bucket.

## Summary

| Disposition | Count |
|---|---:|
| EQUIVALENT-AT | 17 |
| PORTED-NOW | 4 |
| EXCLUDED (dead in origin) | 7 |
| EXCLUDED-FOR-NOW | 91 |
| **Total** | **119** |

Note: zip's `src/lib/ai/image/generate-image.ts` is NOT in the unmatched set — WP6a matched it same-path against staging, whose version is a functional superset (chat + image APIs, model resolution, telemetry, billing).

Cross-family findings (for the controller):

1. **Staging memory UI calls a missing route.** `apps/web/src/components/user/user-detail/memory-settings-card.tsx` fetches `GET/POST /api/user/memory`, but staging has no `app/api/user/memory` route (the parity map flagged the same gap for zip's `src/app/api/user/memory/route.ts`, which belongs to the app/api/user family). The memory storage layer (repo + migration 0069 + prompt injection) is complete; the CRUD route is not. Owner: whichever WP holds `app/api/user/**`.
2. **Staging declares several destination-owned toolkits with empty buckets** (`AppDefaultToolkit.Memory/Scheduler/Video/Artifacts/Canvas/Automation/Build` in `lib/ai/tools/tool-kit.ts`) and binds them "by request-scoped loaders" that live in `app/api/chat/chat/tool-loading.ts` — a path frozen for WP6b (C45 owner). Any tool-factory port (memory tools, scheduler, video, artifacts, canvas) can only be completed by that loader; this is why several otherwise-portable factories below are EXCLUDED-FOR-NOW.
3. Staging's `packages/mcp-core` workspace package already carries the upstream Phase-3 versions of zip's `mcp-config-diff` and `mcp-tool-id` **including their tests** — three "unmatched" files resolve there rather than under `apps/web/src`.

## lib/ai (96 paths)

| zip-main path | disposition | evidence / staging path | justification |
|---|---|---|---|
| `src/lib/ai/agent/example.ts` | PORTED-NOW | `apps/web/src/lib/ai/agent/example.ts` (+ `example.test.ts`, wired into `components/agent/edit-agent.tsx`) | 113-line static starter-agent catalog (Data & Table Generator, Weather Checker); types are shape-compatible with staging `AgentCreateSchema`; mentions reference only staging `DefaultToolName` values (verified by test). |
| `src/lib/ai/codemode/create-codemode-tool.ts` | EXCLUDED-FOR-NOW | — | Executes model-authored JS via `new Function` in the main Node process (constructor escape, `CODEMODE_ENABLED` opt-in). Staging code execution is E2B-sandboxed (`lib/ai/tools/code/{js-run-tool,python-run-tool,server-code-tools}.ts`); reintroducing main-process eval contradicts the B20/B20-adjacent execution gate. Follow-up: none recommended; superseded. |
| `src/lib/ai/codemode/executor.ts` | EXCLUDED-FOR-NOW | — | Same main-process `NodeVMExecutor` as above; superseded by staging E2B code tools. |
| `src/lib/ai/composio.ts` | EQUIVALENT-AT | `apps/web/src/lib/composio/client.ts` | Staging wraps `@composio/core` with a lazy `VercelProvider` singleton (plus `scoped-tools`/`toolkit-connections`); zip's `createComposioSession` (raw MCP url/headers per user) is the older SDK surface staging replaced (C31/C38). |
| `src/lib/ai/harness.ts` | EXCLUDED-FOR-NOW | — | Assembles the runtime briefing from `lib/sandbox/{agents,client,templates}` — the excluded zip Build stack. Staging equivalents: `lib/ai/prompts.ts` (system-prompt assembly) + `lib/ai/app-build-runner.ts`. Follow-up: only meaningful if the zip Build stack is ever product-approved (C43). |
| `src/lib/ai/image/edit-image.ts` | EXCLUDED-FOR-NOW | — | Flare "nano-banana" edit flow with gateway polling (`api.flare-sh.tech`). Staging edit capability lives in `lib/ai/image/generate-image.ts` (`capabilities.edit`, mask inpainting via `normalize-masked-pair.ts` + FLUX Fill) on the Vercel AI Gateway (A25). Follow-up: porting would need a Flare image-edit credential/deployment decision. |
| `src/lib/ai/image/edit-image.test.ts` | EXCLUDED-FOR-NOW | — | Test of the excluded Flare edit flow. |
| `src/lib/ai/image/edit-models.ts` | EXCLUDED-FOR-NOW | — | Flare edit-model catalog; staging catalog is `lib/ai/image/image-models.ts` (Vercel AI Gateway, billing-linked). |
| `src/lib/ai/image/generate-flare-image.ts` | EXCLUDED-FOR-NOW | — | Flare Bifrost gateway generation + polling; staging `lib/ai/image/generate-image.ts` covers generation through the gateway with model resolution/telemetry/billing. |
| `src/lib/ai/image/generate-flare-image.test.ts` | EXCLUDED-FOR-NOW | — | Test of the excluded Flare generation flow. |
| `src/lib/ai/image/models.ts` | EXCLUDED-FOR-NOW | — | Flare-gateway image model ids (flux/dall-e-3/nano-banana sizes); staging `IMAGE_MODELS` is the gateway catalog with edit/mask capabilities. Follow-up: only if the Flare image gateway becomes a deployment provider. |
| `src/lib/ai/ingest/csv-ingest.ts` | EQUIVALENT-AT | `apps/web/src/lib/ai/ingest/readers/csv.ts` (+ `formats.ts` CSV format id) | Staging ingest pipeline covers CSV attachments (`index.test.ts` exercises `text/csv` end-to-end). |
| `src/lib/ai/ingest/csv-ingest.test.ts` | EQUIVALENT-AT | `apps/web/src/lib/ai/ingest/index.test.ts` | CSV coverage present in the staging ingest suite. |
| `src/lib/ai/ingest/konvo-vision-ingest.ts` | EXCLUDED-FOR-NOW | — | KonvO doc-digitization OCR (635 lines polling `api.konvo.ai` job API). No Konvo credentials/service in staging; staging covers scanned PDFs via `pdf-rasterize.ts`. Follow-up: needs KONVO endpoint/env + bounded job polling wired into `lib/ai/ingest`. |
| `src/lib/ai/ingest/konvo-vision-ingest.test.ts` | EXCLUDED-FOR-NOW | — | Test of the excluded KonvO OCR integration. |
| `src/lib/ai/ingest/pdf-ingest.ts` | EQUIVALENT-AT | `apps/web/src/lib/ai/ingest/readers/pdf.ts` + `pdf-rasterize.ts` | Staging does PDF text extraction plus visual-context rasterization (A22), which exceeds zip's text-only `unpdf` preview. |
| `src/lib/ai/mcp/mcp-config-diff.ts` | EQUIVALENT-AT | `packages/mcp-core/src/mcp-config-diff.ts` | Upstream Phase-3 monorepo move; `detectConfigChanges` identical purpose. |
| `src/lib/ai/mcp/mcp-config-diff.test.ts` | EQUIVALENT-AT | `packages/mcp-core/src/mcp-config-diff.test.ts` | Same test shipped in the workspace package. |
| `src/lib/ai/mcp/mcp-tool-id.test.ts` | EQUIVALENT-AT | `packages/mcp-core/src/mcp-tool-id.test.ts` | Staging `lib/ai/mcp/mcp-tool-id.ts` re-exports `@keinsaas/mcp-core/mcp-tool-id`; the test lives in the package. |
| `src/lib/ai/mcp/validate-mcp-server-config.ts` | EQUIVALENT-AT | `apps/web/src/app/api/mcp/route.ts` (McpPostSchema/McpPutSchema over `MCPRemoteConfigZodSchema`) | Staging validates remote configs with `url: z.string().url()` at create/update — same capability as zip's `new URL(config.url)` check. |
| `src/lib/ai/mcp/validate-mcp-server-config.test.ts` | EQUIVALENT-AT | `packages/mcp-types/src/mcp.ts` (`MCPRemoteConfigZodSchema`) | URL-format rejection is enforced by the schema the MCP routes run. |
| `src/lib/ai/memory/backfill.ts` | EXCLUDED-FOR-NOW | — | Pure backfill loop over the zip extraction pipeline; real consumer is `scripts/backfill-memories.ts` (not in src). Staging has storage (`user_memory` 0069 + repo) and prompt-time recall but no auto-extraction. Follow-up: needs extract-memories/embed re-targeted to staging models + a script/inngest runner. |
| `src/lib/ai/memory/backfill.test.ts` | EXCLUDED-FOR-NOW | — | Test of the excluded backfill loop. |
| `src/lib/ai/memory/embed.ts` | EQUIVALENT-AT | `apps/web/src/lib/ai/rag/embed-rag.ts` + `embedding-models.ts` | Staging embeds via `text-embedding-3-small` (1536-dim, matching `memory-helpers.EMBEDDING_DIMENSIONS`); zip's Flare-env embedding wrapper is deployment-specific. |
| `src/lib/ai/memory/extract-and-store.ts` | EXCLUDED-FOR-NOW | — | Orchestrator designed to be called fire-and-forget from the chat route's `onFinish` (restricted `app/api/chat/**`) and depends on the Flare-model extractor + Flare-env embeddings. Follow-up: re-wire model resolution to staging `customModelProvider` + call from the request-scoped finish hook. |
| `src/lib/ai/memory/extract-and-store.test.ts` | EXCLUDED-FOR-NOW | — | Test of the excluded orchestrator. |
| `src/lib/ai/memory/extract-memories.ts` | EXCLUDED-FOR-NOW | — | Pins `customModelProvider.getModel({ provider: "flare", model: "google/gemma-3-12b-it" })` — a destination-only registry key absent from staging `models.ts` (staging has no `flare` provider). Follow-up: re-resolve the cheap extraction model against staging's provider registry. |
| `src/lib/ai/memory/generate-json.ts` | EQUIVALENT-AT | `apps/web/src/lib/ai/resilient-object.ts` | `extractJsonObject` + `generateObjectResilient` implement the same tolerant fenced-JSON extraction + schema validation. |
| `src/lib/ai/memory/insights.ts` | EQUIVALENT-AT | `apps/web/src/lib/ai/thread-insights.ts` | Same summary/decisions/actionItems contract; staging adds source-count fingerprinting, resilient generation, and persistence (C41). |
| `src/lib/ai/memory/insights.test.ts` | EQUIVALENT-AT | `apps/web/src/lib/ai/thread-insights.test.ts` | Staging suite covers the same contract. |
| `src/lib/ai/memory/insights-backfill.ts` | EXCLUDED-FOR-NOW | — | Batch pre-population driven by zip's scheduler tick subsystem (excluded). Staging insights are on-demand with `insightsGeneratedAt`/source tracking columns — a different, stronger design. Follow-up: if bulk backfill is wanted, write an inngest function over `lib/ai/thread-insights.ts`. |
| `src/lib/ai/memory/insights-backfill.test.ts` | EXCLUDED-FOR-NOW | — | Test of the excluded backfill. |
| `src/lib/ai/memory/memory-source.ts` | EXCLUDED-FOR-NOW | — | Joins memory rows to source chat messages for UI previews; its consumer is the (missing in staging) `/api/user/memory` route — see cross-family finding 1. Follow-up: port together with the memory CRUD route (small: 109 lines, all deps exist). |
| `src/lib/ai/skills/index.ts` | EXCLUDED-FOR-NOW | — | Built-in `/schedule` skill resolution over user skills; depends on zip `lib/scheduler/jobs`. Staging skills are the upstream marketplace (`app/api/skills`, `skill-repository.pg.ts`, `lib/ai/tools/skill/load-skill.ts`). Follow-up: a built-in scheduling skill would target staging `app/api/scheduled-tasks` creation and chat mention wiring. |
| `src/lib/ai/skills/schedule.ts` | EXCLUDED-FOR-NOW | — | Calls `createScheduledJobForUser` from zip's `lib/scheduler/jobs` + `validateCron` — subsystem absent in staging (scheduled-tasks + inngest instead). |
| `src/lib/ai/skills/schedule.test.ts` | EXCLUDED-FOR-NOW | — | Test of the excluded /schedule skill. |
| `src/lib/ai/sort-providers.ts` | EXCLUDED-FOR-NOW | — | Pins the destination's in-house `flare` provider first; staging's registry has no `flare` provider and `app/api/chat/models/route.ts` already applies its own ordering (Navigator first, then key availability). Helper would be a no-op. |
| `src/lib/ai/speech/elevenlabs/use-voice-chat-elevenlabs.ts` | EXCLUDED-FOR-NOW | — | 522-line realtime voice client requiring `@elevenlabs/client` (not in staging deps; deps frozen) plus the kimi-elevenlabs session stack (destination B23). Follow-up: needs the dependency + session route + product approval. |
| `src/lib/ai/speech/konvo/use-voice-chat-konvo.ts` | EXCLUDED-FOR-NOW | — | 1,295-line Konvo realtime client (Groq/Konvo service, en-IN/hi-IN focus). No Konvo service in staging; staging voice = OpenAI realtime + `voice-gateway.server.ts`. |
| `src/lib/ai/speech/open-ai/openai-realtime-event.ts` | EQUIVALENT-AT | `apps/web/src/lib/ai/speech/open-ai/realtime-session-config.ts` (+ `voice-token-api.ts`) | Staging builds the realtime session config/token flow through the gateway transport rather than zip's direct `api.openai.com` session types. |
| `src/lib/ai/speech/providers.ts` | EXCLUDED-FOR-NOW | — | openai/konvo hook-switch map; the konvo side is absent in staging and staging resolves voice through its gateway stack. Follow-up: re-introduce only with a second voice provider. |
| `src/lib/ai/system-prompt.ts` | EXCLUDED-FOR-NOW | — | Named-section prompt registry consumed by the excluded `harness.ts`. Staging prompt assembly is `lib/ai/prompts.ts` (includes `buildUserSystemPromptWithMemory`). |
| `src/lib/ai/tools/artifacts/artifact-creator.ts` | EXCLUDED-FOR-NOW | — | LLM HTML-artifact tool reading `getRuntimeSiteConfig` (destination site-config layer) and pinned Flare models; staging declares `DefaultToolName.ArtifactCreation`/`AppDefaultToolkit.Artifacts` but binds destination groups via request-scoped loaders (cross-family finding 2) and renders artifacts via `components/artifact-panel`. Follow-up: re-target config read to `siteConfigRepository` + tool-loading binding + `tool-invocation/artifact-creator.tsx` card. |
| `src/lib/ai/tools/browser/browser-agent.ts` | EXCLUDED-FOR-NOW | — | Steel.dev self-hosted fleet agent + optional FlareCrawl gateway (public live-view URLs). B20 keeps browser execution fail-closed; staging's sanctioned path is `lib/ai/tools/browser/browser-automation-tool.ts` (@onkernel) behind `lib/ai/routing/browser-automation-gate`. Follow-up: none until an enforceable egress boundary exists (B20 conditions). |
| `src/lib/ai/tools/browser/cloak-browser.ts` | EXCLUDED-FOR-NOW | — | Local stealth-Chromium bridge on `127.0.0.1:3322` with a hardcoded default bridge token (`cloak-local-secret-9f2k`) — security-sensitive destination infra; B20-blocked. |
| `src/lib/ai/tools/browser/crawl-gateway.ts` | EXCLUDED-FOR-NOW | — | FlareCrawl gateway delegation (`CRAWL_BASE_URL`/`CRAWL_API_KEY`); B20-blocked, destination-only creds. |
| `src/lib/ai/tools/browser/steel-fleet.ts` | EXCLUDED-FOR-NOW | — | Self-hosted Steel container fleet allocator (`STEEL_HOST`/`STEEL_BASE_PORT`); destination infra, B20-blocked. |
| `src/lib/ai/tools/canvas/ecanvas-tool.ts` | EXCLUDED-FOR-NOW | — | Chat-side AI tool that drives `lib/ecanvas/content-store` with a pinned `flare/deepseek-v3.2` model. Staging has the full ecanvas stack (`lib/ecanvas/*` + `app/api/ecanvas/[canvasId]/generate` driven from the canvas panel). Follow-up: chat-tool entry needs model re-resolution + request-scoped binding (`AppDefaultToolkit.Canvas` is an empty bucket). |
| `src/lib/ai/tools/canvas/ppt-maker.ts` | EXCLUDED-FOR-NOW | — | Presentation/PPT tool on `getRuntimeSiteConfig` + Flare model pinning; staging has no presentation tooling (panel-side ecanvas only). Follow-up: needs site-config re-target + `tool-invocation/canvas-ppt-maker.tsx` + binding. |
| `src/lib/ai/tools/code-engine/executor.ts` | EXCLUDED-FOR-NOW | — | "Flare Code Engine": model writes one TS function calling all tools, executed via `new Function` in-process (`CODEMODE_ENABLED` opt-in). Superseded by staging E2B code tools; security posture conflicts with the staging execution gate. |
| `src/lib/ai/tools/code-engine/index.ts` | EXCLUDED-FOR-NOW | — | Same subsystem as above. |
| `src/lib/ai/tools/code-engine/normalize.ts` | EXCLUDED-FOR-NOW | — | Same subsystem as above. |
| `src/lib/ai/tools/code-engine/types-gen.ts` | EXCLUDED-FOR-NOW | — | Same subsystem as above. |
| `src/lib/ai/tools/connectors/airtable-tool.ts` | EXCLUDED-FOR-NOW | — | C42/WP4 ownership: staging connector registry (`lib/ai/tools/connectors/registry.ts`) carries 16 providers (asana, calendar, clickup, drive, freshdesk, github, gmail, jira, linear, notion, outlook, productboard, slack, teams, zendesk, zulip) with write-approval coverage; `DefaultToolName.Airtable` etc. are declared but unimplemented. WP4 is finished in `lib/ai/tools/connectors` and this task may not edit it. Follow-up: C42 catalog expansion (each provider = tool + registry entry + OAuth scopes). |
| `src/lib/ai/tools/connectors/axero-tool.ts` | EXCLUDED-FOR-NOW | — | Same C42/WP4 disposition as airtable-tool. |
| `src/lib/ai/tools/connectors/bitbucket-tool.ts` | EXCLUDED-FOR-NOW | — | Same C42/WP4 disposition. |
| `src/lib/ai/tools/connectors/bookstack-tool.ts` | EXCLUDED-FOR-NOW | — | Same C42/WP4 disposition. |
| `src/lib/ai/tools/connectors/canvas-lms-tool.ts` | EXCLUDED-FOR-NOW | — | Same C42/WP4 disposition. |
| `src/lib/ai/tools/connectors/coda-tool.ts` | EXCLUDED-FOR-NOW | — | Same C42/WP4 disposition. |
| `src/lib/ai/tools/connectors/confluence-tool.ts` | EXCLUDED-FOR-NOW | — | Same C42/WP4 disposition (note: `DefaultToolName.Confluence` is declared in staging). |
| `src/lib/ai/tools/connectors/discord-tool.ts` | EXCLUDED-FOR-NOW | — | Same C42/WP4 disposition. |
| `src/lib/ai/tools/connectors/discourse-tool.ts` | EXCLUDED-FOR-NOW | — | Same C42/WP4 disposition. |
| `src/lib/ai/tools/connectors/document360-tool.ts` | EXCLUDED-FOR-NOW | — | Same C42/WP4 disposition. |
| `src/lib/ai/tools/connectors/dropbox-tool.ts` | EXCLUDED-FOR-NOW | — | Same C42/WP4 disposition. |
| `src/lib/ai/tools/connectors/drupal-wiki-tool.ts` | EXCLUDED-FOR-NOW | — | Same C42/WP4 disposition. |
| `src/lib/ai/tools/connectors/egnyte-tool.ts` | EXCLUDED-FOR-NOW | — | Same C42/WP4 disposition. |
| `src/lib/ai/tools/connectors/fireflies-tool.ts` | EXCLUDED-FOR-NOW | — | Same C42/WP4 disposition. |
| `src/lib/ai/tools/connectors/gitbook-tool.ts` | EXCLUDED-FOR-NOW | — | Same C42/WP4 disposition. |
| `src/lib/ai/tools/connectors/gitlab-tool.ts` | EXCLUDED-FOR-NOW | — | Same C42/WP4 disposition. |
| `src/lib/ai/tools/connectors/gong-tool.ts` | EXCLUDED-FOR-NOW | — | Same C42/WP4 disposition. |
| `src/lib/ai/tools/connectors/guru-tool.ts` | EXCLUDED-FOR-NOW | — | Same C42/WP4 disposition. |
| `src/lib/ai/tools/connectors/highspot-tool.ts` | EXCLUDED-FOR-NOW | — | Same C42/WP4 disposition. |
| `src/lib/ai/tools/connectors/hubspot-tool.ts` | EXCLUDED-FOR-NOW | — | Same C42/WP4 disposition. |
| `src/lib/ai/tools/connectors/index.ts` | EXCLUDED-FOR-NOW | — | zip connector catalog index; staging equivalent is `lib/ai/tools/connectors/registry.ts` (WP4-owned). Merge catalog decision belongs to C42. |
| `src/lib/ai/tools/connectors/loopio-tool.ts` | EXCLUDED-FOR-NOW | — | Same C42/WP4 disposition. |
| `src/lib/ai/tools/connectors/mediawiki-tool.ts` | EXCLUDED-FOR-NOW | — | Same C42/WP4 disposition. |
| `src/lib/ai/tools/connectors/outline-tool.ts` | EXCLUDED-FOR-NOW | — | Same C42/WP4 disposition. |
| `src/lib/ai/tools/connectors/salesforce-tool.ts` | EXCLUDED-FOR-NOW | — | Same C42/WP4 disposition. |
| `src/lib/ai/tools/connectors/slab-tool.ts` | EXCLUDED-FOR-NOW | — | Same C42/WP4 disposition. |
| `src/lib/ai/tools/connectors/testrail-tool.ts` | EXCLUDED-FOR-NOW | — | Same C42/WP4 disposition. |
| `src/lib/ai/tools/connectors/wikipedia-tool.ts` | EXCLUDED-FOR-NOW | — | Same C42/WP4 disposition. |
| `src/lib/ai/tools/connectors/xenforo-tool.ts` | EXCLUDED-FOR-NOW | — | Same C42/WP4 disposition. |
| `src/lib/ai/tools/memory.ts` | PORTED-NOW | `apps/web/src/lib/ai/tools/memory.ts` (+ `memory.test.ts`) | 172-line user-scoped save/delete/search memory tool factory; names match staging's declared `DefaultToolName.SaveMemory/DeleteMemory/SearchMemory` and it calls the staging `memoryRepository` API directly. `computeSimilarity` exported for tests. Binding into chat is a follow-up (request-scoped loader in restricted `app/api/chat/chat/tool-loading.ts`). |
| `src/lib/ai/tools/sandbox/sandbox-tool.ts` | EXCLUDED-FOR-NOW | — | Depends on the excluded zip `lib/sandbox/{client,session,templates}` stack. Staging equivalent: `lib/ai/tools/code/e2b-sandbox-tool.ts` over `lib/e2b/sandbox-registry` (A26 artifact export preserved on staging side). |
| `src/lib/ai/tools/sanitize-tool-schemas.ts` | EXCLUDED-FOR-NOW | — | Tool-schema sanitizer whose consumers are the chat route/actions (restricted `app/api/chat/**`) and destination `composio-chat-tools.ts`. Staging handles tool schemas via `lib/json-schema-to-zod` + zod unions. Follow-up: re-port only if a staging consumer outside the frozen chat path needs it. |
| `src/lib/ai/tools/scheduler/scheduler-tool.ts` | EXCLUDED-FOR-NOW | — | AI tool over zip `schedulerRepository`/`lib/scheduler/jobs` — subsystem absent in staging (scheduled-tasks + inngest; `AppDefaultToolkit.Scheduler` is an empty bucket). Follow-up: re-target CRUD to staging scheduled-task repository + request-scoped binding. |
| `src/lib/ai/tools/video/video-generator.ts` | EXCLUDED-FOR-NOW | — | Calls the destination Flare video API (`api.flare-sh.tech/v1/videos/generations`, `VIDEO_GEN_API_URL`/`FLARE_API_KEY`). Staging has no video generation (`AppDefaultToolkit.Video` intentionally empty) and the render card (`components/tool-invocation/video-generator.tsx`) is another family. Follow-up: needs provider credential + UI + binding. |
| `src/lib/ai/tools/workflow.ts` | EXCLUDED-FOR-NOW | — | Windmill/Activepieces self-hosted automation tool (env-gated). Staging "workflow" means saved workflow graphs — different feature; external-automation product decision pending (C21-adjacent). Follow-up: product approval + request-scoped binding. |
| `src/lib/ai/workflow/examples/baby-research.ts` | EXCLUDED | — | Dead in the origin: `git grep extractNodeDependencySchema|workflow/examples` over zip-main `src/` finds no importer; staging has no examples entry point. |
| `src/lib/ai/workflow/examples/code-review.ts` | EXCLUDED | — | Same — no importer in zip-main src. |
| `src/lib/ai/workflow/examples/get-weather.ts` | EXCLUDED | — | Same — no importer in zip-main src. |
| `src/lib/ai/workflow/examples/index.ts` | EXCLUDED | — | Same — no importer in zip-main src. |
| `src/lib/ai/workflow/examples/summarize.ts` | EXCLUDED | — | Same — no importer in zip-main src. |
| `src/lib/ai/workflow/examples/translate.ts` | EXCLUDED | — | Same — no importer in zip-main src. |
| `src/lib/ai/workflow/executor/extract-node-dependency-schema.ts` | EXCLUDED | — | Dead in the origin: zero consumers across zip-main `src/` (verified with `git grep` at `aa9fce0`); staging resolves node schemas inline (`shared.workflow.ts`, `node-executor.ts`). |
| `src/lib/ai/workflow/executor/node-executor.test.ts` | EXCLUDED-FOR-NOW | — | Zip's test mocks zip-only modules (`exaSearchToolForWorkflow`, `youtubeSearchToolForWorkflow`, `youtube-transcript`, `mcpClientsManager`) while staging's `node-executor.ts` evolved (ephemeral MCP client, `public-http-request`, telemetry). Staging already covers the executor via `workflow-executor.test.ts`, `tool-node-executor.test.ts`, `execution-state.test.ts`. Follow-up: port test semantics per-node against staging's current module surface. |

## components/payments (7 paths)

| zip-main path | disposition | evidence / staging path | justification |
|---|---|---|---|
| `src/components/payments/comparison-table.tsx` | EXCLUDED-FOR-NOW | — | Destination `/plans` marketing UI family built on `lib/payments/pricing-features.ts`; staging has no `/plans` route (`app/(public)` = ecanvas/export/p) and its self-service billing is Dodo-only (`components/payments/dodo/dodo-billing-card.tsx` + `/api/payments/dodo/*`, register C18/C21). Follow-up: port the whole plans family (pricing-features + 5 components + `/plans` route) after a product decision. |
| `src/components/payments/dodo/dodo-upgrade-card.tsx` | EXCLUDED-FOR-NOW | — | UI redesign of the upgrade dialog; the workflow (tier list + checkout + portal) already exists at `apps/web/src/components/payments/dodo/dodo-billing-card.tsx` with route tests (C18). |
| `src/components/payments/dodo/upgrade-plan-button.tsx` | EXCLUDED-FOR-NOW | — | Header button wrapping the excluded dialog redesign; equivalent behavior via `dodo-billing-card.tsx`. |
| `src/components/payments/hero-orbital.tsx` | EXCLUDED-FOR-NOW | — | Decorative CSS hero for the excluded `/plans` page. |
| `src/components/payments/plan-card.tsx` | EXCLUDED-FOR-NOW | — | Consumed by the excluded plans page/dialog family (pricing-features metadata). |
| `src/components/payments/plans-faq.tsx` | EXCLUDED-FOR-NOW | — | Static FAQ for the excluded `/plans` page. |
| `src/components/payments/plans-page-content.tsx` | EXCLUDED-FOR-NOW | — | Orchestrates the excluded plans family; needs the `/plans` route + checkout wiring. |

## lib/payments (4 paths)

| zip-main path | disposition | evidence / staging path | justification |
|---|---|---|---|
| `src/lib/payments/dodo.get-subscription.test.ts` | EQUIVALENT-AT | `apps/web/src/lib/payments/dodo.ts#getDodoSubscription` + `apps/web/src/app/api/payments/dodo/reconcile/route.test.ts` | Staging ships `getDodoSubscription` with the same parse/status semantics; the reconcile route tests cover active/owner-matching/inactive behavior. |
| `src/lib/payments/dodo.test.ts` | EQUIVALENT-AT | `apps/web/src/lib/payments/dodo-webhook-signature.test.ts` + `dodo-config.test.ts` | Staging refactored zip's monolithic `dodo.ts` into `dodo-config.ts` + `dodo-webhook-signature.ts`, each with focused tests covering the same HMAC vectors, key rotation, tier mapping, and fail-closed cases. |
| `src/lib/payments/pricing-features.ts` | EXCLUDED-FOR-NOW | — | Per-tier marketing feature matrix consumed only by the excluded plans UI family; no `/plans` surface in staging. Follow-up: port with the plans family (see components/payments). |
| `src/lib/payments/stripe.test.ts` | EXCLUDED-FOR-NOW | — | Register C21 is OPTIONAL and staging billing is Dodo-only: no `stripe` package in staging `apps/web/package.json` (deps frozen). zip's `stripe.ts` itself survives as staging's read-only cockpit provider (`lib/cockpit/providers/stripe.ts` with `summarizeStripe` exported for tests). Follow-up: only if Stripe billing is product-approved (new dependency + webhook route). |

## lib/sandbox (5 paths)

| zip-main path | disposition | evidence / staging path | justification |
|---|---|---|---|
| `src/lib/sandbox/build-events.ts` | EXCLUDED-FOR-NOW | — | In-process SSE event bus for the zip Build feature. Staging's build pipeline (`lib/ai/app-build-runner.ts` + `app-build-repository.pg.ts` + `/api/build` routes) tracks build state via the repository, not a process-local bus. C43 owns the build-lifecycle gap. |
| `src/lib/sandbox/client.ts` | EXCLUDED-FOR-NOW | — | zip Build E2B client (leases, `listFlareTemplates`); staging equivalent is `lib/e2b/create-sandbox.ts` + `lib/e2b/sandbox-registry.ts`. |
| `src/lib/sandbox/inventory.ts` | EXCLUDED-FOR-NOW | — | Depends on the excluded `./client` + `./templates`; staging sandbox inventory = `sandbox-session-repository.pg.ts` + `lib/e2b/reap-sandboxes.ts`. |
| `src/lib/sandbox/templates.ts` | EXCLUDED-FOR-NOW | — | 816-line prebuilt E2B template catalog for zip Build; staging uses the `nextjs-developer` template + enabled preview registry (`lib/e2b/sandbox-registry.ts`). |
| `src/lib/sandbox/vibesdk.ts` | EXCLUDED-FOR-NOW | — | Requires the `@cf-vibesdk/sdk` package (absent from staging; adding deps is forbidden). Staging app-building is the native app-build-runner pipeline (C43). Follow-up: only if the vibesdk build engine is product-approved (new dependency + runtime review). |

## lib/email (3 paths)

| zip-main path | disposition | evidence / staging path | justification |
|---|---|---|---|
| `src/lib/email/admin-triggers.ts` | EXCLUDED-FOR-NOW | — | Bulk policy-change / ban-notification emails via `./resend` + `./templates`. Needs the `resend` package (absent from staging `package.json`; deps frozen) and is only meaningful with the sending layer. Follow-up: add `resend` dep + port resend/templates + decide an inngest-driven sender. |
| `src/lib/email/resend.ts` | EXCLUDED-FOR-NOW | — | Region-routed Resend client reading `lib/admin/site-config-reader` (destination site-config layer) + six region env keys. No `resend` dependency in staging. Follow-up: dependency + site-config email settings decision. |
| `src/lib/email/templates.ts` | EXCLUDED-FOR-NOW | — | HTML email templates consumed only by the excluded resend/admin-triggers layer. Staging's only email module is `lib/email/email-body-format.ts` (no sending workflow). |

## lib/validations (3 paths)

| zip-main path | disposition | evidence / staging path | justification |
|---|---|---|---|
| `src/lib/validations/payment.ts` | EQUIVALENT-AT | `apps/web/src/app/api/payments/dodo/checkout/route.ts` | Checkout tier validation is enforced by the route's `bodySchema` + `tier in PAID_TIER_DODO_PRODUCT_ID_ENV` check (same capability as `CreateDodoCheckoutSchema`). |
| `src/lib/validations/user-name.test.ts` | PORTED-NOW | `apps/web/src/lib/validations/user-name.test.ts` | Zip test ported + extended (control-char and 100-char cases); 6/6 passing. |
| `src/lib/validations/user-name.ts` | PORTED-NOW | `apps/web/src/lib/validations/user-name.ts`, wired into `app/api/user/validations.ts#UpdateUserDetailsSchema` | 25-line self-contained zod schema (blocks control chars, payload punctuation, repeated whitespace; trims). Wiring replaces the previous bare `min(1)/max(100)` name field; the existing staging `validations.test.ts` (25 tests) still passes. |

## types (1 path)

| zip-main path | disposition | evidence / staging path | justification |
|---|---|---|---|
| `src/types/admin-config.ts` | EXCLUDED-FOR-NOW | — | Type layer for the destination admin settings console (`SiteConfig` = models/tools/canvas/artifacts/general). Staging's admin config is the upstream-shaped `lib/db/pg/repositories/site-config-repository.pg.ts` (`SiteConfigSettings`) plus `types/admin.ts` (admin user list types) — a different subsystem (parity-map rows under `app/(chat)/(admin)`/`components/admin` own that decision). Follow-up: port together with the admin-console family if that product direction is approved. |

## Ports completed this pass

| Staging file (all under `C:\Users\Ikra\Desktop\Void-Agent-integration-staging\apps\web\`) | Origin | Notes |
|---|---|---|
| `src/lib/validations/user-name.ts` | zip-main `src/lib/validations/user-name.ts` | Verbatim port (zod-only dependency). |
| `src/lib/validations/user-name.test.ts` | zip-main test, extended | +2 cases (control char, max-length acceptance). |
| `src/lib/ai/tools/memory.ts` | zip-main `src/lib/ai/tools/memory.ts` | Adapted: `computeSimilarity` exported for tests; error typing `unknown`; doc note that binding is owned by request-scoped loaders. |
| `src/lib/ai/tools/memory.test.ts` | new (port validation) | Asserts tool names equal staging `DefaultToolName` values; exercises save/dedupe/delete/search/error paths against a mocked `memoryRepository`. |
| `src/lib/ai/agent/example.ts` | zip-main `src/lib/ai/agent/example.ts` | Verbatim data; imports re-pointed to staging `app-types/agent` + `lib/ai/tools`. |
| `src/lib/ai/agent/example.test.ts` | new (port validation) | Asserts mentions reference declared `DefaultToolName` values and the data satisfies `AgentCreateSchema` field shapes. |
| `src/app/api/user/validations.ts` (edited) | wiring | `UpdateUserDetailsSchema.name` now uses `userNameSchema` (stricter; length bounds unchanged). |
| `src/components/agent/edit-agent.tsx` (edited) | wiring | "Start from example" dropdown (new-agent mode) loading the two example prefills; testids `agent-create-with-example-button`, `agent-create-with-example-data-button`, `agent-create-with-example-weather-button`. |

### Test results

From `C:\Users\Ikra\Desktop\Void-Agent-integration-staging\apps\web`:

```
pnpm exec vitest run src/lib/ai/tools/memory.test.ts src/lib/ai/agent/example.test.ts src/lib/validations/user-name.test.ts src/app/api/user/validations.test.ts

 Test Files  4 passed (4)
      Tests  48 passed (48)
   - src/lib/validations/user-name.test.ts      6 tests
   - src/app/api/user/validations.test.ts      25 tests (pre-existing suite, re-run after schema wiring)
   - src/lib/ai/tools/memory.test.ts           11 tests
   - src/lib/ai/agent/example.test.ts           6 tests
```

No dependencies were added; no files were touched under `apps/web/src/lib/security/**`, `apps/web/src/app/api/chat/**`, connectors (`lib/connectors`, `lib/ai/tools/connectors`), bug-bounty files, app-builder files, `messages/*.json`, or `package.json`.
