import "server-only";

import { createHash } from "node:crypto";
import { Agentset, NotFoundError, type SearchResultSchema } from "agentset";

const AGENTSET_API_ORIGIN = "https://api.agentset.ai";
const REQUEST_TIMEOUT_MS = 5_000;
const MAX_RESPONSE_BYTES = 1_000_000;
const MAX_QUERY_CHARS = 2_000;
const MAX_RESULT_COUNT = 8;
const MAX_RESULT_CHARS = 6_000;
const MAX_TOTAL_RESULT_CHARS = 20_000;

export type AgentsetProjectHit = {
  content: string;
  source: string;
  score: number;
  metadata: Record<string, unknown>;
};

export type AgentsetSearchResult = {
  enabled: boolean;
  results: AgentsetProjectHit[];
};

type Fetcher = typeof fetch;

function toRequestUrl(input: RequestInfo | URL) {
  if (input instanceof URL) return input;
  return new URL(typeof input === "string" ? input : input.url);
}

function boundedProjectNamespaceSlug(projectId: string) {
  const digest = createHash("sha256").update(projectId).digest("hex");
  return `void-project-${digest.slice(0, 32)}`;
}

async function readBoundedResponse(response: Response, maxBytes: number) {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error("Agentset response exceeded the configured size limit");
  }

  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new Error("Agentset response exceeded the configured size limit");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const output = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

export function createBoundedAgentsetFetcher(
  fetchImpl: Fetcher = fetch,
): Fetcher {
  return async (input, init) => {
    const url = toRequestUrl(input);
    if (url.origin !== AGENTSET_API_ORIGIN || url.protocol !== "https:") {
      throw new Error(
        "Agentset requests must use the official HTTPS API origin",
      );
    }
    if (init?.method && !["GET", "POST"].includes(init.method.toUpperCase())) {
      throw new Error("Agentset knowledge search only permits read requests");
    }
    const body = typeof init?.body === "string" ? init.body : "";
    if (body.length > 8_192) {
      throw new Error("Agentset request exceeded the configured size limit");
    }

    const timeoutSignal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    const signals = [init?.signal, timeoutSignal].filter(
      (signal): signal is AbortSignal => Boolean(signal),
    );
    const signal = signals.length > 1 ? AbortSignal.any(signals) : signals[0];
    const response = await fetchImpl(input, { ...init, signal });
    const bytes = await readBoundedResponse(response, MAX_RESPONSE_BYTES);
    return new Response(bytes, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  };
}

function normalizeHit(
  row: SearchResultSchema,
  expectedProjectId: string,
): AgentsetProjectHit | null {
  const content = typeof row.text === "string" ? row.text.trim() : "";
  if (!content) return null;

  const metadata =
    row.metadata && typeof row.metadata === "object"
      ? (row.metadata as Record<string, unknown>)
      : {};
  // Metadata is part of the trust boundary. A shared API key can own many
  // project namespaces, so reject results that do not carry matching scope.
  if (
    metadata.projectId !== expectedProjectId ||
    metadata.sourceStatus !== "ready" ||
    typeof metadata.ownerUserId !== "string" ||
    typeof metadata.collectionId !== "string" ||
    typeof metadata.collectionItemId !== "string" ||
    typeof metadata.documentId !== "string"
  ) {
    return null;
  }

  const filename =
    typeof metadata.filename === "string" && metadata.filename.trim()
      ? metadata.filename.trim().slice(0, 200)
      : "Project document";
  const score =
    typeof row.score === "number" && Number.isFinite(row.score)
      ? Math.max(0, Math.min(1, row.score))
      : 0;

  return {
    content: content.slice(0, MAX_RESULT_CHARS),
    source: filename,
    score,
    metadata: {
      projectId: expectedProjectId,
      ownerUserId: metadata.ownerUserId.slice(0, 100),
      collectionId: metadata.collectionId.slice(0, 100),
      collectionItemId: metadata.collectionItemId.slice(0, 100),
      documentId: metadata.documentId.slice(0, 100),
      filename,
      sourceStatus: "ready",
    },
  };
}

/**
 * Search an explicitly provisioned Agentset namespace for one authorized
 * project. The local PostgreSQL RAG remains the default and is not modified.
 */
export async function searchAgentsetProjectKnowledge(input: {
  projectId: string;
  query: string;
  limit?: number;
  fetcher?: Fetcher;
}): Promise<AgentsetSearchResult> {
  const apiKey = process.env.AGENTSET_API_KEY?.trim();
  if (process.env.AGENTSET_PROJECT_SEARCH_ENABLED !== "true" || !apiKey) {
    return { enabled: false, results: [] };
  }

  const query = input.query.trim();
  if (!query || query.length > MAX_QUERY_CHARS) {
    throw new Error("Agentset query must contain 1 to 2000 characters");
  }
  const limit = Math.max(
    1,
    Math.min(MAX_RESULT_COUNT, Math.floor(input.limit ?? 5)),
  );
  const client = new Agentset({
    apiKey,
    baseUrl: AGENTSET_API_ORIGIN,
    fetcher: createBoundedAgentsetFetcher(input.fetcher),
  });
  const namespace = client.namespace(
    boundedProjectNamespaceSlug(input.projectId),
  );

  let namespaceInfo: Awaited<ReturnType<typeof namespace.get>>;
  try {
    namespaceInfo = await namespace.get();
  } catch (error) {
    if (error instanceof NotFoundError) {
      return { enabled: true, results: [] };
    }
    throw error;
  }

  const rows = await client.namespace(namespaceInfo.id).search(query, {
    topK: Math.min(20, limit * 3),
    rerank: true,
    rerankLimit: limit,
    minScore: 0.35,
    mode: "semantic",
    includeMetadata: true,
  });

  const results: AgentsetProjectHit[] = [];
  let totalChars = 0;
  for (const row of rows) {
    if (results.length >= limit || totalChars >= MAX_TOTAL_RESULT_CHARS) break;
    const hit = normalizeHit(row, input.projectId);
    if (!hit) continue;
    hit.content = hit.content.slice(0, MAX_TOTAL_RESULT_CHARS - totalChars);
    totalChars += hit.content.length;
    results.push(hit);
  }

  return { enabled: true, results };
}
