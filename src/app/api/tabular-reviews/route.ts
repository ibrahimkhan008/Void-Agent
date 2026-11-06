import { getSession } from "auth/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { pgDb } from "lib/db/pg/db.pg";
import {
  CollectionItemTable,
  CollectionTable,
  DocumentTable,
  TabularReviewCellTable,
  TabularReviewItemTable,
  TabularReviewTable,
} from "lib/db/pg/schema.pg";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import { createReviewSchema } from "lib/tabular/review-schema";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session?.user.id) return new Response("Unauthorized", { status: 401 });
  const reviews = await pgDb
    .select()
    .from(TabularReviewTable)
    .where(eq(TabularReviewTable.userId, session.user.id))
    .orderBy(desc(TabularReviewTable.updatedAt))
    .limit(50);
  return Response.json({ reviews });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.user.id) return new Response("Unauthorized", { status: 401 });
  const rate = await checkApiRateLimit({
    kind: "tabular-review-create",
    id: session.user.id,
    limit: 5,
    windowMs: 60_000,
  });
  if (!rate.allowed) return new Response("Too many review requests", { status: 429 });

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = createReviewSchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: "Invalid review", issues: parsed.error.issues }, { status: 400 });
  }

  const ownedItems = await pgDb
    .select({ id: CollectionItemTable.id })
    .from(CollectionItemTable)
    .innerJoin(CollectionTable, eq(CollectionTable.id, CollectionItemTable.collectionId))
    .where(
      and(
        inArray(CollectionItemTable.id, parsed.data.itemIds),
        eq(CollectionTable.userId, session.user.id),
        eq(CollectionItemTable.status, "ready"),
      ),
    );
  if (ownedItems.length !== parsed.data.itemIds.length) {
    return new Response("One or more ready source documents were not found", { status: 404 });
  }
  const availableDocuments = await pgDb
    .select({ itemId: DocumentTable.collectionItemId })
    .from(DocumentTable)
    .where(inArray(DocumentTable.collectionItemId, parsed.data.itemIds));
  const availableIds = new Set(availableDocuments.map((row) => row.itemId));
  if (parsed.data.itemIds.some((id) => !availableIds.has(id))) {
    return new Response("One or more source documents have no extracted text", { status: 409 });
  }

  const review = await pgDb.transaction(async (tx) => {
    const [created] = await tx
      .insert(TabularReviewTable)
      .values({
        userId: session.user.id,
        title: parsed.data.title,
        columns: parsed.data.columns,
      })
      .returning();
    await tx.insert(TabularReviewItemTable).values(
      parsed.data.itemIds.map((itemId, rowIndex) => ({ reviewId: created.id, itemId, rowIndex })),
    );
    await tx.insert(TabularReviewCellTable).values(
      parsed.data.itemIds.flatMap((itemId) =>
        parsed.data.columns.map((column) => ({ reviewId: created.id, itemId, columnId: column.id })),
      ),
    );
    return created;
  });
  return Response.json({ review }, { status: 201 });
}
