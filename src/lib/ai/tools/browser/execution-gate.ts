/**
 * Arbitrary browser execution stays disabled until the browser process and
 * guest VM have a demonstrated network-level egress boundary. App registry
 * removal is defense in depth; direct imports must fail closed as well.
 */
export const BROWSER_NETWORK_ISOLATION_VERIFIED = false;

export const browserAutomationDisabledResult = () => ({
  isError: true,
  error: "Browser automation is disabled until network isolation is verified.",
});
