import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  normalizeServerUrl,
  readServerUrl,
  resolveStartupServer,
  writeServerUrl,
} from "./server-config.js";

let userDataDir: string;

beforeEach(() => {
  userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "void-agent-server-"));
});

afterEach(() => {
  fs.rmSync(userDataDir, { recursive: true, force: true });
});

describe("desktop server configuration", () => {
  it("normalizes custom HTTPS addresses to an origin", () => {
    expect(normalizeServerUrl(" selfhost.example/chat?x=1 ", false)).toEqual({
      ok: true,
      origin: "https://selfhost.example",
    });
  });

  it("allows local HTTP only when the build is in development", () => {
    expect(normalizeServerUrl("http://localhost:3000", true)).toEqual({
      ok: true,
      origin: "http://localhost:3000",
    });
    expect(normalizeServerUrl("http://localhost:3000", false)).toEqual({
      ok: false,
      reason: "insecure",
    });
    expect(normalizeServerUrl("http://example.com", true)).toEqual({
      ok: false,
      reason: "insecure",
    });
  });

  it("rejects credentials and non-web protocols", () => {
    expect(normalizeServerUrl("https://user:pass@example.com", false)).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(normalizeServerUrl("file:///tmp/app", false)).toEqual({
      ok: false,
      reason: "invalid",
    });
  });

  it("persists only a validated canonical HTTPS origin", () => {
    writeServerUrl(userDataDir, "https://selfhost.example");
    expect(readServerUrl(userDataDir)).toBe("https://selfhost.example");
    expect(() =>
      writeServerUrl(userDataDir, "https://selfhost.example/path"),
    ).toThrow("Invalid desktop server origin");
  });

  it("persists loopback HTTP only for a development installation", () => {
    writeServerUrl(userDataDir, "http://localhost:3000", true);
    expect(readServerUrl(userDataDir, true)).toBe("http://localhost:3000");
    expect(readServerUrl(userDataDir, false)).toBeNull();
    expect(() => writeServerUrl(userDataDir, "http://localhost:3000")).toThrow(
      "Invalid desktop server origin",
    );
  });

  it("ignores a hand-edited insecure server target", () => {
    fs.writeFileSync(
      path.join(userDataDir, "server.json"),
      JSON.stringify({ url: "http://unsafe.example" }),
    );
    expect(readServerUrl(userDataDir)).toBeNull();
  });

  it("opens the picker for a fresh installation", () => {
    expect(
      resolveStartupServer({
        isDev: false,
        devUrl: "http://localhost:3000",
        defaultUrl: "https://void.example",
        userDataDir,
      }),
    ).toEqual({ pick: true });
  });

  it("preserves legacy cloud data and cookies without prompting", () => {
    fs.mkdirSync(path.join(userDataDir, "Local Storage"));
    expect(
      resolveStartupServer({
        isDev: false,
        devUrl: "http://localhost:3000",
        defaultUrl: "https://void.example",
        userDataDir,
      }),
    ).toEqual({ url: "https://void.example" });
    expect(readServerUrl(userDataDir)).toBe("https://void.example");
  });

  it("reuses an explicit server choice, including on legacy installs", () => {
    fs.mkdirSync(path.join(userDataDir, "Network"), { recursive: true });
    fs.writeFileSync(path.join(userDataDir, "Network", "Cookies"), "");
    writeServerUrl(userDataDir, "https://self-hosted.example");
    expect(
      resolveStartupServer({
        isDev: false,
        devUrl: "http://localhost:3000",
        defaultUrl: "https://void.example",
        userDataDir,
      }),
    ).toEqual({ url: "https://self-hosted.example" });
  });

  it("always uses the configured local development server", () => {
    writeServerUrl(userDataDir, "https://self-hosted.example");
    expect(
      resolveStartupServer({
        isDev: true,
        devUrl: "http://localhost:3000",
        defaultUrl: "https://void.example",
        userDataDir,
      }),
    ).toEqual({ url: "http://localhost:3000" });
  });
});
