import "server-only";
import { getSession } from "auth/server";
import {
  ProviderDiscoveryResponseTooLargeError,
  ProviderDiscoveryTimeoutError,
  requestProviderDiscovery,
} from "lib/admin/provider-discovery";
import { requireAdminPermission } from "lib/auth/permissions";
import { readBoundedRequestBody } from "lib/http/bounded-request-body";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import { hasSameOrigin } from "lib/security/same-origin";
import { UrlBlockedError } from "lib/webhooks/url-guard";
import { NextResponse } from "next/server";
import { z } from "zod";

const MAX_BODY_BYTES = 8 * 1024;
const requestSchema = z
  .object({
    baseURL: z.string().trim().url().max(2_048),
    apiKey: z.string().max(4_096).optional(),
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

  const { baseURL, apiKey } = parsed.data;
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
