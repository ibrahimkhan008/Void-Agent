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
- **Connectors**: 22 first-party wired (Gmail, Drive, Calendar, Docs, Sheets,
  Forms, Slides, Tasks, Keep, GitHub, Slack, Notion, Outlook, Teams, Jira, Linear, Asana,
  ClickUp, Freshdesk, Zendesk, Productboard, Zulip) with user-scoped OAuth
  and scoped write approvals. Docs/Sheets/Forms/Slides tools are bounded and
  read-only; Google Forms does not fetch response data.

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
- **Log scope decision**: Void Deploy publishes already-generated static HTML;
  it runs no build or persistent application process. Version history and
  publish/revoke timestamps are therefore the relevant deployment audit
  trail. Separate build/runtime logs are intentionally not applicable unless
  deploy later adds a build or server runtime.
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

### §3.6 Canvas ✅ (export formats)
- Excalidraw workspace + AI generation + preview panel
- Exports: **PNG / ZIP / XLSX / PDF / SVG / PPTX / DOCX** (SVG remains
  editable vector content; Office exports place each frame or the full
  canvas as a proportionally scaled image)
**Commit**: `2ac3d74`

### Platform core ✅
- Multi-model chat (AI SDK 7), capability-based auto-routing, resumable
  streams (Redis), realtime voice, E2B sandboxes, admin console
  (config/providers/payments/security/users), public marketing site
- **Production live on the VPS** (native systemd, `app.voidagent.space`,
  migrations 88 applied) + marketing at `voidagent.space`/`www`

---

## 🟡 HALF DONE — exists, exact gaps documented

### App Builder build diagnostics
- 🟡 Owner-scoped build lifecycle logs are now persisted (20,000-character
  cap), returned through the existing no-store detail endpoint, and shown
  live while the build is active. Entries cover generation, sandbox
  provisioning, source upload, readiness, completion, and safe failure text;
  raw prompts, credentials, generated source, and sandbox stdout are not
  copied into the log. Focused repository/runner/API tests and schema checks
  cover the behavior. Generated `app.js` is now parsed inside the E2B sandbox
  with Node's syntax-check mode before preview startup, including stored files
  on preview rebuild. Parser output is never persisted because it may include
  source text; invalid JavaScript fails the build with a safe diagnostic.
  This is lifecycle progress output, not a raw stdout
  stream; the E2B server process currently has no build command output to
  stream because previews serve generated static files. Migration 0092 is
  journaled but has not been applied to an isolated PostgreSQL database.
  The focused runner suite (18 tests), four earlier focused suites (38 tests),
  `db:check`, targeted Biome, and `git diff --check` pass. The 6 GiB web typecheck still reports three
  unresolved imports in pre-existing untracked public/legal files; it reports
  no errors in this App Builder slice.

### §3.1 BYOK — bring your own keys
- ✅ Per-user keys for local/OpenAI-compatible endpoints
- 🟡 Hosted-provider keys now have a user settings control under Customize →
  Instructions, AES-256-GCM encrypted storage in the user's private
  preferences, redacted status APIs, and request-scoped AI Gateway BYOK for
  supported providers (Alibaba, Anthropic, Cohere, DeepSeek, Google, Mistral,
  Moonshot, OpenAI, xAI, Z AI). Focused API/credential tests pass. There has
  been no live provider request. AI Gateway documents that failed BYOK
  credentials may retry with platform Gateway credentials; the UI discloses
  this. Existing app credit accounting also remains unchanged, so actual
  provider billing attribution still needs live verification before this is
  considered complete.
- 🟡 Automatic routing now supports user-selected Balanced, Lower cost, and
  Faster priorities under Customize → Instructions. Cost chooses the lowest
  sum of configured input and output token rates among eligible
  candidates no more than 8 task-fit points below the best candidate (equal
  one-million-token input/output units; this is a rate comparison, not a
  per-turn spend forecast). Faster uses the catalog's
  admin-maintained `fast`/`balanced`/`slow` tier within the same quality band;
  it is not a live latency measurement. Capability, retention, region,
  organization allowlist/price policy, and thread pinning remain hard gates.
  Route unit tests cover quality tradeoffs; live org routing has not been
  verified. Keep PARTIAL until an isolated configured org verifies each tier.

