/**
 * Extract and validate the generic update URL embedded by electron-builder.
 * Updates are a code-execution boundary, so accept HTTPS feeds only and never
 * follow feed URLs carrying credentials, query tokens, or fragments.
 */
export function parseSecureUpdateFeed(config: string): string | null {
  const match = config.match(
    /^\s*url\s*:\s*(?:"([^"]+)"|'([^']+)'|([^\s#]+))\s*$/m,
  );
  const raw = match?.[1] ?? match?.[2] ?? match?.[3];
  if (!raw) return null;

  try {
    const url = new URL(raw);
    if (
      url.protocol !== "https:" ||
      !url.hostname ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname.split("/").some((part) => part === "." || part === "..")
    ) {
      return null;
    }
    if (!url.pathname.endsWith("/")) url.pathname += "/";
    return url.toString();
  } catch {
    return null;
  }
}
