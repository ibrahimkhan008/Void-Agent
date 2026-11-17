import "server-only";

import { Sandbox } from "@e2b/code-interpreter";
import {
  type AppBuildMode,
  appPlanSchema,
  generateAppPlan,
  validateGeneratedAppPath,
} from "lib/ai/app-builder";
import {
  type AppBuild,
  pgAppBuildRepository,
} from "lib/db/pg/repositories/app-build-repository.pg";
import { pgSandboxSessionRepository } from "lib/db/pg/repositories/sandbox-session-repository.pg";
import {
  PREVIEW_IDLE_TIMEOUT_MS,
  PREVIEW_SETUP_TIMEOUT_MS,
  createSandbox,
  waitForSandboxReady,
} from "lib/e2b/create-sandbox";
import { isSandboxOwner } from "lib/e2b/sandbox-ownership";
import { getEnabledPreviewTemplate } from "lib/e2b/sandbox-registry";

const TEMPLATE = "nextjs-developer";
const PORT = 3000;
const APP_DIR = "/home/user/app";
export const STATIC_APP_SERVER_SOURCE = `const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve("/home/user/app");
const types = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".ico": "image/x-icon" };
http.createServer((req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405, { Allow: "GET, HEAD" }).end(); return; }
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname); } catch { res.writeHead(400).end(); return; }
  if (pathname.includes("\\0")) { res.writeHead(400).end(); return; }
  let target = path.resolve(root, "." + pathname);
  if (target !== root && !target.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  fs.stat(target, (statError, stat) => {
    if (!statError && stat.isDirectory()) target = path.join(target, "index.html");
    fs.stat(target, (fileError, fileStat) => {
      if (fileError || !fileStat.isFile()) { res.writeHead(404, { "X-Content-Type-Options": "nosniff" }).end("Not found"); return; }
      res.writeHead(200, {
        "Content-Type": types[path.extname(target).toLowerCase()] || "application/octet-stream",
        "Content-Length": fileStat.size,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'self' data: blob:; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"
      });
      if (req.method === "HEAD") { res.end(); return; }
      fs.createReadStream(target).pipe(res);
    });
  });
}).listen(3000, "0.0.0.0");
`;

export class AppBuildCancelledError extends Error {
  constructor() {
    super("App build was cancelled");
    this.name = "AppBuildCancelledError";
  }
}

function assertNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new AppBuildCancelledError();
}

async function assertBuildActive(
  buildId: string,
  userId: string,
): Promise<void> {
  const build = await pgAppBuildRepository.getForOwner(buildId, userId);
  if (!build || build.status === "cancelled")
    throw new AppBuildCancelledError();
}