### §3.1 Fallback chains — mid-stream retry
- ✅ Resolution-time consumption (org policy refusal → chain walk)
- ✅ Configured chains now feed AI Gateway's ordered model fallback for
  provider/model failures before the first response is emitted. Every fallback
  is revalidated against organization access/retention/price policy and must
  support the request's tools/vision needs. Candidates more expensive than the
  selected model are excluded, keeping the member-budget reservation bounded.
  Gateway's successful-model metadata attributes each tool-loop step's token
  usage and member-budget cost to the model that actually served it. Focused
  fallback/BYOK tests pass; no live Gateway/provider failure drill was run.
- 🟡 **After-output stream interruption remains unretried.** Once response
  chunks or tool effects have escaped to the client, replaying the request can
  duplicate visible output or side effects. Gateway model fallback is not
  evidence that it can resume a provider stream after partial output; keep this
  behavior explicit until the transport can safely detect and reconcile a
  failed partial run.

### §3.2/3.4 Orchestrator depth
- ✅ Role-scoped parallel workers with verification
- 🟡 Autonomous **self-decomposition** is implemented locally: callers may
  omit workers and the orchestrator asks its model for a bounded worker plan,
  validates dependencies, then executes it. Schema/planner tests and
  typecheck pass; a live model-driven run has not been verified.
- 🟡 Cross-worker dependency ordering is implemented locally through
  `dependsOn` worker keys and topological waves. Independent workers still
  run concurrently; dependent workers receive prior summaries and skip when
  a prerequisite fails. Focused schema/planner tests and typecheck pass;
  no live model-run verification has been performed for this change.
- 🟡 Durable checkpoints are now written between dependency waves. Failed runs
  expose a resume ID; resuming requires the same authenticated user and chat,
  reuses successful worker summaries, retries failed/unstarted work, and
  repeats an incomplete verification stage. Resume now atomically claims a
  failed checkpoint for that owner/thread; a second concurrent resume is
  rejected, and stale running/verifying claims can be reclaimed after ten
  minutes (the run deadline is six minutes). Migration 0091 and focused query
  shape tests are present. No isolated PostgreSQL or live model/sandbox resume
  test was run, so database-level crash recovery and side-effect behavior
  remain unverified. Keep PARTIAL.

