import { withAuth } from "auth/route-guard";
import { memoryRepository } from "lib/db/repository";
import { enrichMemoriesWithSource } from "lib/ai/memory/memory-source";
import { NextResponse } from "next/server";

// Ported from zip-main `src/app/api/user/memory/route.ts` (triage WP6b-T3,
// 2026-11-11). Staging's memory settings card
// (`components/user/user-detail/memory-settings-card.tsx`) already calls
// this endpoint via SWR/fetch; without the route every call 404s. The
// endpoint contract matches the UI exactly: GET returns the memory array
// (source-enriched), POST creates, PUT updates, DELETE removes one (?id=)
// or all (?all=true). Auth uses staging's withAuth guard; writes are
// owner-scoped inside memoryRepository.

const MAX_MEMORY_CONTENT_LENGTH = 4_000;
const MAX_MEMORY_CATEGORY_LENGTH = 100;

const asTrimmedString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

/** GET /api/user/memory — list all memories, enriched with source-message
 * preview (when applicable) for the settings UI. */
export const GET = withAuth(async (_request, session) => {
  const raw = await memoryRepository.getAll(session.user.id);
  const memories = await enrichMemoriesWithSource(raw, session.user.id);
  return NextResponse.json(memories);
});

/** POST /api/user/memory — create a memory. */
export const POST = withAuth(async (request, session) => {
  const body = (await request.json().catch(() => null)) as {
    content?: unknown;
    category?: unknown;
  } | null;
  const content = asTrimmedString(body?.content);
  if (!content) {
    return NextResponse.json({ error: "Content is required" }, { status: 400 });
  }
  if (content.length > MAX_MEMORY_CONTENT_LENGTH) {
    return NextResponse.json(
      { error: "Content exceeds the maximum length" },
      { status: 400 },
    );
  }
  const category = asTrimmedString(body?.category)?.slice(
    0,
    MAX_MEMORY_CATEGORY_LENGTH,
  );
  const memory = await memoryRepository.create({
    userId: session.user.id,
    content,
    category: category || undefined,
  });
  return NextResponse.json(memory, { status: 201 });
});

/** PUT /api/user/memory — update a memory. */
export const PUT = withAuth(async (request, session) => {
  const body = (await request.json().catch(() => null)) as {
    id?: unknown;
    content?: unknown;
    category?: unknown;
  } | null;
  const id = typeof body?.id === "string" ? body.id : "";
  const content = asTrimmedString(body?.content);
  if (!id || !content) {
    return NextResponse.json(
      { error: "ID and content are required" },
      { status: 400 },
    );
  }
  if (content.length > MAX_MEMORY_CONTENT_LENGTH) {
    return NextResponse.json(
      { error: "Content exceeds the maximum length" },
      { status: 400 },
    );
  }
  const category = asTrimmedString(body?.category)?.slice(
    0,
    MAX_MEMORY_CATEGORY_LENGTH,
  );
  const memory = await memoryRepository.update(id, session.user.id, {
    content,
    category: category || undefined,
  });
  if (!memory) {
    return NextResponse.json({ error: "Memory not found" }, { status: 404 });
  }
  return NextResponse.json(memory);
});

/** DELETE /api/user/memory — delete a memory (?id=) or all (?all=true). */
export const DELETE = withAuth(async (request, session) => {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const all = searchParams.get("all");

  if (all === "true") {
    const count = await memoryRepository.deleteAll(session.user.id);
    return NextResponse.json({ deleted: count });
  }

  if (!id) {
    return NextResponse.json(
      { error: "Memory ID is required" },
      { status: 400 },
    );
  }
  const deleted = await memoryRepository.delete(id, session.user.id);
  if (!deleted) {
    return NextResponse.json({ error: "Memory not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
});
