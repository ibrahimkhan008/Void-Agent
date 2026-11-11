/**
 * Marketplace install configuration has no encrypted credential contract yet.
 * Keep it empty until an owner-scoped secret flow exists; silently persisting
 * arbitrary JSON could put API keys or OAuth tokens in plaintext JSONB.
 */
export function assertMcpInstallConfigSupported(
  config: Record<string, unknown> | undefined,
): void {
  if (config && Object.keys(config).length > 0) {
    throw new Error("MCP marketplace install configuration is not supported");
  }
}
