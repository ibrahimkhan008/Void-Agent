import "server-only";
import { getSession } from "auth/server";
import {
  ProviderDiscoveryResponseTooLargeError,
  ProviderDiscoveryTimeoutError,
  requestProviderDiscovery,
} from "lib/admin/provider-discovery";
import { requireAdminPermission } from "lib/auth/permissions";
import { siteConfigRepository } from "lib/db/repository";
import { readBoundedRequestBody } from "lib/http/bounded-request-body";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import { decrypt } from "lib/security/encryption";
import { hasSameOrigin } from "lib/security/same-origin";
import { UrlBlockedError } from "lib/webhooks/url-guard";
import { NextResponse } from "next/server";
import { z } from "zod";

const MAX_BODY_BYTES = 8 * 1024;
const requestSchema = z
  .object({
    baseURL: z.string().trim().url().max(2_048),
    apiKey: z.string().max(4_096).optional(),
    providerId: z
      .string()
      .regex(/^[a-z0-9][a-z0-9_-]{0,63}$/u)
      .optional(),
  })
  .strict();

const json = (body: unknown, status = 200) =>
  NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });

export async function POST(request: Request) {
  try {
    await requireAdminPermission("discover provider models");
  } catch {
    return json({ success: false, error: "Unauthorized" }, 401);
  }

  const session = await getSession();
  if (!session?.user.id) {
    return json({ success: false, error: "Unauthorized" }, 401);
  }
  if (!hasSameOrigin(request)) {
    return json({ success: false, error: "Forbidden" }, 403);
  }

  try {
    const rate = await checkApiRateLimit({
      kind: "admin-provider-model-discovery",
      id: session.user.id,
      limit: 20,
      windowMs: 60_000,
    });
    if (!rate.allowed) {
      return json({ success: false, error: "Too many requests" }, 429);
    }
  } catch {
    return json({ success: false, error: "Rate limiting unavailable" }, 503);
  }

  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return json({ success: false, error: "Request too large" }, 413);
  }

  let boundedBody: Uint8Array | null;
  try {
    boundedBody = await readBoundedRequestBody(request, MAX_BODY_BYTES);
  } catch {
    return json({ success: false, error: "Invalid JSON body" }, 400);
  }
  if (boundedBody === null) {
    return json({ success: false, error: "Request too large" }, 413);
  }

  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder().decode(boundedBody));
  } catch {
    return json({ success: false, error: "Invalid JSON body" }, 400);
  }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    const hasBaseURL =
      body !== null &&
      typeof body === "object" &&
      "baseURL" in body &&
      typeof body.baseURL === "string" &&
      body.baseURL.trim().length > 0;
    return json(
      {
        success: false,
        error: hasBaseURL ? "Invalid discovery request" : "baseURL is required",
      },
      400,
    );
  }

  const { baseURL, providerId } = parsed.data;
  let apiKey = parsed.data.apiKey?.trim() || undefined;
  if (!apiKey && providerId) {
    try {
      const config = await siteConfigRepository.getConfig("models");
      const providers = config?.dynamicProviders as
        | Record<string, { baseURL?: unknown; apiKey?: unknown }>
        | undefined;
      const saved = providers?.[providerId];
      if (!saved)
        return json({ success: false, error: "Provider not found" }, 404);
      if (
        typeof saved.baseURL !== "string" ||
        normalizeProviderBaseURL(saved.baseURL) !==
          normalizeProviderBaseURL(baseURL)
      ) {
        return json(
          {
            success: false,
            error: "Enter the API key to discover models at a changed endpoint",
          },
          400,
        );
      }

      if (typeof saved.apiKey === "string" && saved.apiKey) {
        try {
          apiKey = decrypt(saved.apiKey);
        } catch {
          // The provider may predate encryption or have no direct key.
        }
      }
      if (!apiKey) {
        const tools = await siteConfigRepository.getConfig("tools");
        const secrets = tools?.apiKeysSecrets as
          | Record<string, unknown>
          | undefined;
        const encryptedFallback = secrets?.[`dyn_${providerId}`];
        if (typeof encryptedFallback === "string" && encryptedFallback) {
          try {
            apiKey = decrypt(encryptedFallback);
          } catch {
            // Continue with unauthenticated discovery if no usable key exists.
          }
        }
      }
    } catch {
      return json(
        { success: false, error: "Provider settings are unavailable" },
        503,
      );
    }
  }
  try {
    const modelsUrl = new URL(`${baseURL.replace(/\/$/, "")}/models`);
    const response = await requestProviderDiscovery(
      modelsUrl.toString(),
      apiKey,
    );

    if (response.status < 200 || response.status >= 300) {
      return json({
        success: false,
        error: "Provider returned an unsuccessful response",
      });
    }

    let data: unknown;
    try {
      data = JSON.parse(response.body);
    } catch {
      return json({
        success: false,
        error: "Provider returned an invalid response",
      });
    }
    const readModels = (items: unknown[]): string[] =>
      items
        .map((item) => {
          if (typeof item === "string") return item;
          if (!item || typeof item !== "object") return undefined;
          const model = item as { id?: unknown; name?: unknown };
          return typeof model.id === "string"
            ? model.id
            : typeof model.name === "string"
              ? model.name
              : undefined;
        })
        .filter((model): model is string => Boolean(model));

    let models: string[] = [];
    if (Array.isArray(data)) {
      models = readModels(data);
    } else if (data && typeof data === "object") {
      const responseData = data as {
        data?: unknown;
        models?: unknown;
      };
      if (Array.isArray(responseData.data)) {
        models = readModels(responseData.data);
      } else if (Array.isArray(responseData.models)) {
        models = readModels(responseData.models);
      }
    }

    return json({ success: true, models: [...new Set(models)] });
  } catch (error) {
    if (error instanceof ProviderDiscoveryTimeoutError) {
      return json({ success: false, error: "Provider request timed out" });
    }
    if (error instanceof UrlBlockedError) {
      return json(
        { success: false, error: "Endpoint must be a public HTTPS URL" },
        400,
      );
    }
    if (error instanceof ProviderDiscoveryResponseTooLargeError) {
      return json({
        success: false,
        error: "Provider response exceeded the size limit",
      });
    }
    return json({ success: false, error: "Model discovery failed" });
  }
}

function normalizeProviderBaseURL(value: string): string | null {
  try {
    const url = new URL(value);
    url.pathname = url.pathname.replace(/\/+$/u, "");
    return url.toString().replace(/\/$/u, "");
  } catch {
    return null;
  }
}
