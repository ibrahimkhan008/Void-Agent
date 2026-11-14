# AGENTS.md

This file provides guidance for AI agents working in this repository.

## Critical Workflow

Before making any code, config, or docs change:
1. Read `context.md` completely — it contains prior decisions, constraints, and recent diffs.
2. Do not edit files until `context.md` has been reviewed.
3. After every meaningful action batch, append a new timestamped entry to `context.md` with request summary, actions, files edited, diff summary, and validation results. Never delete or rewrite older entries.

## Session Memory System

Two memory layers; neither lives in this repo:
- **`context.md`** (repo root, gitignored) is the in-repo working record — prior
  decisions, constraints and recent diffs. It is the authoritative continuity
  surface and is required reading before any change (see Critical Workflow).
- The coding agent's own persistent memory (project memory directory +
  `MEMORY.md` index) stores user preferences, feedback, product facts and
  reference pointers across sessions. Update it after meaningful sessions; it
  supplements `context.md`, never replaces it.

## Deployment

- **Production is LIVE on the VPS as a native (no-Docker) systemd stack**:
  `app.voidagent.space` (Cloudflare Tunnel `void-agent` → `127.0.0.1:3000`),
  apt-native PostgreSQL 16 + pgvector and Redis 7, Node 22 + pnpm 10,
  `void-agent.service` running `next start` from `/home/ubuntu/void-agent`.
  Env lives at `apps/web/.env.production` (600) with a root symlink; build
  with `NODE_OPTIONS=--max-old-space-size=8192`; migrate with
  `NODE_ENV=production pnpm db:migrate`; nightly `pg_dump` in
  `/home/ubuntu/backups` (14-day retention). As-deployed runbook:
  `docs/deploy-vps-native.md`. The Docker runbook (`DEPLOY-VPS.md`, compose
  file `docker/compose.production.yml`) remains the recipe for any other
  host; migrations there run at container boot, on the native host they are
  an explicit update step.
- Local dev: `pnpm --filter web dev` with the Postgres container from
  `docker compose -f docker/compose.yml up -d postgres` (Docker Desktop must
  be running; the dev server dies if the database is unreachable).

## Browser Automation Providers

One tool (`browserAutomation`), three swappable providers, chosen at bind
time in `apps/web/src/app/api/chat/route.ts`:

1. **Kernel** (cloud, metered) — when `KERNEL_API_KEY` is set. Live view,
   credential vault + profile cookie persistence, CAPTCHA solving, per-second
   browser billing. The only provider voice mode uses (it needs the live view).
2. **Steel** (self-hosted, free, Apache-2.0) — when `STEEL_BASE_URL` +
   `STEEL_EXECUTOR_URL` are set. One active session; live view at `/ui`;
   the model's Playwright code runs in the `steel-executor` sidecar (docker/
   steel-executor), never inside the app server. The app-side credential
   vault still applies (placeholder substitution is provider-agnostic);
   Kernel-style profile writeback does not. Steel's ports have no auth —
   keep them on the internal network.
3. **agent-browser CLI** (free, local) — Vercel Labs' open-source CLI
   (Apache-2.0), used when neither service is configured. One whitelisted
   CLI command per step (snapshot -> act on refs); no credential vault.

**B20 egress isolation (implemented 2026-11-15):** a provider binds ONLY when
its network-level egress boundary is configured — Kernel `KERNEL_EGRESS_MODE=managed`,
Steel `STEEL_EGRESS_PROXY_URL` (the `egress-proxy` compose service: DNS resolved
+ IP-pinned by the proxy, loopback/RFC1918/link-local/metadata denied at the
network layer, live-verified 13/13 incl. rebinding/redirects/subresources/
WebSockets), agent-browser `AGENT_BROWSER_EGRESS_PROXY_URL` (CLI proxy + the
`<-loopback>` bypass negation). `BROWSER_EGRESS_ISOLATION_ENABLED=true` remains
the operator master flag, and the org policy still gates per org. The provider
chain is isolated-first: an unisolated candidate is skipped and the gate names
the env to set. Gate: `apps/web/src/lib/chat/browser-tool-gate.ts`; capability:
`apps/web/src/lib/browser-egress/capability.ts`.

## Admin Panel Patterns

