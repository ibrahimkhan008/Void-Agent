import { resolve } from "node:path";
import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.A01_BASE_URL || "http://127.0.0.1:3000";
const testDatabaseUrl = process.env.A01_TEST_DATABASE_URL;

if (!testDatabaseUrl) {
  throw new Error(
    "A01_TEST_DATABASE_URL must point to the isolated loopback A01 test database.",
  );
}

const databaseUrl = new URL(testDatabaseUrl);
const databaseName = decodeURIComponent(databaseUrl.pathname.slice(1));
if (
  !["localhost", "127.0.0.1", "::1", "[::1]"].includes(
    databaseUrl.hostname.toLowerCase(),
  ) ||
  !databaseName.toLowerCase().includes("a01") ||
  !databaseName.toLowerCase().includes("test")
) {
  throw new Error(
    "A01 Playwright must use a loopback PostgreSQL database with an A01 test database name.",
  );
}

const authStatePath = resolve(
  process.cwd(),
  ".audit/a01-playwright/regular-user.json",
);

export default defineConfig({
  testDir: "./tests/a01",
  outputDir: ".audit/a01-playwright/results",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  use: {
    baseURL,
    ignoreHTTPSErrors: true,
    serviceWorkers: "block",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...devices["Desktop Chrome"],
  },
  projects: [
    {
      name: "a01-auth-setup",
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: "a01-chromium",
      dependencies: ["a01-auth-setup"],
      testMatch: /chat-lifecycle\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: authStatePath,
      },
    },
  ],
  webServer: {
    command: `pnpm exec next start -p ${new URL(baseURL).port || "3000"}`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      A01_TEST_DATABASE_URL: testDatabaseUrl,
      POSTGRES_URL: testDatabaseUrl,
      NEXT_PUBLIC_BASE_URL: baseURL,
      FLARE_AUTH_URL: baseURL,
      BETTER_AUTH_URL: baseURL,
      BETTER_AUTH_SECRET: "a01-local-browser-test-secret-not-for-production",
      PORT: new URL(baseURL).port || "3000",
      CI: "1",
      FLARE_API_KEY: "",
      KORE_API_KEY: "",
      GROQ_API_KEY: "",
      ZAI_API_KEY: "",
      FIRECRAWL_API_KEY: "",
    },
  },
});
