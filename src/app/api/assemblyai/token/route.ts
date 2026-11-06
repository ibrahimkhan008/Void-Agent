import { getSession } from "auth/server";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";

export const dynamic = "force-dynamic";

const privateHeaders = { "Cache-Control": "no-store, private" };

export async function GET() {
  const session = await getSession();
  if (!session?.user.id)
    return new Response("Unauthorized", {
      status: 401,
      headers: privateHeaders,
    });
  return Response.json(
    { available: Boolean(process.env.ASSEMBLYAI_API_KEY?.trim()) },
    { headers: privateHeaders },
  );
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.user.id)
    return new Response("Unauthorized", {
      status: 401,
      headers: privateHeaders,
    });

  const origin = request.headers.get("origin");
  try {
    if (!origin || new URL(origin).origin !== new URL(request.url).origin) {
      return new Response("Forbidden", {
        status: 403,
        headers: privateHeaders,
      });
    }
  } catch {
    return new Response("Forbidden", { status: 403, headers: privateHeaders });
  }

  const rate = await checkApiRateLimit({
    kind: "assemblyai-token",
    id: session.user.id,
    limit: 10,
    windowMs: 60_000,
  });
  if (!rate.allowed)
    return new Response("Too many requests", {
      status: 429,
      headers: privateHeaders,
    });

  const apiKey = process.env.ASSEMBLYAI_API_KEY?.trim();
  if (!apiKey)
    return Response.json(
      { error: "Voice dictation is not configured" },
      { status: 503, headers: privateHeaders },
    );

  try {
    const response = await fetch(
      "https://streaming.eu.assemblyai.com/v3/token?expires_in_seconds=600",
      {
        method: "GET",
        headers: { authorization: apiKey },
        signal: AbortSignal.timeout(10_000),
        cache: "no-store",
      },
    );
    if (!response.ok)
      return Response.json(
        { error: "Voice service unavailable" },
        { status: 503, headers: privateHeaders },
      );
    const payload: unknown = await response.json();
    const token =
      payload && typeof payload === "object" && "token" in payload
        ? payload.token
        : null;
    if (
      typeof token !== "string" ||
      token.length < 16 ||
      token.length > 4_096
    ) {
      return Response.json(
        { error: "Voice service returned an invalid token" },
        { status: 503, headers: privateHeaders },
      );
    }
    return Response.json({ token }, { headers: privateHeaders });
  } catch {
    return Response.json(
      { error: "Voice service unavailable" },
      { status: 503, headers: privateHeaders },
    );
  }
}
