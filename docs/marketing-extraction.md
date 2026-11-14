# Marketing Site Extraction — Architecture & Migration Report

Date: 2026-11-15 · Branch: `feature/marketing-site-extraction` · Status: implemented on the
branch, **not merged and not deployed** (VPS untouched, per the standing deploy rule).

## A. Architecture report — why `apps/marketing`

The repo is already a pnpm + Turborepo monorepo (`apps/web`, `apps/desktop`,
`packages/*`, `servers/*`), so the extraction adds one sibling application:
**`apps/marketing`** — an independent, self-contained Next.js 15.4.11 app that
owns the entire public marketing surface and deploys to
**https://voidagent.space**, while the existing app stays exactly where it is
(`apps/web`) and serves the logged-in product at **https://app.voidagent.space**.

Nothing about the existing application was relocated: same backend, same
database, same Better Auth implementation, same API routes. The only `apps/web`
changes are the narrowly scoped cross-domain integration pieces listed in §D.

Deliberate sharing decision: the five brand UI primitives (`ui/eyebrow`,
`accent-span`, `dither-canvas`, `brand-button`, `reveal`) and the brand-surface
CSS block are used by BOTH the marketing pages and the app's auth pages /
`(chat)/design` reference — they **stay in `apps/web` and are copied** into
`apps/marketing` (self-contained app, no cross-app imports, documented
keep-in-sync note in both CSS files). The marketing `globals.css` is a trimmed
subset: token base + the self-contained marketing block; the app theme blocks
and dashboard utilities are intentionally absent.

## B. Folder structure

```text
Void-Agent/
├── apps/
│   ├── web/            # EXISTING — unchanged location; marketing pages REMOVED
│   │   └── (public)/   # now only the DB-backed sharing surfaces: export, ecanvas, p
│   ├── marketing/      # NEW — independent Next.js app (voidagent.space)
│   │   ├── package.json          next 15.4.11 / react 19 / tailwind 4 (versions match web)
│   │   ├── next.config.ts        /updates→/index redirect (moved verbatim), security
│   │   │                         headers, outputFileTracingIncludes (legal md),
│   │   │                         outputFileTracingRoot (monorepo pin)
│   │   ├── legal-consent/        terms / privacy / cookies markdown (moved)
│   │   ├── public/               logo-va-*, dither-*, bg.png, og-image, manifest
│   │   └── src/
│   │       ├── app/              all marketing routes (below), favicon conventions,
│   │       │                     globals.css (trimmed), layout.tsx (fonts + Toaster,
│   │       │                     metadataBase), sitemap.ts + robots.ts (NEW),
│   │       │                     llms.txt + design.md route handlers (moved)
│   │       ├── components/       public/*, legal/* (moved), ui/* (copied primitives)
│   │       ├── lib/              utils (cn only), site.ts (MARKETING_URL/APP_URL)
│   │       └── middleware.ts     www→apex 308 + / → /landing rewrite
│   └── desktop/        # untouched
├── docker/marketing.Dockerfile   # NEW — optional Docker recipe (standalone output)
└── docker/compose.production.yml # + optional `marketing` service (127.0.0.1:3100)
```

Two structural notes:
- The landing page lives at `(home)/landing/page.tsx` and middleware rewrites
  `/` → `/landing` (URL stays `/`). A root `page.tsx` cannot coexist with the
  changelog route folder `index/` in the App Router ("Expected
  clientReferenceManifest" prerender bug — `/` and `/index` normalize to the
  same route key). This is also exactly how the app domain served the homepage
  before the split, so behavior is preserved.
