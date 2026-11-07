import { net, BrowserWindow, app, dialog, ipcMain } from "electron";
import { normalizeServerUrl, writeServerUrl } from "./server-config.js";
import { buildServerPickerHtml } from "./server-picker-page.js";
import {
  isCompatibleServerHealthResponse,
  isTrustedServerPickerCall,
} from "./server-picker-policy.js";

type PickerFailure =
  | "empty"
  | "invalid"
  | "insecure"
  | "unreachable"
  | "incompatible"
  | "forbidden";
type ChooseResult = { ok: true } | { ok: false; reason: PickerFailure };

let pickerWindow: BrowserWindow | null = null;
let handlerRegistered = false;

async function readBoundedBody(response: Response, maxBytes: number) {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    await response.body?.cancel().catch(() => undefined);
    return null;
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

async function checkServer(origin: string): Promise<ChooseResult> {
  try {
    const url = new URL("/api/health", origin);
    const response = await net.fetch(url.toString(), {
      method: "GET",
      credentials: "omit",
      redirect: "manual",
      signal: AbortSignal.timeout(6_000),
      headers: { accept: "application/json" },
    });
    if (new URL(response.url).origin !== origin)
      return { ok: false, reason: "incompatible" };
    const body = await readBoundedBody(response, 8_192);
    return body !== null &&
      isCompatibleServerHealthResponse({
        status: response.status,
        contentType: response.headers.get("content-type"),
        body,
      })
      ? { ok: true }
      : { ok: false, reason: "incompatible" };
  } catch {
    return { ok: false, reason: "unreachable" };
  }
}

function relaunch() {
  app.relaunch();
  app.exit(0);
}

export function registerServerPickerIpc(input: {
  defaultUrl: string;
  userDataDir: string;
  allowLocalHttp: boolean;
}) {
  if (handlerRegistered) return;
  handlerRegistered = true;
  ipcMain.handle(
    "server:choose",
    async (event, raw: unknown): Promise<ChooseResult> => {
      const activePicker = pickerWindow;
      const pickerDestroyed = !activePicker || activePicker.isDestroyed();
      if (
        !isTrustedServerPickerCall({
          hasPicker: Boolean(activePicker),
          pickerDestroyed,
          senderMatches:
            Boolean(activePicker) && event.sender === activePicker?.webContents,
          mainFrameMatches:
            Boolean(activePicker) &&
            event.senderFrame === activePicker?.webContents.mainFrame,
          frameUrl: event.senderFrame?.url ?? "",
        })
      ) {
        return { ok: false, reason: "forbidden" };
      }
      if (!raw || typeof raw !== "object" || Array.isArray(raw))
        return { ok: false, reason: "invalid" };
      const choice = raw as Record<string, unknown>;
      let origin: string;
      if (choice.mode === "default" && Object.keys(choice).length === 1) {
        origin = input.defaultUrl;
      } else if (
        choice.mode === "custom" &&
        typeof choice.url === "string" &&
        typeof choice.allowLocalHttp === "boolean" &&
        choice.allowLocalHttp === input.allowLocalHttp &&
        Object.keys(choice).length === 3
      ) {
        const normalized = normalizeServerUrl(choice.url, input.allowLocalHttp);
        if (!normalized.ok) return normalized;
        origin = normalized.origin;
        const result = await checkServer(origin);
        if (!result.ok) return result;
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
  defaultUrl: string;
  previousUrl: string;
  allowLocalHttp: boolean;
  preloadPath: string;
  parent?: BrowserWindow;
}) {
  if (pickerWindow && !pickerWindow.isDestroyed()) {
    pickerWindow.show();
    pickerWindow.focus();
    return pickerWindow;
  }
  const window = new BrowserWindow({
    width: 560,
    height: 560,
    resizable: false,
    show: false,
    title: "Choose Void-Agent server",
    ...(input.parent ? { parent: input.parent, modal: true } : {}),
    webPreferences: {
      preload: input.preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  pickerWindow = window;
  window.on("closed", () => {
    if (pickerWindow === window) pickerWindow = null;
  });
  window.once("ready-to-show", () => window.show());
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  const html = buildServerPickerHtml(input);
  try {
    await window.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(html)}`,
    );
  } catch {
    if (!window.isDestroyed()) window.close();
    dialog.showErrorBox(
      "Could not open server selection",
      "Close this window and try again.",
    );
    throw new Error("Could not open desktop server picker");
  }
  return window;
}
