import {
  createOwnedCollection,
  listOwnedCollections,
  toCollectionShape,
} from "@/lib/collections/collection-service";
import { hasSameOrigin } from "@/lib/security/same-origin";
import { withAuth } from "auth/route-guard";
import { NextResponse } from "next/server";
import { z } from "zod";

const createSchema = z
  .object({
    name: z.string().trim().min(1).max(128),
    description: z.string().trim().max(1000).optional(),
  })
  .strict();

export const dynamic = "force-dynamic";

export const GET = withAuth(async (_request, session) => {
  try {
    const collections = await listOwnedCollections(session.user.id);
    return NextResponse.json({
      collections: collections.map(toCollectionShape),
    });
  } catch (error) {
    console.error("Failed to list collections", error);
    return NextResponse.json(
      { error: "Failed to list collections" },
      { status: 500 },
    );
  }
});

export const POST = withAuth(async (request, session) => {
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid collection" }, { status: 400 });
  }

  try {
    const collection = await createOwnedCollection({
      ...parsed.data,
      userId: session.user.id,
    });
    return NextResponse.json(
      { collection: toCollectionShape(collection) },
      { status: 201 },
    );
  } catch (error) {
    console.error("Failed to create collection", error);
    return NextResponse.json(
      { error: "Failed to create collection" },
      { status: 500 },
    );
  }
});
