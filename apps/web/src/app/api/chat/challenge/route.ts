import { readBoundedRequestBody } from "@/lib/http/bounded-request-body";
import {
  createChatChallenge,
  resolveChatSecuritySessionId,
  resolveChatSecuritySessionIpAddress,
  resolveChatSecuritySessionUserAgent,
} from "@/lib/security/chat-request-guard.server";
import type { ChatChallengeRequestPayload } from "@/lib/security/chat-request-guard.shared";
import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveChatSession } from "../route-helpers";

const MAX_CHALLENGE_BODY_BYTES = 2 * 1024;
const ClientBindingSchema = z
  .object({
    clientId: z.string().min(16).max(128),
    clientPublicKey: z.string().min(80).max(600),
  })
  .strict();

export async function POST(request: Request) {
  const resolved = await resolveChatSession(request);
  if (resolved instanceof Response) return resolved;
  if (resolved.headless) {
    return NextResponse.json(
      { error: "Interactive session required" },
      { status: 403 },
    );
  }

  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .includes("application/json")
  ) {
    return NextResponse.json({ error: "Expected JSON body" }, { status: 415 });
  }

  const bytes = await readBoundedRequestBody(request, MAX_CHALLENGE_BODY_BYTES);
  if (!bytes) {
    return NextResponse.json(
      { error: "Request is too large" },
      { status: 413 },
    );
  }

  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = ClientBindingSchema.strict().safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid client binding" },
      { status: 400 },
    );
  }

  const session = resolved.session;
  const clientBinding: ChatChallengeRequestPayload = parsed.data;
  let challenge;
  try {
    challenge = await createChatChallenge({
      request,
      userId: session.user.id,
      sessionId: resolveChatSecuritySessionId(session),
      sessionIpAddress: resolveChatSecuritySessionIpAddress(session),
      sessionUserAgent: resolveChatSecuritySessionUserAgent(session),
      clientBinding,
    });
  } catch {
    return NextResponse.json(
      {
        code: "chat-security-unavailable",
        message: "Chat security verification is temporarily unavailable.",
      },
      { status: 503 },
    );
  }

  if (!challenge.ok) {
    return NextResponse.json(
      { code: challenge.code, message: challenge.message },
      { status: challenge.status },
    );
  }

  return NextResponse.json(challenge.data, {
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
