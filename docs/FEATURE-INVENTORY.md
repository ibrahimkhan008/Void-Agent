# Void Agent — Master Feature Inventory (cross-checked against implementation)

> **Source**: consolidated product feature list (the product master prompt's
> 16 named modules + cross-platform capabilities + the software-development
> workflow). Preserved as the PRD baseline.
>
> **Cross-check**: every module below carries a verified status banner —
> ✅ implemented and verified · 🟡 partially implemented (exact deltas listed)
> · ❌ never started — checked against `docs/PROGRESS.md` (the verified
> ledger, 2026-11-18) with evidence pointers.

## Scorecard

| # | Module | Status |
|---|--------|--------|
| 1 | Void Intelligence — Multi-Model AI | ✅ DONE (BYOK live request pending operator keys) |
| 2 | Void Agents — Autonomous AI Agents | ✅ DONE (browser automation enablement = operator env) |
| 3 | Void Memory — Persistent Context | ✅ DONE (10 versioned project records, including BOUNDARIES.md) |
| 4 | Void Orchestrator | ✅ DONE (controlled-model + isolated-PostgreSQL planner/dependency and quota drills; live model provider not exercised) |
| 5 | Void Automations | ✅ DONE (Inngest-optional; systemd timers documented) |
| 6 | Void Hooks | 🟡 (internal project/memory/agent/workflow events and script support implemented; live E2B and GitHub delivery remain unverified) |
| 7 | Void Studio — Creative Workspace | ✅ DONE (artifact version history is single-slot updated_at, not full revision history) |
| 8 | Void Canvas — Visual Editing | ✅ DONE (browser drill verified; model-plan edits need a provider key at use time) |
| 9 | Void Motion — Video/Motion | ✅ DONE (prompt-driven Veo video generation and motion-graphics skills; timeline/keyframe editing is outside the intended scope) |
| 10 | Void Visualizer | ✅ DONE (native charts + sanitized Mermaid incl. gantt) |
| 11 | Void Deploy | ✅ DONE (uptime monitor shipped; build/runtime logs intentionally N/A for static publishing; third-party hosting integrations not built) |
| 12 | Void Sentinel | ❌ NEVER STARTED |
| 13 | Void Cloud | ❌ NEVER STARTED |
| 14 | Void Devices | ❌ NEVER STARTED (managed per-user sandbox machines — web-based, no desktop daemon; substrate live via E2B) |
| 15 | Void Connect | ✅ DONE (25 first-party connectors live-exercise pending; Composio demoted to optional marketplace) |
| 16 | Void Skills | ✅ DONE (122 vendored skills / 8 packs + native engineering pack; GitHub-repo import works through the URL path) |
| 17 | Cross-platform capabilities | ✅ DONE |
| 18 | Software-development workflow | ✅ DONE (the orchestrator + audit pattern is in daily use) |
| 19 | Design principles | ✅ inherent in the shipped architecture |

**Organization UI (cross-cutting feature):**
`/organization/settings` lists members and pending invitations, sends
member/admin invitations, and exposes owner/admin-only invite management and
member removal (with self-removal disabled). Pending invitation links can be
copied for manual sharing when SMTP delivery is unavailable.
`/accept-invitation/{id}` keeps
the sign-in callback, supports acceptance/decline, and activates the joined
organization. The account menu exposes organization settings and the existing
workspace switcher. Loading/error states are surfaced and server-side Better
Auth permissions remain authoritative. Six local UI interaction tests cover
send/cancel invitation, member removal, accept/decline, workspace switching,
and surfaced switch failures; full web typecheck and full suite pass. No
browser-driven authenticated workspace flow or real invitation-email delivery
was run, so SMTP still requires operator credentials. See `docs/PROGRESS.md`
for the exact verification scope.

---

## 1. Void Intelligence — Multi-Model AI

**Status: ✅ DONE — multi-model gateway, routing tiers drill-verified against a real configured organization, fallback verified at three boundaries.**

