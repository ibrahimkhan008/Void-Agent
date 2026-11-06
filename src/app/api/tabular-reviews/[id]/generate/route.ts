import { generateText } from "ai";
import { getSession } from "auth/server";
import { and, asc, eq, inArray } from "drizzle-orm";
import { customModelProvider } from "lib/ai/models";
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
import {
  type ReviewCellRegeneration,
  isReviewCellInScope,
  readBoundedJson,
  reviewCellRegenerationSchema,
} from "lib/tabular/review-cell-schema";
import {
  type ReviewColumn,
  TABULAR_REVIEW_CONCURRENCY,
  TABULAR_REVIEW_MAX_SOURCE_CHARS,
  buildReviewPrompt,
  mapWithConcurrency,
  validateCitationAnswer,
} from "lib/tabular/review-schema";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session?.user.id) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const [review] = await pgDb
    .select({ id: TabularReviewTable.id, userId: TabularReviewTable.userId })
    .from(TabularReviewTable)
    .where(
      and(
        eq(TabularReviewTable.id, id),
        eq(TabularReviewTable.userId, session.user.id),
      ),
    )
    .limit(1);
  if (!review) return new Response("Review not found", { status: 404 });
  const cells = await pgDb
    .select()
    .from(TabularReviewCellTable)
    .where(eq(TabularReviewCellTable.reviewId, id));
  return Response.json({ cells });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session?.user.id) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  let target: ReviewCellRegeneration | undefined;
  if (request.body) {
    const body = await readBoundedJson(request);
    if (!body.ok)
      return Response.json(
        {
          error:
            body.reason === "too-large"
              ? "Request body too large"
              : "Invalid JSON body",
        },
        { status: body.reason === "too-large" ? 413 : 400 },
      );
    const parsedTarget = reviewCellRegenerationSchema.safeParse(body.value);
    if (!parsedTarget.success)
      return Response.json({ error: "Invalid cell target" }, { status: 400 });
    target = parsedTarget.data;
  }
  const rate = await checkApiRateLimit({
    kind: "tabular-review-generate",
    id: session.user.id,
    limit: 3,
    windowMs: 60_000,
  });
  if (!rate.allowed)
    return new Response("Too many generation requests", { status: 429 });

  const reservation = await pgDb.transaction(async (tx) => {
    const [review] = await tx
      .select()
      .from(TabularReviewTable)
      .where(
        and(
          eq(TabularReviewTable.id, id),
          eq(TabularReviewTable.userId, session.user.id),
        ),
      )
      .for("update")
      .limit(1);
    if (!review) return { status: "missing" as const };
    const stale = Date.now() - review.updatedAt.getTime() > 10 * 60_000;
    if (review.status === "generating" && !stale)
      return { status: "busy" as const };

    // Validate a targeted retry before reserving the review. Returning from
    // this transaction commits, so no state writes may happen before this
    // check or an invalid target would leave the review marked generating.
    const cells = await tx
      .select()
      .from(TabularReviewCellTable)
      .where(eq(TabularReviewCellTable.reviewId, id));
    if (target && !isReviewCellInScope(cells, target))
      return { status: "invalid-cell" as const };

    await tx
      .update(TabularReviewTable)
      .set({ status: "generating", updatedAt: new Date() })
      .where(eq(TabularReviewTable.id, id));
    const items = await tx
      .select({
        itemId: TabularReviewItemTable.itemId,
        filename: CollectionItemTable.filename,
        collectionId: CollectionItemTable.collectionId,
      })
      .from(TabularReviewItemTable)
      .innerJoin(
        CollectionItemTable,
        eq(CollectionItemTable.id, TabularReviewItemTable.itemId),
      )
      .where(eq(TabularReviewItemTable.reviewId, id))
      .orderBy(asc(TabularReviewItemTable.rowIndex));
    const owned = await tx
      .select({
        itemId: CollectionItemTable.id,
        content: DocumentTable.content,
        createdAt: DocumentTable.createdAt,
      })
      .from(CollectionItemTable)
      .innerJoin(
        CollectionTable,
        eq(CollectionTable.id, CollectionItemTable.collectionId),
      )
      .innerJoin(
        DocumentTable,
        eq(DocumentTable.collectionItemId, CollectionItemTable.id),
      )
      .where(
        and(
          inArray(
            CollectionItemTable.id,
            items.map((item) => item.itemId),
          ),
          eq(CollectionTable.userId, session.user.id),
          eq(CollectionItemTable.status, "ready"),
        ),
      )
      .orderBy(asc(DocumentTable.createdAt));
    const sourceText = new Map<string, string>();
    for (const row of owned) {
      const previous = sourceText.get(row.itemId) ?? "";
      if (previous.length < TABULAR_REVIEW_MAX_SOURCE_CHARS) {
        sourceText.set(
          row.itemId,
          `${previous}\n\n${row.content ?? ""}`.slice(
            0,
            TABULAR_REVIEW_MAX_SOURCE_CHARS,
          ),
        );
      }
    }
    const columns = review.columns as ReviewColumn[];
    const tasks = items.flatMap((item) =>
      columns.map((column) => ({
        itemId: item.itemId,
        filename: item.filename || "Source document",
        column,
        source: sourceText.get(item.itemId) ?? "",
        current: cells.find(
          (cell) => cell.itemId === item.itemId && cell.columnId === column.id,
        ),
      })),
    );
    return {
      status: "ready" as const,
      tasks: tasks.filter((task) =>
        target
          ? task.itemId === target.itemId && task.column.id === target.columnId
          : task.current?.status !== "done",
      ),
      staleCellIds: cells
        .filter((cell) => cell.status === "generating")
        .map((cell) => cell.id),
    };
  });
  if (reservation.status === "missing")
    return new Response("Review not found", { status: 404 });
  if (reservation.status === "busy")
    return new Response("This review is already generating", { status: 409 });
  if (reservation.status === "invalid-cell")
    return new Response("Review cell not found", { status: 404 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let failed = false;
      const send = (event: object) => {
        if (!request.signal.aborted)
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
          );
      };
      try {
        if (reservation.staleCellIds.length) {
          await pgDb
            .update(TabularReviewCellTable)
            .set({ status: "pending", updatedAt: new Date() })
            .where(
              inArray(TabularReviewCellTable.id, reservation.staleCellIds),
            );
        }
        await mapWithConcurrency(
          reservation.tasks,
          TABULAR_REVIEW_CONCURRENCY,
          async (task) => {
            request.signal.throwIfAborted();
            if (!task.source.trim()) {
              failed = true;
              await pgDb
                .update(TabularReviewCellTable)
                .set({
                  status: "error",
                  value: "Source text unavailable",
                  updatedAt: new Date(),
                })
                .where(
                  and(
                    eq(TabularReviewCellTable.reviewId, id),
                    eq(TabularReviewCellTable.itemId, task.itemId),
                    eq(TabularReviewCellTable.columnId, task.column.id),
                  ),
                );
              send({
                type: "cell",
                itemId: task.itemId,
                columnId: task.column.id,
                value: "Source text unavailable",
                status: "error",
              });
              return;
            }
            await pgDb
              .update(TabularReviewCellTable)
              .set({ status: "generating", updatedAt: new Date() })
              .where(
                and(
                  eq(TabularReviewCellTable.reviewId, id),
                  eq(TabularReviewCellTable.itemId, task.itemId),
                  eq(TabularReviewCellTable.columnId, task.column.id),
                ),
              );
            await pgDb
              .update(TabularReviewTable)
              .set({ updatedAt: new Date() })
              .where(eq(TabularReviewTable.id, id));
            try {
              const { system, prompt } = buildReviewPrompt({
                filename: task.filename,
                sourceText: task.source,
                column: task.column,
              });
              const result = await generateText({
                model:
                  await customModelProvider.getModelWithFailureFallbackAsync(),
                system,
                prompt,
                maxOutputTokens: 350,
                abortSignal: request.signal,
              });
              let generatedValue = result.text.trim();
              if (task.column.type === "citation") {
                const verification = validateCitationAnswer(
                  generatedValue,
                  task.source,
                );
                if (!verification.ok) {
                  throw new Error("Citation output could not be verified");
                }
                generatedValue = verification.value;
              }
              const value = generatedValue.slice(0, 4_000);
              await pgDb
                .update(TabularReviewCellTable)
                .set({ status: "done", value, updatedAt: new Date() })
                .where(
                  and(
                    eq(TabularReviewCellTable.reviewId, id),
                    eq(TabularReviewCellTable.itemId, task.itemId),
                    eq(TabularReviewCellTable.columnId, task.column.id),
                  ),
                );
              send({
                type: "cell",
                itemId: task.itemId,
                columnId: task.column.id,
                value,
                status: "done",
              });
            } catch {
              failed = true;
              const value =
                "Generation failed. Retry this review to try again.";
              await pgDb
                .update(TabularReviewCellTable)
                .set({ status: "error", value, updatedAt: new Date() })
                .where(
                  and(
                    eq(TabularReviewCellTable.reviewId, id),
                    eq(TabularReviewCellTable.itemId, task.itemId),
                    eq(TabularReviewCellTable.columnId, task.column.id),
                  ),
                );
              send({
                type: "cell",
                itemId: task.itemId,
                columnId: task.column.id,
                value,
                status: "error",
              });
            }
          },
        );
        const persistedCells = await pgDb
          .select({ status: TabularReviewCellTable.status })
          .from(TabularReviewCellTable)
          .where(eq(TabularReviewCellTable.reviewId, id));
        const finalStatus =
          failed || persistedCells.some((cell) => cell.status === "error")
            ? "error"
            : persistedCells.every((cell) => cell.status === "done")
              ? "done"
              : "pending";
        await pgDb
          .update(TabularReviewTable)
          .set({ status: finalStatus, updatedAt: new Date() })
          .where(eq(TabularReviewTable.id, id));
        send({ type: "complete", status: finalStatus });
      } catch {
        await pgDb
          .update(TabularReviewCellTable)
          .set({ status: "pending", updatedAt: new Date() })
          .where(
            and(
              eq(TabularReviewCellTable.reviewId, id),
              eq(TabularReviewCellTable.status, "generating"),
            ),
          );
        await pgDb
          .update(TabularReviewTable)
          .set({ status: "error", updatedAt: new Date() })
          .where(eq(TabularReviewTable.id, id));
        send({
          type: "error",
          message: "Review generation stopped. Retry to continue.",
        });
      } finally {
        if (!request.signal.aborted) controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
