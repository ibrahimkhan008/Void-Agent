import "server-only";

export const MAX_HTML_BYTES = 512 * 1024;
const MAX_ENTRIES = 256;
const MAX_TOTAL_BYTES = 64 * 1024 * 1024;
const CONTENT_TTL_MS = 30 * 60 * 1000;

type Entry = { html: string; bytes: number; expiresAt: number };
const content = new Map<string, Entry>();
let totalBytes = 0;

function keyFor(userId: string, canvasId: string) {
  return `${userId.length}:${userId}${canvasId}`;
}

function remove(key: string) {
  const entry = content.get(key);
  if (!entry) return;
  totalBytes -= entry.bytes;
  content.delete(key);
}

function pruneExpired(now: number) {
  for (const [key, entry] of content) {
    if (entry.expiresAt <= now) remove(key);
  }
}

export function setCanvasContent(
  userId: string,
  canvasId: string,
  html: string,
  now = Date.now(),
): boolean {
  const bytes = new TextEncoder().encode(html).byteLength;
  if (!userId || !canvasId || bytes > MAX_HTML_BYTES) return false;

  pruneExpired(now);
  const key = keyFor(userId, canvasId);
  remove(key);
  while (content.size >= MAX_ENTRIES || totalBytes + bytes > MAX_TOTAL_BYTES) {
    const oldest = content.keys().next().value;
    if (oldest === undefined) break;
    remove(oldest);
  }
  content.set(key, { html, bytes, expiresAt: now + CONTENT_TTL_MS });
  totalBytes += bytes;
  return true;
}

export function getCanvasContent(
  userId: string,
  canvasId: string,
  now = Date.now(),
): string | null {
  const key = keyFor(userId, canvasId);
  const entry = content.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= now) {
    remove(key);
    return null;
  }
  // Refresh insertion order for bounded LRU eviction while retaining the TTL.
  content.delete(key);
  content.set(key, entry);
  return entry.html;
}

export function clearCanvasContentForTests() {
  content.clear();
  totalBytes = 0;
}