- ✅ Multi-model AI gateway.
- ✅ Support for multiple AI providers: Google Gemini, OpenAI GPT, Anthropic Claude, other supported providers, custom AI providers and endpoints (OpenAI-compatible + admin-managed dynamic providers).
- ✅ / 🟡 Bring Your Own API Key (BYOK) — per-user keys for local/OpenAI-compatible endpoints are done; hosted-provider BYOK (10 providers via AI Gateway) is implemented + encrypted, but a live provider request and billing-attribution behavior still need operator keys.
- ✅ Switch models within an existing conversation without losing context (thread pinning).
- ✅ Automatic model selection and routing (capability-based, org-policy-gated).
- ✅ Manual model selection (org-policy validated, fallback-chain backed).
- ✅ Hybrid model routing (deterministic router + manual override).
- ✅ Provider fallback when a model or provider fails — verified at three boundaries: resolution-time chain walk, AI Gateway pre-output failover, and the pre-first-UI-chunk mid-stream retry.
- ✅ Provider-independent architecture.
- ✅ Model-specific capability selection.
- ✅ Different models for different tasks (task-fit profiles).
- ✅ Cost- and performance-aware model selection (Balanced / Lower cost / Faster tiers, drill-verified).
- ✅ Support for text, image, audio, and video model capabilities.

## 2. Void Agents — Autonomous AI Agents

**Status: ✅ DONE — sandbox execution live-verified against E2B with owned runtime images.**

- ✅ Autonomous agents that complete multi-step tasks (scheduled-task runner + hook runs).
- ✅ Specialist agents for different types of work (role-scoped toolsets: research / build / test).
- ✅ Multiple agents working together; ✅ parallel subagent execution (orchestrator stage-06 fan-out).
- ✅ Agent-to-agent task delegation (chaining + orchestrator handoffs).
- ✅ Agent planning and task decomposition (self-decomposition, dependsOn waves).
- ✅ Agents that can: research information (web search/content), browse websites (browser automation — B20 egress-isolated; enablement = operator env), inspect repositories (GitHub/GitLab tools), read and modify files (connector writes, HITL), write and execute code (E2B live-verified), run terminal commands, debug applications, create documents and artifacts, test software, analyze results.
- ✅ Isolated execution environments (owned E2B templates, fail-closed).
- ✅ Resumable agent tasks (resumable chat streams via Redis; orchestrator checkpoints drill-verified).
- ✅ Agent progress tracking (frames + run audit).
- ✅ Agent output and execution history.
- ✅ Agent-specific permissions and restrictions (role-scoped toolsets + org policy).
- ✅ Human approval for restricted actions (HITL connector actions, one-use owner-bound tokens).

## 3. Void Memory — Persistent Context

**Status: ✅ DONE — implemented and verified live (create → save → restore → propose → approve → audit).**

- ✅ Global user memory (5 user-level records: MEMORY, PERSONA, BEHAVIOR, SKILLS, PREFERENCES).
- ✅ Conversation memory; ✅ project-specific memory; ✅ task-specific context; ✅ persistent agent context.
- ✅ Store project requirements, constraints, decisions and development history.
- ✅ Store user preferences and working instructions.
- ✅ Memory retrieval across conversations and tasks (owner-scoped include/exclude per record).
- ✅ Project-level memory isolation.
- ✅ Memory versioning and updates (full revision history; restores append new revisions).
- ✅ Memory provenance and traceability (audit trail).
- ✅ Structured project memory — ten versioned records are seeded per project: MEMORY.md, TODO.md, DONT.md, BOUNDARIES.md, RULES.md, STYLE.md, ARCHITECTURE.md, DECISIONS.md, SECURITY.md, DEPLOYMENT.md. The `propose-record` tool accepts the canonical `records/boundaries` slug.
- ✅ Approval-controlled memory updates (propose-record tool → approval in /memory; rejections keep the audit trail).

## 4. Void Orchestrator — Multi-Agent Orchestration

**Status: ✅ DONE — crash/resume drill-verified end to end against real PostgreSQL with controlled models; verification gate live in the flow.**

