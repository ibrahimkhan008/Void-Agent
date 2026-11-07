import { open } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

const MAX_READ_BYTES = 256 * 1024;
const MAX_RETURNED_EVENTS = 100;

const auditEventSchema = z
  .object({
    timestamp: z.string().datetime({ offset: true }),
    surface: z.literal("desktop"),
    action: z.enum(["mcp.list-tools", "mcp.tool-call"]),
    configHash: z.string().regex(/^[a-f0-9]{64}$/u),
    toolName: z.string().max(100).optional(),
    argsHash: z.string().regex(/^[a-f0-9]{64}$/u).optional(),
    outcome: z.enum(["success", "denied", "failure"]),
  })
  .strict();

export type DesktopMcpAuditEvent = z.infer<typeof auditEventSchema>;

/** Parse only the safe projection written by the desktop main process. */
export function parseDesktopMcpAuditLog(text: string, limit = MAX_RETURNED_EVENTS) {
  if (!Number.isFinite(limit) || limit <= 0) return [];
  const events: DesktopMcpAuditEvent[] = [];
  for (const line of text.split(/\r?\n/u).slice(-MAX_RETURNED_EVENTS * 2)) {
    if (!line || line.length > 8_192) continue;
    try {
      const parsed = auditEventSchema.safeParse(JSON.parse(line));
      if (parsed.success) events.push(parsed.data);
    } catch {
      // A partial write or malformed local row is skipped, never surfaced raw.
    }
  }
  return events.slice(-Math.max(0, Math.min(limit, MAX_RETURNED_EVENTS))).reverse();
}

/** Read a bounded tail so a long-lived desktop install cannot force a large allocation. */
export async function readRecentDesktopMcpAuditEvents(userDataDir: string) {
  const file = path.join(userDataDir, "mcp-audit.ndjson");
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(file, "r");
    const { size } = await handle.stat();
    const start = Math.max(0, size - MAX_READ_BYTES);
    const buffer = Buffer.alloc(Math.min(size, MAX_READ_BYTES));
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, start);
    let text = buffer.subarray(0, bytesRead).toString("utf8");
    if (start > 0) text = text.slice(text.indexOf("\n") + 1);
    return parseDesktopMcpAuditLog(text);
  } catch {
    return [];
  } finally {
    await handle?.close().catch(() => undefined);
  }
}
