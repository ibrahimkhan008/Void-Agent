import { getSession } from "auth/server";
import {
  revokeOwnerChatShare,
  rotateOwnerChatShare,
} from "lib/chat/export-share-service";
import { isSameOriginRequest } from "lib/notifications/contracts";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import { NextResponse } from "next/server";
import { z } from "zod";

const exportIdSchema = z.string().uuid();
const noStore = { "cache-control": "no-store" };

function response(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: noStore });
}

function limitedResponse(retryAfterMs: number) {
  return NextResponse.json(
    { error: "Too many requests" },
    {
      status: 429,
      headers: {
        ...noStore,
        "retry-after": String(Math.max(1, Math.ceil(retryAfterMs / 1_000))),
      },
    },
  );
}

async function ownerId() {
  const session = await getSession();
  return session?.user?.id ?? null;
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!_request || !isSameOriginRequest(_request))
    return response("Invalid origin", 403);
  const userId = await ownerId();
  if (!userId) {
    return response("Unauthorized", 401);
  }
  const rate = await checkApiRateLimit({
    kind: "chat-export-share",
    id: userId,
    limit: 20,
    windowMs: 60_000,
  });
  if (!rate.allowed) return limitedResponse(rate.retryAfterMs);
  const { id } = await params;
  if (!exportIdSchema.safeParse(id).success) {
    return response("Not found", 404);
  }

  const token = await rotateOwnerChatShare(id, userId);
  if (!token) {
    return response("Not found", 404);
  }
  return NextResponse.json({ token }, { headers: noStore });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!_request || !isSameOriginRequest(_request))
    return response("Invalid origin", 403);
  const userId = await ownerId();
  if (!userId) {
    return response("Unauthorized", 401);
  }
  const rate = await checkApiRateLimit({
    kind: "chat-export-share",
    id: userId,
    limit: 20,
    windowMs: 60_000,
  });
  if (!rate.allowed) return limitedResponse(rate.retryAfterMs);
  const { id } = await params;
  if (!exportIdSchema.safeParse(id).success) {
    return response("Not found", 404);
  }

  const revoked = await revokeOwnerChatShare(id, userId);
  if (!revoked) {
    return response("Not found", 404);
  }
  return new Response(null, { status: 204, headers: noStore });
}
