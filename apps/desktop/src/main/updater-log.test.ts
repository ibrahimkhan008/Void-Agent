import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: {
    getPath: (name: string) => path.join(os.tmpdir(), "void-agent-" + name),
  },
}));

import {
  UPDATER_LOG_MAX_BYTES,
  createUpdaterLogger,
  sanitizeUpdaterLogMessage,
  trimUpdaterLog,
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

  it("caps a message and trims old log data at a line boundary", () => {
    expect(sanitizeUpdaterLogMessage("x".repeat(5_000))).toHaveLength(4_000);
    expect(trimUpdaterLog("old line\nnew line\n", 10)).toBe("new line\n");
    expect(
      Buffer.byteLength(trimUpdaterLog("éé\nx\n", 4), "utf8"),
    ).toBeLessThanOrEqual(4);
  });

  it("writes local updater events and rotates to a bounded log file", () => {
    const directory = mkdtempSync(
      path.join(os.tmpdir(), "void-agent-updater-"),
    );
    tempDirectories.push(directory);
    const file = path.join(directory, "updater.log");
    const logger = createUpdaterLogger(file);

    logger.info("checking update feed");
    logger.error("failed https://updates.example/private?token=do-not-log");
    expect(readFileSync(file, "utf8")).toContain("checking update feed");
    expect(readFileSync(file, "utf8")).not.toContain("do-not-log");

    logger.debug("x".repeat(4_000));
    for (let i = 0; i < 140; i += 1) logger.info("event " + i);

    expect(statSync(file).size).toBeLessThanOrEqual(UPDATER_LOG_MAX_BYTES);
    expect(readFileSync(file, "utf8")).toContain("event 139");
  });
});
