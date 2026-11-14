# Current Source Roles and Integration State

Last verified: 2026-11-11 (Asia/Kolkata) — post-promotion

## Repositories

| Role | Repository / snapshot | Rules |
|---|---|---|
| Original custom-feature preservation source | `Ayushprtp/zip-main`, fetched `main` at `aa9fce0f545afb18b9a191724be092887f83630b` | Read-only. Its Git history is unrelated to the destination history. |
| Upstream feature baseline | `keinsaasforever/better-chatbot` at the explicitly requested `6f4183566bc48616303cb84055f11f79578c82fe` | Read-only exact snapshot. Do not silently move to another SHA. |
| Destination | `ibrahimkhan008/Void Agent`, local `main`, committed HEAD `8b7b1287b45456d6d2ae6fcdb7a2e4b2371a5bcd` (matches `origin/main`) | Canonical implementation target. Since 2026-11-11 it holds the PROMOTED, validated monorepo integration as an uncommitted working tree (old-tree relocation shows as uncommitted deletions, recoverable via git history + backup). No commit, push, or deployment. |

## Current integration workspace

**Promoted (2026-11-11):** `C:\Users\Ikra\Desktop\Void Agent` is now the integrated single monorepo (`apps/web`, `apps/desktop`, `packages/*`, `servers/*`, `e2b/*`) carrying the complete pinned upstream snapshot plus all ported custom functionality. Validation after promotion: web 498 files / 3,361 tests, typecheck, lint, `db:check`, production build, desktop 22 files / 132 tests — all PASS (see docs/testing-report.md, controller session section).

**Backup (verified restorable):** `C:\Users\Ikra\Desktop\Void Agent-backup-20261111\` — pre-promotion `working-tree.tar.gz` (58/58 dirty/untracked entries verified byte-identical on extraction, includes the original desktop source and env files), `git-tracked-diff.patch`, `git-head.txt`, `git-status-porcelain.txt`, and `superseded-old-tree\` (the relocated pre-promotion flat `src/` app, old root configs, and desktop leftovers — moved, not deleted).

**Historical snapshot:** `C:\Users\Ikra\Desktop\Void Agent-integration-staging` remains on disk as the pre-promotion integration workspace (1,768 upstream paths, no Git metadata). It is no longer the work surface; do not copy anything out of it (its `.env` files were never read and must stay that way).

The locally configured Git remote named `upstream` points to `Ayushprtp/zip-main`; a read-only fetch succeeded. This contradicts the earlier connector-only 404 observation: the repository content is available to local Git in this environment. The remote named `better-chatbot` points to the Better Chatbot source.

## Desktop provenance correction

The `zip-main` tree has no `apps/desktop` paths. The current destination's 49-file `apps/desktop` was introduced in later Better Chatbot migration history, rather than being part of the original zip-main snapshot. The pinned Better Chatbot source already includes its own `apps/desktop`. Reconcile valuable differences from the prior destination desktop into that upstream app; do not describe a second desktop copy as an original zip-main feature.

## Progress and limits

> **Historical — superseded 2026-11-11:** the bullets below describe the pre-promotion staging checkpoint. The destination has since been promoted and validated; see docs/MIGRATION-STATUS-REPORT.md §16 for the current remaining-work list.

- Four Dodo test TypeScript errors were fixed in staging. The Dodo-focused suite passes 9 files / 29 tests; the repository test passes 3/3; a fresh 6 GiB web typecheck passed before the later notes test typing correction.
- Saved Notes API/service/UI work now passes focused tests (8 tests across notes helpers, notes API, and preferences API) and a fresh 6 GiB web typecheck after adapting test requests to `NextRequest`.
- eCanvas passed 9 files / 26 tests and `db:check`; real PostgreSQL and live model-provider verification remain unavailable.
- Staging is not fully reconciled against zip-main. Direct OAuth connectors and several custom feature groups require semantic integration. Path-only unmatched counts are not a feature-parity percentage.
- Full suite, lint, database metadata, production web build, desktop tests/build, primary promotion, and final primary validation remain pending.
- B20 browser network isolation remains MISSING and execution must stay disabled. No real isolated PostgreSQL integration is claimed.

Historical `Void Agent-V2` references in prior reports and logs are retained as historical evidence only. They are not a canonical repository identity or current source of truth.


## Latest read-only reference check — 2026-11-11 01:05 IST

Resolved refs: zip-main HEAD aa9fce0f545afb18b9a191724be092887f83630b; Better Chatbot main 6f4183566bc48616303cb84055f11f79578c82fe; Void Agent origin/main and local HEAD 589fa48f3c323d049e51d566f3b8ddff95d59bc5. zip-main is available locally, although semantic feature comparison remains incomplete.

Staging has 1,768 upstream tracked paths (1,609 exact content matches, 159 differences, none missing), no Git metadata, and is unpromoted. Weighted status is 44% overall (58% implementation, 31% verified). Preserve 61 destination changes; never copy staging .env; explicitly handle apps/Void Agent-desktop.
