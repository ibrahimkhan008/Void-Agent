import { execFile } from "node:child_process";
import { type PathLike, existsSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// Hoisted: replaces the fs binding the client module imports, so the binary
// resolution is fully controlled per test.
vi.mock("node:fs", () => ({ existsSync: vi.fn(() => false) }));

const existsMock = vi.mocked(existsSync);

import {
  AGENT_BROWSER_ALLOWED_COMMANDS,
  isAgentBrowserConfigured,
  resetAgentBrowserAvailability,
  resolveAgentBrowserBin,
  runAgentBrowserCommand,
} from "./client";

/** Partial env for the resolver DI: the app widens ProcessEnv with required keys. */
const env = (vars: Record<string, string>) =>
  vars as unknown as NodeJS.ProcessEnv;

/** existsSync stub keyed by the candidate suffix the resolver checks. */
function existsWhere(...present: string[]) {
  return (candidate: PathLike) =>
    present.some((p) => String(candidate).replace(/\\/g, "/").endsWith(p));
}

beforeEach(() => {
  existsMock.mockReturnValue(false);
});

afterEach(() => {
  vi.unstubAllEnvs();
  existsMock.mockReset();
  resetAgentBrowserAvailability();
});

describe("resolveAgentBrowserBin", () => {
  const PLATFORM_BIN = "agent-browser-win32-x64.exe";

  it("prefers an explicit AGENT_BROWSER_BIN override", () => {
    existsMock.mockImplementation(() => true);
    expect(
      resolveAgentBrowserBin(
        env({ AGENT_BROWSER_BIN: "C:/tools/agent-browser.exe" }),
        "C:/somewhere",
        "win32",
        "x64",
      ),
    ).toBe("C:/tools/agent-browser.exe");
  });

  it("ignores an override that does not exist", () => {
    existsMock.mockImplementation(existsWhere("agent-browser.exe"));
    expect(
      resolveAgentBrowserBin(
        env({ AGENT_BROWSER_BIN: "C:/tools/missing.exe" }),
        "C:/bin",
        "win32",
        "x64",
      )?.replaceAll("\\", "/"),
    ).toBe("C:/bin/agent-browser.exe");
  });

  it("finds the npm-global native binary next to the shim dir", () => {
    // The npm shim lives at <dir>/agent-browser.cmd and the package (with its
    // native binary) at <dir>/node_modules/agent-browser/bin/.
    existsMock.mockImplementation(
      existsWhere(`node_modules/agent-browser/bin/${PLATFORM_BIN}`),
    );
    const bin = resolveAgentBrowserBin(env({}), "C:/npm", "win32", "x64");
    expect(bin?.replace(/\\/g, "/")).toContain(
      `node_modules/agent-browser/bin/${PLATFORM_BIN}`,
    );
  });

  it("falls back to a bare binary on PATH", () => {
    existsMock.mockImplementation(existsWhere("agent-browser.exe"));
    expect(
      resolveAgentBrowserBin(env({}), "C:/bin", "win32", "x64")?.replaceAll(
        "\\",
        "/",
      ),
    ).toBe("C:/bin/agent-browser.exe");
  });

  it("returns null when nothing exists", () => {
    expect(
      resolveAgentBrowserBin(env({}), "C:/bin", "win32", "x64"),
    ).toBeNull();
  });

  it("skips empty PATH entries", () => {
    expect(resolveAgentBrowserBin(env({}), ";;;", "win32", "x64")).toBeNull();
  });
});

describe("isAgentBrowserConfigured", () => {
  it("memoizes the availability check per process", () => {
    existsMock.mockImplementation(() => true);
    expect(isAgentBrowserConfigured()).toBe(true);
    // The second call answers from the cache even after the world "changes".
    existsMock.mockReturnValue(false);
    expect(isAgentBrowserConfigured()).toBe(true);
    // And the reset clears it, so the new reality is visible again.
    resetAgentBrowserAvailability();
    expect(isAgentBrowserConfigured()).toBe(false);
  });
});

describe("runAgentBrowserCommand", () => {
  it("rejects disallowed subcommands without spawning anything", async () => {
    existsMock.mockReturnValue(true); // binary "found" — rejection is the whitelist's doing
    const spawnSpy = vi.spyOn({ execFile }, "execFile");
    for (const banned of ["install", "doctor", "mcp", "login", "serve", ""]) {
      const result = await runAgentBrowserCommand(banned ? [banned] : []);
      expect(result.ok).toBe(false);
      expect(result.exitCode).toBeNull();
      expect(result.output).toContain("Disallowed");
    }
    expect(spawnSpy).not.toHaveBeenCalled();
  });

  it("covers the interactive loop commands in the whitelist", () => {
    for (const command of [
      "open",
      "snapshot",
      "click",
      "fill",
      "wait",
      "close",
    ]) {
      expect(AGENT_BROWSER_ALLOWED_COMMANDS.has(command)).toBe(true);
    }
    for (const command of [
      "install",
      "doctor",
      "mcp",
      "serve",
      "skills",
      "batch",
    ]) {
      expect(AGENT_BROWSER_ALLOWED_COMMANDS.has(command)).toBe(false);
    }
  });
});
