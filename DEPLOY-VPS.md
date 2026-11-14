# Production Deployment on a VPS

Deploy the full Void-Agent stack (app + Postgres + Redis) on any Linux VPS with
Docker — no Vercel. TLS comes from Cloudvoid-agent Tunnel (recommended: no open
ports) or nginx + certbot.

> **Native path (the current production host):** the live VPS runs this stack
> **without Docker** — apt-native PostgreSQL 16 + pgvector, Redis 7, Node 22,
> a `void-agent` systemd unit, and a Cloudflare Tunnel publishing
> `app.voidagent.space`. As-deployed runbook with the verified commands:
> `docs/deploy-vps-native.md`. Everything below remains the Docker recipe for
> any other host.

---

## 1. Server prerequisites (Ubuntu 22/24, once)

```bash
# Docker Engine + compose plugin
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER   # re-login after this

# git
sudo apt install -y git
```

Recommended baseline: 2 vCPU / 4 GB RAM minimum (builds need headroom — add
swap if 4 GB: `sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile &&
sudo mkswap /swapfile && sudo swapon /swapfile`).

## 2. Get the code

```bash
git clone https://github.com/ibrahimkhan008/Void-Agent.git void-agent
cd void-agent
```

## 3. Configure

```bash
cp docker/.env.production.example .env.production
nano .env.production            # fill EVERY value
```

Key values:
- `POSTGRES_PASSWORD` — strong random (this DB holds user accounts)
- `BETTER_AUTH_SECRET`, `ENCRYPTION_MASTER_KEY` — random secrets
- `BETTER_AUTH_URL` / `NEXT_PUBLIC_BASE_URL` — your public URL (decide the
  domain NOW, see step 5)
- Model provider keys — copy from your local `apps/web/.env`
- Optional feature keys (see §9): `KERNEL_API_KEY`, `STEEL_BASE_URL`,
  `STEEL_EXECUTOR_URL`, `STEEL_PUBLIC_BASE_URL`, `E2B_API_KEY`,
  `GOOGLE_GENERATIVE_AI_API_KEY`

## 4. Boot

```bash
docker compose -f docker/compose.production.yml --env-file .env.production up -d --build
```

- The app container runs database migrations automatically at boot.
- Verify: `curl -I http://127.0.0.1:3000/sign-in` → 200 (from the VPS).

## 5. Public access — pick ONE

### Option A — Cloudvoid-agent Tunnel (recommended: no open ports, free TLS)

You already run cloudflared elsewhere, so on the VPS:

```bash
sudo apt install -y cloudflared
cloudflared tunnel login                      # browser once
cloudflared tunnel create void-agent
cloudflared tunnel route dns void-agent app.your-domain.com
cloudflared tunnel run --url http://localhost:3000 void-agent
```

Then install as a service so it survives reboots:

```bash
sudo cloudflared service install
sudo systemctl enable --now cloudflared
```

### Option B — nginx + certbot (open ports 80/443)

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
sudo tee /etc/nginx/sites-available/void-agent >/dev/null <<'NGINX'
server {
    listen 80;
    server_name app.your-domain.com;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
NGINX
sudo ln -s /etc/nginx/sites-available/void-agent /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d app.your-domain.com
```

## 6. Wire sign-in to the domain

- **Google Cloud Console** → OAuth client → add
  `https://app.your-domain.com/api/auth/callback/google` to Authorized
  redirect URIs.
- **Cloudvoid-agent Turnstile** → add the domain to the site key's hostnames.
- Both need the exact production domain — localhost values never work.

## 7. Updating

```bash
cd void-agent
git pull
docker compose -f docker/compose.production.yml --env-file .env.production up -d --build
```

Migrations run automatically at container boot; data lives in the
`postgres_data` volume and survives rebuilds.

## 8. Backups

```bash
# Nightly dump (crontab -e):
0 3 * * * docker exec docker-postgres-1 pg_dump -U voidagent void_agent | gzip > /root/backups/void_agent_$(date +\%F).sql.gz
```

Store a copy off-VPS (rclone to Cloudvoid-agent R2/B2). Restoring:

```bash
gunzip -c dump.sql.gz | docker exec -i docker-postgres-1 psql -U voidagent void_agent
```

## 9. Optional browser stack (free browser automation)

The compose file already ships two extra services: `steel` (self-hosted
Steel Browser, Apache-2.0 — session API + live-view UI + CDP) and
`steel-executor` (an isolated sidecar that runs the agent's Playwright code
against the Steel session, so agent code never executes inside the app
server). Both sit on the internal Docker network only — **Steel's ports have
no authentication**, so they are never exposed directly.

To activate the provider, set in `.env.production`:

```bash
STEEL_BASE_URL=http://steel:3000            # app + executor → Steel (internal)
STEEL_EXECUTOR_URL=http://steel-executor:8080
STEEL_PUBLIC_BASE_URL=https://browser.your-domain.com   # what the USER's browser loads
```

- `STEEL_PUBLIC_BASE_URL` needs a public route for the live view: add a
  tunnel hostname (Option A) or an nginx server block (Option B) proxying to
  `http://127.0.0.1:3001` after publishing the steel UI port as
  `127.0.0.1:3001:3000` — and put it behind Cloudflare Access or an
  authenticated reverse proxy. Never leave it open: Steel has no auth.
- Without any browser env vars the app falls back to the local
  `agent-browser` CLI (install with `npm i -g agent-browser && agent-browser
  install`), and with `KERNEL_API_KEY` it uses the Kernel cloud browser.
  Preference order: Kernel → Steel → agent-browser CLI.
- All browser execution stays fail-closed until runtime-level egress
  isolation is enabled (`BROWSER_EGRESS_ISOLATION_ENABLED`).

---

## Checklist

- [ ] Strong `POSTGRES_PASSWORD`, `BETTER_AUTH_SECRET`, `ENCRYPTION_MASTER_KEY`
- [ ] Domain chosen and DNS pointing at the VPS / tunnel
- [ ] Google OAuth callback + Turnstile hostname updated to the domain
- [ ] `curl -I https://app.your-domain.com/sign-in` → 200
- [ ] Sign-up + sign-in tested in a private browser window
- [ ] Backup cron installed and one restore rehearsed
