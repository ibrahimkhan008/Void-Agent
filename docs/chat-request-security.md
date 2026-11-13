# Browser Chat Request Security

Interactive `POST /api/chat` and `POST /api/chat/temporary` requests use a
short-lived challenge before chat state is read or written. The challenge is
bound to the authenticated user and session, request IP, user agent, client
id, and client public key. The request also carries a canonical body hash,
HMAC, ECDSA client proof, and SHA-256 proof-of-work. Challenge tokens expire
after two minutes and may be consumed only once.

The challenge endpoint requires an authenticated interactive session, a JSON
body of at most 2 KiB, a valid client binding, an allowed `Origin` or `Referer`,
and browser request signals. Scheduled-task requests are already authenticated
by the server-side task secret and skip browser proof-of-work; ordinary browser
requests never take that bypass.

## Required production configuration

- `NEXT_PUBLIC_BASE_URL` or `BETTER_AUTH_URL`: canonical public origin.
- `CHAT_GUARD_ALLOWED_ORIGINS`: optional comma-separated additional trusted
  origins.
- `BETTER_AUTH_SECRET`: challenge signing fallback. Set
  `CHAT_REQUEST_GUARD_SECRET` to use a separate signing secret.
- `REDIS_URL` or Upstash REST credentials: shared cache for challenge grace
  state and atomic one-use replay claims.
- PostgreSQL must be available for atomic challenge/request rate-limit buckets.
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY`: required when
  adaptive checks request CAPTCHA verification.

The guard fails closed with a 503 when the shared replay cache or PostgreSQL
rate-limit store is unavailable. It does not accept process-local cache state
as proof of replay protection. In development, the challenge is disabled and
the endpoint returns `{ "enabled": false }`.

## Verification boundaries

Unit tests exercise signed challenge generation, body tampering, origin,
expiry, client-key and proof-of-work checks, one-use replay, rate-limit failure,
and fail-closed cache behavior. Route tests mock authentication and persistence.
These tests do not verify a live PostgreSQL server, Redis/Upstash deployment,
Cloudvoid-agent Turnstile credentials, a browser, or an end-to-end provider call.
Those production integrations remain to be verified in an isolated configured
environment.
