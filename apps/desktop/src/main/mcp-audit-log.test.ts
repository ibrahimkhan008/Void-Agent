import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  parseDesktopMcpAuditLog,
  readRecentDesktopMcpAuditEvents,
} from "./mcp-audit-log.js";

const hash = "a".repeat(64);
const event = (index: number) => ({
  timestamp: new Date(Date.UTC(2026, 10, 7, 0, 0, index)).toISOString(),
  surface: "desktop",
  action: "mcp.tool-call",
  configHash: hash,
  toolName: "read_file",
  argsHash: hash,
  outcome: "success",
});

const temporaryDirectories: string[] = [];
afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((dir) =>
      rm(dir, { recursive: true, force: true }),
    ),
  );
});

describe("desktop MCP audit history", () => {
  it("returns newest safe rows first and discards malformed or secret-bearing rows", () => {
    const secretRow = JSON.stringify({ ...event(9), args: { token: "secret" } });
    const parsed = parseDesktopMcpAuditLog(
      [JSON.stringify(event(1)), "not-json", secretRow, JSON.stringify(event(2))].join("\n"),
    );

    expect(parsed).toEqual([event(2), event(1)]);
    expect(JSON.stringify(parsed)).not.toContain("secret");
  });

  it("caps event counts and rejects non-positive limits", () => {
    const text = Array.from({ length: 120 }, (_, index) => JSON.stringify(event(index))).join("\n");
    expect(parseDesktopMcpAuditLog(text)).toHaveLength(100);
    expect(parseDesktopMcpAuditLog(text, 0)).toEqual([]);
    expect(parseDesktopMcpAuditLog(text, 500)).toHaveLength(100);
  });

  it("reads a missing file as an empty history and a present file from its tail", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "void-mcp-audit-"));
    temporaryDirectories.push(dir);
    expect(await readRecentDesktopMcpAuditEvents(dir)).toEqual([]);
    await writeFile(
      path.join(dir, "mcp-audit.ndjson"),
      `${JSON.stringify(event(1))}\n${JSON.stringify(event(2))}\n`,
      { mode: 0o600 },
    );
    expect(await readRecentDesktopMcpAuditEvents(dir)).toEqual([event(2), event(1)]);
  });
});
