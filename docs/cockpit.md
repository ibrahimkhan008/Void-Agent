# Cockpit (retired)

Cockpit has been removed from the application UI, APIs, voice tools, and runtime. The former `/cockpit` URL redirects to `/`. The composer now shows **Chat**.

The Cockpit database table and migration are intentionally retained for now so existing encrypted connection records are not destroyed by this UI removal. `APP_SECRETS_KEY` and the secret-box helper remain only to decrypt or export those legacy records if needed. No Cockpit connection management or provider calls are available in the app. Do not remove the legacy table or key until its records have been deliberately archived or purged through an approved data-retention process.

This file is a retirement note; the historical implementation plan and provider setup instructions are no longer active.
