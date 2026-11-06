import { contextBridge, ipcRenderer } from "electron";

type DesktopUpdateState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "available"; version: string }
  | { status: "not-available" }
  | { status: "downloading"; version: string; percent: number }
  | { status: "downloaded"; version: string }
  | { status: "error"; message: string };

contextBridge.exposeInMainWorld("desktop", {
  auth: {
    startBrowserSignIn: (input: {
      page: "sign-in" | "sign-up";
      provider: "google" | "github" | "microsoft";
      callbackUrl?: string;
    }) =>
      ipcRenderer.invoke("auth:start-browser-sign-in", input) as Promise<{
        ok: boolean;
      }>,
  },
  mcp: {
    listTools: (config: {
      command: string;
      args?: string[];
      env?: Record<string, string>;
    }) => ipcRenderer.invoke("mcp:list-tools", { config }),
    callTool: (input: {
      config: {
        command: string;
        args?: string[];
        env?: Record<string, string>;
      };
      toolName: string;
      params?: Record<string, unknown>;
    }) => ipcRenderer.invoke("mcp:tool-call", input),
  },
  notifications: {
    show: (input: {
      kind: "complete" | "needs_approval" | "needs_input" | "error";
      threadId: string;
    }) => ipcRenderer.invoke("notifications:show", input) as Promise<boolean>,
    getPermissionStatus: () =>
      ipcRenderer.invoke("notifications:get-permission") as Promise<
        NotificationPermission | "granted" | "unsupported"
      >,
    requestPermission: () =>
      ipcRenderer.invoke("notifications:request-permission") as Promise<
        NotificationPermission | "granted" | "unsupported"
      >,
  },
  updates: {
    getState: () =>
      ipcRenderer.invoke("updates:get-state") as Promise<DesktopUpdateState>,
    checkNow: () => ipcRenderer.invoke("updates:check") as Promise<void>,
    downloadAndInstall: () =>
      ipcRenderer.invoke("updates:download-and-install") as Promise<void>,
    restartAndInstall: () =>
      ipcRenderer.invoke("updates:restart-and-install") as Promise<void>,
    onStateChange: (callback: (state: DesktopUpdateState) => void) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        state: DesktopUpdateState,
      ) => callback(state);
      ipcRenderer.on("updates:state-changed", listener);
      return () =>
        ipcRenderer.removeListener("updates:state-changed", listener);
    },
  },
});