export async function executeAppBuild(input: {
  buildId: string;
  userId: string;
  threadId: string;
  prompt: string;
  customerId: string | null;
  entityId?: string;
  /** "static" (single pass, default) or "agent" (bounded refine loop). */
  mode?: AppBuildMode;
  abortSignal?: AbortSignal;
}): Promise<{
  previewUrl: string;
  files: { path: string; content: string }[];
}> {
  let sandbox: Sandbox | undefined;
  try {
    assertNotAborted(input.abortSignal);
    const started = await pgAppBuildRepository.updateActiveForOwner(
      input.buildId,
      input.userId,
      {
        status: "generating",
      },
    );
    if (!started) throw new AppBuildCancelledError();
    await pgAppBuildRepository.appendLogForOwner(
      input.buildId,
      input.userId,
      "App generation started",
    );
    const plan = await generateAppPlan(input.prompt, {
      mode: input.mode,
      abortSignal: input.abortSignal ?? AbortSignal.timeout(90_000),
    });
    assertNotAborted(input.abortSignal);
    await assertBuildActive(input.buildId, input.userId);
    const provision = await pgAppBuildRepository.updateActiveForOwner(
      input.buildId,
      input.userId,
      {
        title: plan.title,
        summary: plan.summary,
        files: plan.files,
        status: "provisioning",
      },
    );
    if (!provision) throw new AppBuildCancelledError();
    await pgAppBuildRepository.appendLogForOwner(
      input.buildId,
      input.userId,
      `Generated plan with ${plan.files.length} source file(s)`,
    );

    const template = getEnabledPreviewTemplate(TEMPLATE);
    if (!template) throw new Error("App preview template is unavailable");
    sandbox = await createSandbox(TEMPLATE, {
      billing: {
        userId: input.userId,
        customerId: input.customerId,
        ...(input.entityId ? { entityId: input.entityId } : {}),
      },
      requestId: input.buildId,
      maxAttempts: 2,
      timeoutMs: PREVIEW_SETUP_TIMEOUT_MS,
      requestTimeoutMs: 30_000,
      metadata: { buildId: input.buildId, feature: "app-builder" },
    });
    await pgAppBuildRepository.appendLogForOwner(
      input.buildId,
      input.userId,
      "Secure preview sandbox provisioned",
    );

    await pgAppBuildRepository.updateForOwner(input.buildId, input.userId, {
      sandboxId: sandbox.sandboxId,
    });
    assertNotAborted(input.abortSignal);
    await assertBuildActive(input.buildId, input.userId);

    // Both command strings are fixed by this service. Model output never
    // becomes a shell command, package manifest, install script, or file path.
    await sandbox.commands.run(`mkdir -p ${APP_DIR}`);
    for (const file of plan.files) {
      assertNotAborted(input.abortSignal);
      await assertBuildActive(input.buildId, input.userId);
      await sandbox.files.write(`${APP_DIR}/${file.path}`, file.content);
    }
    await sandbox.files.write(`${APP_DIR}/server.js`, STATIC_APP_SERVER_SOURCE);
    await pgAppBuildRepository.appendLogForOwner(
      input.buildId,
      input.userId,
      "Generated source files uploaded",
    );

    const start = await sandbox.commands.run(
      `nohup node ${APP_DIR}/server.js > /tmp/void-agent-app-build.log 2>&1 < /dev/null &`,
      { timeoutMs: 10_000 },
    );
    if (start.exitCode !== 0) throw new Error("Preview server did not start");
    await pgAppBuildRepository.appendLogForOwner(
      input.buildId,
      input.userId,
      "Preview server started; waiting for readiness",
    );

    assertNotAborted(input.abortSignal);
    const readiness = await waitForSandboxReady(sandbox, PORT, 45_000);
    if (!readiness.ready)
      throw new Error("Preview server was not ready in time");
    await pgAppBuildRepository.appendLogForOwner(
      input.buildId,
      input.userId,
      "Preview server passed readiness check",
    );
    assertNotAborted(input.abortSignal);
    await assertBuildActive(input.buildId, input.userId);

    const previewUrl = `https://${sandbox.getHost(PORT)}`;
    await Sandbox.setTimeout(sandbox.sandboxId, PREVIEW_IDLE_TIMEOUT_MS, {
      apiKey: process.env.E2B_API_KEY,
    });
    await pgSandboxSessionRepository.upsert({
      sandboxId: sandbox.sandboxId,
      threadId: input.threadId,
      toolCallId: input.buildId,
      userId: input.userId,
      organizationId: null,
      template: TEMPLATE,
      port: PORT,
      url: previewUrl,
    });
    const saved = await pgAppBuildRepository.updateActiveForOwner(
      input.buildId,
      input.userId,
      { status: "ready", previewUrl },
    );
    if (!saved) throw new Error("App build record disappeared");
    await pgAppBuildRepository.appendLogForOwner(
      input.buildId,
      input.userId,
      "Build completed successfully",
    );
    return { previewUrl, files: plan.files };
  } catch (error) {
    if (sandbox) {
      await sandbox.kill().catch(() => undefined);
      await pgSandboxSessionRepository
        .markState(sandbox.sandboxId, "killed")
        .catch(() => undefined);
    }
    const safeError =
      error instanceof AppBuildCancelledError
        ? "Build cancelled"
        : error instanceof Error && error.name === "GenerationAbortedError"
          ? "App generation timed out"
          : "The app could not be built. Try a smaller request.";
    await pgAppBuildRepository
      .appendLogForOwner(input.buildId, input.userId, safeError)
      .catch(() => false);
    await pgAppBuildRepository
      .updateActiveForOwner(input.buildId, input.userId, {
        status: "failed",
        error: safeError,
        sandboxId: null,
      })
      .catch(() => null);
    throw error;
  }
}

