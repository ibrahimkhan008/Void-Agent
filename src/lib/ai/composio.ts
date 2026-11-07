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
  const accounts = [] as Awaited<
    ReturnType<ReturnType<typeof getComposio>["connectedAccounts"]["list"]>
  >["items"];
  let cursor: string | undefined;
  for (let page = 0; page < 20; page++) {
    const result = await getComposio().connectedAccounts.list(
      {
        userIds: [userId],
        statuses: ["ACTIVE"],
        limit: 100,
        ...(cursor ? { cursor } : {}),
      },
      { signal: AbortSignal.timeout(10_000) },
    );
    accounts.push(...result.items);
    cursor = result.nextCursor ?? undefined;
    if (!cursor) break;
  }
  return accounts.filter((account) => !account.isDisabled);
}

/** Returns global toolkit metadata and user-scoped connection flags. */
export async function listComposioToolkits(
  userId: string,
  query: { search?: string; cursor?: string; limit?: number } = {},
) {
  const session = await getComposio().create(userId);
  return session.toolkits({
    limit: Math.min(Math.max(query.limit ?? 30, 1), 50),
    ...(query.search ? { search: query.search } : {}),
    ...(query.cursor ? { cursor: query.cursor } : {}),
  });
}

/** Starts the provider-managed OAuth flow; Composio owns OAuth state handling. */
export async function authorizeComposioToolkit(
  userId: string,
  toolkit: string,
  callbackUrl: string,
) {
  const session = await getComposio().create(userId);
  const authorization = await session.authorize(toolkit, { callbackUrl });
  return authorization.redirectUrl;
}

/** Disconnect only after the caller proves the account belongs to this user. */
export async function disconnectComposioAccount(connectedAccountId: string) {
  await getComposio().connectedAccounts.delete(connectedAccountId);
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
