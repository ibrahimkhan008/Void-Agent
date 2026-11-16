# docs/

Living documentation for Void Agent. Migration-era audit reports live in
[`archive/`](./archive/) — historical, superseded, kept for provenance.

## Current docs

| File | What it covers |
|---|---|
| `PROGRESS.md` | Feature progress: done / half-done / never-started across the master prompt's modules (verified 2026-11-17) |
| `architecture-overview.md` | The integrated monorepo architecture and baseline |
| `boot-diagnostics.md` | Temporary boot trace (redirects, reloads) |
| `chat-request-security.md` | Browser chat request security (C45 envelope guards) |
| `cockpit.md` | The `/cockpit` business flight-deck view |
| `e2b-skills.md` | The E2B template for Remotion + Next.js skills |
| `KNOWLEDGE_BASE_TOOL.md` | Knowledge Base search tool — LLM integration |
| `load-testing.md` | Dependency-free load test for the prompt-assembly hot path |
| `security-review.md` | Incremental security review (B20 status, C45/C38 evidence) |
| `self-hosting.md` | Upstream self-hosting guide (Vercel/Supabase origins) |
| `third-party-attribution.md` | Upstream attribution notes |
| `tool-widget-population.md` | Widget population from tools |
| `voice-agent-delegation.md` | Voice-driven agent delegation |
| `voice-web-search.md` | Voice web search |

## Product docs that live elsewhere

- Root: `README.md` (capabilities + pointers), `AGENTS.md` (agent guidance),
  `DEPLOY-VPS.md` (Docker production runbook), `CLAUDE.md` (agent overview).
- `deploy-vps-native.md` — the as-deployed native (no-Docker) production
  runbook for the live VPS (`app.voidagent.space`).
- Product changelog: the in-app `/index` hub (`apps/web/src/app/(public)/index/`).
- System skills convention: `apps/web/skills/README.md`.
