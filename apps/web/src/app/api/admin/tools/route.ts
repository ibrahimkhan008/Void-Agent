import "server-only";

import { getSession } from "auth/server";
import { requireAdminPermission } from "lib/auth/permissions";
import type { DynamicTool } from "lib/db/pg/repositories/site-config-repository.pg";
import { siteConfigRepository } from "lib/db/repository";
import { readBoundedRequestBody } from "lib/http/bounded-request-body";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import { hasSameOrigin } from "lib/security/same-origin";
import { NextResponse } from "next/server";
import { z } from "zod";

const MAX_BODY_BYTES = 8 * 1024;
const MAX_TOOLS = 200;

const mutationSchema = z
  .object({
    id: z.string().trim().max(100).optional(),
    name: z.string().trim().min(1).max(100),
    category: z.string().trim().max(60).optional(),
    description: z.string().trim().max(500).optional(),
    enabled: z.boolean().optional(),
  })
  .strict();

const json = (body: unknown, status = 200) =>
  NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });

function toolSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100);
}

async function authorizeMutation(request: Request) {
  try {
    await requireAdminPermission("manage tools");
  } catch {
    return json({ success: false, error: "Unauthorized" }, 401);
  }
  if (!hasSameOrigin(request)) {
    return json({ success: false, error: "Forbidden" }, 403);
  }
  const session = await getSession();
  if (!session?.user.id) {
    return json({ success: false, error: "Unauthorized" }, 401);
  }
  try {
    const rate = await checkApiRateLimit({
      kind: "admin-dynamic-tool-mutation",
      id: session.user.id,
      limit: 30,
      windowMs: 60_000,
    });
    if (!rate.allowed) {
      return json({ success: false, error: "Too many requests" }, 429);
    }
  } catch {
    return json({ success: false, error: "Rate limiting unavailable" }, 503);
  }
  return null;
}

// GET — list registered dynamic tools. Entries carry no credentials.
export async function GET() {
  try {
    await requireAdminPermission("manage tools");
  } catch {
    return json({ success: false, error: "Unauthorized" }, 401);
  }
  try {
    const config = await siteConfigRepository.getConfig("tools");
    const dynamicTools = (config?.dynamicTools ?? {}) as unknown as Record<
      string,
      Record<string, unknown>
    >;
    const list = Object.entries(dynamicTools).map(([id, tool]) => ({
      id,
      name: typeof tool.name === "string" ? tool.name : id,
      category: typeof tool.category === "string" ? tool.category : "Custom",
      description: typeof tool.description === "string" ? tool.description : "",
      enabled: tool.enabled !== false,
      addedAt: typeof tool.addedAt === "string" ? tool.addedAt : "",
    }));
    return json({ success: true, tools: list });
  } catch (error) {
    console.error("[admin/tools/GET] error:", error);
    return json({ success: false, error: "Failed to load tools" }, 500);
  }
}

// POST — add or update a dynamic tool entry.
export async function POST(request: Request) {
  const denied = await authorizeMutation(request);
  if (denied) return denied;

  let bytes: Uint8Array | null;
  try {
    bytes = await readBoundedRequestBody(request, MAX_BODY_BYTES);
  } catch {
    return json({ success: false, error: "Invalid request body" }, 400);
  }
  if (!bytes) return json({ success: false, error: "Request too large" }, 413);

  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return json({ success: false, error: "Invalid JSON" }, 400);
  }
  const parsed = mutationSchema.safeParse(body);
  if (!parsed.success) {
    return json({ success: false, error: "Invalid tool configuration" }, 400);
  }

  const input = parsed.data;
  const slug = toolSlug(input.id || input.name);
  if (!slug) {
    return json({ success: false, error: "Invalid tool ID" }, 400);
  }

  try {
    const config = await siteConfigRepository.getConfig("tools");
    const existing = (config?.dynamicTools ?? {}) as unknown as Record<
      string,
      Record<string, unknown>
    >;
    if (!existing[slug] && Object.keys(existing).length >= MAX_TOOLS) {
      return json({ success: false, error: "Too many dynamic tools" }, 409);
    }
    // Legacy stored entries are loose JSON objects; only the entries this
    // route writes are guaranteed to satisfy DynamicTool, so the existing
    // records are cast as a group and the working map is typed from here on.
    const next: Record<string, DynamicTool> = {
      ...(existing as unknown as Record<string, DynamicTool>),
      [slug]: {
        name: input.name,
        category: input.category || "Custom",
        description: input.description || "",
        enabled: input.enabled !== false,
        addedAt:
          typeof existing[slug]?.addedAt === "string"
            ? (existing[slug].addedAt as string)
            : new Date().toISOString(),
      },
    };
    await siteConfigRepository.upsert("tools", {
      ...(config ?? {}),
      dynamicTools: next,
    });
    return json({ success: true, id: slug });
  } catch (error) {
    console.error("[admin/tools/POST] error:", error);
    return json({ success: false, error: "Failed to save tool" }, 500);
  }
}

// DELETE — remove a dynamic tool entry by id.
export async function DELETE(request: Request) {
  const denied = await authorizeMutation(request);
  if (denied) return denied;

  const id = new URL(request.url).searchParams.get("id")?.trim();
  if (!id) {
    return json({ success: false, error: "id required" }, 400);
  }

  try {
    const config = await siteConfigRepository.getConfig("tools");
    const existing = (config?.dynamicTools ?? {}) as unknown as Record<
      string,
      Record<string, unknown>
    >;
    if (!existing[id]) {
      return json({ success: false, error: "Not found" }, 404);
    }
    const next = { ...existing } as unknown as Record<string, DynamicTool>;
    delete next[id];
    await siteConfigRepository.upsert("tools", {
      ...(config ?? {}),
      dynamicTools: next,
    });
    return json({ success: true });
  } catch (error) {
    console.error("[admin/tools/DELETE] error:", error);
    return json({ success: false, error: "Failed to remove tool" }, 500);
  }
}
