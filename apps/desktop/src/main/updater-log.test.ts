import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const logs = vi.hoisted(() => ({ directory: "" }));

vi.mock("electron", () => ({
  app: {
    getPath: () => logs.directory,
  },
}));

import { UPDATER_LOG_MAX_BYTES } from "./update-policy.js";
import {
  createUpdaterLogger,
  sanitizeUpdaterLogMessage,
} from "./updater-log.js";

const tempDirectories: string[] = [];

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("updater diagnostics", () => {
  it("redacts signed URLs, bearer values, and credential fields", () => {
    const message = sanitizeUpdaterLogMessage(
      'request https://user:pass@updates.example/releases/app.zip?token=secret Authorization: Bearer abc123 {"api_key":"key-456","cookie":"session-secret"}',
    );

    expect(message).toContain("https://updates.example/[path omitted]");
    expect(message).toContain("Authorization=[redacted]");
    expect(message).not.toContain("user:pass");
    expect(message).not.toContain("token=secret");
    expect(message).not.toContain("abc123");
    expect(message).not.toContain("key-456");
    expect(message).not.toContain("session-secret");
  });

  it("caps messages and rotates a bounded log", () => {
    const directory = mkdtempSync(
      path.join(os.tmpdir(), "desktop-updater-log-"),
    );
    tempDirectories.push(directory);
    logs.directory = directory;
    const file = path.join(directory, "updater.log");
    const logger = createUpdaterLogger();

    expect(sanitizeUpdaterLogMessage("x".repeat(5_000))).toHaveLength(4_000);
    logger.info("checking update feed");
    logger.error("failed https://updates.example/private?token=do-not-log");
    expect(readFileSync(file, "utf8")).toContain("checking update feed");
    expect(readFileSync(file, "utf8")).not.toContain("do-not-log");

    for (let index = 0; index < 160; index += 1) {
      logger.info(`event ${index} ${"x".repeat(4_000)}`);
    }
    expect(statSync(file).size).toBeLessThanOrEqual(UPDATER_LOG_MAX_BYTES);
    expect(readFileSync(file, "utf8")).toContain("event 159");
  });
});
