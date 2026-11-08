import { getSession } from "auth/server";
import { validateUserProviderCapabilities } from "lib/ai/user-model-provider-capabilities";
import {
  USER_PROVIDER_DISCOVERY_TIMEOUT_MS,
  fetchUserModelProvider,
  normalizeUserProviderBaseUrl,
  parseOpenAICompatibleModelIds,
} from "lib/ai/user-model-provider-transport";
import { userModelProviderRepository } from "lib/db/repository";
import { readBoundedRequestBody } from "lib/http/bounded-request-body";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import { isEncryptionAvailable } from "lib/security/encryption";
import { hasSameOrigin } from "lib/security/same-origin";
import { UrlBlockedError } from "lib/webhooks/url-guard";
import { NextResponse } from "next/server";
import { z } from "zod";

const MAX_BODY_BYTES = 16 * 1024;
const DISCOVERY_MAX_RESPONSE_BYTES = 64 * 1024;
const providerSchema = z
  .object({
    id: z.string().uuid().optional(),
    name: z.string().trim().min(1).max(80),
    baseUrl: z.string().trim().url().max(2_048),
    apiKey: z.string().max(4_096).optional(),
    capabilities: z
      .record(
        z.string().min(1).max(200),
        z.object({ supportsToolCalling: z.boolean() }).strict(),
      )
      .optional(),
  })
  .strict();

const json = (body: unknown, status = 200) =>
  NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });

async function getAuthorizedUser(request: Request, mutation = false) {
  const session = await getSession();
  const userId = session?.user?.id;
  if (!userId) return { response: json({ error: "Unauthorized" }, 401) };
  if (mutation && !hasSameOrigin(request)) {
    return { response: json({ error: "Forbidden" }, 403) };
  }
  try {
    const rate = await checkApiRateLimit({
      kind: "user-model-provider-management",
      id: userId,
      limit: 30,
      windowMs: 60_000,
    });
    if (!rate.allowed)
      return { response: json({ error: "Too many requests" }, 429) };
  } catch {
    return { response: json({ error: "Rate limiting unavailable" }, 503) };
  }
  return { userId };
}

export async function GET(request: Request) {
  const auth = await getAuthorizedUser(request);
  if (auth.response) return auth.response;
  try {
    const providers = await userModelProviderRepository.listForUser(
      auth.userId,
    );
    return json({ providers });
  } catch {
    return json({ error: "Provider settings are unavailable" }, 503);
  }
}

export async function POST(request: Request) {
  const auth = await getAuthorizedUser(request, true);
  if (auth.response) return auth.response;
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return json({ error: "Request too large" }, 413);
  }

  let bytes: Uint8Array | null;
  try {
    bytes = await readBoundedRequestBody(request, MAX_BODY_BYTES);
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  if (!bytes) return json({ error: "Request too large" }, 413);

  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  const parsed = providerSchema.safeParse(body);
  if (!parsed.success) return json({ error: "Invalid provider settings" }, 400);
  if (!isEncryptionAvailable()) {
    return json({ error: "Encrypted provider storage is unavailable" }, 503);
  }

  const provider = parsed.data;
  let baseUrl: string;
  try {
    baseUrl = normalizeUserProviderBaseUrl(provider.baseUrl);
  } catch {
    return json({ error: "Endpoint must be a public HTTPS:443 URL" }, 400);
  }

  let existing: Awaited<
    ReturnType<typeof userModelProviderRepository.getForRuntime>
  > = null;
  if (provider.id) {
    try {
      existing = await userModelProviderRepository.getForRuntime(
        auth.userId,
        provider.id,
      );
    } catch {
      return json({ error: "Provider settings are unavailable" }, 503);
    }
    if (!existing) return json({ error: "Provider not found" }, 404);
  }
  const submittedApiKey = provider.apiKey?.trim() || "";
  const endpointChanged = Boolean(existing && existing.baseUrl !== baseUrl);
  if (endpointChanged && existing?.apiKey && !submittedApiKey) {
    return json(
      { error: "Enter an API key before changing the provider endpoint" },
      400,
    );
  }
  // A saved credential may be reused only for the endpoint the user originally
  // approved. A changed public URL requires an explicitly entered replacement.
  const apiKey =
    submittedApiKey || (!endpointChanged ? existing?.apiKey : undefined) || "";

  let modelsResponse: Response;
  try {
    const endpoint = `${baseUrl}/models`;
    modelsResponse = await fetchUserModelProvider(
      endpoint,
      {
        method: "GET",
        headers: apiKey
          ? { Authorization: `Bearer ${apiKey}`, "api-key": apiKey }
          : {},
      },
      DISCOVERY_MAX_RESPONSE_BYTES,
      USER_PROVIDER_DISCOVERY_TIMEOUT_MS,
    );
  } catch (error) {
    if (error instanceof UrlBlockedError) {
      return json({ error: "Endpoint must be a public HTTPS:443 URL" }, 400);
    }
    return json({ error: "Provider model discovery failed" }, 502);
  }
  if (modelsResponse.status < 200 || modelsResponse.status >= 300) {
    await modelsResponse.body?.cancel().catch(() => undefined);
    return json({ error: "Provider rejected model discovery" }, 502);
  }

  let data: unknown;
  try {
    data = await modelsResponse.json();
  } catch {
    return json({ error: "Provider returned an invalid model list" }, 502);
  }
  const modelIds = parseOpenAICompatibleModelIds(data);
  if (modelIds.length === 0) {
    return json({ error: "Provider returned no compatible models" }, 422);
  }

  const capabilities = validateUserProviderCapabilities(
    endpointChanged ? undefined : provider.capabilities,
    modelIds,
  );
  if (!capabilities) {
    return json(
      { error: "Capabilities must reference only discovered model IDs" },
      400,
    );
  }

  try {
    const saved = await userModelProviderRepository.saveForUser({
      userId: auth.userId,
      id: provider.id,
      name: provider.name,
      baseUrl,
      apiKey: submittedApiKey || undefined,
      modelIds,
      capabilities,
    });
    return json({ provider: saved, capabilitiesReset: endpointChanged });
  } catch {
    return json({ error: "Provider could not be saved" }, 503);
  }
}

export async function DELETE(request: Request) {
  const auth = await getAuthorizedUser(request, true);
  if (auth.response) return auth.response;
  const id = new URL(request.url).searchParams.get("id");
  if (!id || !z.string().uuid().safeParse(id).success) {
    return json({ error: "A valid provider id is required" }, 400);
  }
  try {
    const deleted = await userModelProviderRepository.deleteForUser(
      auth.userId,
      id,
    );
    return deleted
      ? json({ success: true })
      : json({ error: "Provider not found" }, 404);
  } catch {
    return json({ error: "Provider could not be deleted" }, 503);
  }
}
