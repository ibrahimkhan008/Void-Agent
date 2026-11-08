import path from "node:path";

export const MAX_SANDBOX_ARTIFACT_BYTES = 15 * 1024 * 1024;
export const MAX_SANDBOX_ARTIFACT_PATH_LENGTH = 500;

const SAFE_EXTENSIONS = new Set([
  ".pdf",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".csv",
  ".xlsx",
  ".docx",
  ".pptx",
  ".html",
  ".txt",
  ".md",
  ".json",
  ".mp3",
  ".wav",
  ".ogg",
  ".m4a",
  ".webm",
]);

/**
 * Resolve an export target strictly inside the persistent sandbox work tree.
 * Absolute paths, traversal, control characters, executable formats, and
 * unknown types are rejected. HTML is allowed only because it is routed to
 * the isolated private sanitizer preview; it is never served as active HTML.
 */
export function resolveSandboxArtifactPath(
  rawPath: string,
  workDir: string,
): { path: string; filename: string } | null {
  if (
    rawPath.length === 0 ||
    rawPath.length > MAX_SANDBOX_ARTIFACT_PATH_LENGTH ||
    rawPath.startsWith("/") ||
    rawPath.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(rawPath)
  ) {
    return null;
  }

  const parts = rawPath.split("/");
  if (parts.some((part) => part === ".." || part === "")) return null;
  const absoluteWorkDir = path.posix.resolve(workDir);
  const absolutePath = path.posix.resolve(absoluteWorkDir, rawPath);
  if (!absolutePath.startsWith(`${absoluteWorkDir}/`)) return null;

  const filename = path.posix.basename(absolutePath);
  const extension = path.posix.extname(filename).toLowerCase();
  if (!filename || !SAFE_EXTENSIONS.has(extension)) return null;

  return { path: absolutePath, filename };
}
