import "server-only";
import { Composio } from "@composio/core";
import type { Tool as ComposioTool } from "@composio/core";

let composioInstance: Composio | null = null;

function getComposio(): Composio {
  if (!composioInstance) {
    const apiKey = process.env.COMPOSIO_API_KEY;
    if (!apiKey) {
      throw new Error("COMPOSIO_API_KEY is not set");
    }
    composioInstance = new Composio({ apiKey });
  }
  return composioInstance;
}

export interface ComposioSession {
  mcpUrl: string;
  mcpHeaders: Record<string, string>;
}

export async function createComposioSession(
  userId: string,
): Promise<ComposioSession> {
  const composio = getComposio();
  const session = await composio.create(userId, { mcp: true });
  return {
    mcpUrl: session.mcp.url,
    mcpHeaders: session.mcp.headers as Record<string, string>,
  };
}

export function isComposioConfigured(): boolean {
  return !!process.env.COMPOSIO_API_KEY;
}

const READ_ACTION =
  /(^|_)(GET|LIST|SEARCH|FIND|FETCH|RETRIEVE|READ|QUERY|LOOKUP|DESCRIBE|DETAILS|HISTORY|STATUS|STATS|REPORT)(_|$)/;
const WRITE_ACTION =
  /(^|_)(CREATE|UPDATE|DELETE|REMOVE|SEND|WRITE|POST|PUT|PATCH|MOVE|COPY|UPLOAD|INVITE|ADD|CANCEL|ARCHIVE|TRIGGER|EXECUTE)(_|$)/;

export function isReadOnlyComposioAction(slug: string) {
  const normalized = slug.toUpperCase();
  return READ_ACTION.test(normalized) && !WRITE_ACTION.test(normalized);
}

export async function listComposioAccountsForUser(userId: string) {
  const result = await getComposio().connectedAccounts.list(
    {
      userIds: [userId],
      statuses: ["ACTIVE"],
      limit: 100,
    },
    { signal: AbortSignal.timeout(10_000) },
  );
  return result.items.filter((account) => !account.isDisabled);
}

export async function listComposioReadActions(toolkitSlug: string) {
  const tools = await getComposio().tools.getRawComposioTools(
    { toolkits: [toolkitSlug], limit: 500 },
    undefined,
    { signal: AbortSignal.timeout(20_000) },
  );
  return tools.filter((tool) => isReadOnlyComposioAction(tool.slug));
}

export async function executeComposioReadAction(input: {
  userId: string;
  connectedAccountId: string;
  tool: ComposioTool;
  arguments: Record<string, unknown>;
  signal?: AbortSignal;
}) {
  if (!isReadOnlyComposioAction(input.tool.slug)) {
    throw new Error("Composio action is not read-only");
  }
  const timeoutSignal = AbortSignal.timeout(15_000);
  const signal = input.signal
    ? AbortSignal.any([input.signal, timeoutSignal])
    : timeoutSignal;
  return getComposio().tools.execute(
    input.tool.slug,
    {
      userId: input.userId,
      connectedAccountId: input.connectedAccountId,
      arguments: input.arguments,
      ...(input.tool.version ? { version: input.tool.version } : {}),
    },
    { signal },
  );
}