- ✅ Convert user requests into structured plans (self-decomposition).
- ✅ Break complex work into tasks and subtasks; ✅ divide work into phases (waves).
- ✅ Identify task dependencies (dependsOn + topological waves).
- ✅ Define success criteria (verification criteria).
- ✅ Identify tasks that can run in parallel; ✅ assign tasks to specialist agents; ✅ coordinate multiple agents (role-scoped workers, ≤4, step budgets, 6-minute run clock).
- ✅ Track execution progress (frames: planning / worker-running / worker-done / verifying / verification / done).
- ✅ Manage task dependencies (prerequisite-failure skip + handoff summaries).
- ✅ Handle failed tasks and retries (one retry with the failure reason attached).
- ✅ Resume interrupted workflows (durable checkpoints, atomic claim, reuse of succeeded workers — drill-verified).
- ✅ Daily per-tier run quotas (free 2, voidagent-pro 15, max 50, enterprise
  200 per UTC day) are atomically reserved with checkpoint creation in the
  existing user-preferences JSON. Isolated PostgreSQL contention verifies the
  limit cannot be raced; resuming does not consume another run. No schema
  migration is required. Self-decomposition and dependency ordering pass a
  controlled-model isolated-PostgreSQL run; no live provider model was used.
- ✅ Integrate outputs from multiple agents (consolidated report).
- 🟡 Resolve conflicting results — integration merges summaries; explicit conflict resolution is not a separate mechanism.
- ✅ Maintain execution checkpoints.
- ✅ Run verification gates (repaired ≠ verified; VERDICT parsing).
- ✅ Generate consolidated completion reports; ✅ track completed, failed, blocked and unverified tasks (the report names failed workers and emits a Resume ID).

**Core workflow: `Plan → Delegate → Execute → Integrate → Verify → Deliver → Monitor` — implemented as the orchestrator's stage pipeline.**

## 5. Void Automations — Workflow Automation

**Status: ✅ DONE — Inngest-optional; systemd-timer driving documented for the VPS.**

- ✅ Scheduled automations (cron agent runs, per-user concurrency slots, browser-grant scoping).
- ✅ Event-triggered automations (Void Hooks).
- ✅ Recurring workflows (cron; secret-gated tick drivers).
- ✅ Custom automation rules (match rules incl. startsWith/endsWith/notContains/notEquals).
- ✅ Multi-step automated workflows; ✅ agent-powered automations.
- ✅ Project-specific automations; ✅ global automations.
- ✅ Durable task queues (webhook_event_outbox with claim/backoff).
- ✅ Automatic retries (attempts + max_attempts with terminal failure).
- ✅ Resumable automation execution (checkpoint claim; queued-run recovery).
- ✅ Automation history and logs (hook_run audit, delivery rows, capped build logs).
- ✅ Notifications and event handling.
- ✅ Conditional execution (rule gates recorded as skipped runs with reasons).
- ✅ Workflow chaining (cross-hook chaining ≤3 depth, deterministic idempotency keys).
- ✅ Custom automation triggers (webhook/email/Slack/GitHub inbound kinds).

## 6. Void Hooks — Event and Extension System

**Status: 🟡 — the agent-trigger pipeline is complete and drill-verified; optional user-authored JS/TS/Python script steps are implemented and covered by focused mocked tests. Live E2B execution was not run.**

- ✅ Custom hooks; ✅ global hooks (owner-scoped endpoints); ✅ project-specific hooks (project-bound agents).
- ✅ Event-based execution; ✅ rule-based execution.
- ✅ Hooks that trigger agents (the entire pipeline).
- ✅ Optional JavaScript, TypeScript, and Python script step before agent execution. Scripts receive the normalized event as `payload`; stdout/result output is capped at 12,000 characters and passed to the agent. Execution uses the account-owned `void-agent-code-interpreter` template, secured controller access, disabled outbound network, 30-second runtime timeout, 16,000-character source and 24,000-character payload limits, and unconditional sandbox cleanup. Hook creation and owner-scoped updates expose script configuration.
- 🟡 Hooks that execute tools / launch workflows — indirectly: the triggered agent runs tools; direct tool-execution hooks are not a separate mechanism.
- ✅ Hooks that react to GitHub events (push/pull_request/issues — validated against GitHub-realistic payloads; commit-content rules work).
- ✅ Internal project events: create/update/delete plus project record save/restore.
- ✅ Internal memory-record events: project and global user record changes.
- ✅ Successful agent-run and saved-workflow completion events; hook-origin
  agent runs suppress recursive completion triggers.
- 🟡 Verification: these events are owner-scoped, durable and idempotent; the
  isolated PostgreSQL pipeline verifies duplicate publication and dispatch.
  No live GitHub-server delivery was exercised.
