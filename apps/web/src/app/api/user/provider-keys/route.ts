import {
  USER_BYOK_PROVIDERS,
  isUserByokProvider,
} from "@/lib/ai/user-provider-byok";
import { userRepository } from "@/lib/db/repository";
import { encrypt, isEncryptionAvailable } from "@/lib/security/encryption";
import { withAuth } from "auth/route-guard";
import { NextResponse } from "next/server";

export const GET = withAuth(async (_request, session) => {
  const preferences = await userRepository.getPreferences(session.user.id);
  const saved = preferences?.aiProviderKeys ?? {};
  return NextResponse.json({
    providers: USER_BYOK_PROVIDERS.map((provider) => ({
      id: provider,
      configured: typeof saved[provider] === "string" && saved[provider] !== "",
    })),
    encryptionAvailable: isEncryptionAvailable(),
  });
});

export const PUT = withAuth(async (request, session) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const { provider, apiKey } = body as Record<string, unknown>;
  if (typeof provider !== "string" || !isUserByokProvider(provider)) {
    return NextResponse.json(
      { error: "Unsupported provider" },
      { status: 400 },
    );
  }
  if (
    apiKey !== null &&
    (typeof apiKey !== "string" ||
      apiKey.trim().length === 0 ||
      apiKey.length > 4096)
  ) {
    return NextResponse.json({ error: "Invalid API key" }, { status: 400 });
  }
  if (apiKey !== null && !isEncryptionAvailable()) {
    return NextResponse.json(
      { error: "Credential encryption is not configured" },
      { status: 503 },
    );
  }

  const current = (await userRepository.getPreferences(session.user.id)) ?? {};
  const keys = { ...(current.aiProviderKeys ?? {}) };
  if (apiKey === null) delete keys[provider];
  else keys[provider] = encrypt((apiKey as string).trim());
  const { aiProviderKeys: _oldKeys, ...otherPreferences } = current;
  const updated = await userRepository.updatePreferences(session.user.id, {
    ...otherPreferences,
    ...(Object.keys(keys).length > 0 ? { aiProviderKeys: keys } : {}),
  });

  return NextResponse.json({
    success: true,
    configured: apiKey !== null,
    preferences: sanitizePreferences(updated.preferences),
  });
});

function sanitizePreferences<
  T extends Record<string, unknown> | null | undefined,
>(preferences: T) {
  if (!preferences) return {};
  const { aiProviderKeys: _keys, ...safePreferences } = preferences;
  return safePreferences;
}
