export const MAX_WORKER_ARTIFACTS = 16;
export const MAX_ARTIFACT_CHARS = 32_000;
export const MAX_WORKER_ARTIFACT_CHARS = 64_000;
export const MAX_SWARM_ARTIFACT_CHARS = 256_000;

export interface WorkerArtifact {
  path: string;
  content: string;
}

export interface SwarmArtifact extends WorkerArtifact {
  workerKey: string;
  workerName: string;
}

export interface ArtifactConflict {
  path: string;
  workers: string[];
}

/** Only simple relative paths are accepted; paths never touch the host filesystem. */
export function validateArtifactPath(path: string): string {
  const normalized = path.trim();
  if (
    normalized.length < 1 ||
    normalized.length > 180 ||
    normalized.startsWith("/") ||
    normalized.includes("\\") ||
    normalized.includes("\0")
  ) {
    throw new Error("Use a relative artifact path up to 180 characters.");
  }
  const segments = normalized.split("/");
  if (
    segments.some(
      (segment) =>
        !segment ||
        segment === "." ||
        segment === ".." ||
        !/^[A-Za-z0-9._-]+$/.test(segment) ||
        segment.toLowerCase().startsWith(".env") ||
        /secret|credential|id_rsa/i.test(segment),
    )
  ) {
    throw new Error(
      "Artifact paths may use simple relative names and cannot contain traversal or secret-file names.",
    );
  }
  return segments.join("/");
}

export function addWorkerArtifact(
  artifacts: Map<string, string>,
  path: string,
  content: string,
): { path: string; characters: number } {
  const safePath = validateArtifactPath(path);
  if (content.length > MAX_ARTIFACT_CHARS) {
    throw new Error(
      `Each artifact is limited to ${MAX_ARTIFACT_CHARS} characters.`,
    );
  }
  if (!artifacts.has(safePath) && artifacts.size >= MAX_WORKER_ARTIFACTS) {
    throw new Error(
      `Each worker can write at most ${MAX_WORKER_ARTIFACTS} artifacts.`,
    );
  }
  const currentSize = [...artifacts.values()].reduce(
    (sum, value) => sum + value.length,
    0,
  );
  const nextSize =
    currentSize - (artifacts.get(safePath)?.length ?? 0) + content.length;
  if (nextSize > MAX_WORKER_ARTIFACT_CHARS) {
    throw new Error(
      `Each worker's artifacts are limited to ${MAX_WORKER_ARTIFACT_CHARS} characters total.`,
    );
  }
  artifacts.set(safePath, content);
  return { path: safePath, characters: content.length };
}

/** Merge independent worker outputs; identical duplicates are harmless, differing writes fail closed. */
export function consolidateWorkerArtifacts(
  workers: Array<{
    key: string;
    name: string;
    status: "succeeded" | "failed";
    artifacts?: WorkerArtifact[];
  }>,
): { artifacts: SwarmArtifact[]; conflicts: ArtifactConflict[] } {
  const byPath = new Map<string, SwarmArtifact>();
  const owners = new Map<string, Set<string>>();
  const conflictingPaths = new Set<string>();
  let totalChars = 0;

  for (const worker of workers) {
    if (worker.status !== "succeeded") continue;
    for (const artifact of worker.artifacts ?? []) {
      const path = validateArtifactPath(artifact.path);
      if (conflictingPaths.has(path)) {
        owners.get(path)?.add(worker.name);
        continue;
      }
      const existing = byPath.get(path);
      if (!existing) {
        totalChars += artifact.content.length;
        if (totalChars > MAX_SWARM_ARTIFACT_CHARS) {
          throw new Error(
            `Combined worker artifacts are limited to ${MAX_SWARM_ARTIFACT_CHARS} characters.`,
          );
        }
        byPath.set(path, {
          path,
          content: artifact.content,
          workerKey: worker.key,
          workerName: worker.name,
        });
        owners.set(path, new Set([worker.name]));
      } else {
        owners.get(path)?.add(worker.name);
        if (existing.content !== artifact.content) {
          // Keep the path out of the deliverable set until a worker resolves it.
          byPath.delete(path);
          conflictingPaths.add(path);
        }
      }
    }
  }

  const conflicts = [...owners.entries()]
    .filter(([path]) => conflictingPaths.has(path))
    .map(([path, names]) => ({ path, workers: [...names] }));

  return {
    artifacts: [...byPath.values()].sort((a, b) =>
      a.path.localeCompare(b.path),
    ),
    conflicts,
  };
}