- ✅ Hooks for schedules and external integrations (webhook/email/Slack inbound).
- 🟡 Live E2B script run — not verified; focused tests mock the sandbox boundary. One live attempt was rejected before sandbox creation due to an unsupported IPv6 deny CIDR. The corrected network-disabled request was not retried because E2B's current security guidance requests prior written consent before further testing.
- ✅ Webhook-based triggers.
- ✅ Scoped permissions (owner-owns-agent, owner-scoped tokens).
- ✅ Execution timeouts (run clock); ✅ rate limits (cooldown + daily cap).
- ✅ Duplicate-event protection; ✅ idempotency (UNIQUE event_id + deterministic chain keys).
- ✅ Loop prevention.
- ✅ Hook execution logs and audit records.

## 7. Void Studio — AI Creative Workspace

**Status: ✅ DONE — documents, presentations, spreadsheets, design, editing; export matrix verified; smoke-opened in real Office via COM.**

- ✅ AI-powered document / presentation / spreadsheet creation (bounded Office exports + tool-driven tables).
- ✅ Graphic design, visual asset creation, vector asset creation (SVG export stays editable).
- 🟡 Custom design systems / bespoke visual styles — the design skill pack + canvas styling; no dedicated design-system editor.
- ✅ AI-assisted editing; ✅ direct editing of generated artifacts (Edit artifact mode, browser-verified).
- ✅ In-place content modification; ✅ editable design elements; ✅ editable text and images.
- ✅ Editable tables and charts (interactive tables; chart tools).
- 🟡 Layer-based editing — Excalidraw layering on canvas; artifact HTML edits are element-level.
- ✅ Chat-based artifact editing (Refine + Targeted edit with validated DOM-operation plans).
- ✅ Natural-language editing examples from this list ("make it darker"-style targeted edits + Refine).
- ✅ Export formats: PPTX, PDF, DOCX, XLSX (tool-invocation tables), CSV, HTML, SVG, PNG, ZIP. (Markdown export exists for chat/notes surfaces.)
- 🟡 Comments and revision history — element comments ✅; artifact version history is a single updated_at slot, not full revision history.
- ✅ Preserve the original editable structure when making changes.

## 8. Void Canvas — Visual Editing Environment

**Status: ✅ DONE — browser drill closed the last item (two live bugs found and fixed).**

- ✅ Interactive visual workspace; ✅ direct manipulation (Excalidraw canvas).
- ✅ Text editing, image editing and positioning, shape and element editing.
- 🟡 Layer management (Excalidraw-native; no dedicated layer panel).
- 🟡 Table and chart editing inside canvas — tables/charts live in the artifact HTML; canvas edits them as elements.
- ✅ Layout modification; ✅ live preview (sandboxed iframe); 🟡 undo/redo (Excalidraw-internal; artifact-level edits are saved snapshots).
- ✅ Chat-driven visual changes (Generate / Refine / Targeted edit).
- ✅ Preserve editability instead of flattening into images (Office exports keep frames; SVG stays vector).
- ✅ Per-element comments; ✅ owner-scoped durable storage (migration 0090, real-DB verified).

## 9. Void Motion — AI Video and Motion Creation

**Status: ✅ DONE for the intended prompt-driven creation workflow — chat-native Veo generates video from the user's prompt and returns an MP4 in the thread; the Motion capability pack (29 skills) supports motion-graphics authoring. This is a video-generation feature, not a timeline editor.**

- ✅ Text-to-video generation with prompt-controlled clip length/dimensions (Veo; MP4 thread artifact).
- ✅ AI-generated motion graphics (skill pack: kinetic typography, web animation, data animation, explainers, JS canvas films).
- Out of scope: timeline editing, keyframes, and a separate video-editing surface; users direct generation with prompts.
- ✅ Integration with other creative tools (exports into threads).
- Rendering is provided by the configured model provider; a separate rendering service is not required for this workflow.

## 10. Void Visualizer — Diagrams and Data Visualization

**Status: ✅ DONE.**

- ✅ Flowchart / workflow / architecture / system-design / sequence / process diagrams (sanitized Mermaid).
- ✅ Charts and graphs (native bar, line, pie + structured tables).
- ✅ Data visualization.
- ✅ Gantt charts and project timelines (Mermaid gantt support).
- 🟡 Dependency visualization (orchestrator waves are textual; agent-execution visualization is the run report + frames).
- 🟡 Automation workflow visualization — hook_run audit is tabular, not graphical.

