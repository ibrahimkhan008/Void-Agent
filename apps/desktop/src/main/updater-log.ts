import {
  appendFileSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { app } from "electron";
import type { Logger } from "electron-updater";

export const UPDATER_LOG_MAX_BYTES = 512 * 1024;
const MAX_LOG_MESSAGE_CHARS = 4_000;

export type UpdaterLogger = Logger & { debug(message: string): void };

export function updaterLogDirectory(): string {
  try {
    return app.getPath("logs");
  } catch {
    return path.join(app.getPath("userData"), "logs");
  }
}

export function updaterLogPath(): string {
  return path.join(updaterLogDirectory(), "updater.log");
}

/** Keep the newest complete log lines under the configured byte limit. */
export function trimUpdaterLog(existing: string, maxBytes: number): string {
  if (Buffer.byteLength(existing, "utf8") <= maxBytes) return existing;
  const bytes = Buffer.from(existing, "utf8");
  let tail = bytes
    .subarray(Math.max(0, bytes.length - maxBytes))
    .toString("utf8");
  const firstNewline = tail.indexOf("\n");
  if (firstNewline >= 0) tail = tail.slice(firstNewline + 1);
  return tail;
}

/**
 * Updater errors often embed signed feed URLs or request headers. Keep logs
 * useful for support without persisting credentials or query/path tokens.
 */
export function sanitizeUpdaterLogMessage(value: unknown): string {
  let message: string;
  if (value instanceof Error) message = value.name + ": " + value.message;
  else if (typeof value === "string") message = value;
  else {
    try {
      message = JSON.stringify(value);
    } catch {
      message = String(value);
    }
  }

  return message
    .replace(/https?:\/\/[^\s"'<>]+/gi, (rawUrl) => {
      try {
        const url = new URL(rawUrl.replace(/[),.;]+$/, ""));
        const suffix = rawUrl.endsWith(")") ? ")" : "";
        return url.origin + "/[path omitted]" + suffix;
      } catch {
        return "[URL redacted]";
      }
    })
    .replace(/\bBearer\s+[^\s,;"']+/gi, "Bearer [redacted]")
    .replace(
      /("(?:authorization|cookie|set-cookie|api[-_]?key|access[-_]?token|refresh[-_]?token|client[_-]?secret)"\s*:\s*)"[^\"]*"/gi,
      '$1"[redacted]"',
    )
    .replace(
      /\b(authorization|cookie|set-cookie|api[-_]?key|access[-_]?token|refresh[-_]?token|client[_-]?secret)\s*[:=]\s*(?:Bearer\s+)?[^\s,;]+/gi,
      "$1=[redacted]",
    )
    .slice(0, MAX_LOG_MESSAGE_CHARS);
}

export function createUpdaterLogger(file = updaterLogPath()): UpdaterLogger {
  let directoryReady = false;

  const write = (level: string, value: unknown) => {
    try {
      if (!directoryReady) {
        mkdirSync(path.dirname(file), { recursive: true });
        directoryReady = true;
      }
      rotateUpdaterLog(file);
      const line =
        new Date().toISOString() +
        " [" +
        level +
        "] " +
        sanitizeUpdaterLogMessage(value) +
        "\n";
      appendFileSync(file, line, { encoding: "utf8", mode: 0o600 });
      rotateUpdaterLog(file);
    } catch {
      // Diagnostics are best-effort and must never interrupt update handling.
    }
  };

  return {
    info: (message) => write("info", message),
    warn: (message) => write("warn", message),
    error: (message) => write("error", message),
    debug: (message) => write("debug", message),
  };
}

function rotateUpdaterLog(file: string): void {
  let size: number;
  try {
    size = statSync(file).size;
  } catch {
    return;
  }
  if (size <= UPDATER_LOG_MAX_BYTES) return;
  const trimmed = trimUpdaterLog(
    readFileSync(file, "utf8"),
    Math.floor(UPDATER_LOG_MAX_BYTES / 2),
  );
  writeFileSync(file, trimmed, { encoding: "utf8", mode: 0o600 });
}
