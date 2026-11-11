/**
 * Global server-side kill switch for browser automation.
 *
 * URL filtering alone does not prevent private-network access through DNS
 * rebinding, redirects, subresources, WebSockets, or provider-side proxying.
 * Keep execution disabled until the browser provider/runtime guarantees an
 * enforceable network-egress boundary.
 */
export function isBrowserEgressIsolationEnabled(): boolean {
  return process.env.BROWSER_EGRESS_ISOLATION_ENABLED === "true";
}

export const BROWSER_EGRESS_ISOLATION_REQUIRED_MESSAGE =
  "Browser automation is disabled until provider-level network egress isolation is explicitly enabled.";
