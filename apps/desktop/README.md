# Void-Agent Desktop Companion

This Electron companion loads a configured Void-Agent HTTPS deployment (or a localhost development server) and enables local stdio MCP testing from `/mcp/test/[id]`.

## Development

From the repository root, run `pnpm desktop:dev`. It starts the Next.js app at `http://localhost:3000` and opens the desktop window. Social sign-in is completed in the system browser and returned using a short-lived, single-use Better Auth token.

## Build

Set `VOID_AGENT_WEB_URL` to the HTTPS Void-Agent deployment, then run `pnpm desktop:build`. The URL is embedded in the desktop main process at build time. The app refuses insecure non-local HTTP URLs.

## Local MCP security boundary

- Local stdio is available only in the MCP test page; cloud chat and agent execution do not run on the desktop bridge.
- The main process validates the calling frame origin and path, MCP config size and environment, allowed read-style tool names, and argument/result size.
- Starting a configured local MCP process requires native OS consent. Each tool call requires a separate native consent and warns that output returns to the configured Void-Agent origin.
- Child processes inherit a small OS environment allowlist plus explicitly configured MCP variables. Tool results and environment values are not written to audit logs; audit records contain hashes.
- Auto-updates and local release packaging are configured; signed artifacts and a staging-feed update journey remain unverified.

## Signed packaging and update feeds

Development builds do not run the updater. For release packaging, configure `DESKTOP_UPDATE_FEED_URL` to an HTTPS directory containing the platform-specific electron-builder update metadata and artifacts, then use `pnpm --dir apps/desktop dist:win`, `dist:mac`, or `dist:linux`. Windows packages require a code-signing subject in `VOID_AGENT_WINDOWS_PUBLISHER_NAME`; macOS packages require `CSC_NAME` or `CSC_LINK`. Keep signing credentials outside the repository. The packaging scripts validate these settings and never publish; auto-update is enabled only for packaged builds with a valid HTTPS feed. The first signed package and an actual feed installation/update still need platform-specific release verification.
