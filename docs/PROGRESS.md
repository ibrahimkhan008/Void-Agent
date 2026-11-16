# Void Agent — Progress Ledger

> **Last verified: 2026-11-17** — every claim below was grep-checked against
> `origin/main` and live-verified where the environment allowed. This is the
> authoritative status document: what is done, what is half done, what is
> broken, and what has never been started. Refresh after every module ships
> or a gap closes.
>
> Tiers: **✅ DONE** (implemented + verified) · **🟡 HALF DONE** (exists,
> specific gaps) · **❌ NEVER STARTED** (zero code) · plus a regression
> section (currently closed) and the operator-side checklist.

---

## ✅ DONE — implemented and verified

### §3.3 Void Memory — persistent context ✅
**Implemented:**
- **Project records**: 9 versioned documents per project — MEMORY.md,
  TODO.md, DONT.md, RULES.md, STYLE.md, ARCHITECTURE.md, DECISIONS.md,
  SECURITY.md, DEPLOYMENT.md — stored as brain pages with full revision
  history; restores append the restored content as a NEW revision
- **Global user records**: 5 user-level documents — MEMORY, PERSONA,
  BEHAVIOR, SKILLS, PREFERENCES — applying across all projects, auto-seeded
  on first visit
- **Approval flow**: the agent files `propose-record` tool calls; nothing
  changes until the user approves in the Void Memory page (`/memory`).
  Rejections keep the audit trail. Non-matching proposals are recorded
  with reasons
- **Per-record retrieval tuning**: owner-scoped include/exclude per record
  from the agent's context, on both scopes
- **Verified live**: create → save (r2) → toggle → restore (r3) → propose →
  approve → audit trail → reject

**Files**: `lib/db/pg/repositories/{project,user}-records-repository.pg.ts`,
`lib/ai/tools/memory-record.ts`, `app/api/memory/*`,
`components/memory/memory-manager.tsx` · Commits: `9b8c3d2`, `8fca707`

### §3.12 Void Connect & Skills ✅
**Implemented:**
- MCP servers + custom MCP servers (lazy connection architecture)
- Skills registry: search (skills.sh integration), project-aware
  recommendations (10-domain catalog), review-before-import
- Import paths: **files, URLs, ZIP archives** (folder-per-skill convention),
  plus **122 vendored built-in skills across 8 packs** (offline install
  through `/api/skills/built-in`)
- Built-in packs: motion (29, MIT), pdf (2, MIT), spreadsheets (2, MIT),
  presentations (2, MIT), documents (2, MIT), visualize (1, Apache-2.0),
  skill-creator (1, MIT), design (83, Apache-2.0) — all Void-Agent-native
  (ZCode runner references adapted)
- **Connectors**: 16 first-party wired (Gmail, Drive, Calendar, GitHub,
  Slack, Notion, Outlook, Teams, Jira, Linear, Asana, ClickUp, Freshdesk,
  Zendesk, Productboard, Zulip) with OAuth + scoped write approvals

**Files**: `lib/skills/*`, `app/api/skills/*`, `app/skills/` (system home),
`lib/ai/tools/connectors/*` · Commits: `2c8b3e9`, `98ec5b6`, `b6323f9`,
`a8af4ec`

### §3.7 Void Motion ✅
- Curated motion-graphics catalog (29 skills, 6 packs — kinetic typography,
  web animation, data animation, explainers, JS canvas films)
- Chat-native Veo text-to-video: prompt carries clip length/dimensions,
  the MP4 lands in the thread
**Commits**: `0caa872`, `5635705`

### §3.8 Visualizer ✅
- Native chart tools (bar, line, pie, structured tables)
- Sanitized Mermaid rendering

### §3.9 Void Deploy ✅ (complete)
- Publishing pipeline + hosting dashboard
- Live/offline status, view analytics, version numbers, revoke controls
- **Deployment history**: every publish is a versioned row, surfaced per
  slug behind a History expander
- **Attribution badges with visibility controls**: public `badge.svg`
  (live/offline dot), owner toggle, embed snippet, **rendered on the
  published page itself** below the sandboxed iframe
