import { convertToModelMessages, streamText } from "ai";
import { getSession } from "auth/server";
import { getModelInstance } from "lib/ai/models";
import { validateManualModel } from "lib/ai/routing/service";
import { billingRunKey } from "lib/billing/usage-idempotency";
import {
  CanvasGenerateRequestSchema,
  toCanvasUIMessage,
} from "lib/ecanvas/generate-contract";
import { encodeCanvasDone, encodeCanvasEvent } from "lib/ecanvas/sse";
import {
  CreditsExhaustedError,
  assertCreditsAvailable,
  requireBillingContext,
  trackUsage,
} from "lib/gate";
import { readBoundedJson } from "lib/notifications/contracts";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import { hasSameOrigin } from "lib/security/same-origin";
import { generateUUID } from "lib/utils";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const CANVAS_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const MAX_REQUEST_BYTES = 3 * 1024 * 1024;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ canvasId: string }> },
) {
  const session = await getSession();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });
  if (!hasSameOrigin(request))
    return new Response("Forbidden", { status: 403 });

  const { canvasId } = await params;
  if (!CANVAS_ID_PATTERN.test(canvasId))
    return Response.json({ message: "Invalid canvas ID" }, { status: 400 });

  const rate = await checkApiRateLimit({
    kind: "ecanvas-generate",
    id: session.user.id,
    limit: 20,
    windowMs: 60_000,
  });
  if (!rate.allowed) return new Response("Too many requests", { status: 429 });

  const body = await readBoundedJson(request, MAX_REQUEST_BYTES);
  if (!body.ok) {
    return Response.json(
      { message: body.tooLarge ? "Request too large" : "Invalid JSON" },
      { status: body.tooLarge ? 413 : 400 },
    );
  }
  const parsed = CanvasGenerateRequestSchema.safeParse(body.value);
  if (!parsed.success)
    return Response.json(
      { message: "Invalid canvas generation request" },
      { status: 400 },
    );

  const chatModel = parsed.data.model;
  const activeOrganizationId = (
    session.session as { activeOrganizationId?: string | null } | undefined
  )?.activeOrganizationId;
  try {
    await validateManualModel({
      organizationId: activeOrganizationId,
      userId: session.user.id,
      chatModel,
    });
  } catch {
    return Response.json(
      { message: "Selected model is unavailable" },
      { status: 403 },
    );
  }

  const billing = await requireBillingContext().catch(() => ({
    customerId: session.user.id,
    userId: session.user.id,
    entityId: undefined,
  }));
  try {
    await assertCreditsAvailable({
      customerId: billing.customerId,
      entityId: billing.entityId,
    });
  } catch (error) {
    if (error instanceof CreditsExhaustedError) {
      return Response.json(
        { message: error.message, code: "CREDITS_EXHAUSTED" },
        { status: 402 },
      );
    }
    return Response.json(
      { message: "Unable to verify available credits" },
      { status: 503 },
    );
  }

  try {
    const model = await getModelInstance(chatModel, session.user.id);
    const messages = parsed.data.messages.map((message, index) =>
      toCanvasUIMessage(message, `canvas-${canvasId}-${index}`),
    );
    const modelMessages = await convertToModelMessages(messages);
    const runId = generateUUID();
    const result = streamText({
      model,
      messages: modelMessages,
      abortSignal: request.signal,
      onEnd: async ({ usage }) => {
        if (!usage?.totalTokens || !usage.inputTokens || !usage.outputTokens)
          return;
        await trackUsage({
          kind: "tokens",
          customerId: billing.customerId,
          entityId: billing.entityId,
          modelId: `${chatModel.provider}/${chatModel.model}`,
          promptTokens: usage.inputTokens,
          completionTokens: usage.outputTokens,
          cacheReadTokens: usage.inputTokenDetails?.cacheReadTokens,
          cacheWriteTokens: usage.inputTokenDetails?.cacheWriteTokens,
          noCacheTokens: usage.inputTokenDetails?.noCacheTokens,
          idempotencyKey: billingRunKey({
            scope: "ecanvas",
            subject: billing.customerId ?? session.user.id,
            runId,
          }),
          properties: { canvasId },
        }).catch(() => undefined);
      },
    });

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let inputTokens = 0;
        let outputTokens = 0;
        const send = (event: unknown) => {
          if (controller.desiredSize === null) return;
          controller.enqueue(encodeCanvasEvent(event));
        };
        const sendDone = () => {
          if (controller.desiredSize === null) return;
          controller.enqueue(encodeCanvasDone());
        };
        try {
          for await (const chunk of result.fullStream) {
            if (chunk.type === "text-delta") {
              send({ type: "chunk", text: chunk.text });
            } else if (chunk.type === "reasoning-delta") {
              send({ type: "thinking", text: chunk.text });
            } else if (chunk.type === "finish") {
              inputTokens = chunk.totalUsage?.inputTokens ?? 0;
              outputTokens = chunk.totalUsage?.outputTokens ?? 0;
            }
          }
          send({
            type: "done",
            usage: { input_tokens: inputTokens, output_tokens: outputTokens },
          });
          sendDone();
          controller.close();
        } catch {
          try {
            send({ type: "error", message: "Canvas generation failed" });
            sendDone();
            controller.close();
          } catch {
            // Client cancellation closes the stream; no further response is possible.
          }
        }
      },
      cancel() {
        // `request.signal` is forwarded to streamText so provider work stops
        // when the browser disconnects.
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-store",
        Connection: "keep-alive",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return Response.json(
      { message: "Invalid canvas generation request" },
      { status: 400 },
    );
  }
}
