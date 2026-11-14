# Native Production Deployment on the VPS (no Docker)

The production stack as actually deployed on **instance-20261010-1836**
(Oracle Cloud ARM, Ubuntu 24.04, 2 vCPU / 11 GB RAM, hostname
`app.voidagent.space`). Everything runs natively under systemd — **no Docker**.
The Docker runbook in `DEPLOY-VPS.md` remains a valid alternative for other
hosts.

## Stack

| Layer     | What runs where                                            |
| --------- | ---------------------------------------------------------- |
| Web app   | Next.js 15 production server via `systemd` unit `void-agent` |
| Database  | PostgreSQL 16 + pgvector 0.6 (apt, cluster `16/main`)      |
| Cache     | Redis 7 (apt, AOF on, 127.0.0.1 only)                      |
| TLS/DNS   | Cloudflare Tunnel `void-agent` → `http://localhost:3000`    |
| Node/pnpm | Node 22 (NodeSource), pnpm 10.2.1 via corepack             |

No inbound ports are open — the app binds `127.0.0.1:3000` and is published
only through the tunnel.

## Layout on the VPS

- Code: `/home/ubuntu/void-agent` (clone of `ibrahimkhan008/Void-Agent`)
- Env: `/home/ubuntu/void-agent/apps/web/.env.production` (chmod 600, holds
  every secret) + symlink `/home/ubuntu/void-agent/.env.production` → same
  file (root-run scripts resolve env from the repo root)
- Service: `/etc/systemd/system/void-agent.service` (User=ubuntu,
  WorkingDirectory=apps/web, `EnvironmentFile` = the env file,
  `ExecStart=node_modules/.bin/next start`)
- Tunnel: `/etc/cloudflared/config.yml` (tunnel
  `388aeed9-9c1e-49e4-a452-9a42e1c9a103`, ingress `app.voidagent.space` →
  `http://localhost:3000`), credentials in `~/.cloudflared/`
- Backups: `/home/ubuntu/backups/void_agent_<date>.sql.gz`, nightly 03:00 UTC
  via ubuntu's crontab (pg_dump through `~/.pgpass`, 14-day retention)
- Swap: 4 GB `/swapfile` (build headroom)

## Reproducing from zero

```bash
# 1. Packages (all from Ubuntu repos, no Docker)
sudo apt update
sudo apt install -y postgresql-16 postgresql-16-pgvector redis-server
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
sudo corepack enable pnpm && corepack prepare pnpm@10.2.1 --activate

# 2. Database (role password: openssl rand -hex 24, store in the env file)
sudo -u postgres psql -c "CREATE ROLE voidagent LOGIN PASSWORD '<pw>';"
sudo -u postgres psql -c "CREATE DATABASE void_agent OWNER voidagent;"
sudo -u postgres psql -d void_agent -c "CREATE EXTENSION IF NOT EXISTS vector; CREATE EXTENSION IF NOT EXISTS pg_trgm;"
sudo sed -i 's/^appendonly no/appendonly yes/' /etc/redis/redis.conf

# 3. Code + env
gh repo clone ibrahimkhan008/Void-Agent /home/ubuntu/void-agent
#   create apps/web/.env.production (see DEPLOY-VPS.md §3 for the var list)
#   POSTGRES_URL=postgresql://voidagent:<pw>@127.0.0.1:5432/void_agent
#   REDIS_URL=redis://127.0.0.1:6379  NO_HTTPS=1  NODE_ENV=production
#   OPENAI_COMPATIBLE_DATA=[]   # catalog is admin-panel-managed
chmod 600 apps/web/.env.production
ln -sf apps/web/.env.production /home/ubuntu/void-agent/.env.production

# 4. Install + build (build OOMs at Node's default 2 GB heap — raise it)
cd /home/ubuntu/void-agent
DOCKER_BUILD=1 pnpm install --frozen-lockfile      # skips postinstall env setup
NODE_OPTIONS=--max-old-space-size=8192 pnpm build

# 5. Migrate (scripts read .env.<NODE_ENV> — NODE_ENV must be set)
NODE_ENV=production pnpm db:migrate

# 6. systemd unit (see /etc/systemd/system/void-agent.service on the VPS)
sudo systemctl daemon-reload && sudo systemctl enable --now void-agent

# 7. Public access via Cloudflare Tunnel
cloudflared tunnel create void-agent
cloudflared tunnel route dns void-agent app.voidagent.space
#   /etc/cloudflared/config.yml: tunnel UUID + credentials-file + ingress
sudo cloudflared service install && sudo systemctl enable --now cloudflared
```

## Updating the production app

```bash
cd /home/ubuntu/void-agent
git pull
DOCKER_BUILD=1 pnpm install --frozen-lockfile
NODE_OPTIONS=--max-old-space-size=8192 pnpm build
NODE_ENV=production pnpm db:migrate
sudo systemctl restart void-agent
```

## Verified smoke tests (2026-11-14)

- `https://app.voidagent.space/sign-in` → 200; `/api/auth/ok` → `{"ok":true}`
- Email sign-up through the public tunnel → 200 (test user deleted after)
- `pg_dump` backup written and compressed
- All four services `enabled` + `active` (postgresql, redis-server,
  void-agent, cloudflared)

## Gotchas learned on this box

- **Build OOM**: `next build` exhausts Node's default ~2 GB heap on this
  instance — always build with
  `NODE_OPTIONS=--max-old-space-size=8192` (4 GB swap installed as backup).
- **`pnpm db:migrate` from the repo root** reads `.env.production` from the
  *root* (via `src/lib/load-env.ts`, which builds its file list from
  `NODE_ENV`) — keep the root symlink AND export `NODE_ENV=production`,
  otherwise postgres.js falls back to OS-user auth and fails with
  `password authentication failed for user "ubuntu"`.
- **Boot fail-closes without a model provider** (`env-validation.ts`):
  `OPENAI_COMPATIBLE_DATA=[]` passes honestly while keeping the model catalog
  admin-panel-managed (providers stored encrypted in `site_config`).
- The pgvector extension is created up front as the `postgres` superuser so
  the migration's `CREATE EXTENSION IF NOT EXISTS` never needs elevated
  rights.
