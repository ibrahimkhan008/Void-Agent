import { randomBytes, timingSafeEqual } from "node:crypto";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { BrowserWindow, app, ipcMain, session, shell } from "electron";
import { buildDesktopHandoffPath, parseDesktopAuthDeepLink, sanitizeDesktopReturnTo } from "../../../../src/lib/auth/desktop-handoff.js";

const PENDING_FILE = "pending-desktop-sign-in.json";
const PENDING_TTL_MS = 5 * 60_000;
const signInInputSchema = {
  parse(value: unknown): { page: "sign-in" | "sign-up"; provider: "google" | "github" | "microsoft"; callbackUrl?: string } {
    if (!value || typeof value !== "object") throw new Error("Invalid sign-in request");
    const input = value as Record<string, unknown>;
    if (input.page !== "sign-in" && input.page !== "sign-up") throw new Error("Invalid sign-in page");
    if (typeof input.provider !== "string" || !socialProviders.has(input.provider)) throw new Error("Unsupported sign-in provider");
    if (input.callbackUrl !== undefined && (typeof input.callbackUrl !== "string" || input.callbackUrl.length > 2_048)) throw new Error("Invalid sign-in destination");
    return { page: input.page, provider: input.provider as "google" | "github" | "microsoft", ...(typeof input.callbackUrl === "string" ? { callbackUrl: input.callbackUrl } : {}) };
  },
};

type PendingSignIn = { state: string; createdAt: number; returnTo: string };
const socialProviders = new Set(["google", "github", "microsoft"]);
let mainWindow: BrowserWindow | null = null;
let appUrl: URL | null = null;
let inFlight = false;
const queuedDeepLinks: string[] = [];

const pendingPath = () => join(app.getPath("userData"), PENDING_FILE);

function isTrustedAppFrame(event: Electron.IpcMainInvokeEvent) {
  if (!mainWindow || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents || event.senderFrame !== mainWindow.webContents.mainFrame || !appUrl) return false;
  try { return new URL(event.senderFrame.url).origin === appUrl.origin; } catch { return false; }
}

export function configureDesktopAuth(window: BrowserWindow, target: URL) {
  mainWindow = window;
  appUrl = target;
  ipcMain.handle("auth:start-browser-sign-in", async (event, rawInput: unknown) => {
    if (!isTrustedAppFrame(event)) throw new Error("Untrusted sign-in request");
    const input = signInInputSchema.parse(rawInput);
    const pending: PendingSignIn = { state: randomBytes(24).toString("base64url"), createdAt: Date.now(), returnTo: sanitizeDesktopReturnTo(input.callbackUrl) };
    await writeFile(pendingPath(), JSON.stringify(pending), { encoding: "utf8", mode: 0o600 });
    const callbackUrl = buildDesktopHandoffPath(pending.state);
    const browserUrl = new URL(`/${input.page}`, target.origin);
    browserUrl.searchParams.set("callbackUrl", callbackUrl);
    browserUrl.searchParams.set("desktopProvider", input.provider);
    await shell.openExternal(browserUrl.toString());
    return { ok: true };
  });
}

async function loadPending(): Promise<PendingSignIn | null> {
  try {
    const raw: unknown = JSON.parse(await readFile(pendingPath(), "utf8"));
    if (!raw || typeof raw !== "object") return null;
    const value = raw as Record<string, unknown>;
    if (typeof value.state !== "string" || !/^[A-Za-z0-9_-]{32}$/.test(value.state) || typeof value.createdAt !== "number" || !Number.isFinite(value.createdAt)) return null;
    return { state: value.state, createdAt: value.createdAt, returnTo: sanitizeDesktopReturnTo(value.returnTo) };
  } catch { return null; }
}

async function exchangeOneTimeToken(token: string) {
  if (!appUrl) return false;
  const origin = appUrl.origin;
  try {
    const response = await session.defaultSession.fetch(`${origin}/api/auth/one-time-token/verify`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", Origin: origin, Referer: `${origin}/` },
      body: JSON.stringify({ token }),
      signal: AbortSignal.timeout(15_000),
    });
    return response.ok;
  } catch { return false; }
}

export async function handleDesktopAuthDeepLink(rawUrl: string) {
  if (!mainWindow || mainWindow.isDestroyed() || !appUrl) {
    queuedDeepLinks.push(rawUrl);
    return;
  }
  const deepLink = parseDesktopAuthDeepLink(rawUrl);
  if (!deepLink || inFlight) return;
  inFlight = true;
  try {
    const pending = await loadPending();
    if (!pending) return;
    const expected = Buffer.from(pending.state, "utf8");
    const actual = Buffer.from(deepLink.state, "utf8");
    if (pending.createdAt + PENDING_TTL_MS < Date.now() || expected.length !== actual.length || !timingSafeEqual(expected, actual)) return;
    await rm(pendingPath(), { force: true });
    if (await exchangeOneTimeToken(deepLink.token)) {
      await mainWindow.loadURL(new URL(pending.returnTo, appUrl.origin).toString());
      mainWindow.show();
      mainWindow.focus();
    }
  } finally { inFlight = false; }
}

export function flushDesktopAuthDeepLinks() {
  for (const url of queuedDeepLinks.splice(0)) void handleDesktopAuthDeepLink(url);
}
