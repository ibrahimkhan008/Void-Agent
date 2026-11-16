# Void Agent — Progress

> Last verified: **2026-11-17** — every claim below was grep-checked against
> `origin/main` (commit `2ac3d74` + subsequent skill-vendor commits) and
> live-verified where noted. Audit method: module-by-module code
> verification against the master prompt's §3.1–§3.12 capability list and
> the 15-module product structure. Refresh whenever a module ships or a
> gap closes.

---

## ✅ DONE — implemented, verified, shipped

### §3.3 Void Memory — persistent context
- **Project records**: 9 versioned documents per project (MEMORY.md, TODO.md,
  DONT.md, RULES.md, STYLE.md, ARCHITECTURE.md, DECISIONS.md, SECURITY.md,
  DEPLOYMENT.md) stored as brain pages, full revision history, restores
  append new revisions
- **Global user records**: 5 user-level documents (MEMORY, PERSONA, BEHAVIOR,
  SKILLS, PREFERENCES) applying across all projects, auto-seeded
- **Approval flow**: the agent files `propose-record` tool calls; nothing
  changes until the user approves in the Void Memory page (`/memory`) —
  non-matching events recorded as skipped with reasons
- **Per-record retrieval tuning**: include/exclude each record from the
  agent's context, owner-scoped toggles on both scopes
- Commits: `9b8c3d2`, `8fca707` · routes: `/api/memory/*`, `/memory`

### §3.12 Void Connect & Skills
- MCP servers + custom MCP servers (lazy connection architecture)
- Skills registry with search + skills.sh integration, review-before-import
- **Project-aware recommendations** (10-domain catalog: nextjs, cloudflare,
  security, postgresql, docker, performance, accessibility, seo, threejs, python)
- Import paths: files, URLs, **ZIP archives** (folder-per-skill convention),
  plus 122 **vendored built-in skills** across 8 packs (offline install)
- Commits: `2c8b3e9`, `98ec5b6`, `b6323f9`, `a8af4ec`

### §3.7 Motion
- Curated motion-graphics skill catalog (29 vendored skills, 6 packs)
- Chat-native Veo text-to-video: the prompt carries clip length/dimensions;
  the MP4 lands in the thread like an image
- Commits: `0caa872`, `5635705`

### §3.8 Visualizer
- Native chart tools: bar, line, pie + structured tables
- Sanitized Mermaid diagram rendering in chat

### §3.9 Deploy — full
- Publishing pipeline + hosting dashboard (`/dashboard/webhooks` deploy page)
- Live/offline status, view analytics, version numbers, revoke controls
- **Deployment history**: every publish is a versioned row, surfaced per slug
- **Attribution badges**: public `badge.svg` with live/offline dot, owner
  visibility toggle, embed snippet, **rendered on the published page itself**
- Commits: `8003435`, `d248ece`, `f4e9d6c`, `b2e7781`

### §3.5 Automations — Void Hooks + scheduled tasks
- **Scheduled tasks**: full agent runs on cron via Inngest, per-user
  concurrency, browser-grant scoping, failure notifications
- **Void Hooks**: inbound webhook/email/Slack events → agent execution with
  idempotency (UNIQUE event_id), loop prevention (cooldown + daily cap,
  each skip recorded), rule matching (field/op rules, AND semantics),
  secret-gated tick driver, run audit
- Commits: `1071f79`, `0f80748`, `4c03397`(partial), `4accd3f`, `342d786`

### B20 — egress isolation (security boundary)
- Filtering egress proxy: DNS resolved + IP-pinned by the proxy,
  loopback/RFC1918/CGNAT/link-local/metadata denied at the network layer;
  redirects, subresources and WebSockets covered by construction
- Per-provider capability: Kernel managed-mode, Steel proxyUrl,
  agent-browser proxy env; isolated-first provider chain
- Live-verified 13/13 against a real Steel session
- Commit: `64171ac`

### §3.2/3.4 Orchestrator — role-scoped parallel workers
- Stage 06 fan-out: 06A Research & Inspect / 06B Build & Modify / 06C Test &
  Analyze run concurrently as inner agents with role-scoped toolsets
- Verification gate (repaired ≠ verified): a 06C worker checks build outputs
  against criteria; VERDICT parsing into the tool output
- Single retry with failure reason; consolidated reports; bounded (≤4
  workers, step budgets, run clock)
- Commits: `fe17634`, `7d79853`, `9b9a0f5`, `2a8dfd6`

### §3.1 Fallback chains
- Admin-persisted per-provider chains + global chain consumed at resolution
  time on org-policy refusal; every entry re-validates through org policy
  (policy/pricing/retention apply to fallbacks); reasonCode: fallback_chain
- Commit: `4c03397`

### §3.6 Canvas — partial-complete
- Excalidraw workspace + AI generation + preview; exports
  **PNG / ZIP / XLSX / PDF / SVG** (SVG added `2ac3d74`)
- *(remaining canvas gaps listed under Half-done)*

### Platform core
- Multi-model chat (AI SDK 7), capability-based auto-routing, resumable
  streams (Redis), realtime voice, E2B code sandboxes (user key received),
  admin console (config/providers/payments/security/users), public marketing
  site, **production live on the VPS** (native systemd, migrations 88)

---

## 🟡 HALF DONE — exists, specific gaps remain

### §3.1 BYOK — bring your own keys
- **Done**: per-user keys for local/OpenAI-compatible endpoints; admin-managed
  dynamic providers with encrypted keys
- **Missing**: per-user keys for hosted providers (OpenAI/Anthropic/Google/…)
  — no user-provider-key table; a "BYOK" settings surface for hosted models

