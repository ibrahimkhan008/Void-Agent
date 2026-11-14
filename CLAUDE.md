# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**AGENTS.md is the canonical agent guidance for this repo** — workflows, provider patterns, admin-panel notes and the current-state handoff all live there. This file only carries the overview so a reader knows what they are in.

## Project Overview

**Void Agent** — a universal autonomous AI workspace built on the Better Chatbot upstream snapshot (`6f4183566bc48616303cb84055f11f79578c82fe`) as an independently branded product. Next.js monorepo (`apps/web` = the product, `apps/desktop` = Electron, `packages/*`, `servers/*`).

Headline capabilities: multi-model chat, autonomous agents, **Void Memory** (versioned project + user records with an agent-proposal approval flow, `/memory`), **Void Skills** (registry, search, recommendations, file/URL/ZIP import), **Void Deploy** (hosting dashboard), **Void Motion** (curated motion-graphics skill catalog + chat-native Veo video generation), browser automation through three swappable providers (Kernel cloud → self-hosted Steel → open-source `agent-browser` CLI), MCP servers and connectors, scheduled automations (Inngest), realtime voice, E2B code sandboxes, and the public marketing site (landing, pricing, docs, changelog at `/index`).

## Critical Workflow

Before making any code, config, or docs change:
1. Read `context.md` completely (repo root, gitignored) — prior decisions, constraints, recent diffs.
2. Do not edit files until `context.md` has been reviewed.
3. After every meaningful action batch, append a timestamped entry to `context.md`. Never delete or rewrite older entries.

## Build, Test, and Development

```bash
pnpm install
pnpm --filter web dev          # dev server on :3000 (Docker Desktop + the
                               # compose postgres must be running first)
pnpm --filter web test         # full unit suite (Vitest)
pnpm --filter web typecheck    # tsc --noEmit (run ALONE, never chained with commit)
pnpm --filter web build        # production build (NODE_OPTIONS=--max-old-space-size=8192 locally)

docker compose -f docker/compose.yml up -d postgres   # dev database
```

Production deployment is the Docker stack on a VPS — runbook: `DEPLOY-VPS.md` (compose file: `docker/compose.production.yml`). There is no systemd service and no Vercel target.

## Architecture Notes

- **App**: Next.js 15 App Router, React 19, TypeScript, Tailwind CSS v4 (tokens via `@theme inline` — never emitted as CSS vars), Drizzle ORM + PostgreSQL (pgvector), Better Auth (fully self-hosted).
- **AI**: AI SDK 6 streaming chat; model catalog + dynamic providers in `apps/web/src/lib/ai/models.ts`; capability-based auto-routing in `apps/web/src/lib/ai/routing/`.
- **Memory**: project records = brain pages with revision history (`lib/db/pg/repositories/project-records-repository.pg.ts`); user records + the agent proposal/approval flow (`lib/db/pg/repositories/user-records-repository.pg.ts`, tool `lib/ai/tools/memory-record.ts`, routes `/api/memory/*`).
- **Browser automation**: provider chain Kernel → Steel → agent-browser CLI behind `BrowserProvider` (`lib/ai/tools/browser/browser-automation-tool.ts`); the fail-closed gate is `lib/chat/browser-tool-gate.ts` (`BROWSER_EGRESS_ISOLATION_ENABLED`, org policy).
- **Sandbox**: E2B (`E2B_API_KEY`) for code execution + PDF rendering; custom templates built from `e2b/`.
- **Automations**: scheduled tasks run full agent loops via Inngest (`lib/scheduled-tasks/`); inbound webhooks/email/Slack receivers + signed outbound webhook delivery.
- **DB**: PostgreSQL Drizzle migrations under `apps/web/src/lib/db/migrations/pg`; applied automatically at container boot in production.