### Model Selector
- `ModelSelector` and `FallbackModelSelector` in `src/components/admin/ui/model-selector.tsx` fetch from three endpoints in parallel: `/api/chat/models`, `/api/admin/providers`, `/api/admin/config`.
- They read the enabled/disabled state of providers from the admin config and filter disabled providers' models from the dropdown.
- Model names are stored as UI display names (e.g., "Claude Opus 4.6"), NOT API IDs (e.g., "voidagent/claude-opus-4.6").

### Dynamic Provider CRUD
- `GET /api/admin/providers` — list dynamic providers from `site_config` DB table (key: "models", field: `dynamicProviders`).
- `POST /api/admin/providers` — add/update dynamic provider. Auto-generates slug from `name` if `id` not provided. Encrypts API key with `ENCRYPTION_MASTER_KEY` before storing.
- `DELETE /api/admin/providers?id=...` — remove dynamic provider.
- Encrypted keys are stored in `site_config` (key: "models") and mirrored to `site_config` (key: "tools") under `apiKeysSecrets[dyn_${slug}]`.

### Encryption
- API keys are encrypted with AES-256-GCM via `lib/security/encryption.ts`.
- `ENCRYPTION_MASTER_KEY` env var (32 chars) — set it in `.env.production`
  (Docker stack) or the app's env file locally.
- `isEncryptionAvailable()` checks if the key is configured before attempting encryption.

### Provider Test Connection
- `POST /api/admin/providers/test` tests provider connectivity.
- Static providers use hardcoded configs from env vars.
- Dynamic providers: reads `apiKey` from `site_config.models.dynamicProviders[${id}]`, tries to decrypt directly, falls back to `apiKeysSecrets[dyn_${id}]`.

### Model Name Format
- Admin stores model name as UI display string (e.g., "Claude Opus 4.6").
- Fallback model is stored as `"provider/model"` string (e.g., "groq/Llama 4 17b Scout").
- `updateProviderModel` in the admin models page handles both formats: string for defaultModel, `{ provider, model }` for fallbackModel.

## Model Catalog Notes (verified behavior, re-verified 2026-11-14)

- `models.ts` carries a single dynamic-provider definition; the historical
  duplicate block is long gone.
- `ModelSelector` provider filter uses lowercase ID matching. API returns provider names like "Void Agent" → transformed to "voidagent" via `.toLowerCase().replace(/\s+/g, "-")`. This matches the `providerId` prop used in admin cards.
- Dynamic provider models in the chat UI need to be registered via `registerDynamicProvider()` in `models.ts` at runtime — currently the models are fetched from discovery but the runtime model resolution may not include them unless the provider is added to `allModels`.
- `Void Agent`/`void-agent` duplicate: Both static `void-agent` provider and dynamic `void-agent` entry produce the same slug. Deduplication in `modelsInfo` prefers the static `void-agent` provider. Dynamic providers with the same slug as a static provider are filtered out to prevent duplicate model entries.

## Site Config DB Table Structure

The `site_config` table stores configuration under different `key` values:

| key field | Purpose | Sub-fields |
|-----------|---------|------------|
| `"models"` | Model/provider config | `providers[]`, `dynamicProviders{}`, `defaultModel`, `fallbackModel` |
| `"tools"` | Tool config | `apiKeysSecrets{}` (mirrored from dynamic provider keys), `enabledCategories[]` |
| `"canvas"` | Canvas config | `model` (model name string) |
| `"artifacts"` | Artifacts config | `model` (model name string) |
| `"general"` | General config | `featureFlags{}`, `theme`, etc. |

## Deduplication Logic in modelsInfo

`modelsInfo` deduplicates models using `deduplicateModels()` which:
1. Groups models by normalized `providerId` (lowercase, spaces to hyphens).
2. For each group with multiple entries, keeps the first entry with that `providerId`.
3. For the specific `void-agent`/`Void Agent` case: prefers the static `void-agent` provider (created directly in `models.ts`) over the dynamic `void-agent` entry (created via `createOpenAICompatibleModels` from `OPENAI_COMPATIBLE_DATA`).
4. This prevents the same model (e.g., "Claude Opus 4.6") from appearing twice with both "voidagent" and "Void Agent" provider IDs.

## Default Config Fallback Pattern

