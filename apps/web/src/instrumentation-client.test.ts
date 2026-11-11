import { afterEach, describe, expect, it, vi } from "vitest";

const sentry = vi.hoisted(() => ({
  init: vi.fn(),
  replayIntegration: vi.fn(() => ({ name: "replay" })),
  captureRouterTransitionStart: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => sentry);

describe("conditional Sentry client initialization", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("does not initialize when no public DSN is configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "");
    await import("./instrumentation-client");
    expect(sentry.init).not.toHaveBeenCalled();
  });

  it("initializes replay and router transition reporting when configured", async () => {
    vi.stubEnv(
      "NEXT_PUBLIC_SENTRY_DSN",
      "https://public@example.ingest.sentry.io/1",
    );
    vi.stubEnv("NEXT_PUBLIC_SENTRY_ENABLED", "true");

    const instrumentation = await import("./instrumentation-client");

    expect(sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: "https://public@example.ingest.sentry.io/1",
        integrations: [{ name: "replay" }],
        sendDefaultPii: true,
      }),
    );
    expect(instrumentation.onRouterTransitionStart).toBe(
      sentry.captureRouterTransitionStart,
    );
  });
});
