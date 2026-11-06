import { getSession } from "auth/server";
import { requestStop } from "lib/ai/chat-stream-context";
import { chatRepository } from "lib/db/repository";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import { z } from "zod";

export const dynamic = "force-dynamic";
const idSchema = z.string().uuid();
const noStore = { "cache-control": "no-store" };

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session?.user.id)
    return new Response("Unauthorized", { status: 401, headers: noStore });
  const { id } = await params;
  if (!idSchema.safeParse(id).success)
    return new Response("Not found", { status: 404, headers: noStore });
  const origin = request.headers.get("origin");
  if (!origin || new URL(request.url).origin !== origin)
    return new Response("Forbidden", { status: 403, headers: noStore });
  const thread = await chatRepository.selectThread(id);
  if (!thread || thread.userId !== session.user.id)
    return new Response("Not found", { status: 404, headers: noStore });
  const rate = await checkApiRateLimit({
    kind: "chat-stream-stop",
    id: session.user.id,
    limit: 30,
    windowMs: 60_000,
  });
  if (!rate.allowed)
    return new Response("Too many requests", { status: 429, headers: noStore });
  try {
    await requestStop(id);
  } catch {
    return new Response("Could not stop generation", {
      status: 503,
      headers: noStore,
    });
  }
  return Response.json({ ok: true }, { headers: noStore });
}
