FROM node:22-alpine AS builder
ARG DOCKER_BUILD="1"
WORKDIR /app

COPY . .

# Install pnpm
RUN corepack enable pnpm

RUN pnpm install --frozen-lockfile

# Makes the next output standalone
# https://github.com/vercel/next.js/discussions/65511
ENV NEXT_STANDALONE_OUTPUT="true"

# Build ONLY the marketing site — this image must not require the web app's
# env (no DB, no auth) and must not rebuild it.
RUN pnpm build:marketing

FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
# disable telemetry during runtime.
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# The standalone output mirrors the monorepo layout: server.js lives at
# apps/marketing/server.js inside the traced bundle.
COPY --from=builder --chown=nextjs:nodejs /app/apps/marketing/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/marketing/.next/static ./apps/marketing/.next/static
COPY --from=builder /app/apps/marketing/public ./apps/marketing/public
# The three markdown legal pages are read from ./legal-consent relative to the
# process working directory at request time; next.config.ts outputFileTracingIncludes
# covers standalone tracing — this COPY is belt-and-braces for the Docker layout.
COPY --from=builder /app/apps/marketing/legal-consent ./apps/marketing/legal-consent

USER nextjs

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

EXPOSE 3000

CMD ["node", "apps/marketing/server.js"]