- The changelog route folder sits under the `(changelog)` group for the same
  reason (a bare `app/index/` breaks the RSC manifest). **The URL is still
  `/index`** — the standing decree ("changelog hub permanently at /index,
  never rename it again") is preserved; `/updates` still 301s to `/index` via
  the redirect moved into `apps/marketing/next.config.ts`.

## C. Route migration report

| Original (apps/web) | Destination | Final URL | Status |
|---|---|---|---|
| `/` (anon → rewrite `/landing`) | `apps/marketing (home)/landing` + middleware rewrite | `https://voidagent.space/` | moved; app domain `/` now 307s anon → marketing |
| `/landing` | `apps/marketing (home)/landing` | `voidagent.space/landing` (+ `/` rewrite) | moved; app domain 308s → marketing `/` |
| `/pricing` | `apps/marketing/pricing` | `voidagent.space/pricing` | moved; app domain 308s |
| `/about` | `apps/marketing/about` | `voidagent.space/about` | moved; app domain 308s |
| `/docs`, `/docs/mcp` | `apps/marketing/docs` | `voidagent.space/docs[/mcp]` | moved; app domain 308s |
| `/contact` | `apps/marketing/contact` | `voidagent.space/contact` | moved; app domain 308s |
| `/contact-sales` | `apps/marketing/contact-sales` | `voidagent.space/contact-sales` | moved; app domain 308s |
| `/vs/manus` | `apps/marketing/vs/manus` | `voidagent.space/vs/manus` | moved; app domain 308s |
| `/index` (+ `/updates` 301) | `apps/marketing/(changelog)/index` | `voidagent.space/index` | moved; `/updates` redirect moved to marketing next.config; app domain 308s both |
| `/branding` | `apps/marketing/branding` | `voidagent.space/branding` | moved; app domain 308s |
| `/privacy-policy`, `/terms-of-service`, `/cookies-policy`, `/refund-policy`, `/grievance-redressal` | `apps/marketing/…` | `voidagent.space/…` | moved; app domain 308s |
| `/llms.txt`, `/design.md` (route handlers) | `apps/marketing/…` | `voidagent.space/…` | moved + stale `void-agent.dev` links rebuilt from config; app domain 308s |
| `legal-consent/*.md` | `apps/marketing/legal-consent/` | (runtime read via `process.cwd()`) | moved; `outputFileTracingIncludes` + Docker COPY cover standalone builds |
| `components/public/*`, `components/legal/*` | `apps/marketing/src/components/` | — | moved (marketing-only, verified) |
| `/export/[id]`, `/ecanvas/export/[id]`, `/p/[slug]` | **stay in apps/web** `(public)` | `app.voidagent.space/…` | preserved — DB-backed product sharing surfaces |
| `/sign-in`, `/sign-up`, auth flows, dashboard, `/api/*`, `/embed*`, `/marketplace/mcp`, `/bug-bounty` | **stay in apps/web** | `app.voidagent.space/…` | preserved |

## D. apps/web changes (complete list — everything else untouched)

1. `src/middleware.ts` — marketing redirect map (18 paths → 308 to the
   marketing domain, query-preserving, `/landing`→`/`, `/updates`→`/index`);
   anonymous `/` → 307 marketing (never cached; authed `/` still serves the
   chat workspace); moved paths pruned from `PUBLIC_DESTINATION_PAGES`; CORS
   preflight (`OPTIONS /api/*`) + marketing-origin pass-through for the
   checkout POST so it reaches the route handler's own 401 instead of the
   cookie-gate redirect.
2. `next.config.ts` — removed the `/updates` redirect (moved to marketing).
3. `src/lib/marketing-url.ts` (NEW) — single source for the marketing origin
   (`NEXT_PUBLIC_MARKETING_URL`; prod-safe default `https://voidagent.space`,
   dev fallback `localhost:3001`).
4. `src/lib/security/cors.ts` (NEW) + `api/payments/dodo/checkout/route.ts` —
   exact-origin CORS allowlist (credentials, methods, headers, `Vary:
   Origin`, headers on every response path incl. 401/403/400/503), OPTIONS
   preflight. Session, rate-limit and payment validation untouched. CORS is
   an origin gate, not a replacement for auth.
5. `src/lib/auth/callback-url.ts` — absolute `callbackUrl` accepted ONLY for
   the exact marketing origin (open-redirect guard preserved; unit-tested for
   lookalikes/other subdomains/wrong scheme).
6. `src/lib/auth/auth-instance.ts` — `NEXT_PUBLIC_MARKETING_URL` added to
   better-auth trusted origins (exact, env-derived).
7. `src/components/auth/sign-in.tsx` / `email-sign-up.tsx` — absolute
   callbacks navigate via `window.location.href` (better-auth email flows
   return `redirect: false` and don't auto-navigate cross-origin).
8. `src/components/layouts/app-sidebar-resources.tsx` (NEW) + `app-sidebar.tsx`
   — "Resources" sidebar group: Website / Pricing / Documentation / Contact →
   absolute marketing URLs, new tab (spec §12).
9. `src/middleware.test.ts`, `src/lib/auth/callback-url.test.ts`,
   `src/lib/security/cors.test.ts` (NEW) — redirect matrix + allowlist tests.

## E. Deployment report

Primary doctrine unchanged: VPS-native systemd. See the new **"Marketing
site"** section in `docs/deploy-vps-native.md` for the full runbook —
service (`void-agent-marketing.service`, port 3100), env file, build, and the
DNS/Cloudflare safety sequence:

1. DNS record inventory FIRST (the apex holds a stale record pointing at a
   dead origin; it must be deleted in the CF dashboard before
   `cloudflared tunnel route dns`, which errors on conflict).
2. Backup `/etc/cloudflared/config.yml` before editing.
3. Ingress: `voidagent.space` + `www.voidagent.space` → `http://localhost:3100`,
   `app.voidagent.space` → `http://localhost:3000` UNCHANGED, catch-all
   `http_status:404` kept LAST (first-match order documented).
4. Post-change tests for BOTH hostname mappings + the catch-all.
5. Rollback: restore the config backup + restart cloudflared; delete the two
   marketing DNS records. The app subdomain is never touched.
6. Cutover ordering: marketing live BEFORE restarting web with the new build.

Docker (optional, other hosts): `docker/marketing.Dockerfile` +
`marketing` service in `docker/compose.production.yml` (127.0.0.1:3100), with
`COPY legal-consent` for the markdown pages.

## F. Testing report (actual results — all commands executed locally)

| Check | Result |
|---|---|
| `pnpm --filter marketing typecheck` | PASS |
| `pnpm --filter marketing test` | PASS — 11 tests / 3 files |
| `pnpm --filter marketing build` | PASS — 23 routes, all marketing pages static |
| Production `next start :3200` sweep | PASS — 20/20 routes HTTP 200 (incl. `/` rewrite, `/index`, `/robots.txt`, `/sitemap.xml`, `/llms.txt`, all 5 legal pages) |
| `/updates` redirect | PASS — 308 → `/index` |
| www → apex | PASS — 308 `www.voidagent.space` → `https://voidagent.space/pricing` |
| Sitemap content | PASS — canonical `https://voidagent.space` URLs; no `/updates` |
| llms.txt content | PASS — 17 canonical links, zero stale `void-agent.dev` |
| Legal markdown in production build | PASS — rendered 200; `outputFileTracingIncludes` verified in `.nft.json` traces |
| Standalone runtime on Windows | **BLOCKED** — Next's standalone tracer hits `EPERM` symlinking node_modules (Windows privilege limitation, pre-existing for any standalone build here); trace manifests verified instead; Linux/CI unaffected |
| `pnpm --filter web typecheck` | PASS |
| `pnpm --filter web test` (full suite) | PASS — **3,358 tests / 503 files** |
| Web middleware redirects (live dev) | PASS — anon `/` 307 → `:3001/`; `/pricing` 308 → `:3001/pricing`; `/design.md` 308; `/sign-in` 200 |
| CORS preflight (live) | PASS — `OPTIONS` → 204 + `ACAO`/`ACAC`/methods/headers/`Vary: Origin` (marketing origin only) |
| CORS 401 path (live) | PASS — unauth POST from marketing origin → `401 UNAUTHENTICATED` + CORS headers; evil origin → no exemption (middleware 307; authed → route 403) |
| Same-origin API UX | UNCHANGED — cookieless POST still 307s to `/sign-in` as before |
| Checkout continuity (browser) | PASS — authed POST with session cookie crosses origins (SameSite Lax + shared registrable domain), passes session + exact-origin allowlist, reaches the tier gate (`400 INVALID_TIER` — no Dodo product IDs configured locally); return-to-pricing restores the billing selection, auto-retries once, strips the intent params (no loop) |
| Marketing visuals (browser) | PASS — homepage + pricing render pixel-faithful (dither art, Instrument Serif accents, brand tokens from the trimmed CSS) |
| `pnpm --filter web build` | **NOT RUN** — the shared `.next` is owned by the live dev server (builds would clobber it); CI builds web on push |
| Docker image build | **NOT RUN** — file-level review only (optional recipe) |
| Real Dodo payment redirect | **NOT TESTED** — no payment credentials exist locally; flow verified up to the payment-configuration gate |

## G. Remaining issues / manual follow-ups

1. **Merge + deploy are pending approval.** The VPS is untouched; the runbook
   sequence (marketing service + DNS + ingress) is a manual, user-ordered step.
2. **Production env vars to add** (documented in the runbook):
   `apps/web/.env.production` += `NEXT_PUBLIC_MARKETING_URL=https://voidagent.space`;
   `apps/marketing/.env.production` = the two `NEXT_PUBLIC_*` URLs.
3. **OAuth follow-up**: GitHub OAuth app / Google Cloud Console redirect URIs
   stay on `app.voidagent.space` (auth is app-domain only) — no change needed;
   but the marketing origin is now in better-auth trusted origins via env, so
   nothing to configure externally.
4. **Keep-in-sync**: `apps/marketing/src/app/globals.css` and the copied
   `ui/*` primitives duplicate the app-side originals (web keeps them for the
   auth pages + design reference). Brand changes must touch both — noted in
   both CSS file headers.
5. **Standalone/Docker verification on Linux** — the Windows symlink EPERM
   limits local standalone runtime testing; CI/VPS builds will confirm (the
   trace manifests already prove the legal md inclusion).
6. **AGENTS.md** intentionally not updated — it carries an unrelated
   uncommitted modification; the architecture notes live in this document.
