import { getSession } from "auth/server";
import { voiceDeviceCustomRepository } from "lib/db/repository";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import { z } from "zod";

export const dynamic = "force-dynamic";

const idSchema = z.string().uuid();
const limitSchema = z.coerce.number().int().min(1).max(50).default(20);
const noStore = { "cache-control": "no-store" };

function transcriptText(parts: unknown) {
  if (!Array.isArray(parts)) return "";
  return parts
    .flatMap((part) => {
      if (typeof part !== "object" || part === null) return [];
      const value = part as Record<string, unknown>;
      return value.type === "text" && typeof value.text === "string"
        ? [value.text]
        : [];
    })
    .join("\n")
    .slice(0, 8_000);
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session?.user.id)
    return new Response("Unauthorized", { status: 401, headers: noStore });
  const { id } = await context.params;
  if (!idSchema.safeParse(id).success)
    return new Response("Not found", { status: 404, headers: noStore });
  const rate = await checkApiRateLimit({
    kind: "voice-device-history",
    id: session.user.id,
    limit: 60,
    windowMs: 60_000,
  });
  if (!rate.allowed)
    return new Response("Too many requests", { status: 429, headers: noStore });
  const params = new URL(request.url).searchParams;
  const parsedLimit = limitSchema.safeParse(params.get("limit") ?? undefined);
  if (!parsedLimit.success)
    return Response.json(
      { error: "Invalid history limit" },
      { status: 400, headers: noStore },
    );

  try {
    const items =
      await voiceDeviceCustomRepository.listRecentTranscriptsByDevice({
        deviceId: id,
        userId: session.user.id,
        limit: parsedLimit.data,
      });
    return Response.json(
      {
        items: items.map((item) => ({
          id: item.id,
          threadId: item.threadId,
          text: transcriptText(item.parts),
          language:
            typeof (item.metadata as Record<string, unknown> | null)
              ?.language === "string"
              ? ((item.metadata as Record<string, unknown>).language as string)
              : null,
          createdAt: item.createdAt.toISOString(),
        })),
      },
      { headers: noStore },
    );
  } catch {
    return Response.json(
      { error: "Could not load voice device history" },
      { status: 500, headers: noStore },
    );
  }
}
