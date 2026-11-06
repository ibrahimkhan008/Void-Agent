/**
 * Resolve electron-updater across its ESM and CommonJS interop shapes.
 * Keeping this adapter small avoids coupling the main process to a bundler's
 * treatment of the package's default export.
 */
export function resolveAutoUpdater<T>(module: unknown): T {
  if (typeof module !== "object" || module === null) {
    throw new Error("electron-updater did not expose a module object");
  }

  const candidate = module as {
    autoUpdater?: unknown;
    default?: { autoUpdater?: unknown } | unknown;
  };
  const fromNamedExport = candidate.autoUpdater;
  const fromDefaultExport =
    typeof candidate.default === "object" && candidate.default !== null
      ? (candidate.default as { autoUpdater?: unknown }).autoUpdater
      : undefined;
  const updater = fromNamedExport ?? fromDefaultExport;

  if (typeof updater !== "object" || updater === null) {
    throw new Error("electron-updater did not expose autoUpdater");
  }

  return updater as T;
}
