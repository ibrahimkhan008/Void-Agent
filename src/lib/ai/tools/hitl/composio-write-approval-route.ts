import { Composio, type Tool as ComposioTool } from "@composio/core";
import { getSession } from "auth/server";
import {
  isComposioConfigured,
  isWriteComposioAction,
  listComposioAccountsForUser,
} from "lib/ai/composio";
import {
  bindComposioWriteApprovalPayload,
  composioWriteApprovalRepository,
  composioWriteApprovalRequestSchema,
  fingerprintComposioActionSchema,
  getComposioAccountLabel,
  resolveComposioAccountReference,
} from "lib/ai/tools/hitl/composio-write-approval";
import { normalizeToolInputSchema } from "lib/ai/tools/sanitize-tool-schemas";
import { readBoundedJson } from "lib/notifications/contracts";
import { validateJsonSchemaArguments } from "lib/projects/mcp-sync";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import { hasSameOrigin } from "lib/security/same-origin";
import { NextResponse } from "next/server";

type ComposioAccount = {
  id: string;
  alias?: unknown;
  toolkit?: { slug?: string };
};

type RouteAction = Pick<ComposioTool, "slug" | "version" | "inputParameters">;

export type ComposioApprovalRouteDependencies = {
  getSession: typeof getSession;
  isConfigured: () => boolean;
  rateLimit: (userId: string) => Promise<{ allowed: boolean }>;
  listAccounts: (userId: string) => Promise<ComposioAccount[]>;
  getAction: (
    toolkitSlug: string,
    actionSlug: string,
  ) => Promise<RouteAction | null>;
  issue: typeof composioWriteApprovalRepository.issue;
};

let composioClient: Composio | null = null;

async function getCurrentAction(toolkitSlug: string, actionSlug: string) {
  if (!composioClient) {
    const apiKey = process.env.COMPOSIO_API_KEY;
    if (!apiKey) throw new Error("Composio is not configured");
    composioClient = new Composio({ apiKey });
  }
  const actions = await composioClient.tools.getRawComposioTools(
    { toolkits: [toolkitSlug], limit: 500 },
    undefined,
    { signal: AbortSignal.timeout(15_000) },
  );
  return actions.find((action) => action.slug === actionSlug) ?? null;
}

const productionDependencies: ComposioApprovalRouteDependencies = {
  getSession,
  isConfigured: isComposioConfigured,
  rateLimit: async (userId) =>
    checkApiRateLimit({
      kind: "composio-write-approval",
      id: userId,
      limit: 10,
      windowMs: 60_000,
    }),
  // Shared connections are deliberately excluded from this effect approval.
  listAccounts: (userId) =>
    listComposioAccountsForUser(userId, { maxAccounts: 2_000 }),
  getAction: getCurrentAction,
  issue: composioWriteApprovalRepository.issue,
};

function hasSensitiveSchemaField(value: unknown, depth = 0): boolean {
  if (!value || typeof value !== "object" || depth > 8) return false;
  if (Array.isArray(value))
    return value.some((item) => hasSensitiveSchemaField(item, depth + 1));
  return Object.entries(value).some(
    ([key, child]) =>
      /(api.?key|token|secret|password|credential|authorization)/iu.test(key) ||
      hasSensitiveSchemaField(child, depth + 1),
  );
}

export function createComposioApprovalPostHandler(
  dependencies: ComposioApprovalRouteDependencies = productionDependencies,
) {
  return async function POST(request: Request) {
    const session = await dependencies.getSession();
    const userId = session?.user?.id;
    if (!userId) return new Response("Unauthorized", { status: 401 });
    if (!hasSameOrigin(request))
      return new Response("Forbidden", { status: 403 });
    if (!dependencies.isConfigured())
      return new Response("Integration service unavailable", { status: 503 });

    const rate = await dependencies.rateLimit(userId);
    if (!rate.allowed)
      return new Response("Too many requests", { status: 429 });

    const body = await readBoundedJson(request, 20_000);
    if (!body.ok)
      return new Response(
        body.tooLarge ? "Request too large" : "Invalid JSON",
        {
          status: body.tooLarge ? 413 : 400,
        },
      );
    const parsed = composioWriteApprovalRequestSchema.safeParse(body.value);
    if (!parsed.success)
      return NextResponse.json(
        { error: "Invalid Composio approval proposal" },
        { status: 400 },
      );

    const reference = resolveComposioAccountReference(
      parsed.data.accountRef,
      userId,
    );
    if (!reference || reference.toolkitSlug !== parsed.data.toolkitSlug)
      return NextResponse.json(
        { error: "Connected account reference is invalid or expired" },
        { status: 404 },
      );

    try {
      const accounts = await dependencies.listAccounts(userId);
      const account = accounts.find(
        (item) =>
          item.id === reference.connectedAccountId &&
          item.toolkit?.slug?.toLowerCase() ===
            reference.toolkitSlug.toLowerCase(),
      );
      if (!account)
        return NextResponse.json(
          { error: "Connected account is no longer available" },
          { status: 404 },
        );
      const currentAccountLabel = getComposioAccountLabel({
        id: account.id,
        alias: account.alias,
        toolkitSlug: reference.toolkitSlug,
      });
      if (
        parsed.data.accountLabel !== reference.accountLabel ||
        parsed.data.accountLabel !== currentAccountLabel
      )
        return NextResponse.json(
          {
            error:
              "Connected account identity changed; review the current account again",
          },
          { status: 409 },
        );

      const action = await dependencies.getAction(
        reference.toolkitSlug,
        parsed.data.actionSlug,
      );
      if (
        !action ||
        action.slug !== parsed.data.actionSlug ||
        !isWriteComposioAction(action.slug)
      )
        return NextResponse.json(
          { error: "This action is unavailable for approval" },
          { status: 409 },
        );

      const currentVersion =
        action.version == null ? "" : String(action.version);
      if (parsed.data.actionVersion !== currentVersion)
        return NextResponse.json(
          { error: "Action version changed; review the current action again" },
          { status: 409 },
        );

      const schema = normalizeToolInputSchema(action.inputParameters);
      const serializedSchema = JSON.stringify(schema);
      if (
        !serializedSchema ||
        serializedSchema.length > 12_000 ||
        hasSensitiveSchemaField(schema) ||
        fingerprintComposioActionSchema(schema) !==
          parsed.data.schemaFingerprint ||
        !validateJsonSchemaArguments(schema, parsed.data.arguments)
      )
        return NextResponse.json(
          {
            error:
              "Action schema or arguments changed; review the current action again",
          },
          { status: 409 },
        );

      const boundPayload = bindComposioWriteApprovalPayload(
        userId,
        account.id,
        parsed.data,
      );
      const approvalToken = await dependencies.issue(userId, boundPayload);
      return NextResponse.json(
        { approvalToken },
        { headers: { "Cache-Control": "no-store" } },
      );
    } catch {
      return NextResponse.json(
        { error: "Could not record Composio approval" },
        { status: 503 },
      );
    }
  };
}
