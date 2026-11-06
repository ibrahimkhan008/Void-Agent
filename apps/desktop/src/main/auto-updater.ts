import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { type BrowserWindow, app, dialog, ipcMain } from "electron";
import type { AppUpdater, ProgressInfo, UpdateInfo } from "electron-updater";
import { parseSecureUpdateFeed } from "../../../../src/lib/desktop/update-feed.js";
import {
  AUTO_CHECK_INTERVAL_MS,
  FOCUS_CHECK_MIN_GAP_MS,
  type UpdateCheckSource,
  isForcedUpdateCheck,
  shouldRunUpdateCheck,
} from "./update-policy.js";
import { resolveAutoUpdater } from "./updater-interop.js";

export type DesktopUpdateState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "available"; version: string }
  | { status: "not-available" }
  | { status: "downloading"; version: string; percent: number }
  | { status: "downloaded"; version: string }
  | { status: "error"; message: string };

const UPDATE_STATE_CHANGED_CHANNEL = "updates:state-changed";
const GENERIC_ERROR =
  "The update service could not be reached. Try again later.";

let updateState: DesktopUpdateState = { status: "idle" };
let mainWindow: BrowserWindow | null = null;
let trustedOrigin = "";
let autoUpdaterRef: AppUpdater | null = null;
let lastCheckAt: number | null = null;
let checkInFlight = false;
let disabledReason = "The updater has not finished starting.";
let updaterInitialized = false;
let handlersRegistered = false;

function setState(next: DesktopUpdateState) {
  updateState = next;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(UPDATE_STATE_CHANGED_CHANNEL, updateState);
  }
}

export function setUpdateMainWindow(window: BrowserWindow | null, origin = "") {
  mainWindow = window;
  trustedOrigin = origin;
}

function readPackagedFeed(): string | null {
  try {
    const configPath = join(process.resourcesPath, "app-update.yml");
    if (!existsSync(configPath)) return null;
    return parseSecureUpdateFeed(readFileSync(configPath, "utf8"));
  } catch {
    return null;
  }
}

export function initAutoUpdater() {
  if (updaterInitialized) return;
  updaterInitialized = true;

  if (!app.isPackaged) {
    disabledReason = "Automatic updates are disabled in development builds.";
    return;
  }
  const feed = readPackagedFeed();
  if (!feed) {
    disabledReason = "This build has no valid HTTPS update feed.";
    return;
  }

  void import("electron-updater")
    .then((module) => {
      const updater = resolveAutoUpdater<AppUpdater>(module);
      autoUpdaterRef = updater;
      updater.logger = console;
      updater.autoDownload = true;
      updater.autoInstallOnAppQuit = true;
      updater.allowDowngrade = false;

      updater.on("checking-for-update", () => setState({ status: "checking" }));
      updater.on("update-available", (info: UpdateInfo) =>
        setState({ status: "available", version: info.version }),
      );
      updater.on("update-not-available", () =>
        setState({ status: "not-available" }),
      );
      updater.on("download-progress", (progress: ProgressInfo) => {
        const version =
          updateState.status === "available" ||
          updateState.status === "downloading"
            ? updateState.version
            : "";
        setState({ status: "downloading", version, percent: progress.percent });
      });
      updater.on("update-downloaded", (info: UpdateInfo) =>
        setState({ status: "downloaded", version: info.version }),
      );
      updater.on("error", () =>
        setState({ status: "error", message: GENERIC_ERROR }),
      );

      void checkForUpdatesNow("startup");
      setInterval(
        () => void checkForUpdatesNow("interval"),
        AUTO_CHECK_INTERVAL_MS,
      );
      app.on("browser-window-focus", () => void checkForUpdatesNow("focus"));
    })
    .catch(() => {
      disabledReason = "The updater could not be initialized.";
      setState({ status: "error", message: GENERIC_ERROR });
    });
}

export async function checkForUpdatesNow(source: UpdateCheckSource) {
  if (!autoUpdaterRef) {
    if (source === "manual") {
      await showDialog("Updates are unavailable", disabledReason);
    }
    return;
  }
  if (checkInFlight) return;
  const now = Date.now();
  if (
    !isForcedUpdateCheck(source) &&
    !shouldRunUpdateCheck({
      lastCheckAt,
      now,
      minGapMs: FOCUS_CHECK_MIN_GAP_MS,
    })
  ) {
    return;
  }

  checkInFlight = true;
  lastCheckAt = now;
  try {
    const result = await autoUpdaterRef.checkForUpdates();
    if (source === "manual" && result) {
      await showDialog(
        result.isUpdateAvailable
          ? `Void-Agent ${result.updateInfo.version} is downloading`
          : "Void-Agent is up to date",
        result.isUpdateAvailable
          ? "The update will download in the background. You can keep working."
          : `You are running Void-Agent ${app.getVersion()}.`,
      );
    }
  } catch {
    setState({ status: "error", message: GENERIC_ERROR });
  } finally {
    checkInFlight = false;
  }
}

async function showDialog(message: string, detail: string) {
  const options = {
    type: "info" as const,
    title: "Void-Agent",
    message,
    detail,
  };
  if (mainWindow && !mainWindow.isDestroyed()) {
    await dialog.showMessageBox(mainWindow, options);
  } else {
    await dialog.showMessageBox(options);
  }
}

function assertTrustedSender(event: Electron.IpcMainInvokeEvent) {
  if (
    !mainWindow ||
    mainWindow.isDestroyed() ||
    event.sender !== mainWindow.webContents ||
    event.senderFrame !== mainWindow.webContents.mainFrame
  ) {
    throw new Error("Untrusted desktop IPC sender");
  }
  try {
    if (new URL(event.senderFrame.url).origin !== trustedOrigin) {
      throw new Error("Untrusted desktop IPC origin");
    }
  } catch {
    throw new Error("Untrusted desktop IPC origin");
  }
}

export function registerUpdateIpcHandlers() {
  if (handlersRegistered) return;
  handlersRegistered = true;

  ipcMain.handle("updates:get-state", (event) => {
    assertTrustedSender(event);
    return updateState;
  });
  ipcMain.handle("updates:download-and-install", async (event) => {
    assertTrustedSender(event);
    if (!autoUpdaterRef || updateState.status !== "available") return;
    const version = updateState.version;
    setState({ status: "downloading", version, percent: 0 });
    try {
      await autoUpdaterRef.downloadUpdate();
    } catch {
      setState({ status: "error", message: GENERIC_ERROR });
    }
  });
  ipcMain.handle("updates:check", async (event) => {
    assertTrustedSender(event);
    await checkForUpdatesNow("renderer");
  });
  ipcMain.handle("updates:restart-and-install", (event) => {
    assertTrustedSender(event);
    if (!autoUpdaterRef || updateState.status !== "downloaded") return;
    autoUpdaterRef.quitAndInstall(false, true);
  });
}
