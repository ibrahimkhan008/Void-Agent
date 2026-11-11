# zip-main UI triage — WP6b-T2 (semantic dispositions)

Generated: 2026-11-11. Feeds the zip-main → staging promotion gate. Covers the UNMATCHED
families assigned to WP6b-T2 in `docs/zip-main-parity-map.md`: `components/ui` (56),
`components/landing` (24), `components/admin` (14), `app/(chat)` (25), `app/(public)` (13),
`components` (11), `components/user` (6), PWA/favicon assets (11 incl. `components/pwa`),
and the remaining `components/*` buckets (auth 3, canvas 2, chat 1, gallery 1, layouts 2,
payments 7, pwa 1, sandbox 1, tool-invocation 7, workflow 2).

- ORIGINAL: zip-main @ `aa9fce0f545afb18b9a191724be092887f83630b` (read via `git show` only).
- DESTINATION (reference): `Void-Agent` working tree `src/` — read-only.
- STAGING (ports): `Void-Agent-integration-staging/apps/web/src` — additive files only.
- Method per path: staging symbol/filename/route search + consumer check + `feature-work-register.md`
  evidence (A15, C16, C17, C18, C39–C42) + original file inspection (imports, size, consumers).

## Summary

| Disposition | Paths | Meaning |
|---|---:|---|
| PORTED-NOW | 13 | Ported into staging this pass (12 source files + 1 vitest test), validated below |
| EQUIVALENT-AT | 24 | Staging already delivers the behavior at the recorded path |
| EXCLUDED | 150 | Written justification per row below |
| **Total assigned** | **187** | 56+24+14+25+13+11+6+11+3+2+1+1+2+7+1+1+7+2 |

PORTED-NOW list (staging paths; all additive, no existing staging file modified):