### §3.5 Hooks depth
- ✅ Webhook/email/Slack inbound, rule matching, idempotent execution
- 🟡 **GitHub-event triggers** now have a local implementation for push,
  pull-request, and issue deliveries: owner-created GitHub hooks retain an
  encrypted signing secret, the inbound route verifies the raw-body GitHub
  HMAC, and a stable per-hook delivery ID dedupes the queued outbox event.
  The UI exposes GitHub setup and the owner API redacts the stored secret.
  Focused signature, normalization, route, and redaction tests pass. The
  signature and delivery-ID contracts follow [GitHub's webhook validation
  guidance](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries)
  and [best practices](https://docs.github.com/en/webhooks/using-webhooks/best-practices-for-using-webhooks). This has
  not been exercised against a real GitHub delivery or isolated PostgreSQL;
  large deliveries above 2 MiB are rejected rather than persisted.
- 🟡 Additional content-filter operators are implemented locally:
  startsWith, endsWith, notContains, and notEquals. The API validates them,
  and stored invalid rules fail closed; the implementation and tests are
  already published in commit `d698cac`. Live webhook/PostgreSQL verification
  remains outstanding.
- 🟡 Local Hooks regression fixes: the executor now passes normalized metadata
  to subject rules and renders the subject from metadata in prompts; PATCH
  keeps existing match rules when another setting changes; create/rebind and
  execution require the hook owner to own its bound agent. Creation keeps the
  endpoint disabled until configuration is saved. Focused route, matcher, and
  executor tests plus the full web suite and TypeScript pass. Live
  webhook/PostgreSQL verification has not been repeated for these edits.
- 🟡 **Cross-hook chaining** is implemented locally: an owner can configure up
  to three enabled hooks to run after a successful hook, each child run has a
  deterministic idempotency key, bounded parent-result context, and a database
  depth limit of three. The queued run is durable before Inngest enqueue; the
  existing hook tick can recover queued children if enqueue fails. Focused API
  and executor tests pass (22 cases), targeted Biome and `db:check` pass. The
  additive PostgreSQL migration is generated and journaled but has not been
  applied to a local isolated PostgreSQL database; live Inngest/PostgreSQL
  behavior is not verified, so this remains PARTIAL.

### §3.6 Canvas depth
- ✅ Workspace, AI generation, preview, 7 export formats. PPTX/DOCX exports
  are client-side downloads; each frame becomes one slide/page and retains
  its image aspect ratio. Focused aspect-ratio tests and exporter typecheck
  pass; generated Office files have not yet been smoke-opened in Office.
- 🟡 Per-element comments are implemented locally with authenticated,
  owner-scoped list/create/delete APIs and PostgreSQL persistence; the eCanvas
  editor loads comments for the selected Excalidraw element. API tests cover
  validation, session ownership, create/list/delete and not-found behavior.
  Migration 0089 is journaled but has not been applied to isolated PostgreSQL,
  so cross-request persistence has not been integration-verified.
- 🟡 The existing artifact preview now has an Edit artifact mode: users can
  select existing text or container elements and update leaf text, text color,
  background color, and font size in place; the editor also adds a text node,
  moves a selected sibling up/down, or removes the selected node. Edits are
  returned from the sandboxed preview, size-checked, and saved through the
  authenticated, owner-scoped eCanvas content endpoint. Generated and edited
  artifacts use owner/canvas-keyed PostgreSQL storage (migration 0090) rather
  than the former process-local cache. A separate Targeted edit action now
  asks the selected model for a strict JSON DOM-operation plan, validates
  selectors/operation types/styles/text/count before sending it to the
  sandboxed preview, applies only bounded text/style/insert/remove/reorder
  operations, and persists the resulting HTML through the same owner-scoped
  endpoint. Full-document Refine remains available. Focused plan/protocol/API
  tests pass. The model-generated plan and iframe interaction have not been
  browser-tested; migration 0090 has not been applied to isolated PostgreSQL.
  Keep PARTIAL.

### Connectors
- ✅ 24 first-party provider tool factories are wired with user-scoped API calls
  and the existing approval gates for writes. Google Docs, Sheets, Forms, and
  Slides have dedicated bounded, read-only tools, and their API origins are
  fixed in the provider allowlist. Slides text is capped at 60,000 characters;
  Forms returns question structure only and does not read responses. Focused
  tests cover owner binding, URL construction, text extraction, and limits.
  Google Tasks now lists user task lists or bounded task summaries read-only;
  it does not expose mutation operations or provider-supplied links. Google
  Keep now exposes bounded, paginated note text only; no permissions or
  attachments are returned. Keep API availability may be limited to Google
  Workspace enterprise use, and was not live-verified here.
- ✅ Google Meet now has a user-bound read-only tool for the account's
  conference history, available transcripts, and bounded transcript entries.
  Resource names are validated before path construction and provider response
  fields are allowlisted. Focused tests pass; no live Google authorization or
  Meet API request was performed.
- ✅ YouTube's existing direct Google OAuth connection now lists channels
  returned by authenticated `mine=true`, then verifies a requested channel is
  in that owner-scoped list before reading its uploads playlist. Output fields
  and page sizes are bounded; the tool is read-only. Focused tests pass; no
  live Google OAuth or YouTube API request was performed.
- ✅ A separate Composio-backed marketplace can list and authorize its live
  toolkit catalog, then provide connected tools to chat when
  `COMPOSIO_API_KEY` is configured.
- 🟡 The legacy provider catalog contains 52 names, but it is not a verified
  count of missing integrations: several are available through Composio, and
  direct provider-specific OAuth/credential flows exist for a smaller set.
  The Customize connector cards currently show only their explicitly
  supported provider subset. Per-provider live authorization and action
  coverage have not been verified here. Do not describe all remaining names
  as simply “unwired.”

### Notifications
- ✅ In-app + Web Push (VAPID)
- ✅ Per-user email preference for scheduled-task results and hook failures,
  with separate toggles for successful schedules, failed schedules, and hook
  failures. It defaults off; delivery is limited to verified account emails
  when SMTP is configured. Emails contain a generic notice and a safe in-app
  link, not the notification body. Nine focused preference and delivery tests
  pass; no live SMTP delivery has been verified.
- 🟡 Operator problem reports, organization invitations, and password resets
  now use an optional TLS-required SMTP
  transport (`SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM`, and optional paired
  `SMTP_USER`/`SMTP_PASSWORD`). Missing relay settings and send failures are
  visible to callers; stored problem reports remain intact. Focused transport,
  gate, and report-route tests pass. No live SMTP delivery has been verified.
- 🟡 Per-user daily email digests are implemented locally: opted-in users can
  choose a generic daily summary instead of immediate delivery for enabled
  scheduled-run and hook-failure events. An Inngest daily cron groups verified
  recipients, applies event preferences, and never includes notification
  titles or bodies. Three digest unit tests plus immediate-delivery suppression
  tests pass. This has not been verified with a live Inngest registration,
  PostgreSQL database, or SMTP server; delivery remains best-effort and should
  stay PARTIAL until those integrations are exercised.
- ⏸️ Telegram and outbound Slack are deferred per user direction; they are
  not required in the current work scope.

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
- Source recheck on 2026-11-17: `propose-record` still uses `jsonSchema()`;
  the model-facing workflow payload still uses `z.unknown()`. No new live
  provider probe was run during this recheck.

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

The current user request excludes every **NEVER STARTED** module above. The
items below describe the remaining half-done work only; live verification and
operator credentials still determine whether an item can be closed.

1. **BYOK-hosted** — encrypted per-user keys and provider-specific model paths
2. **Canvas structural editing** — text/style and selected-node
   add/reorder/remove controls plus a natural-language targeted-edit plan now
   exist with durable owner-scoped storage. Apply migration 0090 only to
   isolated PostgreSQL and verify model-plan application, browser interaction,
   persistence, and cross-user isolation.
3. **Connector wiring** — continue selective callable tools for remaining
   catalog providers. Google Meet and YouTube now have bounded read-only direct
   tools, but the legacy catalog is not a promise that every provider has a
   first-party action implementation.
4. **Fallback live verification** — exercise Gateway provider/model failover
   with an isolated configured organization and confirm the usage attribution;
   partial-output stream recovery remains a separate design gap
5. **Orchestrator checkpoints** — local durable-resume implementation exists;
   apply migration 0091 to isolated PostgreSQL and test crash recovery,
   ownership, retry behavior, verification resume, and sandbox side effects.
6. **Live hook verification** — apply the hook-chaining migration to an
   isolated PostgreSQL database and verify chained execution, deduplication,
   ownership, and Inngest recovery; repeat real GitHub-delivery checks.
7. **Notification digests** — code and focused tests exist; verify cron
   registration, PostgreSQL query behavior, and delivery through isolated
   Inngest/SMTP before closing

---

## Verification notes

- 2026-11-17 continuation: the complete web Vitest suite passed **505 files / 3,342 tests** after the routing-priority, eCanvas artifact-editor/storage, and orchestrator-checkpoint slices were published. Focused suites, targeted Biome, migration-journal checks, and `git diff --check` also passed for those changes. This is a local unit/component/API suite; it does not establish PostgreSQL integration, browser E2E, live model/provider, Inngest, SMTP, or GitHub webhook verification.
- 2026-11-17 Gateway fallback slice: focused fallback/BYOK suites passed (2 files / 8 tests), targeted Biome and `git diff --check` passed. A single 6 GiB typecheck reported only the three pre-existing missing imports in preserved, untracked public/legal files; it reported no errors in the fallback changes. No live Gateway/provider failover test was run. AI Gateway's documented `providerOptions.gateway.models` behavior retries configured models when the primary fails or is unavailable; this does not prove recovery after partial output has reached the client.
- 2026-11-17 Google Forms/Slides connector slice: added owner-bound read-only form-structure and slide-text tools on fixed Google API origins, reusing the already configured OAuth providers/scopes. No form responses are read. Six focused suites (31 tests), targeted Biome, and `git diff --check` pass. A 6 GiB typecheck still reports only the three unresolved imports in preserved untracked public/legal files; no changed connector errors. Live Google OAuth/API access was not tested.
- 2026-11-17 Google Tasks connector slice: adds read-only paginated task-list/task views using the authenticated user's Tasks API, bounded summaries, and a fixed API origin. The OAuth provider/scopes already existed. Included in eight focused suites (38 tests) with registry/origin coverage; targeted Biome and `git diff --check` pass. No live Google account was used.
- 2026-11-17 Google Keep connector slice: adds bounded, paginated read-only notes using fixed Keep API origin; response excludes permissions and attachments. Included in eight focused suites (38 tests) with registry/origin coverage; targeted Biome and `git diff --check` pass. Google's API overview describes Keep API as for enterprise administration; ordinary consumer-account availability remains unverified.
- 2026-11-17 Google Meet and YouTube connector slices: added user-scoped read-only Google Meet conference/transcript retrieval and YouTube owner-channel/upload listing. Meet resource names are path-validated and transcript output is capped; YouTube channels are resolved with `mine=true` and requested channels must match that list. Six focused suites passed (41 tests), targeted Biome and `git diff --check` passed. The new tools and the recent Keep/Tasks tools now pass their slice typecheck; the full web typecheck still reports only three unresolved imports in preserved untracked marketing/legal files. These tests mock provider transport; no live OAuth, Google Meet, or YouTube API verification was done.
- The 6 GiB web typecheck was rerun after the Canvas and orchestrator code changes. It reported only three unresolved imports in pre-existing untracked public/legal files (`public-header` in two pages and `legal-toc` in one); no errors were reported in those changed slices. Those user-owned untracked files were not edited.
- Docker is unavailable in this environment and no local PostgreSQL binaries/service or listener are present (`127.0.0.1:5432` refused). Migrations 0090 and 0091 were journal-checked only and were not applied. Production/VPS was not accessed.
- 2026-11-17 targeted Canvas edit: 8 focused eCanvas tests passed, `pnpm db:check` passed, targeted Biome passed with only existing PascalCase filename warnings, and `git diff --check` passed. The model/iframe interaction remains unverified in a browser and no PostgreSQL migration was applied.
- The 6 GiB web typecheck after the targeted-edit change still fails only on the same three unresolved imports in pre-existing untracked public/legal pages (`public-header` twice and `legal-toc` once); it reports no errors in the Canvas targeted-edit files. Those untracked files were preserved and not edited.
- 2026-11-17 post-targeted-edit full web suite: **506 test files / 3,347 tests passed**. It is still a mock/unit/component/API suite; PostgreSQL, live providers, and browser E2E are not established by this result.
- 2026-11-17 orchestrator resume-claim hardening: focused repository/orchestrator suites passed (2 files / 11 tests), targeted Biome passed, `pnpm db:check` passed, and `git diff --check` passed. Docker Engine is unavailable and localhost PostgreSQL is not listening, so no database integration or concurrent PostgreSQL run was performed.
- 2026-11-17 local follow-up: the changed Hooks, Orchestrator, and schedule
  code passed the full web suite (495 files / 3,286 tests) after the Hooks
  security/subject fixes, 6 GiB TypeScript check, focused regression tests,
  targeted Biome checks, and `git diff --check`. These are local
  checks; no real GitHub webhook, hosted model, or production run was used.
- Subsequent local GitHub-hook changes passed focused unit and route tests,
  the **full web suite (496 files / 3,294 tests)**, the 6 GiB TypeScript
  check, `pnpm db:check`, and a production web build. The build compiled and
  exited 0; static page collection logged PostgreSQL `ECONNREFUSED` because
  the local database was down, so this is not runtime/database verification.
  These are local checks; Docker Desktop's engine
  was unavailable, so no PostgreSQL integration run was performed. GitHub's
  documented `X-Hub-Signature-256` verification and
  `X-GitHub-Delivery` deduplication are implemented, but no live delivery or
  real PostgreSQL outbox race was verified.
- SMTP delivery is implemented for problem reports, invitations, and
  password resets; transport, community-gate, and problem-report route tests
  cover those paths. No SMTP server was contacted. The latest full suite and
  production build predate the invitation/reset wiring.
- Hosted-provider BYOK local validation: settings/API/credential tests pass
  (3 files / 10 tests), targeted Biome passes, and `git diff --check` passes.
  One 6 GiB full typecheck was attempted during this work; it failed on three
  missing imports in pre-existing untracked public/legal files plus a route
  alias and a user-profile type issue introduced in this slice. The two
  slice-owned type issues were corrected afterward; no full typecheck was
  repeated. No live AI provider request was made. [AI Gateway BYOK docs](https://vercel.com/docs/ai-gateway/authentication-and-byok/byok)
  note that a failed BYOK request may fall back to platform credentials.
- Notification digest local validation: focused Vitest passed (3 files / 13
  tests), targeted Biome and `git diff --check` passed. Tests cover recipient
  aggregation, opt-in/verification/event filtering, generic email privacy, and
  suppression of immediate sends when digest mode is enabled. No live SMTP,
  Inngest, or PostgreSQL integration check was run.
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
