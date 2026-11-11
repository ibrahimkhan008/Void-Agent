import { withAuth } from "auth/route-guard";
import { encryptConnectorToken } from "lib/connectors/oauth-flow";
import { getFreshdeskOrigin } from "lib/connectors/provider-api";
import { pgDb } from "lib/db/pg/db.pg";
import { UserConnectorTable } from "lib/db/pg/schema.pg";
import { readBoundedJson } from "lib/notifications/contracts";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import { isEncryptionAvailable } from "lib/security/encryption";
import { hasSameOrigin } from "lib/security/same-origin";
import { NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

const credentialsSchema = z
  .object({ apiKey: z.string().min(20).max(512) })
  .strict();
const MAX_RESPONSE_BYTES = 64 * 1024;

export const POST = withAuth(async (request, session) => {
  if (!hasSameOrigin(request))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const rate = await checkApiRateLimit({
    kind: "freshdesk-connect",
    id: session.user.id,
    limit: 8,
    windowMs: 60_000,
  });
  if (!rate.allowed)
    return NextResponse.json(
      { error: "Too many connection attempts" },
      { status: 429 },
    );
  if (!isEncryptionAvailable())
    return NextResponse.json(
      { error: "Connector encryption is not configured" },
      { status: 503 },
    );
  const origin = getFreshdeskOrigin();
  if (!origin)
    return NextResponse.json(
      { error: "Freshdesk is not configured" },
      { status: 503 },
    );
  const body = await readBoundedJson(request, 2_048);
  if (!body.ok)
    return NextResponse.json(
      { error: body.tooLarge ? "Request too large" : "Invalid request" },
      { status: body.tooLarge ? 413 : 400 },
    );
  const parsed = credentialsSchema.safeParse(body.value);
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid credentials" }, { status: 400 });

  try {
    const response = await fetch(`${origin}/api/v2/agents/me`, {
      headers: {
        Authorization: `Basic ${Buffer.from(`${parsed.data.apiKey}:X`).toString("base64")}`,
        Accept: "application/json",
      },
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
    const agent = await readAgentResponse(response);
    if (!response.ok || !agent)
      return NextResponse.json(
        { error: "Freshdesk credentials could not be verified" },
        { status: 401 },
      );
    const now = new Date();
    const name =
      typeof agent.contact?.name === "string"
        ? agent.contact.name.slice(0, 160)
        : typeof agent.name === "string"
          ? agent.name.slice(0, 160)
          : null;
    const email =
      typeof agent.contact?.email === "string"
        ? agent.contact.email.slice(0, 320)
        : typeof agent.email === "string"
          ? agent.email.slice(0, 320)
          : null;
    await pgDb
      .insert(UserConnectorTable)
      .values({
        userId: session.user.id,
        provider: "freshdesk",
        email,
        accessToken: encryptConnectorToken(
          session.user.id,
          "freshdesk",
          "access",
          parsed.data.apiKey,
        ),
        refreshToken: null,
        tokenExpiresAt: null,
        scope: "tickets:read tickets:write",
        isConnected: true,
        isPaused: false,
        lastSyncAt: now,
        metadata: { name },
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [UserConnectorTable.userId, UserConnectorTable.provider],
        set: {
          email,
          accessToken: encryptConnectorToken(
            session.user.id,
            "freshdesk",
            "access",
            parsed.data.apiKey,
          ),
          refreshToken: null,
          tokenExpiresAt: null,
          scope: "tickets:read tickets:write",
          isConnected: true,
          isPaused: false,
          lastSyncAt: now,
          metadata: { name },
          updatedAt: now,
        },
      });
    return NextResponse.json(
      {
        connected: true,
        ...(email ? { email } : {}),
        ...(name ? { name } : {}),
      },
      { headers: { "Cache-Control": "no-store", Pragma: "no-cache" } },
    );
  } catch {
    return NextResponse.json(
      { error: "Freshdesk connection could not be completed" },
      { status: 503 },
    );
  }
});

async function readAgentResponse(response: Response): Promise<{
  [key: string]: unknown;
  contact?: { name?: unknown; email?: unknown };
} | null> {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES)
    return null;
  if (!response.body) return null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const parsed: unknown = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    );
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as {
          [key: string]: unknown;
          contact?: { name?: unknown; email?: unknown };
        })
      : null;
  } catch {
    return null;
  }
}