| # | staging path | adaptation |
|---|---|---|
| 1 | `apps/web/src/app/(public)/privacy-policy/page.tsx` | POLICY_PATH `flare-privacy-policy.md` → committed `legal-consent/cognix-privacy-policy.md` (the flare-named file is committed in NO tree; the committed cognix-named file carries the current Flare-branded policy text in exactly the format the page parses) |
| 2 | `apps/web/src/app/(public)/privacy-policy/layout.tsx` | verbatim |
| 3 | `apps/web/src/app/(public)/cookies-policy/page.tsx` | POLICY_PATH `flare-cookies-policy.md` → committed `legal-consent/cognix-cookies-policy.md` (same rationale) |
| 4 | `apps/web/src/app/(public)/cookies-policy/layout.tsx` | verbatim |
| 5 | `apps/web/src/app/(public)/terms-of-service/page.tsx` | verbatim (self-contained JSX text) |
| 6 | `apps/web/src/app/(public)/terms-of-service/layout.tsx` | verbatim |
| 7 | `apps/web/src/app/(public)/refund-policy/page.tsx` | verbatim (self-contained JSX text) |
| 8 | `apps/web/src/app/(public)/refund-policy/layout.tsx` | verbatim |
| 9 | `apps/web/src/app/(chat)/(admin)/admin/users/(list)/page.tsx` | `redirect("/login")` → `redirect("/sign-in")` (staging's sign-in route) |
| 10 | `apps/web/src/app/(chat)/(admin)/admin/users/(list)/layout.tsx` | verbatim |
| 11 | `apps/web/src/app/(chat)/(admin)/admin/users/(list)/loading.tsx` | verbatim |
| 12 | `apps/web/src/app/(chat)/canvas/page.tsx` | verbatim (9-line back-compat redirect to `/ecanvas`) |
| 13 | `apps/web/src/components/user/user-detail/memory-ui-helpers.test.ts` | verbatim; tests the already-present staging helper |

Why the users-list trio is safe to port: staging already ships `components/admin/users-table.tsx`
(+skeleton) and `lib/admin/server.ts` (`getAdminUsers`, `ADMIN_USER_LIST_LIMIT/_MAX_LIMIT`,
`ADMIN_USER_SEARCH_MAX_LENGTH`, `DEFAULT_SORT_BY/_DIRECTION`) and `src/types/admin.ts`
(`ADMIN_USER_SORT_FIELDS`, `AdminUserSortField`, `AdminUsersQuery` — field names match the page's
call exactly: `searchValue/searchField:"email"/searchOperator:"contains"/filterField:"role"/filterOperator:"eq"/sortBy:"createdAt"`);
`requireAdminPermission` in `lib/auth/permissions.ts` has a defaulted `action` arg, so the page's
no-arg call type-checks. The port also fixes a real staging defect: staging's `users-table`
navigates to `buildUserDetailUrl()` → `/admin/users/...` (lib/admin/navigation-utils.ts), which
previously 404'd because staging had no admin/users routes at all.

Validation (from `apps/web`): `pnpm exec vitest run src/components/user/user-detail/memory-ui-helpers.test.ts`
→ **Test Files 1 passed (1), Tests 22 passed (22)**, 546ms. Route ports are verbatim originals
from a compiling tree plus the three recorded one-line adaptations; per task constraints no full
typecheck/build was run. Legal routes need no new deps (staging already has `react-markdown` 10.1,
`remark-gfm` 4.0.1, `lucide-react`, `next/image`; `public/flare-logo-192.webp` exists in staging;
`.prose` classes are unstyled in the destination too — no typography plugin in either tree, so
fidelity is identical to the destination).

---

## components/ui (56) — all EXCLUDED

Connector/brand icon components (52). Every one is a tiny (~0.4–6.5 KB) single-symbol SVG
component. Staging's `components/ui` (63 files) has model-provider icons but none of these; the
only staging consumers that could use them (`components/connectors/connector-settings.tsx`,
`app/(chat)/connectors/page.tsx`) render plain text and do not import any icon component. Porting
them now would be dead code; restore together with the destination connectors UI
(`connectors-popover.tsx` / `connectors-settings-view.tsx`), which is their only consumer.

| zip-main path | disposition | evidence/staging path | justification |
|---|---|---|---|
| `src/components/ui/airtable-icon.tsx` | EXCLUDED | `components/connectors/connector-settings.tsx` (text-only UI) | no staging consumer; restore with destination connectors UI port |
| `src/components/ui/asana-icon.tsx` | EXCLUDED | same | no staging consumer; restore with destination connectors UI port |
| `src/components/ui/atlassian-icon.tsx` | EXCLUDED | same | no staging consumer; restore with destination connectors UI port |
| `src/components/ui/axero-icon.tsx` | EXCLUDED | same | no staging consumer; restore with destination connectors UI port |
| `src/components/ui/bitbucket-icon.tsx` | EXCLUDED | same | no staging consumer; restore with destination connectors UI port |
| `src/components/ui/bookstack-icon.tsx` | EXCLUDED | same | no staging consumer; restore with destination connectors UI port |
| `src/components/ui/canva-icon.tsx` | EXCLUDED | same | no staging consumer; restore with destination connectors UI port |
| `src/components/ui/canvas-lms-icon.tsx` | EXCLUDED | same | no staging consumer; restore with destination connectors UI port |
| `src/components/ui/clickup-icon.tsx` | EXCLUDED | same | no staging consumer; restore with destination connectors UI port |
| `src/components/ui/coda-icon.tsx` | EXCLUDED | same | no staging consumer; restore with destination connectors UI port |
| `src/components/ui/composio-icon.tsx` | EXCLUDED | staging composio = `lib/composio/*` (no branded UI) | no staging consumer |
| `src/components/ui/confluence-icon.tsx` | EXCLUDED | connectors UI text-only | no staging consumer; restore with destination connectors UI port |
| `src/components/ui/connector-logo-icon.tsx` | EXCLUDED | same | resolver used only by destination connectors UI (`connectors-settings-view.tsx` 997 L, excluded); no staging consumer |
| `src/components/ui/connectors-icon.tsx` | EXCLUDED | same | no staging consumer |
| `src/components/ui/discord-icon.tsx` | EXCLUDED | same | no staging consumer; restore with destination connectors UI port |
| `src/components/ui/discourse-icon.tsx` | EXCLUDED | same | no staging consumer; restore with destination connectors UI port |
| `src/components/ui/document360-icon.tsx` | EXCLUDED | same | no staging consumer; restore with destination connectors UI port |
| `src/components/ui/dropbox-icon.tsx` | EXCLUDED | same | no staging consumer; restore with destination connectors UI port |
| `src/components/ui/drupal-wiki-icon.tsx` | EXCLUDED | same | no staging consumer; restore with destination connectors UI port |
| `src/components/ui/egnyte-icon.tsx` | EXCLUDED | same | no staging consumer; restore with destination connectors UI port |
| `src/components/ui/fireflies-icon.tsx` | EXCLUDED | same | no staging consumer; restore with destination connectors UI port |
| `src/components/ui/freshdesk-icon.tsx` | EXCLUDED | same | no staging consumer; restore with destination connectors UI port |
| `src/components/ui/gitbook-icon.tsx` | EXCLUDED | same | no staging consumer; restore with destination connectors UI port |
| `src/components/ui/gitlab-icon.tsx` | EXCLUDED | same | no staging consumer; restore with destination connectors UI port |
| `src/components/ui/gmail-icon.tsx` | EXCLUDED | same | no staging consumer; restore with destination connectors UI port |
| `src/components/ui/gong-icon.tsx` | EXCLUDED | same | no staging consumer; restore with destination connectors UI port |
| `src/components/ui/google-drive-icon.tsx` | EXCLUDED | same | no staging consumer; restore with destination connectors UI port |
| `src/components/ui/guru-icon.tsx` | EXCLUDED | same | no staging consumer; restore with destination connectors UI port |
| `src/components/ui/highspot-icon.tsx` | EXCLUDED | same | no staging consumer; restore with destination connectors UI port |
| `src/components/ui/hubspot-icon.tsx` | EXCLUDED | same | no staging consumer; restore with destination connectors UI port |
| `src/components/ui/jira-icon.tsx` | EXCLUDED | same | no staging consumer; restore with destination connectors UI port |
| `src/components/ui/linear-icon.tsx` | EXCLUDED | same | no staging consumer; restore with destination connectors UI port |
| `src/components/ui/loopio-icon.tsx` | EXCLUDED | same | no staging consumer; restore with destination connectors UI port |
| `src/components/ui/mediawiki-icon.tsx` | EXCLUDED | same | no staging consumer; restore with destination connectors UI port |
| `src/components/ui/neon-icon.tsx` | EXCLUDED | same | no staging consumer |
| `src/components/ui/notion-icon.tsx` | EXCLUDED | same | no staging consumer; restore with destination connectors UI port |
| `src/components/ui/outline-icon.tsx` | EXCLUDED | same | no staging consumer; restore with destination connectors UI port |
| `src/components/ui/paypal-icon.tsx` | EXCLUDED | same | no staging consumer |
| `src/components/ui/playwright-icon.tsx` | EXCLUDED | same | no staging consumer |
| `src/components/ui/productboard-icon.tsx` | EXCLUDED | same | no staging consumer; restore with destination connectors UI port |
| `src/components/ui/salesforce-icon.tsx` | EXCLUDED | same | no staging consumer; restore with destination connectors UI port |
| `src/components/ui/slab-icon.tsx` | EXCLUDED | same | no staging consumer; restore with destination connectors UI port |
| `src/components/ui/slack-icon.tsx` | EXCLUDED | same | no staging consumer; restore with destination connectors UI port |
| `src/components/ui/stripe-icon.tsx` | EXCLUDED | staging billing is Dodo-only (C18) | no staging consumer; Stripe billing dropped |
| `src/components/ui/teams-icon.tsx` | EXCLUDED | same | no staging consumer; restore with destination connectors UI port |
| `src/components/ui/telegram-icon.tsx` | EXCLUDED | same | no staging consumer |
| `src/components/ui/testrail-icon.tsx` | EXCLUDED | same | no staging consumer; restore with destination connectors UI port |
| `src/components/ui/wikipedia-icon.tsx` | EXCLUDED | same | no staging consumer; restore with destination connectors UI port |
| `src/components/ui/xenforo-icon.tsx` | EXCLUDED | same | no staging consumer; restore with destination connectors UI port |
| `src/components/ui/youtube-icon.tsx` | EXCLUDED | same | no staging consumer |
| `src/components/ui/zendesk-icon.tsx` | EXCLUDED | same | no staging consumer; restore with destination connectors UI port |
| `src/components/ui/zulip-icon.tsx` | EXCLUDED | same | no staging consumer; restore with destination connectors UI port |

Generic primitives (4). Staging compiles without them; nothing in staging (and nothing ported in
this pass) imports them, so porting would add unused primitives against the "dependencies of
something you ported" rule.

| zip-main path | disposition | evidence/staging path | justification |
|---|---|---|---|
| `src/components/ui/breadcrumb.tsx` | EXCLUDED | staging `components/ui` has no breadcrumb; no importer anywhere in staging | primitive absent but unused; add when a consumer is ported |
| `src/components/ui/decrypted-text.tsx` | EXCLUDED | no staging counterpart; no importer | destination-only animation primitive, unused in staging |
| `src/components/ui/form-group.tsx` | EXCLUDED | no staging counterpart; no importer | 19-line primitive, unused in staging |
| `src/components/ui/toggle.tsx` | EXCLUDED | staging uses `ui/switch.tsx`; no importer of toggle | primitive absent but unused in staging |

---

## app/(public) (13) — 8 PORTED-NOW, 5 EXCLUDED

Staging `app/(public)` held only `ecanvas/`, `export/`, `p/` and has **no** legal-policy routes at
all, so the four text legal routes were ported (see PORTED-NOW list above). The remaining pages are
marketing/brand surfaces whose content components are excluded below.

| zip-main path | disposition | evidence/staging path | justification |
|---|---|---|---|
| `src/app/(public)/privacy-policy/page.tsx` | PORTED-NOW | `app/(public)/privacy-policy/page.tsx` | staging had no privacy route; content is markdown text rendered via react-markdown; POLICY_PATH adapted to the committed `legal-consent/cognix-privacy-policy.md` (the referenced `flare-privacy-policy.md` exists in no tree — destination latent bug) |
| `src/app/(public)/privacy-policy/layout.tsx` | PORTED-NOW | `app/(public)/privacy-policy/layout.tsx` | SEO metadata wrapper, verbatim |
| `src/app/(public)/cookies-policy/page.tsx` | PORTED-NOW | `app/(public)/cookies-policy/page.tsx` | same as privacy; parser regex (`# Cookies Policy`) matches the committed md |
| `src/app/(public)/cookies-policy/layout.tsx` | PORTED-NOW | `app/(public)/cookies-policy/layout.tsx` | verbatim |
| `src/app/(public)/terms-of-service/page.tsx` | PORTED-NOW | `app/(public)/terms-of-service/page.tsx` | staging had no terms route; 1161 lines of self-contained JSX policy text; only deps next/image, next/link, lucide-react |
| `src/app/(public)/terms-of-service/layout.tsx` | PORTED-NOW | `app/(public)/terms-of-service/layout.tsx` | verbatim |
| `src/app/(public)/refund-policy/page.tsx` | PORTED-NOW | `app/(public)/refund-policy/page.tsx` | staging had no refund route; 279 lines self-contained JSX policy text |
| `src/app/(public)/refund-policy/layout.tsx` | PORTED-NOW | `app/(public)/refund-policy/layout.tsx` | verbatim |
| `src/app/(public)/about/page.tsx` | EXCLUDED | no staging route; 796 lines brand/company page | marketing/branding surface; no staging route consumes it; restore when the landing redesign is ported |
| `src/app/(public)/about/layout.tsx` | EXCLUDED | no staging route | marketing metadata wrapper for the excluded about page |
| `src/app/(public)/landing/page.tsx` | EXCLUDED | staging root `app/(chat)/page.tsx` is chat-first (HomeChat) | marketing landing route; no staging consumer; restore when the landing redesign is ported |
| `src/app/(public)/landing/layout.tsx` | EXCLUDED | no staging route | marketing metadata wrapper for the excluded landing page |
| `src/app/(public)/plans/page.tsx` | EXCLUDED | no staging `/plans` route; renders `components/payments/plans-page-content.tsx` (excluded) | billing/marketing plans page; staging billing UI is the Dodo billing card in user settings (C18); restore with the plans/landing workstream |

---

## components/landing (24) — all EXCLUDED

Staging has no `components/landing` tree and no landing route. Every file is a marketing-section
component of the destination landing redesign; their only consumers are each other and the excluded
`(public)/landing` route.

| zip-main path | disposition | evidence/staging path | justification |
|---|---|---|---|
| `src/components/landing/landing-page-body.tsx` | EXCLUDED | no staging landing tree/route | no staging route consumes it; restore when the landing redesign is ported |
| `src/components/landing/provider.tsx` | EXCLUDED | same | no staging route consumes it; restore when the landing redesign is ported |
| `src/components/landing/SmoothScroll.tsx` | EXCLUDED | same | no staging route consumes it; restore when the landing redesign is ported |
| `src/components/landing/lib/motion.ts` | EXCLUDED | same | no staging route consumes it; restore when the landing redesign is ported |
| `src/components/landing/lib/tokens.ts` | EXCLUDED | same | no staging route consumes it; restore when the landing redesign is ported |
| `src/components/landing/sections/AtomsSection.tsx` | EXCLUDED | same | no staging route consumes it; restore when the landing redesign is ported |
| `src/components/landing/sections/BuiltToScale.tsx` | EXCLUDED | same | no staging route consumes it; restore when the landing redesign is ported |
| `src/components/landing/sections/CareersCTA.tsx` | EXCLUDED | same | no staging route consumes it; restore when the landing redesign is ported |
| `src/components/landing/sections/ConnectSection.tsx` | EXCLUDED | same | no staging route consumes it; restore when the landing redesign is ported |
| `src/components/landing/sections/DeveloperSection.tsx` | EXCLUDED | same | no staging route consumes it; restore when the landing redesign is ported |
| `src/components/landing/sections/EnterpriseSecurity.tsx` | EXCLUDED | same | no staging route consumes it; restore when the landing redesign is ported |
| `src/components/landing/sections/Footer.tsx` | EXCLUDED | same | no staging route consumes it; restore when the landing redesign is ported |
| `src/components/landing/sections/Hero.tsx` | EXCLUDED | same | no staging route consumes it; restore when the landing redesign is ported |
| `src/components/landing/sections/LatestResearch.tsx` | EXCLUDED | same | no staging route consumes it; restore when the landing redesign is ported |
| `src/components/landing/sections/MachineIntelligence.tsx` | EXCLUDED | same | no staging route consumes it; restore when the landing redesign is ported |
| `src/components/landing/sections/Navbar.tsx` | EXCLUDED | same | no staging route consumes it; restore when the landing redesign is ported |
| `src/components/landing/sections/PlatformUI.tsx` | EXCLUDED | same | no staging route consumes it; restore when the landing redesign is ported |
| `src/components/landing/sections/Thesis.tsx` | EXCLUDED | same | no staging route consumes it; restore when the landing redesign is ported |
| `src/components/landing/ui/AnimCounter.tsx` | EXCLUDED | same | no staging route consumes it; restore when the landing redesign is ported |
| `src/components/landing/ui/FadeIn.tsx` | EXCLUDED | same | no staging route consumes it; restore when the landing redesign is ported |
| `src/components/landing/ui/InteractiveConsole.tsx` | EXCLUDED | same | no staging route consumes it; restore when the landing redesign is ported |
| `src/components/landing/ui/Marquee.tsx` | EXCLUDED | same | no staging route consumes it; restore when the landing redesign is ported |
| `src/components/landing/ui/WaveformBars.tsx` | EXCLUDED | same | no staging route consumes it; restore when the landing redesign is ported |
| `src/components/landing/ui/WorkflowPreview.tsx` | EXCLUDED | same | no staging route consumes it; restore when the landing redesign is ported |

---

## components/admin (14) — all EXCLUDED

Staging's admin console is upstream-shaped: routes `app/(chat)/admin/{payments,providers,security}`
consuming `components/admin/{dodo-payments-settings,dynamic-providers-settings,security-events-settings}.tsx`
(plus `users-table` +skeleton, now wired by this pass's port), backed by `app/api/admin/{actions,api-keys,payments,providers{,/discover,/test},security-settings}`.
The zip-main admin files below are the destination's site_config console (shell + 5 config tabs +
6 UI helpers, ~4.4k lines with the settings pages). Staging has the site_config **backend**
(`lib/db/pg/repositories/site-config-repository.pg.ts`, wired into `lib/db/repository.ts` and
`lib/ai/models.ts`) but **no** site-config admin UI; porting the console is a dedicated workstream,
not a small UI port (largest single file `ui/model-selector.tsx` = 885 lines; models settings page
= 1238 lines).

| zip-main path | disposition | evidence/staging path | justification |
|---|---|---|---|
| `src/components/admin/admin-shell.tsx` | EXCLUDED | staging console has no shell wrapper (3 direct routes) | 11-line wrapper of the destination site-config console; no staging consumer |
| `src/components/admin/admin-sidebar.tsx` | EXCLUDED | staging nav = `components/layouts/app-sidebar-menu-admin.tsx` (links to /admin/providers, /admin/security, /admin/payments) | destination console sidebar; staging admin nav exists upstream-shaped; do not restructure staging UI |
| `src/components/admin/back-button-skeleton.tsx` | EXCLUDED | staging has `components/layouts/back-button.tsx` | consumer (destination settings layout) not ported; no staging consumer |
| `src/components/admin/config/artifacts-tab.tsx` | EXCLUDED | staging site-config backend exists, no UI | site-config console tab (124 L); port with the site-config admin workstream |
| `src/components/admin/config/canvas-tab.tsx` | EXCLUDED | same | site-config console tab (120 L); port with the site-config admin workstream |
| `src/components/admin/config/general-tab.tsx` | EXCLUDED | same | site-config console tab (160 L); port with the site-config admin workstream |
| `src/components/admin/config/models-tab.tsx` | EXCLUDED | same | site-config console tab (180 L); port with the site-config admin workstream |
| `src/components/admin/config/tools-tab.tsx` | EXCLUDED | same | site-config console tab (405 L); port with the site-config admin workstream |
| `src/components/admin/ui/admin-card.tsx` | EXCLUDED | no staging consumer | console UI helper (149 L) used only by excluded console pages |
| `src/components/admin/ui/admin-settings-page.tsx` | EXCLUDED | no staging consumer | console UI helper (215 L) used only by excluded console pages |
| `src/components/admin/ui/form-fields.tsx` | EXCLUDED | no staging consumer | console UI helper (178 L) used only by excluded console pages |
| `src/components/admin/ui/model-selector.tsx` | EXCLUDED | staging model selection = `components/select-model.tsx`; admin provider UI = `dynamic-providers-settings.tsx` | 885-line destination selector (fetches /api/chat/models + /api/admin/providers + /api/admin/config); /api/admin/config does not exist in staging; dedicated workstream |
| `src/components/admin/ui/shortcut-help-modal.tsx` | EXCLUDED | no staging consumer | console helper (110 L) used only by excluded console pages |
| `src/components/admin/ui/toast-helpers.ts` | EXCLUDED | staging uses `ui/shared-toast.tsx` / sonner | 33-line helper for excluded console pages |

---

## app/(chat) (25) — 3 PORTED-NOW, 5 EQUIVALENT-AT, 17 EXCLUDED

| zip-main path | disposition | evidence/staging path | justification |
|---|---|---|---|
| `src/app/(chat)/(admin)/admin/audit/page.tsx` | EQUIVALENT-AT | `app/(chat)/admin/security/page.tsx` + `components/admin/security-events-settings.tsx` + `app/api/admin/security-settings` (migration 0075 security_events) | staging ships security-events admin UI at a different route; parity-map guess confirmed |
| `src/app/(chat)/(admin)/admin/health/page.tsx` | EXCLUDED | staging has no /api/admin/health or health page | destination-only ops diagnostics (183 L); restore with an infra/health workstream if wanted |
| `src/app/(chat)/(admin)/admin/page.tsx` | EXCLUDED | staging admin nav links directly to the three console routes | 311-line hub page of the destination site-config console; no staging consumer |
| `src/app/(chat)/(admin)/admin/layout.tsx` | EXCLUDED | — | file is empty (0 lines); nothing to port |
| `src/app/(chat)/(admin)/admin/settings/layout.tsx` | EXCLUDED | staging console routes are standalone | 8-line console chrome wrapper; no staging consumer |
| `src/app/(chat)/(admin)/admin/settings/page.tsx` | EXCLUDED | same | 5-line redirect/console entry; no staging consumer |
| `src/app/(chat)/(admin)/admin/settings/models/page.tsx` | EQUIVALENT-AT | `app/(chat)/admin/providers/page.tsx` + `components/admin/dynamic-providers-settings.tsx` + `app/api/admin/providers{,/discover,/test}` | staging covers dynamic-provider CRUD/discovery/test and default/fallback model selection (A15) at the providers route |
| `src/app/(chat)/(admin)/admin/settings/artifacts/page.tsx` | EXCLUDED | staging site-config backend exists, no UI | console tab (231 L); port with the site-config admin workstream |
| `src/app/(chat)/(admin)/admin/settings/branding/page.tsx` | EXCLUDED | same | console tab (135 L); port with the site-config admin workstream |
| `src/app/(chat)/(admin)/admin/settings/canvas/page.tsx` | EXCLUDED | same | console tab (178 L); port with the site-config admin workstream |
| `src/app/(chat)/(admin)/admin/settings/chat/page.tsx` | EXCLUDED | same | console tab (211 L); port with the site-config admin workstream |
| `src/app/(chat)/(admin)/admin/settings/general/page.tsx` | EXCLUDED | same | console tab (436 L); port with the site-config admin workstream |
| `src/app/(chat)/(admin)/admin/settings/oauth/page.tsx` | EXCLUDED | same | console tab (229 L); port with the site-config admin workstream |
| `src/app/(chat)/(admin)/admin/settings/tools/page.tsx` | EXCLUDED | same | console tab (851 L); port with the site-config admin workstream |
| `src/app/(chat)/(admin)/admin/users/(list)/page.tsx` | PORTED-NOW | `app/(chat)/(admin)/admin/users/(list)/page.tsx` | closes the dangling `/admin/users` link target of staging's own users-table; all imports verified present in staging (see Summary) |
| `src/app/(chat)/(admin)/admin/users/(list)/layout.tsx` | PORTED-NOW | same | 4-line passthrough layout |
| `src/app/(chat)/(admin)/admin/users/(list)/loading.tsx` | PORTED-NOW | same | renders existing staging `UsersTableSkeleton` |
| `src/app/(chat)/(admin)/admin/users/[id]/layout.tsx` | EXCLUDED | detail page `users/[id]/page.tsx` is NOT in the unmatched set (see false-match note below) | porting the layout without the detail page creates an inert route; port together with the users/[id] detail workstream |
| `src/app/(chat)/archive/[id]/archive-actions-client.tsx` | EQUIVALENT-AT | `components/archives/archive-detail.tsx` + `app/(chat)/archives/[id]/page.tsx` + `lib/archives/archive-service.ts` (C40) | staging archives are staging-native with detail page + thread management; zip server-action variant superseded |
| `src/app/(chat)/canvas/page.tsx` | PORTED-NOW | `app/(chat)/canvas/page.tsx` | 9-line back-compat redirect `/canvas` → `/ecanvas`; zero deps; preserves pre-promotion bookmarks for the production domain |
| `src/app/(chat)/dashboard/page.tsx` | EQUIVALENT-AT | `app/(chat)/page.tsx` (HomeChat) | staging's chat-first home is the same "fresh ChatBot" behavior; parity-map guess confirmed |
| `src/app/(chat)/profile/page.tsx` | EXCLUDED | staging profile mgmt = `components/user/user-detail/user-settings-popup.tsx` (C17) + Dodo billing card in `user-detail.tsx` (C18) | 669-line destination profile/billing route; staging delivers the workflows via settings popup + billing card; restore with profile-route workstream if the route UX is wanted |
| `src/app/(chat)/profile/pending-reconcile.tsx` | EXCLUDED | same | client helper (114 L) of the excluded profile route |
| `src/app/(chat)/sandboxes/page.tsx` | EXCLUDED | staging sandbox APIs exist (`app/api/sandbox`, inngest reap) but no dashboard route | page renders `components/sandbox/sandbox-dashboard.tsx` (254 L, excluded); dedicated port needed |
| `src/app/(chat)/settings/connectors/connectors-settings-view.tsx` | EQUIVALENT-AT | `app/(chat)/connectors/page.tsx` + `components/connectors/connector-settings.tsx` | staging connectors UX is upstream-shaped (C42); destination view (997 L) also depends on excluded `ui/connector-logo-icon.tsx` |

**False basename match flagged (out of my scope, needs re-triage):** the parity map matches
`src/app/(chat)/(admin)/admin/users/[id]/page.tsx` and `.../users/[id]/loading.tsx` to
`src/app/(chat)/agent/[id]/page.tsx|loading.tsx` by parent-dir rule — that is a user-detail page vs
an agent page (imports `lib/user/server.getUser*`, `components/user/user-detail/*`), not an
equivalent. Staging's users-table links to `/admin/users/[id]`, which therefore still 404s; the
detail route + `user-sessions.tsx` should be triaged together in a follow-up.

---

## components (11) — 5 EQUIVALENT-AT, 6 EXCLUDED

| zip-main path | disposition | evidence/staging path | justification |
|---|---|---|---|
| `src/components/agent-gallery.tsx` | EXCLUDED | staging marketplace is MCP-only (`app/marketplace/mcp/page.tsx`); no `/gallery/agents` route, no agent-install UI | destination public agent gallery card (164 L); its route and APIs (`/api/agent/published`, `agent/[id]/view`) are separate families; port with the agent-publication workstream |
| `src/components/chunk-error-recovery.tsx` | EXCLUDED | no staging mount; grep shows no importer in zip-main either (dead code in zip) | webpack chunk-error auto-reload helper; would require root-layout wiring in staging; propose separately if wanted |
| `src/components/connectors-popover.tsx` | EXCLUDED | staging connectors UI = `app/(chat)/connectors/page.tsx` | 614-line destination quick-switch popover; different UX; no staging consumer |
| `src/components/customize-popup.tsx` | EXCLUDED | staging equivalent = `components/chat-preferences-popup.tsx` + `chat-preferences-content.tsx` | destination customize drawer imports `SkillsContent`, which staging's preferences content does not export (staging skills live in `components/skills/`); would need re-adaptation |
| `src/components/knowledge-dashboard.tsx` | EQUIVALENT-AT | `app/(chat)/knowledge/page.tsx` (renders `components/collections/collections-dashboard.tsx`) | staging knowledge UI is the upstream collections dashboard (C41/knowledge-bases APIs) |
| `src/components/knowledge-detail.tsx` | EQUIVALENT-AT | `app/(chat)/knowledge/[id]/page.tsx` + `components/collections/*` | same subsystem at a different path |
| `src/components/mcp-card.tsx` | EQUIVALENT-AT | `components/mcp-dashboard.tsx` (+ `mcp-editor.tsx`, `mcp-marketplace.tsx`) | staging MCP UI covers registration/editing/marketplace (C04/C05) |
| `src/components/mcp-overview.tsx` | EQUIVALENT-AT | `components/mcp-dashboard.tsx` | same subsystem |
| `src/components/message-parts.tsx` | EQUIVALENT-AT | `components/message-parts/` (restructured directory: tool-part, attachment-part, reasoning-part, …) | staging deliberately split the 2079-line monolith; do not reintroduce |
| `src/components/text-selection-popup.tsx` | EXCLUDED | no staging counterpart or importer | destination chat selection-quote helper; depends on `@/app/store` wiring; no staging consumer |
| `src/components/warning-banner.tsx` | EXCLUDED | zip consumer was `app/(chat)/layout.tsx`; staging chat layout has no mount point | 43-line dismissible banner; mounting it edits staging's chat shell (out of scope); product decision needed |

---

## components/user (6) — 1 PORTED-NOW, 4 EQUIVALENT-AT, 1 EXCLUDED

| zip-main path | disposition | evidence/staging path | justification |
|---|---|---|---|
| `src/components/user/user-detail/memory-ui-helpers.test.ts` | PORTED-NOW | `components/user/user-detail/memory-ui-helpers.test.ts` | staging ships `memory-ui-helpers.ts` with exactly the tested exports; vitest 22/22 passed |
| `src/components/user/user-detail/user-detail-card.tsx` | EQUIVALENT-AT | `components/user/user-detail/user-detail-form-card.tsx` | same profile-fields card role in staging's user-detail set |
| `src/components/user/user-detail/user-detail-content.tsx` | EQUIVALENT-AT | `components/user/user-detail/user-settings-content.tsx` | staging settings-content consumed by user-settings-popup (C17) |
| `src/components/user/user-detail/user-info-card.tsx` | EQUIVALENT-AT | `components/user/user-detail/user-access-card.tsx` (+skeleton) | access/roles card equivalent |
| `src/components/user/user-detail/user-sessions.tsx` | EXCLUDED | `getUserSessions` exists in staging `lib/user/server.ts` (L62) but no staging UI renders sessions | 79-line server component whose consumers (profile route, users/[id] page) are excluded/false-matched; port with the user-detail route workstream |
| `src/components/user/user-detail/user-stats.tsx` | EQUIVALENT-AT | `components/user/user-detail/user-statistics-card.tsx` (+ `user-stats-card-loader.tsx`) | stats card equivalent |

---

## PWA / favicon assets (11) — 1 EQUIVALENT-AT, 10 EXCLUDED

| zip-main path | disposition | evidence/staging path | justification |
|---|---|---|---|
| `src/components/pwa/service-worker-registration.tsx` | EQUIVALENT-AT | `lib/push/register-web-push.ts` registers `/sw.js` (C16 push); `public/sw.js` + `public/manifest.json` ship in staging | SW registration already wired via the push client; zip's hourly `registration.update()` polling is a minor enhancement, not a missing workflow |
| `src/app/apple-touch-icon.webp` | EXCLUDED | staging ships `app/apple-touch-icon.png` + full file-convention set (favicon.ico, favicon-16x16.png, favicon-32x32.png, android-chrome-192/512.png) | staging has its own committed icon set; adding webp duplicates would conflict with the root-layout/manifest references |
| `src/app/favicon-16x16.webp` | EXCLUDED | staging `app/favicon-16x16.png` | duplicate-format asset |
| `src/app/favicon-32x32.webp` | EXCLUDED | staging `app/favicon-32x32.png` | duplicate-format asset |
| `src/app/favicon-96x96.png` | EXCLUDED | no staging reference | unreferenced size in staging's set |
| `src/app/favicon-96x96.webp` | EXCLUDED | no staging reference | unreferenced size/format |
| `src/app/favicon.svg` | EXCLUDED | staging uses ico/png set | not referenced by staging metadata |
| `src/app/web-app-manifest-192x192.png` | EXCLUDED | `public/manifest.json` icons = `/flare-logo-192.webp`, `/flare-logo-512.webp` (present in staging public/) | manifest already satisfied by existing assets |
| `src/app/web-app-manifest-192x192.webp` | EXCLUDED | same | duplicate-format asset |
| `src/app/web-app-manifest-512x512.png` | EXCLUDED | same | duplicate-format asset |
| `src/app/web-app-manifest-512x512.webp` | EXCLUDED | same | duplicate-format asset |

---

## Remaining components/* buckets (27)

### components/auth (3) — 2 EQUIVALENT-AT, 1 EXCLUDED

| zip-main path | disposition | evidence/staging path | justification |
|---|---|---|---|
| `src/components/auth/auth-page.tsx` | EQUIVALENT-AT | `app/(auth)/sign-in/page.tsx` + `components/auth/sign-in.tsx` / `sign-up.tsx` / `email-sign-up.tsx` | staging auth is page-based upstream-shaped; captcha covered below |
| `src/components/auth/segmented-control.tsx` | EXCLUDED | only zip consumer is the excluded `auth-page.tsx` | staging splits sign-in/sign-up into routes; no segmented mode switcher consumer |
| `src/components/auth/turnstile-widget.tsx` | EQUIVALENT-AT | `components/auth/use-captcha.tsx` + `lib/auth/captcha.ts` (Better Auth captcha plugin, `@marsidev/react-turnstile`) | staging Turnstile wiring is server+client and env-gated; zip widget superseded |

### components/canvas (2) — 2 EQUIVALENT-AT

| zip-main path | disposition | evidence/staging path | justification |
|---|---|---|---|
| `src/components/canvas/canvas-panel-wrapper.tsx` | EQUIVALENT-AT | `components/canvas/ecanvas/` (App.tsx + components) + `app/(chat)/ecanvas/*` | staging ecanvas is the canvas subsystem (register: ecanvas supersedes zip canvas) |
| `src/components/canvas/canvas-panel.tsx` | EQUIVALENT-AT | same | 280-line zip panel superseded by ecanvas implementation |

### components/chat (1) — 1 EQUIVALENT-AT

| zip-main path | disposition | evidence/staging path | justification |
|---|---|---|---|
| `src/components/chat/citation.tsx` | EQUIVALENT-AT | `components/citations/` (citation-mark, cited-markdown, citation-sources-panel, citation-document-link) | staging restructured citations into its own directory (B07 evidence) |

### components/gallery (1) — 1 EXCLUDED

| zip-main path | disposition | evidence/staging path | justification |
|---|---|---|---|
| `src/components/gallery/my-installed-agents.tsx` | EXCLUDED | staging `components/marketplace/my-installs-panel.tsx` lists MCP installs only (consumed by `/marketplace/mcp`) | no staging agent-install UI exists (C03 install flow is destination-side); port with the agent-gallery/publication workstream |

### components/layouts (2) — 2 EXCLUDED

| zip-main path | disposition | evidence/staging path | justification |
|---|---|---|---|
| `src/components/layouts/app-sidebar-canvas-history.tsx` | EXCLUDED | staging sidebar restructured (`app-sidebar*.tsx`) with no canvas-history section; ecanvas manages its own state | mounting would restructure staging's existing sidebar; restore with the destination shell workstream |
| `src/components/layouts/mobile-sidebar-sheet.tsx` | EXCLUDED | staging layouts have no mobile sheet (`app-shell`/`app-header` handle responsive nav) | 442-line destination mobile nav; consumers are destination shell files; do not restructure staging UI |

### components/payments (7) — 7 EXCLUDED

| zip-main path | disposition | evidence/staging path | justification |
|---|---|---|---|
| `src/components/payments/plans-page-content.tsx` | EXCLUDED | no staging `/plans` route | 669-line destination plans page body; restore with the plans/landing workstream |
| `src/components/payments/plan-card.tsx` | EXCLUDED | same | consumer is the excluded plans page |
| `src/components/payments/comparison-table.tsx` | EXCLUDED | same | consumer is the excluded plans page |
| `src/components/payments/plans-faq.tsx` | EXCLUDED | same | consumer is the excluded plans page |
| `src/components/payments/hero-orbital.tsx` | EXCLUDED | same | decorative marketing visual for the plans page |
| `src/components/payments/dodo/dodo-upgrade-card.tsx` | EXCLUDED | staging billing UI = `components/payments/dodo/dodo-billing-card.tsx` (in `user-detail.tsx`, C18 with customer portal) | zip upgrade card superseded by staging's Dodo billing card |
| `src/components/payments/dodo/upgrade-plan-button.tsx` | EXCLUDED | zip consumer = destination `app-header.tsx` upgrade entry; staging header has no billing entry | C18 portal lives in user settings; header integration is destination-shell work |

### components/pwa (1) — see PWA table above (EQUIVALENT-AT).

### components/sandbox (1) — 1 EXCLUDED

| zip-main path | disposition | evidence/staging path | justification |
|---|---|---|---|
| `src/components/sandbox/sandbox-dashboard.tsx` | EXCLUDED | staging has sandbox APIs (`app/api/sandbox`, inngest reap) but no dashboard route/page | 254-line dashboard + page + hooks would be a dedicated port; no staging consumer today |

### components/tool-invocation (7) — 3 EQUIVALENT-AT, 4 EXCLUDED

| zip-main path | disposition | evidence/staging path | justification |
|---|---|---|---|
| `src/components/tool-invocation/artifact-creator.tsx` | EQUIVALENT-AT | `components/artifact-panel/` (artifact-panel, artifact-chip, document-preview + tests) | staging artifact UI restructured (A26/C30 evidence) |
| `src/components/tool-invocation/browser-agent.tsx` | EXCLUDED | staging browser execution is fail-closed/B20-blocked (`lib/ai/tools/browser/execution-gate.ts`); browser toolkit removed from registry | card for the FIRECRAWL/Steel browser agent; B20 must stay blocked per security review; restore only with a verified isolated runtime |
| `src/components/tool-invocation/canvas-ppt-maker.tsx` | EXCLUDED | staging has no ppt-maker tool (`lib/ai/tools` has no canvas/ dir; only ingest slides reader) | no staging tool to render; restore with the ecanvas-tool/ppt workstream |
| `src/components/tool-invocation/code.worker.ts` | EXCLUDED | — | file is empty (0 lines) in zip-main; destination code-engine (B20-adjacent) not ported |
| `src/components/tool-invocation/memory-action.tsx` | EQUIVALENT-AT | staging registers `save_memory`/`delete_memory`/`search_memory` (`lib/ai/tools/index.ts`) and renders invocations via the generic `components/message-parts/tool-part.tsx` pipeline | function (display memory tool actions) exists; dedicated card is cosmetic |
| `src/components/tool-invocation/sequential-thinking.tsx` | EQUIVALENT-AT | `SequentialThinkingToolName` registered in `lib/ai/tools/index.ts` (L110); rendered generically + `message-parts/reasoning-part.tsx` | function exists in staging's generic pipeline |
| `src/components/tool-invocation/video-generator.tsx` | EXCLUDED | staging has no video-generation backend (`VideoGeneration` appears only as an enum value in `lib/ai/tools/index.ts`; image-generator is the only media card) | no tool to render; restore with the video-generation workstream (parity map: "staging has image-generator.tsx only") |

### components/workflow (2) — 1 EQUIVALENT-AT, 1 EXCLUDED

| zip-main path | disposition | evidence/staging path | justification |
|---|---|---|---|
| `src/components/workflow/workflow-list-page.tsx` | EQUIVALENT-AT | `app/(chat)/workflow/page.tsx` + `components/workflow/workflow-index.tsx` (+ `n8n-workflow-list.tsx`) | staging workflow list/index covers the same surface (C07) |
| `src/components/workflow/workflow-context-menu.tsx` | EXCLUDED | unused in zip-main itself (`git grep WorkflowContextMenu aa9fce0` matches only its own file); staging `workflow-index.tsx` has its own card actions | dead code in the original; nothing to preserve |

---

## Findings that affect other workstreams

1. **False basename matches in the parity map ( Appendix B, parent-dir rule):**
   `src/app/(chat)/(admin)/admin/users/[id]/page.tsx` + `loading.tsx` → `app/(chat)/agent/[id]/*`
   is wrong (user detail vs agent detail). Staging's users-table links to `/admin/users/[id]`,
   which 404s until the detail route is triaged. Recommend re-triaging those two paths plus
   `user-sessions.tsx` together.
2. **Destination latent bug recorded:** `app/(public)/privacy-policy/page.tsx` and
   `cookies-policy/page.tsx` reference `legal-consent/flare-*.md`, which is committed in no tree
   (zip-main, destination, staging). The committed `legal-consent/cognix-*.md` files carry the
   current Flare-branded text and the exact format the pages parse; the staging port points at
   them. Consider fixing the destination paths separately.
3. **Staging site_config admin UI is absent while the backend exists**
   (`site-config-repository.pg.ts` wired into `lib/ai/models.ts` / `lib/db/repository.ts`). The
   excluded `components/admin/*` + `admin/settings/*` console (~4.4k lines incl. 885-line
   model-selector) is the natural candidate for a dedicated site-config admin workstream.
4. **Marketing surface (landing + about + plans + payments plans components, ~1.9k lines) is fully
   excluded** pending a product decision on the landing redesign; the legal routes that the terms
   page links to are now present, so no dangling legal links remain except none (privacy,
   cookies, refund, terms all exist after this pass).
5. `app/api/agent/published*`, `app/api/agent/[id]/view*` (agent gallery APIs) were outside my
   families; with `agent-gallery.tsx`/`my-installed-agents.tsx` excluded for "no staging route",
   those API routes should be triaged with the same publication workstream rather than ported
   standalone.
