import {
  getOwnedCollection,
  ingestOwnedCollectionFile,
  ingestOwnedCollectionText,
  listOwnedCollectionItems,
} from "@/lib/collections/collection-service";
import { validateCollectionFile } from "@/lib/collections/file-validation";
import { downloadPublicTextUrl } from "@/lib/collections/secure-url-ingest";
import { readBoundedRequestBody } from "@/lib/http/bounded-request-body";
import { hasSameOrigin } from "@/lib/security/same-origin";
import { withAuth } from "auth/route-guard";
import { NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_FORM_BYTES = MAX_FILE_BYTES + 256 * 1024;
const MAX_TEXT_CHARS = 500_000;
const MAX_JSON_BYTES = 600 * 1024;
const itemRequestSchema = z.union([
  z
    .object({
      text: z.string().trim().min(1).max(MAX_TEXT_CHARS),
      filename: z.string().trim().min(1).max(255).optional(),
    })
    .strict(),
  z.object({ url: z.string().url().max(2_048) }).strict(),
]);
async function readJsonBody(request: Request) {
  const bytes = await readBoundedRequestBody(request, MAX_JSON_BYTES);
  if (!bytes) return { tooLarge: true as const };
  try {
    return { body: JSON.parse(new TextDecoder().decode(bytes)) as unknown };
  } catch {
    return { invalid: true as const };
  }
}

export const GET = withAuth(async (request, session, { params }) => {
  const { id } = await params;
  try {
    const cursor = new URL(request.url).searchParams.get("cursor") ?? undefined;
    if (cursor && (cursor.length > 512 || /[\u0000-\u001f]/u.test(cursor))) {
      return NextResponse.json({ error: "Invalid cursor" }, { status: 400 });
    }
    const result = await listOwnedCollectionItems({
      id,
      userId: session.user.id,
      cursor,
    });
    if (!result)
      return NextResponse.json(
        { error: "Collection not found" },
        { status: 404 },
      );
    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    console.error("Failed to list collection items", error);
    return NextResponse.json(
      { error: "Failed to list collection items" },
      { status: 502 },
    );
  }
});

export const POST = withAuth(async (request, session, { params }) => {
  if (!hasSameOrigin(request))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const collection = await getOwnedCollection(id, session.user.id);
  if (!collection)
    return NextResponse.json(
      { error: "Collection not found" },
      { status: 404 },
    );
  if (!process.env.AGENTSET_API_KEY) {
    return NextResponse.json(
      { error: "Collection ingestion is not configured" },
      { status: 503 },
    );
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.toLowerCase().startsWith("multipart/form-data")) {
    const bytes = await readBoundedRequestBody(request, MAX_FORM_BYTES);
    if (!bytes)
      return NextResponse.json(
        { error: "Upload exceeds the size limit" },
        { status: 413 },
      );
    try {
      const boundedBody = new Uint8Array(bytes.byteLength);
      boundedBody.set(bytes);
      const form = await new Request(request.url, {
        method: "POST",
        headers: request.headers,
        body: boundedBody.buffer,
      }).formData();
      const value = form.get("file");
      if (!(value instanceof File))
        return NextResponse.json(
          { error: "A file is required" },
          { status: 400 },
        );
      if (value.size > MAX_FILE_BYTES)
        return NextResponse.json(
          { error: "File exceeds the 20 MiB limit" },
          { status: 413 },
        );
      const validation = await validateCollectionFile(value);
      if (!validation.valid)
        return NextResponse.json({ error: validation.reason }, { status: 415 });
      const result = await ingestOwnedCollectionFile({
        id,
        userId: session.user.id,
        file: value,
        filename: value.name,
        contentType: validation.contentType,
      });
      if (!result)
        return NextResponse.json(
          { error: "Collection not found" },
          { status: 404 },
        );
      return NextResponse.json(result, {
        status: 202,
        headers: { "Cache-Control": "private, no-store" },
      });
    } catch (error) {
      console.error("Failed to ingest collection file", error);
      return NextResponse.json(
        { error: "File ingestion failed" },
        { status: 502 },
      );
    }
  }

  if (!contentType.toLowerCase().includes("application/json")) {
    return NextResponse.json(
      { error: "Use JSON or multipart/form-data" },
      { status: 415 },
    );
  }
  const parsedBody = await readJsonBody(request);
  if ("tooLarge" in parsedBody)
    return NextResponse.json(
      { error: "Request is too large" },
      { status: 413 },
    );
  if ("invalid" in parsedBody)
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  const parsed = itemRequestSchema.safeParse(parsedBody.body);
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid collection item" },
      { status: 400 },
    );

  try {
    if ("text" in parsed.data) {
      const filename = parsed.data.filename ?? "pasted-text.txt";
      const result = await ingestOwnedCollectionText({
        id,
        userId: session.user.id,
        text: parsed.data.text,
        filename,
      });
      if (!result)
        return NextResponse.json(
          { error: "Collection not found" },
          { status: 404 },
        );
      return NextResponse.json(result, {
        status: 202,
        headers: { "Cache-Control": "private, no-store" },
      });
    }

    const source = await downloadPublicTextUrl(parsed.data.url);
    const filename = `${new URL(parsed.data.url).hostname}.txt`.slice(0, 255);
    const result = await ingestOwnedCollectionText({
      id,
      userId: session.user.id,
      text: source.text,
      filename,
      sourceOrigin: source.sourceOrigin,
    });
    if (!result)
      return NextResponse.json(
        { error: "Collection not found" },
        { status: 404 },
      );
    return NextResponse.json(result, {
      status: 202,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    const message = error instanceof Error ? error.message : "";
    if (
      name === "UrlBlockedError" ||
      message.startsWith("URL ") ||
      message.includes("URL source")
    ) {
      return NextResponse.json(
        { error: message.slice(0, 160) || "URL source was rejected" },
        { status: 422 },
      );
    }
    console.error("Failed to ingest collection item", error);
    return NextResponse.json(
      { error: "Collection item ingestion failed" },
      { status: 502 },
    );
  }
});