## 11. Void Deploy — Deployment and Hosting

**Status: ✅ DONE — publishing pipeline, history, badges, analytics; monitoring is the seed Sentinel generalizes.**

- ✅ Deploy applications (static HTML publishing pipeline).
- ✅ Manage deployed websites; ✅ hosting dashboard.
- ✅ Deployment history (versioned rows per slug).
- ✅ Deployment status (live/offline).
- ❌ Build logs / runtime logs — intentionally N/A: Deploy publishes already-generated static HTML (no build or runtime process). Version history + publish/revoke timestamps are the audit trail.
- ✅ Application monitoring — published-page uptime monitor (the Sentinel seed).
- ✅ Visitor analytics; ✅ website traffic insights (view analytics per slug).
- ✅ Attribution badge controls (public badge.svg, owner toggle, rendered on the page).
- ✅ Deployment management (revoke, versions).
- ❌ Integration with supported hosting providers — publishes to Void Agent hosting only.

## 12. Void Sentinel — Autonomous Monitoring and Repair

**Status: ❌ NEVER STARTED — the published-page uptime monitor is the seed; Sentinel generalizes it with the repair loop.**

- ❌ Monitor deployed applications (beyond uptime) / detect errors / monitor logs / investigate with agents / propose fixes / modify code / run tests / verify / approval-controlled deployment / rollback — all four operating modes (monitor-only → autonomous-within-limits) are unimplemented.

## 13. Void Cloud — Infrastructure Management

**Status: ❌ NEVER STARTED.**

- ❌ Connect cloud infrastructure, manage VPS/dedicated servers, remote terminal, execute commands, Docker containers/Compose, remote files, services, deployments, server logs, infrastructure monitoring/diagnostics/automation — zero code.

## 14. Void Devices — Managed Sandbox Environments

**Status: ❌ NEVER STARTED as a distinct module — but the substrate is live: E2B sandboxes are already owned, persistent-capable (pause/resume, session persistence) and drill-verified. Void Devices is the USER-FACING layer on top: per-user sandbox machines.**

**Product reframing (user direction, 2026-11-18): Void Agent is web-based — there is no desktop daemon/exe model. Void Devices does NOT mean connecting the user's own PC. It means Void Agent PROVIDES the machines: each user gets their own persistent sandbox environment(s) — named, always-available Linux machines we provision — and the agent does their work inside them.**

