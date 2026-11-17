# E2B template builder

Builds the custom sandbox templates this repo defines. Normally you do not run
this by hand — the **Build E2B template** GitHub Action does it, so no one needs
Docker, the E2B CLI or a local clone.

## Why it lives here and not in `scripts/`

Three constraints meet in this directory:

- The v2 build needs the `e2b` SDK. It is only a *transitive* dependency of the
  app (via `@e2b/code-interpreter`), and pnpm will not resolve a transitive
  dependency by name.
- Adding `e2b` to the root `package.json` means regenerating `pnpm-lock.yaml`,
  and every CI job installs with `--frozen-lockfile` — a package.json the
  lockfile does not match fails the whole pipeline.
- `tsconfig.json` includes `scripts/**/*.ts`, so a TypeScript build script there
  would be typechecked against dependencies a normal dev install does not have.

So this is its own npm package, outside the pnpm workspace (`pnpm-workspace.yaml`
globs only `apps/*`, `packages/*`, `servers/*`) and outside the root tsconfig —
exactly like `e2b/template/`, which is the same arrangement for the Remotion
sandbox app.

Its committed `package-lock.json` pins the standalone builder dependency tree.

## Running it by hand

```bash
cd e2b/build
npm install
E2B_API_KEY=... E2B_TEMPLATE=navigator-python-docs npx tsx build.ts
```

To build the two Void Agent-owned runtime templates from the Docker definitions
stored in this repository:

```bash
cd e2b/build
npm install
E2B_API_KEY=... E2B_TEMPLATE=void-agent-web npx tsx build.ts
E2B_API_KEY=... E2B_TEMPLATE=void-agent-code-interpreter npx tsx build.ts
```

The source of truth is `scripts/e2b/template.mjs`. The corresponding local
images are `e2b.web.Dockerfile` and `e2b.docs.Dockerfile`; neither runtime build
inherits from the `flare-sh/flare-web` or `code-interpreter-v1` template alias.

`E2B_TEMPLATE` must name an entry in `scripts/e2b/template.mjs`, which is the
single source of truth for template names, start commands and ready commands —
`sandbox-registry.test.ts` asserts those names match the app's registry.

## After a build

Building an image is not the same as using it. The app defaults to the verified
`void-agent-web` and `void-agent-code-interpreter` aliases; other custom images
stay disabled until their registry entry is explicitly enabled. Verify first:

```bash
E2B_API_KEY=... pnpm e2b:diagnose            # from the repo root
E2B_LIVE_SMOKE=1 E2B_INCLUDE_EXECUTION_TEMPLATES=1 E2B_API_KEY=... pnpm e2b:smoke
```
