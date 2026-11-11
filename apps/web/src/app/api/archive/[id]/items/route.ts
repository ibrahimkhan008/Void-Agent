import {
  addOwnedThreadToArchive,
  getOwnedArchive,
  listOwnedArchiveThreads,
} from "@/lib/archives/archive-service";
import { readBoundedRequestBody } from "@/lib/http/bounded-request-body";
import { hasSameOrigin } from "@/lib/security/same-origin";
import { ArchiveItemCreateSchema } from "@/types/archive";
import { withAuth } from "auth/route-guard";
import { NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";
const idSchema = z.string().uuid();
const MAX_BODY_BYTES = 4 * 1024;

export const GET = withAuth(async (_request, session, { params }) => {
  const { id } = await params;
  if (!idSchema.safeParse(id).success)
    return NextResponse.json({ error: "Archive not found" }, { status: 404 });
  try {
    const archive = await getOwnedArchive(id, session.user.id);
    if (!archive)
      return NextResponse.json({ error: "Archive not found" }, { status: 404 });
    const threads = await listOwnedArchiveThreads(id, session.user.id);
    return NextResponse.json(
      { threads: threads ?? [] },
      {
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  } catch (error) {
    console.error("Failed to list archive threads", error);
    return NextResponse.json(
      { error: "Failed to list archive threads" },
      { status: 500 },
    );
  }
});

export const POST = withAuth(async (request, session, { params }) => {
  if (!hasSameOrigin(request))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  if (!idSchema.safeParse(id).success)
    return NextResponse.json({ error: "Archive not found" }, { status: 404 });
  const bytes = await readBoundedRequestBody(request, MAX_BODY_BYTES);
  if (!bytes)
    return NextResponse.json(
      { error: "Request is too large" },
      { status: 413 },
    );
  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = ArchiveItemCreateSchema.strict().safeParse(body);
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid archive item" },
      { status: 400 },
    );

  try {
    const item = await addOwnedThreadToArchive({
      archiveId: id,
      threadId: parsed.data.itemId,
      userId: session.user.id,
    });
    if (!item)
      return NextResponse.json(
        { error: "Archive or conversation not found" },
        { status: 404 },
      );
    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    console.error("Failed to archive conversation", error);
    return NextResponse.json(
      { error: "Failed to archive conversation" },
      { status: 500 },
    );
  }
});
