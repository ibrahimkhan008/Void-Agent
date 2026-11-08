# Public agent gallery

The public agent gallery is a browsable list of agents that other users
have chosen to share. Anyone — signed in or not — can open the gallery,
read the agent's description, see how many people installed it, and
click Install to add it to their own account. The gallery is the
distribution channel for community-built agents; the schema mirrors
the MCP marketplace so the two features feel like siblings.

## What the gallery is

The gallery is a public read surface over a subset of the existing
`agent` table. An agent appears in the gallery when its
`published_at` column is set. The list is sorted by
`published_at DESC` so the most recently shared agents surface first.
The optional `gallery_metadata` jsonb column carries
publisher-controlled display fields (tagline, sample prompts,
screenshots), and `cover_image_url` is the banner image on the
detail card.

A separate **`agent_view`** table records one row per page view so
the agent's owner can see "how popular is my agent?" later. The view
counter is denormalized for the card's headline number; the
authoritative count lives in the analytics table.

## How to publish an agent

The owner publishes from the agent editor after setting its visibility
to `public` or `readonly`. The editor calls the authenticated,
same-origin `POST /api/agent/[id]/publish` endpoint. Publication is
owner-scoped, rate-limited, and only updates rows whose visibility is
still shared when the database write runs. The endpoint preserves the
original publication timestamp on repeated publish requests.

The owner can remove the agent from the gallery with
`DELETE /api/agent/[id]/publish`. This clears `published_at`; gallery,
install, and embed lookups only return currently published agents with
`public` or `readonly` visibility. Switching an agent to private hides
it from those public reads even if its publication timestamp remains.

## How to discover

Two entry points, both public:

- **`/gallery/agents`** — the UI. A grid of cards, one per published
  agent. Each card shows the agent's name, the gallery tagline from
  `gallery_metadata`, the cover image (or a placeholder), and the
  install count.
- **`GET /api/agent/published`** — the raw API. Returns the same
  catalogue shape as the page: `{ agents: [...] }`, with public fields
  (`id`, `name`, `description`, `icon`, `installCount`, `coverImageUrl`,
  `galleryMetadata`, `publishedAt`). It currently serves the first 50
  published rows; no query params are wired yet.

Both paths are server-rendered with a 5-minute ISR cache. The
underlying query uses
`agentInstallRepository.listPublishedAgents` in
`src/lib/db/pg/repositories/agent-install-repository.pg.ts`, which
hits the partial `agent_published_idx` index (only published rows
are in the index, so the gallery page stays fast as the agent
table grows).

## How to install

Every card has an "Install" button. The flow is:

1. The user clicks "Install". If they are not signed in, the client
   redirects to `/sign-in` and bounces back to the gallery on
   success.
2. The client posts to **`POST /api/agent/[id]/install`** with no
   body (the user id is the session, the agent id is the URL
   parameter). The route requires a valid Better Auth session;
   missing session returns 401.
3. The route calls
   `agentInstallRepository.installAgent({ agentId, config: {} }, userId, activeOrgId)`
   and then fire-and-forget calls
   `agentInstallRepository.incrementInstallCount(agentId)`. The install
   is idempotent on the `UNIQUE (user_id, agent_id)` constraint.
4. On 201, the response includes `{ installId, agent }`. The installed
   agents API (`GET /api/agent/installed`) can then show it in the
   user's private installed list.

The current install route reads `activeOrgId` from the Better Auth
session when present, otherwise falls back to personal scope (`null`).

## View analytics: the `agent_view` table

Every page view of a gallery card can insert one row into
`agent_view` through `agentViewRepository.recordAgentView`. The table
accepts `userId` as nullable — anonymous views are allowed — and an
optional upstream `referrer`. The Phase 4 public page and install route
currently do not call the analytics repository yet; the table and
repository are ready for the owner-dashboard follow-up. The design is
append-only, with no unique constraint and no upsert:

- `recordAgentView` is fire-and-forget — the gallery page does not
  await the insert, so a slow DB write does not delay the render.
- `countAgentViews(agentId)` is a cheap aggregate scan over the
  `(agent_id, viewed_at)` index for a lifetime count.
- `countAgentViewsByDay(agentId, days = 14)` is a per-day
  sparkline, suitable for a future agent-owner dashboard. It
  back-fills zero-count days so the sparkline is contiguous.

The gallery card's headline "X installs" number is the
denormalized `agent.install_count` cache; the
`agentViewRepository.countAgentViews` aggregate is the source of
truth for analytics and would surface on the agent owner's
detail page in a future iteration.

