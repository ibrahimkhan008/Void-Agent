# Void Agent

Void Agent is an independently branded AI assistant built on the complete Better Chatbot upstream snapshot at commit [`6f4183566bc48616303cb84055f11f79578c82fe`](https://github.com/keinsaasforever/better-chatbot/commit/6f4183566bc48616303cb84055f11f79578c82fe), with Void Agent-specific integrations, UI, security controls, and database extensions layered on top.

The canonical upstream is [`keinsaasforever/better-chatbot`](https://github.com/keinsaasforever/better-chatbot). This repository is the customized destination. The upstream README is preserved at [docs/upstream/better-chatbot-readme.md](docs/upstream/better-chatbot-readme.md); upstream deployment links in that archived copy point to the source repository.

## Capabilities

The upstream application provides chat, model/provider support, MCP tools, workflows, projects and knowledge, file and multimodal input, and realtime voice. Void Agent adds its own product surface, integrations and safeguards:

- **Void Memory** — structured, versioned records at two scopes: per-project records (MEMORY.md, TODO.md, RULES.md, ARCHITECTURE.md and friends) and user-level records (MEMORY, PERSONA, BEHAVIOR, SKILLS, PREFERENCES). Agents propose changes through a `propose-record` tool; nothing sticks until the user approves it in the Void Memory page (`/memory`). Every record carries full revision history, restores, and per-record retrieval tuning.
- **Void Skills** — the skills registry with search and project-aware recommendations, importable from files, URLs and ZIP archives (each skill = a folder with a `SKILL.md`), plus the curated Void Motion catalog.
- **Void Deploy** — publish generated pages to a hosting dashboard with live/offline status, view analytics, versions and revoke.
- **Void Motion / video** — chat-native text-to-video (Veo via the Gemini API) next to the curated motion-graphics skill packs.
- **Browser automation** — three swappable providers behind one tool: the Kernel cloud browser (live view, credential vault, CAPTCHA solving), self-hosted Steel (free, Apache-2.0, with an isolated executor sidecar so agent code never runs on the app server), and the open-source `agent-browser` CLI (free, local, snapshot→act loop). The egress-isolation gate keeps all of them fail-closed until runtime-level network isolation is explicitly enabled.
- Custom provider administration, user-scoped public APIs and embeds, project-brain workflows, physical voice-device support, approval-gated actions, and the public marketing site (landing, pricing, docs, changelog at `/index`).

The product changelog lives in the app at `/index` (posts in `apps/web/src/app/(public)/index/`).

## Development

Install the workspace dependencies and start the web app:

```sh
pnpm install
pnpm --filter web dev
```

Use `.env.example` (and the deployment notes in [DEPLOY-VPS.md](DEPLOY-VPS.md)) for configuration; the upstream self-hosting guide at [docs/self-hosting.md](docs/self-hosting.md) documents the upstream-origin integrations. Database schema changes are managed by the PostgreSQL Drizzle migrations under `apps/web/src/lib/db/migrations/pg`.

## Project notes

- Upstream snapshot: `6f4183566bc48616303cb84055f11f79578c82fe`.
- License and required upstream attribution are retained in [LICENSE](LICENSE).
- Production deployment is the Docker stack on a VPS — runbook: [DEPLOY-VPS.md](DEPLOY-VPS.md).
- Agent guidance (workflows, architecture notes, provider patterns) lives in [AGENTS.md](AGENTS.md).
