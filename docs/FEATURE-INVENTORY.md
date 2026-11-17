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
| 3 | Void Memory — Persistent Context | ✅ DONE (BOUNDARIES.md file not in the shipped 9-record set) |
| 4 | Void Orchestrator | ✅ DONE (conflict resolution between worker outputs is implicit, not explicit) |
| 5 | Void Automations | ✅ DONE (Inngest-optional; systemd timers documented) |
| 6 | Void Hooks | 🟡 (JS/TS/Python user-script hooks not implemented — hooks trigger agents) |
| 7 | Void Studio — Creative Workspace | ✅ DONE (artifact version history is single-slot updated_at, not full revision history) |
| 8 | Void Canvas — Visual Editing | ✅ DONE (browser drill verified; model-plan edits need a provider key at use time) |
| 9 | Void Motion — Video/Motion | 🟡 (text-to-video ✓; image-to-video, timeline/keyframe editing UI not built — Motion ships as a 29-skill capability pack) |
| 10 | Void Visualizer | ✅ DONE (native charts + sanitized Mermaid incl. gantt) |
| 11 | Void Deploy | ✅ DONE (uptime monitor shipped; build/runtime logs intentionally N/A for static publishing; third-party hosting integrations not built) |
| 12 | Void Sentinel | ❌ NEVER STARTED |
| 13 | Void Cloud | ❌ NEVER STARTED |
| 14 | Void Devices | ❌ NEVER STARTED |
| 15 | Void Connect | ✅ DONE (25 first-party connectors live-exercise pending; Composio demoted to optional marketplace) |
| 16 | Void Skills | ✅ DONE (122 vendored skills / 8 packs + native engineering pack; GitHub-repo import works through the URL path) |
| 17 | Cross-platform capabilities | ✅ DONE |
| 18 | Software-development workflow | ✅ DONE (the orchestrator + audit pattern is in daily use) |
| 19 | Design principles | ✅ inherent in the shipped architecture |

**Organization UI gap (discovered 2026-11-18, not in the original list):**
the org backend is complete (Better Auth org plugin, roles, invitation
emails, one-org rule, activation resolution) but the management UI is
missing — org settings/invite tab, `/accept-invitation/{id}` accept page,
org switcher. Tracked as the top code-completable item in
`docs/PROGRESS.md`.

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
- 🟡 Structured memory files — the shipped 9-record set is MEMORY.md, TODO.md, DONT.md, RULES.md, STYLE.md, ARCHITECTURE.md, DECISIONS.md, SECURITY.md, DEPLOYMENT.md. **`BOUNDARIES.md` from this list is not in the shipped set.**
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

**Status: 🟡 — the agent-trigger pipeline is complete and drill-verified (GitHub payloads, idempotency, gates, chaining); user-authored JS/TS/Python hook scripts are not implemented (hooks execute agents, not arbitrary scripts).**

- ✅ Custom hooks; ✅ global hooks (owner-scoped endpoints); ✅ project-specific hooks (project-bound agents).
- ✅ Event-based execution; ✅ rule-based execution.
- ✅ Hooks that trigger agents (the entire pipeline).
- 🟡 Hooks that execute tools / launch workflows — indirectly: the triggered agent runs tools; direct tool-execution hooks are not a separate mechanism.
- ✅ Hooks that react to GitHub events (push/pull_request/issues — validated against GitHub-realistic payloads; commit-content rules work).
- 🟡 Hooks that react to project changes — partially (project-scoped endpoints exist; project-change events are not a distinct trigger source).
- 🟡 Hooks for agent/workflow/verification/deployment events — not a distinct event source today (agent events notify; they don't trigger hooks).
- 🟡 Hooks for memory updates — the agent can propose memory updates during a hook run; dedicated memory hooks are not separate.
- ✅ Hooks for schedules and external integrations (webhook/email/Slack inbound).
- ❌ JavaScript/TypeScript hook support — not implemented.
- ❌ Python hook support — not implemented.
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

**Status: 🟡 — text-to-video is live (chat-native Veo, MP4 lands in the thread) and the Motion capability pack (29 skills) drives motion-graphics authoring; the dedicated video-editing surface is not built.**

- ✅ Text-to-video generation (Veo).
- ❌ Image-to-video generation — not a separate shipped action.
- ✅ AI-generated motion graphics (skill pack: kinetic typography, web animation, data animation, explainers, JS canvas films).
- 🟡 Storyboard/scene generation — skill-guided, not a dedicated storyboard tool.
- ✅ Cinematic video creation (prompt-controlled clip length/dimensions).
- ❌ Timeline-based editing, keyframe editing, motion/animation controls, video editing UI — not built.
- ✅ MP4 export (thread artifact); ✅ integration with other creative tools (exports into threads).
- ❌ Cloud-based rendering pipeline of our own — relies on the model provider's rendering.

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

## 14. Void Devices — Remote Device Management

**Status: ❌ NEVER STARTED** (the voice-device pairing module is unrelated hardware pairing).

- ❌ Connect workstations/servers/devices, remote terminal, remote files, authorized commands, connection management, status monitoring, agent tasks on devices, device permissions — zero code.

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
2. ❌ **Void Cloud** and **Void Devices** — missing.
3. ❌ **Write-capable swarms** — general N-worker write fan-out.
4. 🟡 **Hooks as user scripts** (JS/TS/Python) — hooks currently trigger agents.
5. 🟡 **Motion editing surface** — video generation exists; timeline/keyframe editing does not.
6. 🟡 **BOUNDARIES.md** memory record — add one record to the shipped 9.
7. 🟡 **Artifact revision history** — full version history for artifacts (Deploy already has versioned history).
8. 🟡 **Org management UI** — backend complete; settings/invite/accept/switcher surfaces missing (top code-completable item).
9. 🔒 Live-provider drills (BYOK request, fallback provider drill, connector live OAuth, SMTP delivery) — blocked on operator credentials/accounts, not code.
