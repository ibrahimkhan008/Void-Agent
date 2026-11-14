import "server-only";

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { agentBrowserEgressProxyUrl } from "lib/browser-egress/capability";
import logger from "logger";

/**
 * The free browser provider: Vercel Labs' open-source `agent-browser` CLI
 * (Apache-2.0, github.com/vercel-labs/agent-browser), used as the fallback
 * behind the Kernel cloud browser. The agent drives a real headless Chrome
 * through a snapshot → act-on-ref loop — one CLI command per call, executed by
 * a per-session background daemon — instead of the Playwright-code contract
 * the Kernel provider uses. No service key, no hosted runtime: the binary and
 * its Chrome for Testing build live on this machine (or the VPS), so browser
 * use costs nothing.
 *
 * Command execution is `execFile` with an argv array against a whitelisted
 * subcommand set — never a shell — so model-supplied arguments cannot inject
 * into a command line. `eval` is allowed deliberately: it evaluates in the
 * PAGE context over CDP (the same trust level as the Kernel provider's
 * arbitrary-Playwright-code contract), not in Node.
 */

export const AGENT_BROWSER_DEFAULT_TIMEOUT_MS = 120_000;
export const AGENT_BROWSER_OUTPUT_LIMIT = 16_000;

/**
 * Subcommands the inner agent may run. Everything operational is here;
 * management/setup commands (install, doctor, mcp, serve, skills, batch,
 * flow, plugins, login…) are not part of an agent run and stay excluded.
 */
export const AGENT_BROWSER_ALLOWED_COMMANDS = new Set([
  "open",
  "back",
  "forward",
  "reload",
  "read",
  "snapshot",
  "get",
  "is",
  "click",
  "dblclick",
  "fill",
  "type",
  "press",
  "hover",
  "select",
  "check",
  "uncheck",
  "scroll",
  "drag",
  "upload",
  "find",
  "wait",
  "screenshot",
  "pdf",
  "download",
  "diff",
  "cookies",
  "storage",
  "network",
  "set",
  "clipboard",
  "console",
  "errors",
  "tab",
  "frame",
  "dialog",
  "eval",
  "close",
]);

export interface AgentBrowserRunResult {
  ok: boolean;
  exitCode: number | null;
  /** Merged stdout/stderr, truncated to AGENT_BROWSER_OUTPUT_LIMIT. */
  output: string;
  timedOut: boolean;
}

/**
 * Locate the agent-browser executable.
 *
 * Resolution order: `AGENT_BROWSER_BIN` (explicit, production-proof) → the
 * npm-global layout (`<pathDir>/node_modules/agent-browser/bin/agent-browser-<platform>-<arch>[.exe]`,
 * where the npm shim `agent-browser` / `agent-browser.cmd` sits next to its
 * own `node_modules`) → a bare `agent-browser` / `agent-browser.exe` on PATH.
 *
 * The .cmd shim that npm creates is deliberately NOT used: Node refuses to
 * execFile a .cmd without a shell, and running the CLI through a shell would
 * reintroduce the injection surface the argv-array design exists to avoid.
 */
export function resolveAgentBrowserBin(
  env: NodeJS.ProcessEnv = process.env,
  pathEnv: string = env.PATH ?? "",
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
  exists: (candidate: string) => boolean = existsSync,
): string | null {
  const override = env.AGENT_BROWSER_BIN?.trim();
  if (override && exists(override)) return override;

  const binaryName =
    platform === "win32"
      ? `agent-browser-${platform}-${arch}.exe`
      : `agent-browser-${platform}-${arch}`;
  const bareName = platform === "win32" ? "agent-browser.exe" : "agent-browser";

  for (const rawDir of pathEnv.split(path.delimiter)) {
    const dir = rawDir.trim();
    if (!dir) continue;

    // npm-global layout: the shim lives at <dir>/agent-browser[.cmd] and the
    // package (with its native binary) at <dir>/node_modules/agent-browser/.
    const packageBin = path.join(
      dir,
      "node_modules",
      "agent-browser",
      "bin",
      binaryName,
    );
    if (exists(packageBin)) return packageBin;

    // A directly-present native binary.
    const bare = path.join(dir, bareName);
    if (exists(bare)) return bare;
  }
  return null;
}

let cachedAvailability: boolean | null = null;

/**
 * Whether the free provider can run at all. Memoized per process: the binary
 * does not move mid-run, and resolution touches the filesystem.
 */
