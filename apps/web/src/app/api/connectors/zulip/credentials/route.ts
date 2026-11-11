import { withAuth } from "auth/route-guard";
import { encryptConnectorToken } from "lib/connectors/oauth-flow";
import { normalizeZulipRealmUrl } from "lib/connectors/zulip";
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
  .object({
    realmUrl: z.string().min(8).max(512),
    email: z.string().email().max(320),
    apiKey: z.string().min(16).max(512),
  })
  .strict();
const MAX_RESPONSE_BYTES = 64 * 1024;

export const POST = withAuth(async (request, session) => {
  if (!hasSameOrigin(request))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const rate = await checkApiRateLimit({
    kind: "zulip-connect",
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
  const body = await readBoundedJson(request, 2_048);
  if (!body.ok)
    return NextResponse.json(
      { error: body.tooLarge ? "Request too large" : "Invalid request" },
      { status: body.tooLarge ? 413 : 400 },
    );
  const parsed = credentialsSchema.safeParse(body.value);
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid credentials" }, { status: 400 });
  // Strict host pinning at save: only a plain HTTPS FQDN origin is stored,
  // and every later dispatch re-derives the host from this pinned value.
  const realmUrl = normalizeZulipRealmUrl(parsed.data.realmUrl);
  if (!realmUrl)
    return NextResponse.json(
      {
        error:
          "Zulip realm URL must be an https:// host without credentials, ports, or paths",
      },
      { status: 400 },
    );

  try {
    const response = await fetch(`${realmUrl}/api/v1/users/me`, {
      headers: {
        Authorization: `Basic ${Buffer.from(
          `${parsed.data.email}:${parsed.data.apiKey}`,
        ).toString("base64")}`,
        Accept: "application/json",
      },
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
    const identity = await readIdentityResponse(response);
    if (
      !response.ok ||
      identity.result !== "success" ||
      identity.userId === null
    )
      return NextResponse.json(
        { error: "Zulip credentials could not be verified" },
        { status: 401 },
      );
    const now = new Date();
    const name =
      typeof identity.name === "string" ? identity.name.slice(0, 160) : null;
    const email =
      typeof identity.email === "string" && identity.email
        ? identity.email.slice(0, 320)
        : parsed.data.email;
    await pgDb
      .insert(UserConnectorTable)
      .values({
        userId: session.user.id,
        provider: "zulip",
        email,
        accessToken: encryptConnectorToken(
          session.user.id,
          "zulip",
          "access",
          parsed.data.apiKey,
        ),
        refreshToken: null,
        tokenExpiresAt: null,
        scope: "read",
        isConnected: true,
        isPaused: false,
        lastSyncAt: now,
        metadata: { name, realmUrl },
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [UserConnectorTable.userId, UserConnectorTable.provider],
        set: {
          email,
          accessToken: encryptConnectorToken(
            session.user.id,
            "zulip",
            "access",
            parsed.data.apiKey,
          ),
          refreshToken: null,
          tokenExpiresAt: null,
          scope: "read",
          isConnected: true,
          isPaused: false,
          lastSyncAt: now,
          metadata: { name, realmUrl },
          updatedAt: now,
        },
      });
    return NextResponse.json(
      {
        connected: true,
        realmUrl,
        ...(email ? { email } : {}),
        ...(name ? { name } : {}),
      },
      { headers: { "Cache-Control": "no-store", Pragma: "no-cache" } },
    );
  } catch {
    return NextResponse.json(
      { error: "Zulip connection could not be completed" },
      { status: 503 },
    );
  }
});

async function readIdentityResponse(response: Response): Promise<{
  result: unknown;
  userId: number | null;
  email: unknown;
  name: unknown;
}> {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES)
    return { result: null, userId: null, email: null, name: null };
  if (!response.body)
    return { result: null, userId: null, email: null, name: null };
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
        return { result: null, userId: null, email: null, name: null };
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
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return { result: null, userId: null, email: null, name: null };
    const identity = parsed as {
      result?: unknown;
      user_id?: unknown;
      email?: unknown;
      full_name?: unknown;
    };
    return {
      result: identity.result ?? null,
      userId:
        typeof identity.user_id === "number" &&
        Number.isFinite(identity.user_id)
          ? identity.user_id
          : null,
      email: identity.email ?? null,
      name: identity.full_name ?? null,
    };
  } catch {
    return { result: null, userId: null, email: null, name: null };
  }
}