export async function resumeAppBuild(input: {
  build: AppBuild;
  userId: string;
  customerId: string | null;
  entityId?: string;
}): Promise<string> {
  const job = input.build;
  const plan = appPlanSchema.parse({
    title: job.title ?? "Generated app",
    summary: job.summary ?? "Generated app preview",
    files: job.files,
  });
  if (job.userId !== input.userId) throw new Error("Build owner mismatch");

  // Everything from here on runs inside one failure boundary: the row was
  // already flipped to "provisioning" by beginResumeForOwner, so ANY failure —
  // including a refused sandbox reconnection — must settle it back to "failed"
  // or the active-build cap stays consumed forever.
  let sandbox: Sandbox | undefined;
  try {
    await pgAppBuildRepository.appendLogForOwner(
      job.id,
      input.userId,
      "Resuming app preview",
    );
    if (job.sandboxId) {
      if (!(await isSandboxOwner(job.sandboxId, input.userId))) {
        throw new Error("The previous sandbox owner could not be verified");
      }
      let existing: Sandbox | undefined;
      try {
        existing = await Sandbox.connect(job.sandboxId, {
          apiKey: process.env.E2B_API_KEY,
          requestTimeoutMs: 30_000,
        });
      } catch (error) {
        const missing =
          error instanceof Error && /^\s*404\s*:/.test(error.message);
        if (!missing) {
          throw new Error("The existing preview could not be safely resumed");
        }
        await pgSandboxSessionRepository.markState(job.sandboxId, "killed");
      }
      if (existing) {
        const ready = await waitForSandboxReady(existing, PORT, 15_000);
        if (ready.ready) {
          const previewUrl = `https://${existing.getHost(PORT)}`;
          await Sandbox.setTimeout(
            existing.sandboxId,
            PREVIEW_IDLE_TIMEOUT_MS,
            {
              apiKey: process.env.E2B_API_KEY,
            },
          );
          await pgSandboxSessionRepository.upsert({
            sandboxId: existing.sandboxId,
            threadId: job.threadId,
            toolCallId: job.id,
            userId: input.userId,
            organizationId: null,
            template: TEMPLATE,
            port: PORT,
            url: previewUrl,
          });
          const saved = await pgAppBuildRepository.updateActiveForOwner(
            job.id,
            input.userId,
            { status: "ready", previewUrl },
          );
          if (!saved) throw new AppBuildCancelledError();
          await pgAppBuildRepository.appendLogForOwner(
            job.id,
            input.userId,
            "Preview resumed successfully",
          );
          return previewUrl;
        }
        // Only replace a sandbox whose owner was verified above.
        await existing.kill();
        await pgSandboxSessionRepository.markState(
          existing.sandboxId,
          "killed",
        );
      }
    }

    await assertBuildActive(job.id, input.userId);
    const template = getEnabledPreviewTemplate(TEMPLATE);
    if (!template) throw new Error("App preview template is unavailable");
    sandbox = await createSandbox(TEMPLATE, {
      billing: {
        userId: input.userId,
        customerId: input.customerId,
        ...(input.entityId ? { entityId: input.entityId } : {}),
      },
      requestId: job.id,
      maxAttempts: 2,
      timeoutMs: PREVIEW_SETUP_TIMEOUT_MS,
      requestTimeoutMs: 30_000,
      metadata: { buildId: job.id, feature: "app-builder" },
    });
    await pgAppBuildRepository.appendLogForOwner(
      job.id,
      input.userId,
      "Secure preview sandbox provisioned",
    );
    await pgAppBuildRepository.updateForOwner(job.id, input.userId, {
      sandboxId: sandbox.sandboxId,
    });
    await assertBuildActive(job.id, input.userId);
    await sandbox.commands.run(`mkdir -p ${APP_DIR}`);
    for (const file of plan.files) {
      await assertBuildActive(job.id, input.userId);
      if (!validateGeneratedAppPath(file.path)) {
        throw new Error("Stored app file path is invalid");
      }
      await sandbox.files.write(`${APP_DIR}/${file.path}`, file.content);
    }
    await sandbox.files.write(`${APP_DIR}/server.js`, STATIC_APP_SERVER_SOURCE);
    await pgAppBuildRepository.appendLogForOwner(
      job.id,
      input.userId,
      "Generated source files uploaded",
    );
    const start = await sandbox.commands.run(
      `nohup node ${APP_DIR}/server.js > /tmp/void-agent-app-build.log 2>&1 < /dev/null &`,
      { timeoutMs: 10_000 },
    );
    if (start.exitCode !== 0) throw new Error("Preview server did not start");
    await pgAppBuildRepository.appendLogForOwner(
      job.id,
      input.userId,
      "Preview server started; waiting for readiness",
    );
    const ready = await waitForSandboxReady(sandbox, PORT, 45_000);
    if (!ready.ready) throw new Error("Preview server was not ready in time");
    await pgAppBuildRepository.appendLogForOwner(
      job.id,
      input.userId,
      "Preview server passed readiness check",
    );
    await assertBuildActive(job.id, input.userId);
    const previewUrl = `https://${sandbox.getHost(PORT)}`;
    await Sandbox.setTimeout(sandbox.sandboxId, PREVIEW_IDLE_TIMEOUT_MS, {
      apiKey: process.env.E2B_API_KEY,
    });
    await pgSandboxSessionRepository.upsert({
      sandboxId: sandbox.sandboxId,
      threadId: job.threadId,
      toolCallId: job.id,
      userId: input.userId,
      organizationId: null,
      template: TEMPLATE,
      port: PORT,
      url: previewUrl,
    });
    const saved = await pgAppBuildRepository.updateActiveForOwner(
      job.id,
      input.userId,
      { status: "ready", previewUrl },
    );
    if (!saved) throw new AppBuildCancelledError();
    await pgAppBuildRepository.appendLogForOwner(
      job.id,
      input.userId,
      "Preview resumed successfully",
    );
    return previewUrl;
  } catch (error) {
    if (sandbox) {
      await sandbox.kill().catch(() => undefined);
      await pgSandboxSessionRepository
        .markState(sandbox.sandboxId, "killed")
        .catch(() => undefined);
    }
    await pgAppBuildRepository
      .appendLogForOwner(
        job.id,
        input.userId,
        error instanceof AppBuildCancelledError
          ? "Build cancelled"
          : "The app preview could not be resumed",
      )
      .catch(() => false);
    await pgAppBuildRepository
      .updateActiveForOwner(job.id, input.userId, {
        status: "failed",
        error: "The app could not be resumed. Try again later.",
        sandboxId: null,
      })
      .catch(() => null);
    throw error;
  }
}
