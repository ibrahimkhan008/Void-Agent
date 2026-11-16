# Void Agent — Progress

> Last verified: **2026-11-17** — every claim below was grep-checked against
> `origin/main` (commit `2ac3d74`) and live-verified where noted. Audit
> method: module-by-module code verification, not documentation trust.
> Baseline reference: the master prompt's §3.1–§3.12 capability list and the
> 15-module product structure.

## ✅ Done — implemented, verified, shipped

| Module | What exists | Key commits |
|---|---|---|
| **§3.3 Void Memory** | 9 versioned project records + 5 global user records (MEMORY/PERSONA/BEHAVIOR/SKILLS/PREFERENCES), agent-proposal approval flow, per-record retrieval tuning, `/memory` page | `9b8c3d2`, `8fca707` |
| **§3.12 Connect & Skills** | Registry, search, project-aware recommendations, file/URL/ZIP import (each skill = a folder with SKILL.md), 29 vendored built-in Motion skills (offline install), MCP + custom MCP servers | `2c8b3e9`, `98ec5b6` |
| **§3.7 Motion** | Curated motion-graphics catalog + chat-native Veo text-to-video (MP4 lands in the thread) | `0caa872`, `5635705` |
| **§3.8 Visualizer** | Native chart tools (bar/line/pie/table) + sanitized Mermaid rendering | verified |
| **§3.9 Deploy** | Publishing, hosting dashboard, live/offline status, view analytics, versions, revoke, **deployment history + attribution badges with visibility controls** | `8003435`, `d248ece`, `f4e9d6c` |
| **§3.5 Automations** | Scheduled tasks (full agent runs on cron via Inngest), **Void Hooks**: inbound webhook/email/Slack → agent execution with idempotency, loop prevention (cooldown + daily cap), rule matching, run audit | `1071f79`, `0f80748`, `4accd3f` |
| **B20 egress isolation** | Filtering egress proxy (DNS resolved + IP-pinned, loopback/RFC1918/metadata denied at the network layer) + per-provider capability gate — live-verified 13/13 incl. rebinding/redirects/subresources/WebSockets | `64171ac` |
| **§3.2/3.4 Orchestrator** | Role-scoped parallel workers (06A Research / 06B Build / 06C Test), verification gate (repaired ≠ verified), single retry with failure reason, consolidated reports | `fe17634`→`2a8dfd6` |
| **§3.1 Fallback chains** | Admin-persisted per-provider chains + global chain consumed at resolution time on org-policy refusal | `4c03397` |
| **§3.6 Canvas** | Excalidraw workspace + AI generation + preview; exports PNG/ZIP/XLSX/PDF/**SVG** | `2ac3d74` |
| **Platform** | Multi-model routing, resumable streams, realtime voice, E2B sandboxes, admin console, public marketing site, production on the VPS (native systemd) | — |

## 🟡 Half done — exists, real gaps

| Module | Done | Missing |
|---|---|---|
| **§3.1 BYOK** | Per-user keys for local/OpenAI-compatible endpoints; capability-based auto-routing | Per-user keys for hosted providers (OpenAI/Anthropic/…); cost/latency routing tiers |
| **§3.2/3.4 depth** | Orchestrator shipped | Autonomous self-decomposition (the model currently supplies the worker split); agent-to-agent coordination |
| **Connectors** | ~16 wired first-party (Gmail, Drive, Calendar, GitHub, Slack, Notion, Outlook, Teams, Jira, Linear, Asana, ClickUp, Freshdesk, Zendesk, Productboard, Zulip) | ~32 cataloged providers unwired |
| **§3.6 Canvas depth** | Exports now PNG/ZIP/XLSX/PDF/SVG | PPTX/DOCX exports; per-element comments; structural artifact editing |
| **§3.9 Deploy logs** | History + badges shipped | Distinct build/runtime log stream (static publishes have no build — needs a design decision) |
| **Notifications** | In-app + Web Push (VAPID) | Telegram / Slack outbound / email sending (Sentinel channels — defer with Sentinel) |
| **§3.5 Hooks rules** | Endpoint-level rule matching shipped | GitHub-event triggers; cross-hook orchestration |

## 🚨 Regression — blocking

**`ai@7.0.18` tool-schema break.** The AI SDK upgrade introduced `asSchema`
rejections for tool inputSchemas that are raw JSON-Schema objects. Fixed so
far: `propose-record` (→ `jsonSchema()` wrapper + explicit generics) and
`proposeWorkflowRun` (recursive `z.lazy` payload → `z.unknown()` model-facing;
deep validation stays server-side). **One offender remains unfound** among the
default-bound tools — every tool-bound chat on main fails with
`schema is not a function` until it is fixed. Found via a temporary
`prepareTools` instrumentation in the ai@7 dist naming the failing tool.
This is the top-priority bug: it blocks normal chat and all agent features.

## ❌ Never started — zero code

| Module | Master-prompt spec |
|---|---|
| **§3.10 Void Sentinel** | Monitor deployed apps, detect errors, investigate logs, isolated repair environments, fix → test → approve → deploy/rollback, autonomy modes |
| **§3.11 Void Cloud & Devices** | Connect user VPSs/servers/workstations: remote terminal, Docker management, file operations, service management, least-privilege |
| **Write-capable swarms** | Stage 06 parallel workers with write access + consolidation (the orchestrator tool is the foundation; workers are currently read-scoped by design) |

## Operator-side (not code)

- VPS provider keys via the admin panel — chat in production is unverified until then
- Browser-runtime enablement on the VPS: `BROWSER_EGRESS_ISOLATION_ENABLED=true` + one provider boundary env (B20 code is deployed, fail-closed)
- `E2B_API_KEY` in the production env (provided for dev; production pending)
- Kernel `managed` mode needs live confirmation once a Kernel key exists (SDK type bridge documented; the value forwards verbatim)

## Recommended order

1. **ai@7 schema hunt** — unblocks the product's core (all tool-bound chats)
2. **Fallback mid-stream retry** — extend the resolution-time consumer to stream failures
3. **Sentinel monitoring core** — the last major zero-code module
4. **Cloud/Devices** — the other zero-code module
5. **Canvas PPTX/DOCX** — completes the export matrix
6. **Connector wiring** — incremental, any number at a time
