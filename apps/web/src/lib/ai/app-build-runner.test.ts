import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generateAppPlan: vi.fn(),
  getForOwner: vi.fn(),
  updateActiveForOwner: vi.fn(),
  updateForOwner: vi.fn(),
  appendLogForOwner: vi.fn(),
  upsert: vi.fn(),
  markState: vi.fn(),
  createSandbox: vi.fn(),
  waitForSandboxReady: vi.fn(),
  setTimeout: vi.fn(),
  connect: vi.fn(),
  isSandboxOwner: vi.fn(),
}));
vi.mock("server-only", () => ({}));
// Keep the real schema + path allowlist: resumeAppBuild re-validates stored
// files through them, and that boundary is exactly what the resume tests below
// exercise.
vi.mock("lib/ai/app-builder", async (importOriginal) => ({
  ...(await importOriginal<typeof import("lib/ai/app-builder")>()),
  generateAppPlan: mocks.generateAppPlan,
}));
vi.mock("lib/ai/models", () => ({
  customModelProvider: {
    getModelWithFailureFallbackAsync: vi.fn(),
  },
}));
vi.mock("lib/ai/resilient-object", () => ({
  generateObjectResilient: vi.fn(),
}));
vi.mock("lib/db/pg/repositories/app-build-repository.pg", () => ({
  pgAppBuildRepository: {
    getForOwner: mocks.getForOwner,
    updateActiveForOwner: mocks.updateActiveForOwner,
    updateForOwner: mocks.updateForOwner,
    appendLogForOwner: mocks.appendLogForOwner,
  },
}));
vi.mock("lib/db/pg/repositories/sandbox-session-repository.pg", () => ({
  pgSandboxSessionRepository: {
    upsert: mocks.upsert,
    markState: mocks.markState,
  },
}));
vi.mock("lib/e2b/create-sandbox", () => ({
  PREVIEW_IDLE_TIMEOUT_MS: 180_000,
  PREVIEW_SETUP_TIMEOUT_MS: 240_000,
  createSandbox: mocks.createSandbox,
  waitForSandboxReady: mocks.waitForSandboxReady,
}));
vi.mock("lib/e2b/sandbox-ownership", () => ({
  isSandboxOwner: mocks.isSandboxOwner,
}));
vi.mock("@e2b/code-interpreter", () => ({
  Sandbox: { setTimeout: mocks.setTimeout, connect: mocks.connect },
  SandboxNotFoundError: class SandboxNotFoundError extends Error {},
}));

import { SandboxNotFoundError } from "@e2b/code-interpreter";

// Type-only: erased before vitest runs, so the vi.mock of the repository
// module is unaffected.
import type { AppBuild } from "lib/db/pg/repositories/app-build-repository.pg";
import {
  STATIC_APP_SERVER_SOURCE,
  executeAppBuild,
  resumeAppBuild,
} from "./app-build-runner";

const input = {
  buildId: "00000000-0000-4000-8000-000000000001",
  userId: "owner",
  threadId: "00000000-0000-4000-8000-000000000002",
  prompt: "Create a small timer",
  customerId: "customer",
};

