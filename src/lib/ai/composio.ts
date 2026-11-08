import "server-only";
import { Composio } from "@composio/core";
import type { Tool as ComposioTool } from "@composio/core";
import {
  type ComposioWriteApprovalRequest,
  bindComposioWriteApprovalPayload,
  composioWriteApprovalRepository,
} from "lib/ai/tools/hitl/composio-write-approval";

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

/** True only for slugs with an explicit, recognized mutating verb. */
export function isWriteComposioAction(slug: string) {
  const normalized = slug.toUpperCase();
  return WRITE_ACTION.test(normalized) && !READ_ACTION.test(normalized);
}

export async function listComposioAccountsForUser(
  userId: string,
  options: { includeShared?: boolean; maxAccounts?: number } = {},
) {
  const accounts = [] as Awaited<
    ReturnType<ReturnType<typeof getComposio>["connectedAccounts"]["list"]>
  >["items"];
  let cursor: string | undefined;
  const maxAccounts =
    options.maxAccounts === undefined
      ? Number.POSITIVE_INFINITY
      : Math.max(1, Math.min(Math.floor(options.maxAccounts), 2_000));
  for (let page = 0; page < 20; page++) {
    const result = await getComposio().connectedAccounts.list(
      {
        userIds: [userId],
        statuses: ["ACTIVE"],
        ...(options.includeShared ? { accountType: "ALL" as const } : {}),
        limit: Math.min(100, maxAccounts - accounts.length),
        ...(cursor ? { cursor } : {}),
      },
      { signal: AbortSignal.timeout(10_000) },
    );
    accounts.push(...result.items);
    if (accounts.length >= maxAccounts) break;
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

export async function listComposioReadActions(
  toolkitSlug: string,
  maxActions = 500,
) {
  const tools = await getComposio().tools.getRawComposioTools(
    { toolkits: [toolkitSlug], limit: Math.min(Math.max(1, maxActions), 500) },
    undefined,
    { signal: AbortSignal.timeout(20_000) },
  );
  return tools.filter((tool) => isReadOnlyComposioAction(tool.slug));
}

/** Lists unfiltered actions for an explicit human-approval workflow only. */
export async function listComposioActions(
  toolkitSlug: string,
  maxActions = 500,
) {
  return getComposio().tools.getRawComposioTools(
    { toolkits: [toolkitSlug], limit: Math.min(Math.max(1, maxActions), 500) },
    undefined,
    { signal: AbortSignal.timeout(20_000) },
  );
}

/** Effectful execution primitive; callers must consume an exact approval first. */
export async function executeApprovedComposioAction(input: {
  userId: string;
  connectedAccountId: string;
  toolkitSlug: string;
  tool: ComposioTool;
  approvalRequest: ComposioWriteApprovalRequest;
  approvalToken: string;
  signal?: AbortSignal;
}) {
  if (!isWriteComposioAction(input.tool.slug)) {
    throw new Error("Composio action is not a recognized write action");
  }
  const request = input.approvalRequest;
  const actionVersion =
    input.tool.version == null ? "" : String(input.tool.version);
  if (
    request.actionSlug !== input.tool.slug ||
    request.toolkitSlug.toLowerCase() !== input.toolkitSlug.toLowerCase() ||
    request.actionVersion !== actionVersion
  ) {
    throw new Error("Composio action does not match the approved request");
  }
  const approvalPayload = bindComposioWriteApprovalPayload(
    input.userId,
    input.connectedAccountId,
    request,
  );
  const consumed = await composioWriteApprovalRepository.consume(
    input.userId,
    input.approvalToken,
    approvalPayload,
  );
  if (!consumed) {
    throw new Error("Composio approval is missing, expired, or already used");
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
      arguments: request.arguments,
      ...(input.tool.version ? { version: input.tool.version } : {}),
    },
    { signal },
  );
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