## The pipeline at a glance

1. **Publish** — the agent owner writes `published_at` and
   (optionally) `gallery_metadata` on the row. The
   `webhook_event_outbox` (Phase 3) fires an `agent.published`
   event for any subscriber that has opted in.
2. **Discover** — anonymous user lands on `/gallery/agents`. The
   Next.js page calls
   `agentInstallRepository.listPublishedAgents(50, 0)`. The page is
   ISR-cached for 5 minutes.
3. **Install** — signed-in user clicks Install. The client posts
   to `POST /api/agent/[id]/install`. The route requires a
   session, inserts (or upserts) the `agent_install` row, and bumps
   `install_count` by one.
4. **Use** — the user opens a chat with the installed agent. The
   agent is now a regular first-class agent in the user's
   account — they can edit it, share it, or un-publish (if they
   are the original author) at will.

## Limits and risks

- **50 agents per gallery page.** `listPublishedAgents` defaults
  to `limit = 50`. The query supports `limit` / `offset` and
  the `agent_published_idx` partial index makes it cheap, so
  infinite scroll is a one-screen follow-up. The public API route
  also currently fixes the limit at 50 and does not parse query params.
- **5 minute ISR cache.** The gallery page revalidates every
  5 minutes. A newly published agent can take up to 5 minutes
  to appear; install counts are stale for the same window. This
  is the "eventually consistent" install count mentioned in
  the plan.
- **Install count is best-effort and one-way.**
  `incrementInstallCount` is `install_count + 1`; uninstalls do
  not decrement. The source of truth is the row count in
  `agent_install`; the cache is for sort order.
- **`agent_view.recordAgentView` does not de-dupe.** High-volume
  inserts are expected once analytics recording is wired into the page
  or detail route. The caller should invoke it at most once per page
  render; spamming the route will multiply rows but does not corrupt
  the count.
- **Anonymous views are allowed and intentional.** The
  `agent_view.user_id` column is nullable and uses
  `ON DELETE SET NULL`. Anonymous browsing is a feature: the
  analytics still tell the owner "how many humans saw this
  card", without forcing a sign-in.
- **Gallery metadata editing is not yet in the editor.** Publication
  currently uses the agent's existing name, description, and icon;
  optional `gallery_metadata` and cover image fields still need an
  owner-facing editor.
- **No moderation tools yet.** Anything an owner publishes
  appears immediately on the next ISR revalidation. A
  take-down / report flow is a Phase 5 hardening item.

## See also

- `src/lib/db/pg/repositories/agent-install-repository.pg.ts` —
  the install + published-list data layer
- `src/lib/db/pg/repositories/agent-view-repository.pg.ts` —
  the analytics data layer (`recordAgentView`,
  `countAgentViews`, `countAgentViewsByDay`)
- `src/app/api/agent/published/route.ts` — the public list
  endpoint
- `src/app/api/agent/[id]/install/route.ts` — the install route
- `src/app/api/agent/[id]/publish/route.ts` — owner publication lifecycle
- `src/app/gallery/agents/page.tsx` — the public gallery page
- `src/components/agent-gallery.tsx` — the card grid/card component
- `src/components/gallery/my-installed-agents.tsx` — the installed
  agents panel
- `src/lib/db/migrations/pg/0025_amber_assembly.sql` — the
  schema migration that adds `published_at`, `install_count`,
  `gallery_metadata`, `cover_image_url`, the `agent_install`
  table, and the `agent_view` analytics table

## Copy a published agent into your account

The gallery now offers a separate **Copy to my agents** action in addition to the existing install-record flow. It creates a new first-class agent owned by the signed-in user, private by default, and opens that user's copy in the editor. The existing Install action continues to create/refresh only the `agent_install` row and update the gallery install count; copying does not alter that behavior.

`POST /api/agent/[id]/clone` requires authentication, agent-create permission, same-origin request, rate capacity, and a currently published `public` or `readonly` source. The repository holds a shared row lock and rechecks publication/visibility in the same transaction before copying. A deterministic user-scoped `preset_id` makes repeat requests return the same copy. The new row has no publication timestamp, gallery metadata, cover, or install count. Only the published name/description/icon plus role/system prompt are copied; model pins, MCP/agent mentions, and publisher file bindings are intentionally dropped to avoid inheriting integrations or private storage references.

Verification: clone route/repository tests and existing install/gallery regression tests passed 33/33. Live PostgreSQL/browser confirmation remains pending; no migration was required.