import fs from "node:fs";
import path from "node:path";

export const SERVER_FILE_NAME = "server.json";

type StoredServer = { url?: unknown };

export type NormalizedServer =
  | { ok: true; origin: string }
  | { ok: false; reason: "empty" | "invalid" | "insecure" };

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function hasExistingBrowserData(userDataDir: string) {
  return ["Cookies", path.join("Network", "Cookies"), "Local Storage"].some(
    (entry) => fs.existsSync(path.join(userDataDir, entry)),
  );
}

export type StartupServer = { url: string } | { pick: true };

export function resolveStartupServer(input: {
  isDev: boolean;
  devUrl: string;
  defaultUrl: string;
  userDataDir: string;
}): StartupServer {
  if (input.isDev) return { url: input.devUrl };
  const saved = readServerUrl(input.userDataDir, input.isDev);
  if (saved) return { url: saved };

  const configPath = path.join(input.userDataDir, SERVER_FILE_NAME);
  if (!fs.existsSync(configPath) && hasExistingBrowserData(input.userDataDir)) {
    writeServerUrl(input.userDataDir, input.defaultUrl, input.isDev);
    return { url: input.defaultUrl };
  }
  return { pick: true };
}

export function normalizeServerUrl(
  input: string,
  allowLocalHttp: boolean,
): NormalizedServer {
  const trimmed = input.trim();
  if (!trimmed) return { ok: false, reason: "empty" };
  const value = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, reason: "invalid" };
  }
  if (url.username || url.password) return { ok: false, reason: "invalid" };
  if (url.protocol === "https:") return { ok: true, origin: url.origin };
  if (
    allowLocalHttp &&
    url.protocol === "http:" &&
    LOCAL_HOSTS.has(url.hostname)
  ) {
    return { ok: true, origin: url.origin };
  }
  return {
    ok: false,
    reason: url.protocol === "http:" ? "insecure" : "invalid",
  };
}

export function readServerUrl(
  userDataDir: string,
  allowLocalHttp = false,
): string | null {
  try {
    const stored = JSON.parse(
      fs.readFileSync(path.join(userDataDir, SERVER_FILE_NAME), "utf8"),
    ) as StoredServer;
    if (typeof stored.url !== "string") return null;
    const normalized = normalizeServerUrl(stored.url, allowLocalHttp);
    return normalized.ok ? normalized.origin : null;
  } catch {
    return null;
  }
}

export function writeServerUrl(
  userDataDir: string,
  origin: string,
  allowLocalHttp = false,
): void {
  const normalized = normalizeServerUrl(origin, allowLocalHttp);
  if (!normalized.ok || normalized.origin !== origin)
    throw new Error("Invalid desktop server origin");
  fs.mkdirSync(userDataDir, { recursive: true });
  fs.writeFileSync(
    path.join(userDataDir, SERVER_FILE_NAME),
    JSON.stringify({ url: origin }),
    { encoding: "utf8", mode: 0o600 },
  );
}
