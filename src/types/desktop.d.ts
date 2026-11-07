import type { MCPServerConfig, MCPToolInfo } from "app-types/mcp";

declare global {
  type DesktopUpdateState =
    | { status: "idle" }
    | { status: "checking" }
    | { status: "available"; version: string }
    | { status: "not-available" }
    | { status: "downloading"; version: string; percent: number }
    | { status: "downloaded"; version: string }
    | { status: "error"; message: string };

  interface Window {
    desktop?: {
      updates?: {
        getState: () => Promise<DesktopUpdateState>;
        checkNow: () => Promise<void>;
        downloadAndInstall: () => Promise<void>;
        restartAndInstall: () => Promise<void>;
        onStateChange: (callback: (state: DesktopUpdateState) => void) => () => void;
      };
      auth: {
        startBrowserSignIn(input: { page: "sign-in" | "sign-up"; provider: "google" | "github" | "microsoft"; callbackUrl?: string }): Promise<{ ok: boolean }>;
      };
      mcp: {
        getRecentAuditEvents(): Promise<
          Array<{
            timestamp: string;
            action: "mcp.list-tools" | "mcp.tool-call";
            configHash: string;
            toolName?: string;
            argsHash?: string;
            outcome: "success" | "denied" | "failure";
          }>
        >;
        listTools(config: MCPServerConfig): Promise<MCPToolInfo[]>;
        callTool(input: { config: MCPServerConfig; toolName: string; params?: Record<string, unknown> }): Promise<unknown>;
      };
      notifications?: {
        show(input: {
          kind: "complete" | "needs_approval" | "needs_input" | "error";
          threadId: string;
        }): Promise<boolean>;
        getPermissionStatus(): Promise<NotificationPermission | "granted" | "unsupported">;
        requestPermission(): Promise<NotificationPermission | "granted" | "unsupported">;
      };
    };
  }
}

export {};