**Commits**: `8003435`, `d248ece`, `f4e9d6c`, `b2e7781`

### §3.5 Automations ✅ (hooks + scheduled tasks; depth gaps below)
- **Scheduled tasks**: full agent runs on cron via Inngest, per-user
  concurrency slots, browser-grant scoping, failure notifications
- **Void Hooks**: inbound webhook/email/Slack events → agent execution
  - Idempotency: UNIQUE event_id — a re-claimed event never double-runs
  - Loop prevention: cooldown (60s default) + daily cap (20/day) + enabled
    gate; every skip recorded with its reason
  - **Rule matching**: field/op rules (source/from/subject/text ×
    contains/equals, AND semantics, ≤6 rules)
  - Secret-gated tick driver (`/api/hooks/tick`) + the Inngest outbox path
  - Run audit: status, thread, error, timings
**Commits**: `1071f79`, `0f80748`, `4accd3f`, `342d786`

### B20 — egress isolation ✅ (security boundary)
- Filtering egress proxy: DNS resolved + IP-pinned by the proxy,
  loopback/RFC1918/CGNAT/link-local/metadata denied at the network layer;
  redirects, subresources and WebSockets covered by construction
- Per-provider capability: Kernel managed-mode, Steel proxyUrl,
  agent-browser proxy env; isolated-first provider chain
- **Live-verified 13/13** against a real Steel session (rebinding,
  redirects, subresources, WebSockets, teardown)
**Commit**: `64171ac`

### §3.2/3.4 Orchestrator ✅ (worker fan-out; depth gaps below)
- Stage 06 fan-out: 06A Research & Inspect / 06B Build & Modify / 06C Test &
  Analyze run **concurrently** as inner agents with role-scoped toolsets
- **Verification gate** (repaired ≠ verified): a 06C worker checks build
  outputs against criteria; VERDICT parsed into the output
- Single retry with the failure reason; consolidated reports; bounded
  (≤4 workers, step budgets, 6-minute run clock)
**Commits**: `fe17634`, `7d79853`, `2a8dfd6`

### §3.1 Fallback chains ✅ (resolution-time; mid-stream gap below)
- Admin-persisted per-provider chains + global chain consumed at resolution
  time when the org policy refuses a model; every entry re-validates
  through org policy (pricing/retention apply to fallbacks);
  `reasonCode: fallback_chain`
**Commit**: `4c03397`

### §3.6 Canvas ✅ (exports complete except PPTX/DOCX)
- Excalidraw workspace + AI generation + preview panel
- Exports: **PNG / ZIP / XLSX / PDF / SVG** (SVG = still-editable vectors)
**Commit**: `2ac3d74`

### Platform core ✅
- Multi-model chat (AI SDK 7), capability-based auto-routing, resumable
  streams (Redis), realtime voice, E2B sandboxes, admin console
  (config/providers/payments/security/users), public marketing site
- **Production live on the VPS** (native systemd, `app.voidagent.space`,
  migrations 88 applied) + marketing at `voidagent.space`/`www`

---

## 🟡 HALF DONE — exists, exact gaps documented

### §3.1 BYOK — bring your own keys
- ✅ Per-user keys for local/OpenAI-compatible endpoints
- ❌ Per-user keys for **hosted providers** (OpenAI/Anthropic/Google/…) —
  no user-provider-key table; no BYOK settings surface for hosted models
- ❌ Cost/latency-aware routing tiers

### §3.1 Fallback chains — mid-stream retry
- ✅ Resolution-time consumption (org policy refusal → chain walk)
- ❌ **Mid-stream retry**: when a stream fails mid-run with a model error,
  the chain is not consulted (needs stream-failure detection + model swap
  without duplicating the saved message)

### §3.2/3.4 Orchestrator depth
- ✅ Role-scoped parallel workers with verification
- ❌ Autonomous **self-decomposition** (the model supplies the worker split;
  the orchestrator does not yet generate its own plan from the objective)
- ❌ Cross-worker dependency ordering (currently all lanes start together)
- ❌ Checkpoints between stages

