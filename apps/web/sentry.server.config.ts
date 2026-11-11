import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN?.trim();

if (dsn && process.env.SENTRY_ENABLED !== "false") {
  Sentry.init({
    dsn,
    tracesSampleRate: 1,
    enableLogs: true,
    sendDefaultPii: true,
  });
}
