/**
 * Validate an Electron generic update feed before electron-updater can fetch
 * executable update artifacts from it. Query tokens, userinfo, fragments and
 * non-HTTPS schemes are never accepted.
 */
export function parseSecureUpdateFeedUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2_048) return null;
  const raw = value.trim();
  if (!raw || /[\r\n\u0000-\u001f]/u.test(raw)) return null;

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

/** Parse the `url` field from electron-builder's generic app-update.yml. */
export function parseSecureUpdateFeed(config: string): string | null {
  if (config.length > 16_384) return null;
  const matches = [
    ...config.matchAll(
      /^\s*url\s*:\s*(?:"([^\"]+)"|'([^']+)'|([^\s#]+))\s*$/gm,
    ),
  ];
  if (matches.length !== 1) return null;
  const match = matches[0];
  const raw = match?.[1] ?? match?.[2] ?? match?.[3];
  return parseSecureUpdateFeedUrl(raw);
}