describe("E2B app build lifecycle", () => {
  const sandbox = {
    sandboxId: "sbx_owned",
    getHost: vi.fn(() => "preview-3000.e2b.dev"),
    files: { write: vi.fn().mockResolvedValue(undefined) },
    commands: { run: vi.fn().mockResolvedValue({ exitCode: 0 }) },
    kill: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.E2B_API_KEY = "test-key";
    mocks.generateAppPlan.mockResolvedValue({
      title: "Timer",
      summary: "A focus timer.",
      files: [{ path: "index.html", content: "<main>Timer</main>" }],
    });
    mocks.getForOwner.mockResolvedValue({ ...input, status: "provisioning" });
    mocks.updateActiveForOwner.mockResolvedValue({ ...input });
    mocks.updateForOwner.mockResolvedValue({ ...input });
    mocks.appendLogForOwner.mockResolvedValue(true);
    mocks.upsert.mockResolvedValue(undefined);
    mocks.markState.mockResolvedValue(undefined);
    mocks.createSandbox.mockResolvedValue(sandbox);
    mocks.waitForSandboxReady.mockResolvedValue({
      ready: true,
      lastStatus: 200,
    });
    mocks.setTimeout.mockResolvedValue(undefined);
    mocks.connect.mockResolvedValue(sandbox);
    mocks.isSandboxOwner.mockResolvedValue(true);
    sandbox.files.write.mockResolvedValue(undefined);
    sandbox.commands.run.mockResolvedValue({ exitCode: 0 });
    sandbox.kill.mockResolvedValue(undefined);
  });

  it("serves only local static files, blocks traversal/methods, and prevents browser egress", () => {
    expect(STATIC_APP_SERVER_SOURCE).toContain(
      'req.method !== "GET" && req.method !== "HEAD"',
    );
    expect(STATIC_APP_SERVER_SOURCE).toContain(
      "!target.startsWith(root + path.sep)",
    );
    expect(STATIC_APP_SERVER_SOURCE).toContain("connect-src 'none'");
    expect(STATIC_APP_SERVER_SOURCE).not.toContain("fetch(");
  });

  it("records bounded lifecycle stages without storing provider or sandbox output", async () => {
    await executeAppBuild(input);

    expect(
      mocks.appendLogForOwner.mock.calls.map(([, , message]) => message),
    ).toEqual([
      "App generation started",
      "Generated plan with 1 source file(s)",
      "Secure preview sandbox provisioned",
      "Generated source files uploaded",
      "Preview server started; waiting for readiness",
      "Preview server passed readiness check",
      "Build completed successfully",
    ]);
    for (const [buildId, userId] of mocks.appendLogForOwner.mock.calls.map(
      ([buildId, userId]) => [buildId, userId],
    )) {
      expect(buildId).toBe(input.buildId);
      expect(userId).toBe(input.userId);
    }
  });

  it("generates, writes only approved files, starts the fixed template command, and persists the owner preview", async () => {
    await expect(executeAppBuild(input)).resolves.toMatchObject({
      previewUrl: "https://preview-3000.e2b.dev",
    });
    expect(mocks.createSandbox).toHaveBeenCalledWith(
      "void-agent-web",
      expect.objectContaining({
        secure: true,
        network: { allowPublicTraffic: true },
        lifecycle: { onTimeout: "pause", autoResume: true },
        billing: { userId: "owner", customerId: "customer" },
        metadata: { buildId: input.buildId, feature: "app-builder" },
      }),
    );
    expect(sandbox.files.write).toHaveBeenCalledWith(
      "/home/user/app/index.html",
      "<main>Timer</main>",
    );
    expect(sandbox.commands.run).toHaveBeenNthCalledWith(
      1,
      "mkdir -p /home/user/app",
    );
    expect(sandbox.commands.run).toHaveBeenNthCalledWith(
      2,
      "nohup node /home/user/app/server.js > /tmp/void-agent-app-build.log 2>&1 < /dev/null &",
      { timeoutMs: 10_000 },
    );
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        sandboxId: "sbx_owned",
        userId: "owner",
        threadId: input.threadId,
        url: "https://preview-3000.e2b.dev",
      }),
    );
    expect(mocks.updateActiveForOwner).toHaveBeenLastCalledWith(
      input.buildId,
      input.userId,
      expect.objectContaining({ status: "ready" }),
    );
  });

  it("syntax-checks generated app.js without evaluating it or logging parser output", async () => {
    mocks.generateAppPlan.mockResolvedValue({
      title: "Timer",
      summary: "A focus timer.",
      files: [{ path: "app.js", content: "const app = true;" }],
    });

    await executeAppBuild(input);

    expect(sandbox.commands.run).toHaveBeenNthCalledWith(
      2,
      "node --check --input-type=module < /home/user/app/app.js",
      { timeoutMs: 10_000 },
    );
    expect(sandbox.commands.run).toHaveBeenNthCalledWith(
      3,
      "nohup node /home/user/app/server.js > /tmp/void-agent-app-build.log 2>&1 < /dev/null &",
      { timeoutMs: 10_000 },
    );
    expect(mocks.appendLogForOwner).toHaveBeenCalledWith(
      input.buildId,
      input.userId,
      "Generated JavaScript passed syntax validation",
    );
  });

  it("fails closed on invalid app.js and never persists source-bearing diagnostics", async () => {
    mocks.generateAppPlan.mockResolvedValue({
      title: "Timer",
      summary: "A focus timer.",
      files: [{ path: "app.js", content: "const secret = 'do not log';" }],
    });
    sandbox.commands.run.mockImplementation(async (_command, _options) => {
      if (_command.startsWith("node --check")) {
        return {
          exitCode: 1,
          stderr: "SyntaxError: const secret = 'do not log';",
        };
      }
      return { exitCode: 0 };
    });

    await expect(executeAppBuild(input)).rejects.toThrow(
      "Generated JavaScript failed syntax validation",
    );

    expect(sandbox.commands.run).toHaveBeenCalledTimes(2);
    expect(sandbox.kill).toHaveBeenCalledTimes(1);
    expect(
      mocks.appendLogForOwner.mock.calls.flatMap((call) => call),
    ).not.toContain(expect.stringContaining("do not log"));
    expect(JSON.stringify(mocks.appendLogForOwner.mock.calls)).not.toContain(
      "do not log",
    );
  });

  it("passes the requested build mode to the planner", async () => {
    await executeAppBuild({ ...input, mode: "agent" });
    expect(mocks.generateAppPlan).toHaveBeenCalledWith(
      input.prompt,
      expect.objectContaining({ mode: "agent" }),
    );
    await executeAppBuild(input);
    expect(mocks.generateAppPlan).toHaveBeenLastCalledWith(
      input.prompt,
      expect.objectContaining({ mode: undefined }),
    );
  });

  it("rejects an HTTP error page even when the sandbox host is reachable", async () => {
    mocks.waitForSandboxReady.mockResolvedValue({
      ready: true,
      lastStatus: 503,
    });
    await expect(executeAppBuild(input)).rejects.toThrow(
      "Preview server was not ready in time",
    );
    expect(sandbox.kill).toHaveBeenCalledOnce();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("sanitizes SDK command errors containing generated source", async () => {
    mocks.generateAppPlan.mockResolvedValue({
      title: "Timer",
      summary: "A focus timer.",
      files: [{ path: "app.js", content: "const broken = ;" }],
    });
    sandbox.commands.run.mockImplementation(async (command) => {
      if (command.startsWith("node --check")) {
        throw new Error("Command exited with code 1: const broken = ;");
      }
      return { exitCode: 0 };
    });
    await expect(executeAppBuild(input)).rejects.toThrow(
      "Generated JavaScript failed syntax validation",
    );
    expect(sandbox.kill).toHaveBeenCalledOnce();
    const diagnostics = mocks.updateActiveForOwner.mock.calls.map(
      ([, , patch]) => patch.error,
    );
    expect(JSON.stringify(diagnostics)).not.toContain("const broken");
    expect(JSON.stringify(mocks.appendLogForOwner.mock.calls)).not.toContain(
      "const broken",
    );
  });

  it("kills the sandbox and does not overwrite persisted cancellation", async () => {
    mocks.getForOwner
      .mockResolvedValueOnce({ ...input, status: "provisioning" })
      .mockResolvedValueOnce({ ...input, status: "cancelled" });
    await expect(executeAppBuild(input)).rejects.toThrow("cancelled");
    expect(sandbox.kill).toHaveBeenCalledTimes(1);
    expect(mocks.markState).toHaveBeenCalledWith("sbx_owned", "killed");
    expect(mocks.updateActiveForOwner).toHaveBeenCalledWith(
      input.buildId,
      input.userId,
      expect.objectContaining({ status: "failed" }),
    );
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("kills failed or non-ready previews and stores only a bounded safe error", async () => {
    mocks.waitForSandboxReady.mockResolvedValue({ ready: false });
    await expect(executeAppBuild(input)).rejects.toThrow(
      "Preview server was not ready",
    );
    expect(sandbox.kill).toHaveBeenCalledTimes(1);
    expect(mocks.updateActiveForOwner).toHaveBeenLastCalledWith(
      input.buildId,
      input.userId,
      expect.objectContaining({
        status: "failed",
        error: "The app could not be built. Try a smaller request.",
        sandboxId: null,
      }),
    );
  });
});

describe("resumeAppBuild", () => {
  const sandbox = {
    sandboxId: "sbx_new",
    getHost: vi.fn(() => "preview-3000.e2b.dev"),
    files: { write: vi.fn().mockResolvedValue(undefined) },
    commands: { run: vi.fn().mockResolvedValue({ exitCode: 0 }) },
    kill: vi.fn().mockResolvedValue(undefined),
  };
  const existing = {
    sandboxId: "sbx_existing",
    getHost: vi.fn(() => "preview-3000.e2b.dev"),
    kill: vi.fn().mockResolvedValue(undefined),
  };
  const storedPlan = {
    title: "Timer",
    summary: "A focus timer.",
    files: [{ path: "index.html", content: "<main>Timer</main>" }],
  };
  const build: AppBuild = {
    id: input.buildId,
    userId: "owner",
    threadId: input.threadId,
    prompt: input.prompt,
    status: "ready",
    sandboxId: "sbx_existing",
    createdAt: new Date("2026-11-11T00:00:00Z"),
    updatedAt: new Date("2026-11-11T00:00:00Z"),
    previewUrl: null,
    error: null,
    buildLog: "",
    ...storedPlan,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.E2B_API_KEY = "test-key";
    mocks.getForOwner.mockResolvedValue({ ...build, status: "provisioning" });
    mocks.updateActiveForOwner.mockResolvedValue({ ...build });
    mocks.updateForOwner.mockResolvedValue({ ...build });
    mocks.upsert.mockResolvedValue(undefined);
    mocks.markState.mockResolvedValue(undefined);
    mocks.createSandbox.mockResolvedValue(sandbox);
    mocks.waitForSandboxReady.mockResolvedValue({
      ready: true,
      lastStatus: 200,
    });
    mocks.setTimeout.mockResolvedValue(undefined);
    mocks.isSandboxOwner.mockResolvedValue(true);
    mocks.connect.mockResolvedValue(existing);
    sandbox.files.write.mockResolvedValue(undefined);
    sandbox.commands.run.mockResolvedValue({ exitCode: 0 });
    sandbox.kill.mockResolvedValue(undefined);
    existing.kill.mockResolvedValue(undefined);
  });

  it("rejects a build owned by someone else before touching any sandbox", async () => {
    await expect(
      resumeAppBuild({ build: { ...build, userId: "other" }, ...input }),
    ).rejects.toThrow("Build owner mismatch");
    expect(mocks.connect).not.toHaveBeenCalled();
    expect(mocks.isSandboxOwner).not.toHaveBeenCalled();
  });

  it("refuses to connect when the sandbox owner cannot be proven", async () => {
    mocks.isSandboxOwner.mockResolvedValue(false);
    await expect(
      resumeAppBuild({ build, userId: "owner", customerId: null }),
    ).rejects.toThrow("sandbox owner could not be verified");
    expect(mocks.connect).not.toHaveBeenCalled();
    expect(mocks.createSandbox).not.toHaveBeenCalled();
    // The row was already flipped to provisioning by admission — it must be
    // settled back to failed, or the active-build cap leaks.
    expect(mocks.updateActiveForOwner).toHaveBeenCalledWith(
      build.id,
      "owner",
      expect.objectContaining({ status: "failed" }),
    );
  });

  it("reuses a live owned sandbox without killing or rebuilding it", async () => {
    await expect(
      resumeAppBuild({ build, userId: "owner", customerId: null }),
    ).resolves.toBe("https://preview-3000.e2b.dev");
    expect(mocks.isSandboxOwner).toHaveBeenCalledWith("sbx_existing", "owner");
    expect(mocks.connect).toHaveBeenCalledWith("sbx_existing", {
      apiKey: "test-key",
      requestTimeoutMs: 30_000,
    });
    expect(existing.kill).not.toHaveBeenCalled();
    expect(mocks.createSandbox).not.toHaveBeenCalled();
    expect(mocks.appendLogForOwner).toHaveBeenCalledWith(
      build.id,
      "owner",
      "Preview resumed successfully",
    );
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ sandboxId: "sbx_existing", userId: "owner" }),
    );
    expect(mocks.updateActiveForOwner).toHaveBeenLastCalledWith(
      build.id,
      "owner",
      expect.objectContaining({ status: "ready" }),
    );
  });

  it("rebuilds from stored files when the old sandbox is gone (404)", async () => {
    mocks.connect.mockRejectedValue(new Error("404: Sandbox not found"));
    await expect(
      resumeAppBuild({ build, userId: "owner", customerId: null }),
    ).resolves.toBe("https://preview-3000.e2b.dev");
    expect(mocks.markState).toHaveBeenCalledWith("sbx_existing", "killed");
    expect(mocks.createSandbox).toHaveBeenCalledWith(
      "void-agent-web",
      expect.objectContaining({
        secure: true,
        network: { allowPublicTraffic: true },
        lifecycle: { onTimeout: "pause", autoResume: true },
        billing: { userId: "owner", customerId: null },
        metadata: { buildId: build.id, feature: "app-builder" },
      }),
    );
    expect(sandbox.files.write).toHaveBeenCalledWith(
      "/home/user/app/index.html",
      "<main>Timer</main>",
    );
    expect(sandbox.files.write).toHaveBeenCalledWith(
      "/home/user/app/server.js",
      expect.stringContaining("http.createServer"),
    );
  });

  it("rebuilds on the SDK's typed missing-sandbox error without a status prefix", async () => {
    mocks.connect.mockRejectedValue(
      new SandboxNotFoundError("Paused sandbox sbx_existing not found"),
    );
    await expect(
      resumeAppBuild({ build, userId: "owner", customerId: null }),
    ).resolves.toBe("https://preview-3000.e2b.dev");
    expect(mocks.createSandbox).toHaveBeenCalledOnce();
    expect(mocks.markState).toHaveBeenCalledWith("sbx_existing", "killed");
  });

  it("syntax-checks stored app.js before restarting a rebuilt preview", async () => {
    mocks.connect.mockRejectedValue(new Error("404: Sandbox not found"));
    await resumeAppBuild({
      build: {
        ...build,
        sandboxId: "sbx_missing",
        files: [
          { path: "index.html", content: "<main>Timer</main>" },
          { path: "app.js", content: "export const app = true;" },
        ],
      },
      userId: "owner",
      customerId: null,
    });

    expect(sandbox.commands.run).toHaveBeenNthCalledWith(
      2,
      "node --check --input-type=module < /home/user/app/app.js",
      { timeoutMs: 10_000 },
    );
  });

  it("does not silently rebuild when the connect failure is not a 404", async () => {
    mocks.connect.mockRejectedValue(new Error("500: upstream exploded"));
    await expect(
      resumeAppBuild({ build, userId: "owner", customerId: null }),
    ).rejects.toThrow("could not be safely resumed");
    expect(mocks.createSandbox).not.toHaveBeenCalled();
    expect(mocks.updateActiveForOwner).toHaveBeenCalledWith(
      build.id,
      "owner",
      expect.objectContaining({ status: "failed" }),
    );
  });

  it("rejects stored files outside the allowlist before any sandbox exists", async () => {
    await expect(
      resumeAppBuild({
        build: {
          ...build,
          sandboxId: null,
          files: [{ path: "../escape.html", content: "<p>x</p>" }],
        },
        userId: "owner",
        customerId: null,
      }),
    ).rejects.toThrow();
    expect(mocks.createSandbox).not.toHaveBeenCalled();
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it("replaces a live but unready owned sandbox and replays the files", async () => {
    mocks.waitForSandboxReady
      .mockResolvedValueOnce({ ready: false, lastStatus: 502 })
      .mockResolvedValueOnce({ ready: true, lastStatus: 200 });
    await expect(
      resumeAppBuild({ build, userId: "owner", customerId: null }),
    ).resolves.toBe("https://preview-3000.e2b.dev");
    expect(existing.kill).toHaveBeenCalledTimes(1);
    expect(mocks.markState).toHaveBeenCalledWith("sbx_existing", "killed");
    expect(mocks.createSandbox).toHaveBeenCalledTimes(1);
    expect(sandbox.files.write).toHaveBeenCalledWith(
      "/home/user/app/index.html",
      "<main>Timer</main>",
    );
  });

  it("kills the rebuilt sandbox and marks the build failed when provisioning fails", async () => {
    mocks.connect.mockRejectedValue(new Error("404: Sandbox not found"));
    mocks.waitForSandboxReady.mockResolvedValue({ ready: false });
    await expect(
      resumeAppBuild({ build, userId: "owner", customerId: null }),
    ).rejects.toThrow("Preview server was not ready");
    expect(sandbox.kill).toHaveBeenCalledTimes(1);
    expect(mocks.updateActiveForOwner).toHaveBeenLastCalledWith(
      build.id,
      "owner",
      expect.objectContaining({
        status: "failed",
        error: "The app could not be resumed. Try again later.",
        sandboxId: null,
      }),
    );
  });

  it("treats a concurrently cancelled build as cancelled, not failed", async () => {
    // No stored sandbox: go straight to the rebuild path, then the final
    // status write finds the row already cancelled.
    mocks.updateActiveForOwner.mockResolvedValue(null);
    await expect(
      resumeAppBuild({
        build: { ...build, sandboxId: null },
        userId: "owner",
        customerId: null,
      }),
    ).rejects.toThrow("cancelled");
    expect(mocks.updateActiveForOwner).toHaveBeenLastCalledWith(
      build.id,
      "owner",
      expect.objectContaining({ status: "failed" }),
    );
  });
});
