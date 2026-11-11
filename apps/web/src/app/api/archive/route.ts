import {
  createOwnedArchive,
  listOwnedArchives,
} from "@/lib/archives/archive-service";
import { readBoundedRequestBody } from "@/lib/http/bounded-request-body";
import { hasSameOrigin } from "@/lib/security/same-origin";
import { ArchiveCreateSchema } from "@/types/archive";
import { withAuth } from "auth/route-guard";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
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

export const GET = withAuth(async (_request, session) => {
  try {
    const archives = await listOwnedArchives(session.user.id);
    return NextResponse.json(
      { archives },
      {
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  } catch (error) {
    console.error("Failed to list archives", error);
    return NextResponse.json(
      { error: "Failed to list archives" },
      { status: 500 },
    );
  }
});

export const POST = withAuth(async (request, session) => {
  if (!hasSameOrigin(request))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await readJson(request);
  if ("tooLarge" in body)
    return NextResponse.json(
      { error: "Request is too large" },
      { status: 413 },
    );
  if ("invalid" in body)
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  const parsed = ArchiveCreateSchema.strict().safeParse(body.value);
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid archive" }, { status: 400 });

  try {
    const archive = await createOwnedArchive({
      userId: session.user.id,
      name: parsed.data.name,
      description: parsed.data.description,
    });
    return NextResponse.json({ archive }, { status: 201 });
  } catch (error) {
    console.error("Failed to create archive", error);
    return NextResponse.json(
      { error: "Failed to create archive" },
      { status: 500 },
    );
  }
});
