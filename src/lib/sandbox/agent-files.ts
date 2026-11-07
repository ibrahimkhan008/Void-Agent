import "server-only";

import { createHash } from "node:crypto";
import type { AgentFileBinding } from "app-types/agent";
import type { Sandbox } from "e2b";
import { serverFileStorage } from "lib/file-storage";
import { isUserStorageKey } from "lib/file-storage/storage-utils";
import logger from "logger";

export const MAX_AGENT_FILE_BYTES = 50 * 1024 * 1024;
export const MAX_AGENT_FILES_TOTAL_BYTES = 100 * 1024 * 1024;

type Manifest = {
  version: 1;
  fingerprint: string;
  names: string[];
  unavailable: string[];
};

export type AgentFileStageResult = {
  staged: number;
  unavailable: string[];
};

/**
 * Stage verified agent-owned uploads into the persistent E2B workspace.
 *
 * The manifest makes synchronization idempotent across tool calls and server
 * restarts. On agent changes, only previously manifested safe basenames are
 * removed; paths supplied by the sandbox or a request are never executed as
 * shell commands or used as deletion targets.
 */
export async function stageAgentFiles(
  sandbox: Pick<Sandbox, "files">,
  files: AgentFileBinding[] | undefined,
  workDir: string,
  download: (key: string, maxBytes: number) => Promise<Buffer> = (
    key,
    maxBytes,
  ) => serverFileStorage.downloadLimited(key, maxBytes),
): Promise<AgentFileStageResult> {
  const manifestPath = `${workDir}/.void-agent-agent-files.json`;
  const bindings = (files ?? [])
    .slice(0, 10)
    .filter((file) =>
      Boolean(
        file.ownerId &&
          isUserStorageKey(file.storageKey, file.ownerId) &&
          file.filename,
      ),
    );
  const fingerprint = createHash("sha256")
    .update(
      JSON.stringify(
        bindings.map(({ storageKey, ownerId, filename }) => ({
          storageKey,
          ownerId,
          filename,
        })),
      ),
    )
    .digest("hex");

  const manifest = await readManifest(sandbox, manifestPath);
  if (
    manifest?.fingerprint === fingerprint &&
    manifest.unavailable.length === 0 &&
    (
      await Promise.all(
        manifest.names.map((name) =>
          sandbox.files.exists(`${workDir}/${name}`),
        ),
      )
    ).every(Boolean)
  ) {
    return { staged: 0, unavailable: [] };
  }

  const occupiedNames = new Set<string>();
  const stagedFiles: Array<{ name: string; bytes: Buffer }> = [];
  const unavailable: string[] = [];
  let totalBytes = 0;

  for (const binding of bindings) {
    if (stagedFiles.length >= 10) break;
    const name = uniqueSafeName(binding.filename, occupiedNames);
    try {
      const remainingBytes = MAX_AGENT_FILES_TOTAL_BYTES - totalBytes;
      if (remainingBytes <= 0) {
        unavailable.push(name);
        continue;
      }
      const bytes = await download(
        binding.storageKey,
        Math.min(MAX_AGENT_FILE_BYTES, remainingBytes),
      );
      if (bytes.byteLength > MAX_AGENT_FILE_BYTES) {
        unavailable.push(name);
        continue;
      }
      if (totalBytes + bytes.byteLength > MAX_AGENT_FILES_TOTAL_BYTES) {
        unavailable.push(name);
        continue;
      }
      totalBytes += bytes.byteLength;
      stagedFiles.push({ name, bytes });
    } catch (error) {
      unavailable.push(name);
      logger.warn(
        `[sandbox-tool] could not stage an agent file (${name}): ${
          error instanceof Error ? error.message : "storage download failed"
        }`,
      );
    }
  }

  const nextNames = new Set(stagedFiles.map((file) => file.name));
  for (const oldName of manifest?.names ?? []) {
    if (isSafeBasename(oldName) && !nextNames.has(oldName)) {
      await sandbox.files
        .remove(`${workDir}/${oldName}`)
        .catch(() => undefined);
    }
  }

  if (stagedFiles.length > 0) {
    await sandbox.files.write(
      stagedFiles.map(({ name, bytes }) => ({
        path: `${workDir}/${name}`,
        data: bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ) as ArrayBuffer,
      })),
    );
  }

  const nextManifest: Manifest = {
    version: 1,
    fingerprint,
    names: [...nextNames],
    unavailable,
  };
  await sandbox.files.write(manifestPath, JSON.stringify(nextManifest));
  return { staged: stagedFiles.length, unavailable };
}

async function readManifest(
  sandbox: Pick<Sandbox, "files">,
  manifestPath: string,
): Promise<Manifest | null> {
  try {
    const parsed: unknown = JSON.parse(
      String(await sandbox.files.read(manifestPath)),
    );
    if (
      !parsed ||
      typeof parsed !== "object" ||
      (parsed as Partial<Manifest>).version !== 1 ||
      typeof (parsed as Partial<Manifest>).fingerprint !== "string" ||
      !Array.isArray((parsed as Partial<Manifest>).names) ||
      !Array.isArray((parsed as Partial<Manifest>).unavailable)
    ) {
      return null;
    }
    const value = parsed as Manifest;
    return {
      ...value,
      names: value.names.filter(isSafeBasename),
      unavailable: value.unavailable.filter(
        (name): name is string =>
          typeof name === "string" && name.length <= 240,
      ),
    };
  } catch {
    return null;
  }
}

function isSafeBasename(name: unknown): name is string {
  return (
    typeof name === "string" &&
    name.length > 0 &&
    name.length <= 240 &&
    name !== "." &&
    name !== ".." &&
    /^[A-Za-z0-9._-]+$/.test(name)
  );
}

function uniqueSafeName(raw: string, occupied: Set<string>): string {
  const baseName = raw.split(/[\\/]/).pop() ?? "attachment";
  const cleaned = baseName.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 220);
  const safe =
    !cleaned || cleaned === "." || cleaned === ".." ? "attachment" : cleaned;
  if (!occupied.has(safe)) {
    occupied.add(safe);
    return safe;
  }

  const extensionIndex = safe.lastIndexOf(".");
  const stem = extensionIndex > 0 ? safe.slice(0, extensionIndex) : safe;
  const extension = extensionIndex > 0 ? safe.slice(extensionIndex) : "";
  for (let index = 1; index <= 10; index += 1) {
    const candidate = `${stem.slice(0, 200)}-${index}${extension}`;
    if (!occupied.has(candidate)) {
      occupied.add(candidate);
      return candidate;
    }
  }
  return `attachment-${occupied.size}`;
}