`buildDefaultModelsConfig()` returns:
```ts
{ providers: [], dynamicProviders: {}, defaultModel: undefined, fallbackModel: undefined }
```
This ensures that when no config exists in the DB, the merge `mergeWithDefaults(existing, buildDefaultModelsConfig())` has real arrays/objects to spread into, not undefined. The same pattern applies to canvas (`buildDefaultCanvasConfig()` returns `{ model: "GPT 5.5" }`) and artifacts (`buildDefaultArtifactsConfig()` returns `{ model: "gemini-2.5-flash-lite" }`).

## Environment Variables Reference

Key production vars in `.env.production` (see `docker/.env.production.example`):
- `ENCRYPTION_MASTER_KEY` — 32-char key for AES-256-GCM API key encryption
- `VOIDAGENT_API_KEY` / `KORE_API_KEY` — for Void Agent LLM provider
- `GROQ_API_KEY`, `GROQ_BASE_URL` — for Groq provider
- `ZAI_API_KEY`, `ZAI_BASE_URL` — for Z AI (GLM) provider
- `POSTGRES_URL` — database connection
- `BETTER_AUTH_SECRET` — auth session secret
- `NEXT_PUBLIC_BASE_URL` — public URL for OAuth callbacks
- `KERNEL_API_KEY` — optional; enables the Kernel cloud browser provider
- `STEEL_BASE_URL`, `STEEL_EXECUTOR_URL`, `STEEL_PUBLIC_BASE_URL` — optional;
  enable the free self-hosted Steel browser provider (see compose services)
- `AGENT_BROWSER_BIN` — optional; explicit path to the agent-browser CLI
  binary (auto-resolved from PATH otherwise)
- `E2B_API_KEY` — optional; enables the E2B code-sandbox tool + PDF rendering
- `GOOGLE_GENERATIVE_AI_API_KEY` — optional; enables chat-native video
  generation (Veo) and Gemini image generation

## Before Opening PR / Merging

1. `pnpm --filter web typecheck` — types must pass (run it ALONE; never chain
   typecheck+commit — the pre-commit hook runs biome, not tsc)
2. `pnpm --filter web test` — full unit suite must pass
3. `pnpm exec biome check` on the touched files — format + lint
4. Secret-scan the diff and verify the staged file list before committing
   (never `git add -A` — it once swept private files into a push)
5. Update `context.md` with a timestamped entry of all changes made
6. Verify `git ls-remote origin main` matches the pushed HEAD

## Current migration handoff

> **Supersession (2026-11-14):** the migration is long since complete and the
> repo is PUBLISHED — per-task commits and pushes to `origin/main` are the
> standing workflow (the "no commit, push, deploy" restriction below applied
> only to the migration-audit window). The pre-promotion backup referenced
> below was deleted by user decision ("published = no backup needed"). Do not
> modify upstream or zip-main sources; never read/copy staging .env. The
> browser-execution restriction is now provider-agnostic and fail-closed via
> `BROWSER_EGRESS_ISOLATION_ENABLED` (see Browser Automation Providers).

**Historical record (2026-11-11):** the migration was PROMOTED and validated — the destination is now the integrated monorepo (`apps/web` + `apps/desktop` + `packages/*`), with web 498 files/3,361 tests, desktop 22 files/132 tests, and typecheck/lint/db:check/build all PASS (docs/archive/testing-report.md, "Controller session" section; docs/archive/MIGRATION-STATUS-REPORT.md §16 has the remaining-work list). Status of record: docs/archive/MIGRATION-STATUS-REPORT.md; ordered history: docs/archive/migration-handoff.md; parity dispositions: docs/archive/zip-main-parity-map.md + docs/archive/zip-main-triage-{ai,ui,api}.md; upstream diff classifications: docs/archive/upstream-diff-classification.md. Verified-restorable backup incl. the pre-promotion working tree: C:\Users\Ikra\Desktop\Void Agent-backup-20261111. The earlier 44% weighted estimate is a historical 2026-11-11 01:05 audit value, superseded by the promotion. Standing restrictions unchanged: do not modify upstream or zip-main; no commit, push, deploy, or production migrations; never read/copy staging .env (staging is now a historical snapshot); keep browser execution disabled while B20 is blocked (B20 remains MISSING).