### §3.5 Hooks depth
- ✅ Webhook/email/Slack inbound, rule matching, idempotent execution
- ❌ **GitHub-event triggers** (push/PR/issue → agent run)
- ❌ Content-filter operators beyond contains/equals
- ❌ Cross-hook chaining

### §3.6 Canvas depth
- ✅ Workspace, AI generation, preview, 5 export formats
- ❌ PPTX/DOCX export routes
- ❌ Per-element comments
- ❌ Structural artifact editing ("make slide 3 darker" edits the existing
  artifact instead of regenerating)

### §3.9 Deploy — logs
- ✅ History + badges complete
- ❌ Distinct build/runtime log stream (static publishes have no build step —
  needs a design decision on what to log)

### Connectors
- ✅ 16 first-party wired with OAuth + scoped approvals
- ❌ ~32 cataloged providers unwired (Discord, Twitter/X, Salesforce,
  HubSpot, Pipedrive, Apollo, Trello, Firecrawl, …)

### Notifications
- ✅ In-app + Web Push (VAPID)
- ❌ Telegram, Slack outbound, email sending (nodemailer installed, zero
  usages) — Sentinel channels, defer with Sentinel

---

## 🚨 REGRESSION — verified FIXED (2026-11-17)

**ai@7.0.18 tool-schema break — CLOSED.** The SDK upgrade made `asSchema`
reject raw JSON-Schema tool inputs and zod schemas with unconvertible
constructs, breaking **every tool-bound chat**. Two incompatible tools were
found and fixed:
- `propose-record`: raw schema → `jsonSchema()` wrapper + explicit generics
- `proposeWorkflowRun`: recursive `z.lazy` payload → `z.unknown()`
  model-facing (deep validation stays server-side)
- Found via temporary `prepareTools` instrumentation naming the offender
- **Verified live**: a fresh probe chat passes `prepareTools` cleanly (no
  schema error — straight to the expected gateway refusal, which is the
  missing dev gateway key, not the regression). No third offender exists.
- Commits: `c89b744`, `2a8dfd6`

---

## ❌ NEVER STARTED — zero code

### §3.10 Void Sentinel
The continuous monitoring module: watch deployed applications, detect
errors, investigate logs, create isolated repair environments, generate
fixes, run tests, request approval, deploy or roll back. Four autonomy
modes (monitor-only → autonomous-within-limits). Notification channels
(Telegram, Slack, email) belong here. The published-page uptime monitor
(shipped with Deploy depth) is the seed — Sentinel generalizes it to
arbitrary targets with the repair loop.

### §3.11 Void Cloud & Devices
Authorized connections to user infrastructure: VPSs, dedicated servers,
workstations, development machines. Remote terminal, Docker management,
file operations, deployment, service management — least-privilege, scoped,
explicit authorization. The voice-device auth module is unrelated hardware
pairing, not this.

### Write-capable swarms (Stage 06 generalization)
The orchestrator's workers are role-scoped but the general "spawn N workers
with write access + consolidation" engine (divide-records-into-ranges,
wide-research fan-out) is unbuilt. The quota fields in the docs
(swarm launches/day 2/15/50/200) still have no consuming code.

---

## 🖥️ Operator-side pending (not code)

| Item | State |
|---|---|
| VPS provider keys | Pending — via admin panel (chat in production unverified until then) |
| Browser runtime on the VPS | B20 code deployed; enablement = `BROWSER_EGRESS_ISOLATION_ENABLED=true` + one provider boundary env (Kernel key / Steel native units / agent-browser CLI) |
| `E2B_API_KEY` in production env | Received for dev; production env pending |
| Kernel `managed` mode confirmation | SDK type bridge documented (value forwards verbatim); needs a live Kernel key |
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
  migrations 88 applied) + marketing at `voidagent.space`/`www`
- Every "done" claim above was grep-checked against `origin/main` and
  live-verified where the environment allowed
- Known environment constraints for live agent-run verification: dev lacks
  an AI Gateway key (manual-model resolution fails closed) and the VPS
  provider keys are pending — these are key gaps, not code gaps
