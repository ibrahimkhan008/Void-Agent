/** Classifies trusted-app navigation and local file exports for the Electron shell. */
export type DesktopNavigationAction = "app" | "download" | "external" | "block";

const DOWNLOAD_PATHS = [
  /^\/api\/canvas\/ppt\/export\/?$/,
  /^\/api\/ecanvas\/export\/[^/]+\/zip\/?$/,
  /^\/api\/tabular-reviews\/[^/]+\/export\/?$/,
];

export function isAppDownloadUrl(url: string, appOrigin: string) {
  try {
    const parsed = new URL(url);
    return (
      parsed.origin === appOrigin &&
      DOWNLOAD_PATHS.some((pattern) => pattern.test(parsed.pathname))
    );
  } catch {
    return false;
  }
}

export function classifyDesktopNavigation(
  url: string,
  appOrigin: string,
): DesktopNavigationAction {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "block";
  }
  if (parsed.origin === appOrigin)
    return isAppDownloadUrl(url, appOrigin) ? "download" : "app";
  if (parsed.protocol === "https:" || parsed.protocol === "mailto:")
    return "external";
  return "block";
}