### §3.1 Routing depth
- **Done**: capability-based auto-routing, org policy gates, fallback-chain
  consumer at resolution time
- **Missing**: cost/latency-aware routing tiers; **mid-stream fallback retry**
  (the chain currently applies only at resolution, not when a stream fails
  mid-run)

### §3.2/3.4 Orchestrator depth
- **Done**: role-scoped parallel workers, verification gate, retry
- **Missing**: autonomous self-decomposition (the model currently supplies
  the worker split — the orchestrator does not yet generate its own plan);
  cross-worker dependency ordering; checkpoints

### §3.5 Hooks depth
- **Done**: webhook/email/Slack inbound, rule matching, idempotent
  execution, audit
- **Missing**: GitHub-event triggers (push/PR/issue → agent run);
  content-filter operators beyond contains/equals; cross-hook chaining

### §3.6 Canvas depth
- **Done**: workspace, AI generation, preview, 5 export formats
- **Missing**: PPTX/DOCX export routes; per-element comments; structural
  "edit slide 3" artifact editing (the AI regenerates rather than edits)

### §3.9 Deploy depth
- **Done**: publish/status/views/versions/revoke/history/badges
- **Missing**: distinct build/runtime log stream (static publishes have no
  build — needs a design decision); per-version diff view

### Connectors
- **Done**: 16 fully wired first-party (Gmail, Drive, Calendar, GitHub,
  Slack, Notion, Outlook, Teams, Jira, Linear, Asana, ClickUp, Freshdesk,
  Zendesk, Productboard, Zulip) with OAuth + scoped write approvals
- **Missing**: ~32 cataloged providers unwired (Discord, Twitter/X,
  Salesforce, HubSpot, Pipedrive, Apollo, Trello, Firecrawl, …)

### Notifications
- **Done**: in-app notifications + Web Push (VAPID)
- **Missing**: Telegram, Slack outbound, email sending (nodemailer installed,
  zero usages) — Sentinel channels, defer with Sentinel

### §3.10/3.11 prerequisites
- E2B sandbox key **received** (dev env set; production env pending)

---

## 🚨 REGRESSION — was blocking, now VERIFIED FIXED

**ai@7.0.18 tool-schema break — CLOSED 2026-11-17.** The SDK upgrade made
`asSchema` reject raw JSON-Schema tool inputs (`schema is not a function`)
and zod schemas with unconvertible constructs (`Error converting schema to
JSON` from `z.lazy` recursion). Two tools were incompatible; both fixed:
- `propose-record`: raw schema → `jsonSchema()` wrapper + explicit generics
- `proposeWorkflowRun`: recursive payload → `z.unknown()` model-facing; the
  deep validation stays server-side
- Found via temporary `prepareTools` instrumentation naming the offender
- **Verified live 2026-11-17**: a fresh probe chat passes `prepareTools`
  cleanly (no schema error — straight to the expected gateway refusal, which
  is the missing dev key, not the regression). No third offender exists.

---

## ❌ NEVER STARTED — zero code

### §3.10 Void Sentinel
The continuous monitoring module: watch deployed applications, detect
errors, investigate logs, create isolated repair environments, generate
fixes, run tests, request approval, deploy or roll back. Autonomy modes:
monitor-only / suggest / repair-with-approval / autonomous-within-limits.
Notification channels (Telegram, Slack, email) belong here.

### §3.11 Void Cloud & Devices
Authorized connections to user infrastructure: VPSs, dedicated servers,
workstations. Remote terminal, Docker management, file operations,
deployment, service management — least-privilege, scoped, explicit
authorization. Zero code; the voice-device auth module is unrelated
hardware pairing.

### Stage-06 write-capable swarms
The orchestrator's workers are role-scoped but the general
"spawn N workers with write access + consolidation" engine (wide-research
fan-out, divide-records-into-ranges) is unbuilt. The orchestrator tool is
the foundation; the quota fields in the docs (swarm launches/day 2/15/50/200)
still have no consuming code.

---

## 🖥️ Operator-side pending (not code)

| Item | State |
|---|---|
| VPS provider keys | Pending — via admin panel (chat in production unverified until then) |
| Browser runtime on the VPS | B20 code deployed; enablement = `BROWSER_EGRESS_ISOLATION_ENABLED=true` + one provider boundary env (Kernel key / Steel native units / agent-browser CLI) |
| `E2B_API_KEY` in production env | Received from the user for dev; production env pending |
| Kernel `managed` mode confirmation | SDK type bridge documented (value forwards verbatim); needs a live Kernel key to confirm |
| Google OAuth verification | User re-submits "I have fixed the issues" + console branding/Search Console |

---

## Recommended order

1. **Sentinel monitoring core** — the largest remaining module; notification
   channels (Telegram/Slack/email) belong here
2. **BYOK-hosted** — per-user keys for hosted providers
3. **Cloud/Devices** — remote infrastructure connections
4. **Canvas PPTX/DOCX exports** — completes the export matrix
5. **Connector wiring** — incremental, any number at a time
6. **Mid-stream fallback retry** — extends the resolution-time consumer

---

## Verification notes

- Suite: **493 files / 3,267 tests** green (the post-marketing-extraction
  baseline; the public-site tests moved to `apps/marketing` with their files)
- Built-in skills: **122 across 8 packs** verified via `/api/skills/built-in`
- Production: **live on the VPS** (`app.voidagent.space`, native systemd,
  migrations 88 applied); marketing at `voidagent.space`/`www`
- Every "done" claim above was grep-checked against `origin/main` and
  live-verified where the environment allowed
