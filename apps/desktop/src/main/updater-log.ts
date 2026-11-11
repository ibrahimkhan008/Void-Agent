/**
 * File logger for electron-updater.
 *
 * The 1.25.0 clients never surfaced why they did not pick up 1.26.0, because
 * the updater had no logger and every failure was swallowed. This writes each
 * updater event to `<logs>/updater.log` (Windows:
 * `%LOCALAPPDATA%\Keinsaas Navigator\logs`, macOS:
 * `~/Library/Logs/Keinsaas Navigator`), capped in size, so a support request
 * can be answered from the user's machine.
 */
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
import { UPDATER_LOG_MAX_BYTES, trimLog } from "./update-policy.js";

const MAX_LOG_MESSAGE_CHARS = 4_000;

export type UpdaterLogger = Logger & { debug(message: string): void };

export function updaterLogPath(): string {
  let dir: string;
  try {
    dir = app.getPath("logs");
  } catch {
    dir = path.join(app.getPath("userData"), "logs");
  }
  return path.join(dir, "updater.log");
}

/** Updater errors can contain signed feed URLs or request credentials. */
export function sanitizeUpdaterLogMessage(value: unknown): string {
  let message: string;
  if (value instanceof Error) message = `${value.name}: ${value.message}`;
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
        return `${url.origin}/[path omitted]${suffix}`;
      } catch {
        return "[URL redacted]";
      }
    })
    .replace(/\bBearer\s+[^\s,;"']+/gi, "Bearer [redacted]")
    .replace(
      /(\"(?:authorization|cookie|set-cookie|api[-_]?key|access[-_]?token|refresh[-_]?token|client[_-]?secret)\"\s*:\s*)\"[^\"]*\"/gi,
      '$1"[redacted]"',
    )
    .replace(
      /\b(authorization|cookie|set-cookie|api[-_]?key|access[-_]?token|refresh[-_]?token|client[_-]?secret)\s*[:=]\s*(?:Bearer\s+)?[^\s,;]+/gi,
      "$1=[redacted]",
    )
    .slice(0, MAX_LOG_MESSAGE_CHARS);
}

export function createUpdaterLogger(): UpdaterLogger {
  const file = updaterLogPath();
  let directoryReady = false;

  const write = (level: string, message: unknown): void => {
    try {
      if (!directoryReady) {
        mkdirSync(path.dirname(file), { recursive: true });
        directoryReady = true;
      }
      rotateIfNeeded(file);
      appendFileSync(
        file,
        `${new Date().toISOString()} [${level}] ${sanitizeUpdaterLogMessage(message)}\n`,
        { encoding: "utf8", mode: 0o600 },
      );
      rotateIfNeeded(file);
    } catch {
      // Logging must never take the updater down.
    }
  };

  return {
    info: (message) => write("info", message),
    warn: (message) => write("warn", message),
    error: (message) => write("error", message),
    debug: (message) => write("debug", message),
  };
}

function rotateIfNeeded(file: string): void {
  let size: number;
  try {
    size = statSync(file).size;
  } catch {
    return; // no file yet
  }
  if (size <= UPDATER_LOG_MAX_BYTES) return;
  const trimmed = trimLog(
    readFileSync(file, "utf8"),
    Math.floor(UPDATER_LOG_MAX_BYTES / 2),
  );
  writeFileSync(file, trimmed, { encoding: "utf8", mode: 0o600 });
}
