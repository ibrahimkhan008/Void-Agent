import {
  deleteOwnedArchive,
  getOwnedArchive,
  listOwnedArchiveThreads,
  updateOwnedArchive,
} from "@/lib/archives/archive-service";
import { readBoundedRequestBody } from "@/lib/http/bounded-request-body";
import { hasSameOrigin } from "@/lib/security/same-origin";
import { ArchiveUpdateSchema } from "@/types/archive";
import { withAuth } from "auth/route-guard";
import { NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";
const idSchema = z.string().uuid();
const MAX_BODY_BYTES = 16 * 1024;

async function readJson(request: Request) {
  const bytes = await readBoundedRequestBody(request, MAX_BODY_BYTES);
  if (!bytes) return { tooLarge: true as const };
  try {
    return { value: JSON.parse(new TextDecoder().decode(bytes)) as unknown };
  } catch {
    return { invalid: true as const };
  }
}

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
      { archive, threads: threads ?? [] },
      {
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  } catch (error) {
    console.error("Failed to load archive", error);
    return NextResponse.json(
      { error: "Failed to load archive" },
      { status: 500 },
    );
  }
});

export const PUT = withAuth(async (request, session, { params }) => {
  if (!hasSameOrigin(request))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  if (!idSchema.safeParse(id).success)
    return NextResponse.json({ error: "Archive not found" }, { status: 404 });
  const body = await readJson(request);
  if ("tooLarge" in body)
    return NextResponse.json(
      { error: "Request is too large" },
      { status: 413 },
    );
  if ("invalid" in body)
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  const parsed = ArchiveUpdateSchema.strict().safeParse(body.value);
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid archive update" },
      { status: 400 },
    );

  try {
    const archive = await updateOwnedArchive(id, session.user.id, parsed.data);
    if (!archive)
      return NextResponse.json({ error: "Archive not found" }, { status: 404 });
    return NextResponse.json({ archive });
  } catch (error) {
    console.error("Failed to update archive", error);
    return NextResponse.json(
      { error: "Failed to update archive" },
      { status: 500 },
    );
  }
});

export const DELETE = withAuth(async (request, session, { params }) => {
  if (!hasSameOrigin(request))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  if (!idSchema.safeParse(id).success)
    return NextResponse.json({ error: "Archive not found" }, { status: 404 });
  try {
    const deleted = await deleteOwnedArchive(id, session.user.id);
    if (!deleted)
      return NextResponse.json({ error: "Archive not found" }, { status: 404 });
    return new Response(null, { status: 204 });
  } catch (error) {
    console.error("Failed to delete archive", error);
    return NextResponse.json(
      { error: "Failed to delete archive" },
      { status: 500 },
    );
  }
});
