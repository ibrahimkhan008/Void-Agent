import type { MCPServerConfig, MCPToolInfo } from "app-types/mcp";
import { isMaybeStdioConfig } from "./is-mcp-config";

export function isDesktopClient() {
  return typeof window !== "undefined" && Boolean(window.desktop?.mcp);
}

export function shouldUseDesktopMcpBridge(config: MCPServerConfig) {
  return isDesktopClient() && isMaybeStdioConfig(config);
}

export async function listMcpToolsViaDesktop(config: MCPServerConfig): Promise<MCPToolInfo[]> {
  if (!shouldUseDesktopMcpBridge(config)) throw new Error("Local MCP requires the Void-Agent desktop app");
  return window.desktop!.mcp.listTools(config);
}

export async function callMcpToolViaDesktop(config: MCPServerConfig, toolName: string, params: Record<string, unknown> = {}) {
  if (!shouldUseDesktopMcpBridge(config)) throw new Error("Local MCP requires the Void-Agent desktop app");
  return window.desktop!.mcp.callTool({ config, toolName, params });
}
