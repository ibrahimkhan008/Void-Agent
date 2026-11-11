import { net, BrowserWindow, app, ipcMain } from "electron";
import {
  clearServerUrl,
  normalizeServerUrl,
  readPreviousServerUrl,
  writeServerUrl,
} from "./server-config.js";
import {
  type PickerReason,
  buildServerPickerHtml,
} from "./server-picker-page.js";
import {
  isCompatibleServerHealthResponse,
  isSameOriginServerResponse,
  isTrustedServerPickerUrl,
  readBoundedServerCheckBody,
} from "./server-picker-policy.js";

type ChooseResult = { ok: true } | { ok: false; reason: PickerReason };

let pickerWindow: BrowserWindow | null = null;

/**
 * A server is accepted only if it answers like a better-chatbot or Navigator
 * instance: Better Auth's health endpoint returns `{ ok: true }`. Anything
 * else is refused before the shell trusts it with a session.
 */
export async function checkServer(origin: string): Promise<ChooseResult> {
  try {
    const response = await net.fetch(`${origin}/api/auth/ok`, {
      method: "GET",
      credentials: "omit",
      redirect: "manual",
      signal: AbortSignal.timeout(8000),
      headers: { accept: "application/json" },
    });
    const body = await readBoundedServerCheckBody(response);
    return body !== null &&
      isSameOriginServerResponse(origin, response.url) &&
      isCompatibleServerHealthResponse({
        status: response.status,
        contentType: response.headers.get("content-type"),
        body,
      })
      ? { ok: true }
      : { ok: false, reason: "not-navigator" };
  } catch {
    return { ok: false, reason: "unreachable" };
  }
}

/** Restart so every module starts again from the new origin. */
function relaunch(): void {
  app.relaunch();
  app.exit(0);
}

export function registerServerPickerIpc(input: {
  userDataDir: string;
  cloudUrl: string;
  allowLocalHttp: boolean;
}): void {
  ipcMain.handle(
    "server:choose",
    async (event, raw: unknown): Promise<ChooseResult> => {
      // Only the picker may change the server. The app window loads a remote
      // origin, and that origin must not be able to repoint the shell.
      const activePicker = pickerWindow;
      if (
        !activePicker ||
        activePicker.isDestroyed() ||
        BrowserWindow.fromWebContents(event.sender) !== activePicker ||
        event.senderFrame !== activePicker.webContents.mainFrame ||
        !isTrustedServerPickerUrl(event.senderFrame?.url ?? "")
      ) {
        return { ok: false, reason: "forbidden" };
      }

      const choice = (raw ?? {}) as {
        mode?: unknown;
        url?: unknown;
        allowLocalHttp?: unknown;
      };
      let origin = input.cloudUrl;
      if (choice.mode === "cloud" && Object.keys(choice).length === 1) {
        origin = input.cloudUrl;
      } else if (
        choice.mode === "own" &&
        typeof choice.allowLocalHttp === "boolean" &&
        choice.allowLocalHttp === input.allowLocalHttp &&
        Object.keys(choice).every((key) =>
          ["mode", "url", "allowLocalHttp"].includes(key),
        )
      ) {
        const normalized = normalizeServerUrl(
          String(choice.url ?? ""),
          input.allowLocalHttp,
        );
        if (!normalized.ok) return normalized;
        const reachable = await checkServer(normalized.origin);
        if (!reachable.ok) return reachable;
        origin = normalized.origin;
      } else {
        return { ok: false, reason: "invalid" };
      }

      writeServerUrl(input.userDataDir, origin, input.allowLocalHttp);
      setImmediate(relaunch);
      return { ok: true };
    },
  );
}

export async function openServerPickerWindow(input: {
  userDataDir: string;
  cloudUrl: string;
  allowLocalHttp: boolean;
  preloadPath: string;
  iconPath?: string | null;
}): Promise<BrowserWindow> {
  const window = new BrowserWindow({
    width: 560,
    height: 560,
    resizable: false,
    show: false,
    title: "Keinsaas Navigator",
    ...(input.iconPath ? { icon: input.iconPath } : {}),
    webPreferences: {
      preload: input.preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  pickerWindow = window;
  window.on("closed", () => {
    pickerWindow = null;
  });
  window.once("ready-to-show", () => window.show());

  // The page is self-contained; nothing in it may navigate or open windows.
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));

  const html = buildServerPickerHtml({
    locale: app.getLocale(),
    cloudUrl: input.cloudUrl,
    previous: readPreviousServerUrl(input.userDataDir),
    allowLocalHttp: input.allowLocalHttp,
  });
  await window.loadURL(
    `data:text/html;charset=utf-8,${encodeURIComponent(html)}`,
  );
  return window;
}

/** "Change Server…": forget the choice and start over at the picker. */
export function changeServer(userDataDir: string): void {
  clearServerUrl(userDataDir);
  relaunch();
}
