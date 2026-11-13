# Void Agent

Void Agent is an independently branded AI assistant built on the complete Better Chatbot upstream snapshot at commit [`6f4183566bc48616303cb84055f11f79578c82fe`](https://github.com/keinsaasforever/better-chatbot/commit/6f4183566bc48616303cb84055f11f79578c82fe), with Void Agent-specific integrations, UI, security controls, and database extensions layered on top.

The canonical upstream is [`keinsaasforever/better-chatbot`](https://github.com/keinsaasforever/better-chatbot). This repository is the customized destination. The upstream README is preserved at [docs/upstream/better-chatbot-readme.md](docs/upstream/better-chatbot-readme.md); upstream deployment links in that archived copy point to the source repository.

## Capabilities

The upstream application provides chat, model/provider support, MCP tools, workflows, projects and knowledge, file and multimodal input, and realtime voice. Void Agent adds its own integrations and safeguards, including custom provider administration, user-scoped public APIs and embeds, project-brain workflows, physical voice-device support, and approval-gated actions. Browser automation remains disabled unless enforceable runtime-level network isolation is configured.

## Development

Install the workspace dependencies and start the web app:

```sh
pnpm install
pnpm --filter web dev
```

Use `.env.example` and [the self-hosting guide](docs/self-hosting.md) for local configuration. Database schema changes are managed by the PostgreSQL Drizzle migrations under `apps/web/src/lib/db/migrations/pg`.

## Project notes

- Upstream snapshot: `6f4183566bc48616303cb84055f11f79578c82fe`.
- License and required upstream attribution are retained in [LICENSE](LICENSE).
- Local migration inventory and status are tracked in the `docs/` migration reports.
