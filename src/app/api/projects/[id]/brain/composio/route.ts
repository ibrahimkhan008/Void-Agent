import { getSession } from "auth/server";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import {
  isReadOnlyComposioAction,
  listComposioAccountsForUser,
  listComposioReadActions,
} from "lib/ai/composio";
import { pgDb } from "lib/db/pg/db.pg";
import {
  CollectionTable,
  ProjectBrainComposioConnectorTable,
} from "lib/db/pg/schema.pg";
import { getProjectAccess, mayEditProject } from "lib/projects/access";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import { z } from "zod";

export const dynamic = "force-dynamic";
const attachSchema = z
  .object({
    connectedAccountId: z.string().min(1).max(256),
    collectionId: z.string().uuid(),
  })
  .strict();

function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

function titleFromSlug(slug: string) {
  return slug
    .split(/[_\-.]+/)
    .filter(Boolean)
    .map((word) => word[0]?.toUpperCase() + word.slice(1))
    .join(" ")
    .slice(0, 160);
}

function collectionScope(userId: string, teamId: string | null) {
  const personal = and(
    isNull(CollectionTable.orgId),
    eq(CollectionTable.userId, userId),
  );
  return teamId ? or(eq(CollectionTable.orgId, teamId), personal) : personal;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session?.user.id) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const access = await getProjectAccess(id, session.user.id);
  if (!access) return new Response("Not found", { status: 404 });
  const [connectors, collections] = await Promise.all([
    pgDb
      .select({
        id: ProjectBrainComposioConnectorTable.id,
        collectionId: ProjectBrainComposioConnectorTable.collectionId,
        toolkitSlug: ProjectBrainComposioConnectorTable.toolkitSlug,
        connectedAccountId:
          ProjectBrainComposioConnectorTable.connectedAccountId,
        displayName: ProjectBrainComposioConnectorTable.displayName,
        readActionSlugs: ProjectBrainComposioConnectorTable.readActionSlugs,
        status: ProjectBrainComposioConnectorTable.status,
        lastSyncAt: ProjectBrainComposioConnectorTable.lastSyncAt,
        lastError: ProjectBrainComposioConnectorTable.lastError,
        canSync: eq(
          ProjectBrainComposioConnectorTable.credentialOwnerUserId,
          session.user.id,
        ),
      })
      .from(ProjectBrainComposioConnectorTable)
      .where(eq(ProjectBrainComposioConnectorTable.projectId, id)),
    access.project.collectionIds.length
      ? pgDb
          .select({ id: CollectionTable.id, name: CollectionTable.name })
          .from(CollectionTable)
          .where(
            and(
              inArray(CollectionTable.id, access.project.collectionIds),
              collectionScope(session.user.id, access.project.teamId),
            ),
          )
      : Promise.resolve([]),
  ]);

  let accounts: Array<{
    id: string;
    toolkitSlug: string;
    displayName: string;
  }> = [];
  if (process.env.COMPOSIO_API_KEY) {
    try {
      accounts = (
        await listComposioAccountsForUser(session.user.id, {
          includeShared: true,
        })
      )
        .filter(
          (account) => account.status === "ACTIVE" && account.toolkit?.slug,
        )
        .slice(0, 100)
        .map((account) => ({
          id: account.id,
          toolkitSlug: account.toolkit.slug,
          displayName: titleFromSlug(account.toolkit.slug),
        }));
    } catch {
      accounts = [];
    }
  }
  return Response.json({
    connectors,
    collections,
    accounts,
    composioConfigured: !!process.env.COMPOSIO_API_KEY,
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session?.user.id) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const access = await getProjectAccess(id, session.user.id);
  if (!access) return new Response("Not found", { status: 404 });
  if (!mayEditProject(access.role))
    return new Response("Forbidden", { status: 403 });
  if (!isSameOrigin(request))
    return new Response("Invalid origin", { status: 403 });
  const rate = await checkApiRateLimit({
    kind: "project-brain-composio-attach",
    id: session.user.id,
    limit: 10,
    windowMs: 60 * 60_000,
  });
  if (!rate.allowed)
    return new Response("Rate limit exceeded", { status: 429 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = attachSchema.safeParse(body);
  if (!parsed.success)
    return Response.json(
      { error: "Invalid Composio account selection" },
      { status: 400 },
    );

  const [collection] = await pgDb
    .select({ id: CollectionTable.id })
    .from(CollectionTable)
    .where(
      and(
        eq(CollectionTable.id, parsed.data.collectionId),
        inArray(CollectionTable.id, access.project.collectionIds),
        collectionScope(session.user.id, access.project.teamId),
      ),
    );
  if (!collection)
    return new Response("Attached collection not found", { status: 404 });

  try {
    const account = (
      await listComposioAccountsForUser(session.user.id, {
        includeShared: true,
      })
    ).find(
      (candidate) =>
        candidate.id === parsed.data.connectedAccountId &&
        candidate.status === "ACTIVE" &&
        !candidate.isDisabled,
    );
    const toolkitSlug = account?.toolkit?.slug?.toLowerCase();
    if (!account || !toolkitSlug)
      return Response.json(
        {
          error:
            "Connected Composio account is not active or owned by this user",
        },
        { status: 422 },
      );
    const actions = await listComposioReadActions(toolkitSlug);
    const readActionSlugs = actions
      .filter((tool) => isReadOnlyComposioAction(tool.slug))
      .map((tool) => tool.slug)
      .slice(0, 100);
    if (!readActionSlugs.length)
      return Response.json(
        { error: "This toolkit exposes no supported read actions" },
        { status: 422 },
      );
    const [connector] = await pgDb
      .insert(ProjectBrainComposioConnectorTable)
      .values({
        projectId: id,
        credentialOwnerUserId: session.user.id,
        collectionId: collection.id,
        toolkitSlug,
        connectedAccountId: account.id,
        displayName: titleFromSlug(toolkitSlug),
        readActionSlugs,
        status: "active",
      })
      .onConflictDoUpdate({
        target: [
          ProjectBrainComposioConnectorTable.projectId,
          ProjectBrainComposioConnectorTable.connectedAccountId,
        ],
        set: {
          collectionId: collection.id,
          toolkitSlug,
          displayName: titleFromSlug(toolkitSlug),
          readActionSlugs,
          status: "active",
          updatedAt: new Date(),
        },
      })
      .returning({
        id: ProjectBrainComposioConnectorTable.id,
        displayName: ProjectBrainComposioConnectorTable.displayName,
        readActionSlugs: ProjectBrainComposioConnectorTable.readActionSlugs,
      });
    return Response.json({ connector }, { status: 201 });
  } catch {
    return Response.json(
      { error: "Could not safely discover Composio read actions" },
      { status: 503 },
    );
  }
}