export function isAgentBrowserConfigured(): boolean {
  cachedAvailability ??= resolveAgentBrowserBin() !== null;
  return cachedAvailability;
}

/** Test-only reset for the memoized availability check. @internal */
export function resetAgentBrowserAvailability(): void {
  cachedAvailability = null;
}

/**
 * Child env for CLI runs. When B20 egress isolation is configured, the proxy
 * is injected through the CLI's own `AGENT_BROWSER_PROXY` knob and every
 * bypass variable (NO_PROXY / AGENT_BROWSER_PROXY_BYPASS) is stripped — a
 * bypass list would route traffic around the boundary and defeat isolation.
 */
export function buildAgentBrowserEnv(
  baseEnv: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...baseEnv };
  const proxy = agentBrowserEgressProxyUrl();
  if (proxy) {
    env.AGENT_BROWSER_PROXY = proxy;
    // Chromium IMPLICITLY bypasses the proxy for loopback — the negative
    // bypass rule removes that exemption so loopback traffic also flows
    // through the egress boundary. Any caller-supplied bypass list is
    // replaced, never merged (a bypass would defeat isolation).
    env.AGENT_BROWSER_PROXY_BYPASS = "<-loopback>";
    delete env.NO_PROXY;
    delete env.no_proxy;
  }
  return env;
}

/**
 * Run one agent-browser CLI command for a session.
 *
 * `args[0]` must be an allowed subcommand; `--session` is appended (not
 * injected by the caller) so a caller cannot forge another session's flag.
 */
export function runAgentBrowserCommand(
  args: string[],
  options?: {
    session?: string;
    timeoutMs?: number;
    signal?: AbortSignal;
  },
): Promise<AgentBrowserRunResult> {
  const bin = resolveAgentBrowserBin();
  if (!bin) {
    return Promise.resolve({
      ok: false,
      exitCode: null,
      output: "The agent-browser CLI was not found on this machine.",
      timedOut: false,
    });
  }

  const subcommand = args[0]?.trim();
  if (!subcommand || !AGENT_BROWSER_ALLOWED_COMMANDS.has(subcommand)) {
    return Promise.resolve({
      ok: false,
      exitCode: null,
      output: `Disallowed agent-browser command: ${
        subcommand ? JSON.stringify(subcommand) : "(empty)"
      }`,
      timedOut: false,
    });
  }

  const session = options?.session?.trim();
  const argv =
    session && session.length > 0 ? [...args, "--session", session] : [...args];
  const timeoutMs = options?.timeoutMs ?? AGENT_BROWSER_DEFAULT_TIMEOUT_MS;

  return new Promise((resolve) => {
    const child = execFile(
      bin,
      argv,
      {
        timeout: timeoutMs,
        env: buildAgentBrowserEnv(process.env),
        maxBuffer: 8 * 1024 * 1024,
        windowsHide: true,
        killSignal: "SIGKILL",
      },
      (error, stdout, stderr) => {
        // `error` carries timeout/kill/non-zero-exit; stdout/stderr carry
        // whatever was produced before it.
        const timedOut =
          Boolean(error) &&
          (error as unknown as { killed?: boolean }).killed === true;
        const merged = `${stdout}${stderr}`.replace(/\r\n/g, "\n").trimEnd();
        const output =
          merged.length > AGENT_BROWSER_OUTPUT_LIMIT
            ? `${merged.slice(0, AGENT_BROWSER_OUTPUT_LIMIT)}\n… (output truncated)`
            : merged;
        const exitCode =
          typeof child.exitCode === "number" ? child.exitCode : null;
        const clean = error === undefined || error === null;
        resolve({
          ok: clean && exitCode === 0,
          exitCode,
          output: output || (error ? String(error.message ?? error) : ""),
          timedOut,
        });
      },
    );
    options?.signal?.addEventListener(
      "abort",
      () => {
        child.kill("SIGKILL");
      },
      { once: true },
    );
  });
}

/**
 * Best-effort teardown of a session's daemon and browser. Never throws: the
 * daemon also self-exits after an hour idle, so a lost close leaks nothing
 * permanent.
 */
export async function closeAgentBrowserSession(session: string): Promise<void> {
  try {
    const result = await runAgentBrowserCommand(["close"], { session });
    if (!result.ok) {
      logger.info(
        `[agent-browser] close for ${session} returned exit ${result.exitCode}: ${result.output.slice(0, 200)}`,
      );
    }
  } catch (error) {
    logger.info(
      `[agent-browser] close for ${session} threw: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}
