import { Sandbox } from "@e2b/code-interpreter";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Next's server-only import guard has no implementation to exercise in Vitest.
vi.mock("server-only", () => ({}));

import { pgClient, pgDb } from "lib/db/pg/db.pg";
import { pgAppBuildRepository } from "lib/db/pg/repositories/app-build-repository.pg";
import { pgSandboxSessionRepository } from "lib/db/pg/repositories/sandbox-session-repository.pg";
import { ChatThreadTable, UserTable } from "lib/db/pg/schema.pg";
import { resumeAppBuild } from "./app-build-runner";

// Explicit opt-in: this suite creates billable E2B sandboxes and local fixtures.
// Check the actual connection used by db.pg, before any SQL is issued.
const enabled = process.env.RUN_APP_BUILDER_E2B_TESTS === "1";
const integration = enabled ? describe : describe.skip;
const userId = crypto.randomUUID();
const threadId = crypto.randomUUID();
const sandboxes = new Set<string>();

integration("App Builder with real E2B and isolated PostgreSQL", () => {
  beforeAll(async () => {
    const database = new URL(
      process.env.POSTGRES_URL || process.env.DATABASE_URL || "http://unset",
    );
    if (
      !["127.0.0.1", "localhost"].includes(database.hostname) ||
      database.port !== "55432" ||
      database.pathname !== "/voidagent_migration_test" ||
      !process.env.E2B_API_KEY
    ) {
      throw new Error(
        "Use local voidagent_migration_test on port 55432 and an E2B test credential",
      );
    }
    await pgDb.insert(UserTable).values({
      id: userId,
      name: "E2B integration owner",
      email: `${userId}@test.invalid`,
    });
    fixturesCreated = true;
    await pgDb
      .insert(ChatThreadTable)
      .values({ id: threadId, userId, title: "E2B integration" });
  });

  afterAll(async () => {
    await Promise.all([...sandboxes].map((id) => Sandbox.kill(id)));
    // Only delete the randomly generated fixture after the safety gate passed.
    if (fixturesCreated)
      await pgDb.delete(UserTable).where(eq(UserTable.id, userId));
    await pgClient.end({ timeout: 5 });
  });

  let fixturesCreated = false;

  async function storedBuild(
    script = 'document.querySelector("main").textContent = "Live App Builder";',
  ) {
    const build = await pgAppBuildRepository.create({
      id: crypto.randomUUID(),
      userId,
      threadId,
      prompt: "Integration preview",
    });
    return (await pgAppBuildRepository.updateForOwner(build.id, userId, {
      title: "Live App Builder",
      summary: "Live E2B fixture",
      status: "provisioning",
      files: [
        {
          path: "index.html",
          content:
            '<!doctype html><main>Live App Builder</main><script type="module" src="app.js"></script>',
        },
        { path: "app.js", content: script },
      ],
    }))!;
  }

  it("provisions a secured controller and public preview, persists ownership, and resumes after pause", async () => {
    const build = await storedBuild();
    const url = await resumeAppBuild({ build, userId, customerId: null });
    const saved = (await pgAppBuildRepository.getForOwner(build.id, userId))!;
    if (saved.sandboxId) sandboxes.add(saved.sandboxId);
    expect(saved.status).toBe("ready");
    expect(saved.previewUrl).toBe(url);
    expect(saved.buildLog).toContain(
      "Generated JavaScript passed syntax validation",
    );
    expect(saved.sandboxId).toBeTruthy();
    expect(
      await pgAppBuildRepository.getForOwner(build.id, crypto.randomUUID()),
    ).toBeNull();
    expect(
      await pgSandboxSessionRepository.findOwner(saved.sandboxId!),
    ).toMatchObject({ userId });
    const sandbox = await Sandbox.connect(saved.sandboxId!);
    const response = await fetch(url);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("Live App Builder");
    expect(response.headers.get("content-security-policy")).toContain(
      "connect-src 'none'",
    );
    expect((await fetch(`${url}/app.js`)).status).toBe(200);
    expect((await fetch(url, { method: "POST" })).status).toBe(405);
    // envd authentication is independent of the public application port.
    expect(
      (
        await fetch(
          `https://${sandbox.getHost(49983)}/files?path=/home/user/app/index.html`,
        )
      ).status,
    ).toBe(401);
    await sandbox.pause();
    await pgAppBuildRepository.updateForOwner(build.id, userId, {
      status: "provisioning",
    });
    expect(
      await resumeAppBuild({ build: saved, userId, customerId: null }),
    ).toBe(url);
    expect((await fetch(url)).status).toBe(200);
    await sandbox.kill();
    await pgAppBuildRepository.updateForOwner(build.id, userId, {
      status: "provisioning",
    });
    const rebuiltUrl = await resumeAppBuild({
      build: saved,
      userId,
      customerId: null,
    });
    const rebuilt = (await pgAppBuildRepository.getForOwner(build.id, userId))!;
    sandboxes.add(rebuilt.sandboxId!);
    expect(rebuilt.sandboxId).not.toBe(saved.sandboxId);
    expect((await fetch(rebuiltUrl)).status).toBe(200);
  }, 120_000);

  it("rejects another owner before creating a sandbox", async () => {
    const build = await storedBuild();
    await expect(
      resumeAppBuild({ build, userId: crypto.randomUUID(), customerId: null }),
    ).rejects.toThrow("Build owner mismatch");
    expect(
      (await pgAppBuildRepository.getForOwner(build.id, userId))?.sandboxId,
    ).toBeNull();
  });

  it("handles the real SDK syntax error and kills the failed sandbox", async () => {
    const build = await storedBuild("const privateFixture = ;");
    await expect(
      resumeAppBuild({ build, userId, customerId: null }),
    ).rejects.toThrow("Generated JavaScript failed syntax validation");
    const saved = (await pgAppBuildRepository.getForOwner(build.id, userId))!;
    expect(saved.status).toBe("failed");
    expect(saved.sandboxId).toBeNull();
    expect(saved.buildLog).not.toContain("privateFixture");
    expect(saved.error).not.toContain("privateFixture");
  }, 60_000);
});
