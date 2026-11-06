import path from "node:path";

const FORBIDDEN_FILENAME_CHARS = new Set(["<", ">", ":", '"', "|", "?", "*"]);

export function sanitizeDownloadFilename(value: string) {
  const basename = value.split(/[/\\]/u).pop() ?? "";
  const cleaned = Array.from(basename)
    .map((char) =>
      char.charCodeAt(0) < 32 || FORBIDDEN_FILENAME_CHARS.has(char)
        ? "_"
        : char,
    )
    .join("")
    .replace(/^\.+/u, "")
    .trim();
  return cleaned || "download";
}

export function downloadDefaultPath(
  downloadsDirectory: string,
  filename: string,
) {
  return path.join(downloadsDirectory, sanitizeDownloadFilename(filename));
}

export function safeDownloadUrlLabel(value: string) {
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  } catch {
    return "(invalid URL)";
  }
}