- ❌ Devices page: create / pause / resume / delete / resize personal sandbox machines.
- ❌ Persistent state across sessions (files, installed tooling, running services survive between visits — today's sandboxes are task-scoped ephemeral).
- ❌ Agent tools bound to the user's device: terminal, file operations, code execution, service management inside THEIR machine.
- ❌ Device specs (size, template, timeout policy) per user/tier.
- ✅ Already exists beneath it: owned E2B templates (void-agent-web, void-agent-code-interpreter), authenticated controller, owner isolation, pause/auto-resume, deleted-sandbox rebuild — the App Builder lifecycle proved every primitive; Void Devices generalizes it from per-build to per-user.
- ❌ The voice-device pairing tables (migration 0025) are unrelated hardware pairing.

## 15. Void Connect — Integrations and MCP

**Status: ✅ DONE — 25 first-party connectors + MCP + skills; live OAuth/API exercise is operator-side (accounts get connected in the UI).**

- ✅ MCP server integration; ✅ custom MCP server connections (lazy connection architecture).
- ✅ External service integrations; ✅ connector management (25 first-party + Composio marketplace demoted to optional).
- ✅ Third-party API connections (user-scoped OAuth, bounded read/write tools, approval-gated writes).
- ✅ Connect external tools to agents; ✅ use connected services inside workflows.
- ✅ Project-aware integrations; ✅ permission-controlled tool access (HITL).
- 🟡 Google verification completed — connector scopes approved; live per-provider exercise still pending account connections.

## 16. Void Skills — Reusable Agent Capabilities

**Status: ✅ DONE — 122 vendored skills across 8 packs + the native engineering pack; import paths complete.**

- ✅ Import skills from files, ZIP archives, URLs (folder-per-skill convention).
- 🟡 Import skills from GitHub repositories — via the URL path; a dedicated GitHub-repo importer is not separate.
- ✅ Create custom skills; ✅ manage/organize installed skills; ✅ reuse across tasks.
- ✅ Project-specific skills; ✅ global skills; ✅ agent-specific skills.
- ✅ Skill recommendations based on project context (10-domain catalog).
- ✅ Offline install of built-in packs through /api/skills/built-in (motion MIT, pdf MIT, spreadsheets MIT, presentations MIT, documents MIT, visualize Apache-2.0, skill-creator MIT, design Apache-2.0) + the native engineering/pr-review skill.
- 🟡 Skill categories from this list (Cloudflare, Next.js, OWASP, PostgreSQL, Docker, performance, accessibility, SEO, Three.js) — not pre-seeded as a pack; any of them can be authored/imported via the existing paths.

## 17. Cross-Platform and System-Wide Capabilities

**Status: ✅ DONE.**

- ✅ Multi-agent collaboration; ✅ parallel execution; ✅ context preservation; ✅ project isolation.
- ✅ Human-in-the-loop approval gates (HITL connector actions, org gates, propose-record).
- ✅ Execution history; ✅ evidence-based reporting; ✅ independent verification.
- ✅ Retry and recovery (drill-verified); ✅ artifact management; ✅ tool integrations.
- ✅ Permission management (org policy, tool categories, scoped tokens, admin roles).
- ✅ Auditability (route audits, hook runs, delivery rows, memory audit trail).

## 18. Software Development Workflow

**Status: ✅ DONE — this is the operating pattern in daily use (the week's drills followed exactly this loop).**

- ✅ Analyze an entire repository; inspect architecture; extract feature requirements; create feature inventories.
- ✅ Divide features into batches; assign to independent audit agents; run audits in parallel; consolidate findings.
- ✅ Identify missing features, broken functionality, partial implementations (the ledger's tiers).
- ✅ Create repair tasks; implement; **independently verify each repair** (the drills).
- ✅ Run regression/integration tests; visual verification (browser drills); check migration completeness (db:check + isolated-PostgreSQL runs); verify Git commits; push completed changes.
- ✅ Maintain project TODO and progress trackers (docs/PROGRESS.md ledger + project records).
- ✅ Generate a final verification report.
- ✅ Status tracking: Completed / Repaired / Independently verified / Partial / Open / Excluded / Broken / Blocked / Unverified.
- ✅ **"Repaired ≠ verified"** — enforced as a hard rule (the orchestrator's verification gate + the ledger discipline).

## 19. Product-Wide Design and Experience Principles

**Status: ✅ inherent in the shipped architecture** — one unified workspace, multi-provider independence, persistent context, autonomous execution, orchestrated specialists, parallel execution, editable outputs, direct manipulation, extensible integrations/skills, user-controlled permissions, approval gates, transparent history, independent verification, evidence-backed reports, cross-domain operation.

---

## Net deltas from this vision (the honest remaining list)

1. ❌ **Void Sentinel** — the largest missing module.
2. ❌ **Void Cloud** and **Void Devices** — missing (Devices is web-native: per-user persistent sandbox machines layered on the live E2B substrate; Cloud is provider-API infrastructure management).
3. ✅ **Write-capable swarms (bounded artifact fan-out)** — up to four
   concurrent workers write isolated, capped text artifacts; prerequisite
   workers can hand files to dependent builders/verifiers; identical paths are
   deduplicated and conflicting writes are withheld; successful artifacts are
   included in the scoped checkpoint and downloadable from chat. Focused tests
   pass. This does not provide a shared E2B filesystem, mutate the user's
   repository, or execute generated source. Daily tier quotas (2/15/50/200)
   are now atomically enforced and tested against isolated PostgreSQL; the
   self-planner/dependency integration uses a controlled model rather than a
   live model provider.
4. 🟡 **Hooks as user scripts** — implementation and focused tests are complete; live E2B runtime verification remains outstanding pending E2B written consent. Internal project/memory/agent/workflow event triggers are implemented and isolated-PostgreSQL verified.
5. 🟡 **Artifact revision history** — full version history for artifacts (Deploy already has versioned history).
6. 🟡 **Org management UI** — implemented; six interaction flows, full web typecheck, and full suite pass. Authenticated browser E2E and real SMTP delivery remain unverified.
7. 🔒 Live-provider drills (BYOK request, fallback provider drill, connector live OAuth, SMTP delivery) — blocked on operator credentials/accounts, not code.
