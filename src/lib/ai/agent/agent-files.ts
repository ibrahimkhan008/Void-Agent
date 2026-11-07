import type { AgentFileBinding } from "app-types/agent";
import { MAX_AGENT_FILES } from "app-types/agent";
import {
  isUserStorageKey,
  sanitizeFilename,
  storageKeyFromUrl,
} from "lib/file-storage/storage-utils";
import { z } from "zod";

const AgentFileInputSchema = z
  .object({
    storageKey: z.string().min(1).max(512).optional(),
    url: z.string().min(1).max(4096).optional(),
    filename: z.string().trim().min(1).max(240),
    // Accepted so legacy clients can round-trip records, but ignored below.
    ownerId: z.string().max(128).optional(),
  })
  .refine((file) => Boolean(file.storageKey) !== Boolean(file.url));

type BindingResult =
  | { ok: true; files: AgentFileBinding[] | undefined }
  | { ok: false; reason: "invalid" | "not-owned" };

/**
 * Resolve user-submitted file URLs/keys into persistent agent bindings.
 *
 * New keys must be under the authenticated caller's storage prefix. A shared
 * agent editor may carry forward a key already bound to that agent; its owner
 * ID comes from the existing server record, never from the request body.
 */
export function normalizeAgentFileBindings(input: {
  files: unknown;
  userId: string;
  existingFiles?: AgentFileBinding[];
}): BindingResult {
  if (input.files === undefined) return { ok: true, files: undefined };
  const parsed = z
    .array(AgentFileInputSchema)
    .max(MAX_AGENT_FILES)
    .safeParse(input.files);
  if (!parsed.success) return { ok: false, reason: "invalid" };

  const previous = new Map(
    (input.existingFiles ?? []).map((file) => [file.storageKey, file]),
  );
  const names = new Set<string>();
  const files: AgentFileBinding[] = [];

  for (const submitted of parsed.data) {
    const storageKey =
      submitted.storageKey ?? storageKeyFromUrl(submitted.url!);
    if (!storageKey) return { ok: false, reason: "invalid" };

    const carried = previous.get(storageKey);
    const ownerId = carried?.ownerId ?? input.userId;
    if (
      (carried && !carried.ownerId) ||
      !isUserStorageKey(storageKey, ownerId) ||
      (!carried && !isUserStorageKey(storageKey, input.userId))
    ) {
      return { ok: false, reason: "not-owned" };
    }

    const filename = uniqueFilename(submitted.filename, names);
    files.push({ storageKey, filename, ownerId });
  }

  return { ok: true, files };
}

function uniqueFilename(raw: string, seen: Set<string>): string {
  const safe = sanitizeFilename(raw).slice(0, 220) || "attachment";
  if (safe !== "." && safe !== ".." && !seen.has(safe)) {
    seen.add(safe);
    return safe;
  }

  const dot = safe.lastIndexOf(".");
  const stem = dot > 0 ? safe.slice(0, dot) : safe;
  const extension = dot > 0 ? safe.slice(dot) : "";
  for (let suffix = 1; suffix <= MAX_AGENT_FILES; suffix += 1) {
    const candidate = `${stem.slice(0, 200)}-${suffix}${extension}`;
    if (!seen.has(candidate)) {
      seen.add(candidate);
      return candidate;
    }
  }
  // The schema bounds the list to ten, so reaching this branch would require
  // every permitted suffix to be occupied by the same submitted name.
  return `attachment-${seen.size}`;
}
