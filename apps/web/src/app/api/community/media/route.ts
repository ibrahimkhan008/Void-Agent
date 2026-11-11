import { withAuth } from "auth/route-guard";
import { communityRepository } from "lib/community/community-repository.pg";
import {
  COMMUNITY_UPLOAD_BODY_MAX_BYTES,
  isValidCommunityMedia,
  readCommunityUploadBody,
  sanitizeCommunityFilename,
} from "lib/community/media-validation";
import { serverFileStorage } from "lib/file-storage";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import { hasSameOrigin } from "lib/security/same-origin";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export const POST = withAuth(async (request, session) => {
  if (!hasSameOrigin(request))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const limit = await checkApiRateLimit({
    kind: "community-media-upload",
    id: session.user.id,
    limit: 8,
    windowMs: 60 * 60_000,
  }).catch(() => null);
  if (!limit)
    return NextResponse.json(
      { error: "Community media is temporarily unavailable" },
      { status: 503 },
    );
  if (!limit.allowed)
    return NextResponse.json(
      { error: "Upload limit reached" },
      { status: 429 },
    );

  const rawContentLength = request.headers.get("content-length");
  const contentLength =
    rawContentLength === null ? null : Number(rawContentLength);
  if (
    contentLength !== null &&
    (!Number.isSafeInteger(contentLength) || contentLength < 0)
  ) {
    return NextResponse.json(
      { error: "Invalid upload length" },
      { status: 400 },
    );
  }
  if (
    contentLength !== null &&
    contentLength > COMMUNITY_UPLOAD_BODY_MAX_BYTES
  ) {
    return NextResponse.json(
      { error: "Media exceeds the 10 MB limit" },
      { status: 413 },
    );
  }

  let file: File;
  try {
    const boundedBody = await readCommunityUploadBody(request);
    if (!boundedBody) {
      return NextResponse.json(
        { error: "Media exceeds the 10 MB limit" },
        { status: 413 },
      );
    }
    const formRequest = new Request(request.url, {
      method: "POST",
      headers: { "content-type": request.headers.get("content-type") ?? "" },
      body: boundedBody,
    });
    const form = await formRequest.formData();
    const item = form.get("file");
    if (!(item instanceof File))
      return NextResponse.json(
        { error: "No media file provided" },
        { status: 400 },
      );
    file = item;
  } catch {
    return NextResponse.json({ error: "Invalid upload body" }, { status: 400 });
  }

  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  if (!isValidCommunityMedia(file.type, head, file.size)) {
    return NextResponse.json(
      { error: "Unsupported or invalid media file" },
      { status: 400 },
    );
  }

  let uploadedKey: string | undefined;
  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    const upload = await serverFileStorage.upload(bytes, {
      filename: sanitizeCommunityFilename(file.name),
      contentType: file.type,
      userId: session.user.id,
      uploadType: "attachment",
    });
    uploadedKey = upload.key;
    const media = await communityRepository.saveMedia({
      userId: session.user.id,
      storageKey: upload.key,
      filename: sanitizeCommunityFilename(file.name),
      contentType: file.type,
      size: file.size,
    });
    if (!media) throw new Error("Media metadata was not persisted");
    return NextResponse.json(
      {
        success: true,
        media: {
          id: media.id,
          url: `/api/community/media/${media.id}`,
          name: sanitizeCommunityFilename(file.name),
          contentType: file.type,
          size: file.size,
        },
      },
      { status: 201, headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (uploadedKey) {
      await serverFileStorage.delete(uploadedKey).catch((cleanupError) => {
        console.error(
          "Failed to clean up unregistered community media",
          cleanupError,
        );
      });
    }
    console.error("Failed to upload community media", error);
    return NextResponse.json(
      { error: "Failed to upload media" },
      { status: 500 },
    );
  }
});

export const DELETE = withAuth(async (request, session) => {
  if (!hasSameOrigin(request))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const limit = await checkApiRateLimit({
    kind: "community-media-delete",
    id: session.user.id,
    limit: 30,
    windowMs: 60_000,
  }).catch(() => null);
  if (!limit)
    return NextResponse.json(
      { error: "Community media is temporarily unavailable" },
      { status: 503 },
    );
  if (!limit.allowed)
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const mediaId = new URL(request.url).searchParams.get("id");
  if (!mediaId || !/^[0-9a-f-]{36}$/i.test(mediaId)) {
    return NextResponse.json({ error: "Invalid media id" }, { status: 400 });
  }
  try {
    const row = await communityRepository.deleteUnattachedMedia(
      session.user.id,
      mediaId,
    );
    if (!row)
      return NextResponse.json({ error: "Media not found" }, { status: 404 });
    await serverFileStorage.delete(row.storageKey);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete community media", error);
    return NextResponse.json(
      { error: "Failed to delete media" },
      { status: 500 },
    );
  }
});
