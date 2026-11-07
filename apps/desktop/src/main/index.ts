import { fileURLToPath } from "node:url";
import { BrowserWindow, Menu, app, dialog, shell } from "electron";
import {
  checkForUpdatesNow,
  initAutoUpdater,
  registerUpdateIpcHandlers,
  setUpdateMainWindow,
} from "./auto-updater.js";
import {
  configureDesktopAuth,
  flushDesktopAuthDeepLinks,
  handleDesktopAuthDeepLink,
} from "./desktop-auth.js";
import { registerDesktopDownloads } from "./downloads.js";
import { classifyDesktopNavigation } from "./external-links.js";
import { configureMcpIpc, registerMcpIpcHandlers } from "./mcp-ipc.js";
import {
  configureDesktopNotifications,
  registerDesktopNotificationHandlers,
} from "./notifications.js";
import { resolveStartupServer } from "./server-config.js";
import {
  openServerPickerWindow,
  registerServerPickerIpc,
} from "./server-picker.js";

const targetValue =
  process.env.VOID_AGENT_WEB_URL ?? process.env.NEXT_PUBLIC_BASE_URL ?? "";
let target: URL | null = null;
let window: BrowserWindow | null = null;

function parseTarget(value: string) {
  const url = new URL(value);
  const local = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  if (
    url.protocol !== "https:" &&
    !(
      process.env.NODE_ENV === "development" &&
      local &&
      url.protocol === "http:"
    )
  )
    throw new Error(
      "Void-Agent desktop requires HTTPS except for local development servers",
    );
  if (url.username || url.password)
    throw new Error("Desktop server URL cannot include credentials");
  return new URL(url.origin);
}

function acceptDeepLink(raw: string) {
  void handleDesktopAuthDeepLink(raw);
}

function installApplicationMenu(onChangeServer: () => void) {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: "Void-Agent",
        submenu: [
          { role: "about" },
          { type: "separator" },
          { label: "Change Server…", click: onChangeServer },
          { type: "separator" },
          { role: "quit" },
        ],
      },
      {
        label: "Help",
        submenu: [
          {
            label: "Check for Updates…",
            click: () => void checkForUpdatesNow("manual"),
          },
        ],
      },
    ]),
  );
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", (_event, argv) => {
    const link = argv.find((arg) => arg.startsWith("voidagent://"));
    if (link) acceptDeepLink(link);
    if (window && !window.isDestroyed()) {
      window.show();
      window.focus();
    }
  });
  app.on("open-url", (event, url) => {
    event.preventDefault();
    acceptDeepLink(url);
  });
  app.setAsDefaultProtocolClient("voidagent");

  app
    .whenReady()
    .then(async () => {
      const userDataDir = app.getPath("userData");
      const allowLocalHttp = process.env.NODE_ENV === "development";
      const pickerPreloadPath = fileURLToPath(
        new URL("../preload/server-picker.js", import.meta.url),
      );
      let startup: ReturnType<typeof resolveStartupServer>;
      let defaultTarget: URL;
      try {
        defaultTarget = parseTarget(targetValue);
        startup = resolveStartupServer({
          isDev: allowLocalHttp,
          devUrl: defaultTarget.origin,
          defaultUrl: defaultTarget.origin,
          userDataDir,
        });
      } catch {
        dialog.showErrorBox(
          "Void-Agent desktop is not configured",
          "Build or launch the desktop app with VOID_AGENT_WEB_URL set to your Void-Agent HTTPS URL (or localhost in development).",
        );
        app.quit();
        return;
      }

      registerServerPickerIpc({
        defaultUrl: defaultTarget.origin,
        userDataDir,
        allowLocalHttp,
      });
      if ("pick" in startup) {
        await openServerPickerWindow({
          defaultUrl: defaultTarget.origin,
          previousUrl: defaultTarget.origin,
          allowLocalHttp,
          preloadPath: pickerPreloadPath,
        });
        return;
      }
      target = parseTarget(startup.url);

      const appTarget = target;
      if (!appTarget) {
        app.quit();
        return;
      }
      window = new BrowserWindow({
        width: 1280,
        height: 860,
        minWidth: 920,
        minHeight: 620,
        show: false,
        title: "Void-Agent",
        webPreferences: {
          preload: fileURLToPath(
            new URL("../preload/index.js", import.meta.url),
          ),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
        },
      });
      window.once("ready-to-show", () => window?.show());
      setUpdateMainWindow(window, appTarget.origin);
      registerUpdateIpcHandlers();
      initAutoUpdater();
      installApplicationMenu(() => {
        if (!window || window.isDestroyed()) return;
        void openServerPickerWindow({
          defaultUrl: defaultTarget.origin,
          previousUrl: appTarget.origin,
          allowLocalHttp,
          preloadPath: pickerPreloadPath,
          parent: window,
        }).catch((error) => {
          console.error("Could not open the server picker", error);
        });
      });
      configureDesktopAuth(window, appTarget);
      configureMcpIpc(window, appTarget.origin);
      registerMcpIpcHandlers();
      configureDesktopNotifications(window, appTarget.origin);
      registerDesktopNotificationHandlers();
      registerDesktopDownloads(window.webContents.session, appTarget.origin);
      window.webContents.setWindowOpenHandler(({ url }) => {
        const action = classifyDesktopNavigation(url, appTarget.origin);
        if (action === "download") window?.webContents.downloadURL(url);
        else if (action === "external") void shell.openExternal(url);
        return { action: "deny" };
      });
      window.webContents.on("will-navigate", (event, url) => {
        const action = classifyDesktopNavigation(url, appTarget.origin);
        if (action === "app") return;
        event.preventDefault();
        if (action === "download") window?.webContents.downloadURL(url);
        else if (action === "external") void shell.openExternal(url);
      });
      await window.loadURL(appTarget.origin);
      flushDesktopAuthDeepLinks();
      const coldStartLink = process.argv.find((arg) =>
        arg.startsWith("voidagent://"),
      );
      if (coldStartLink) acceptDeepLink(coldStartLink);
    })
    .catch((error) => {
      dialog.showErrorBox(
        "Void-Agent desktop could not start",
        error instanceof Error ? error.message : "Unexpected startup error",
      );
      app.quit();
    });
  app.on("window-all-closed", () => app.quit());
}
