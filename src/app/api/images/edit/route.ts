import { isFreeTier } from "app-types/subscription";
import { getSession } from "auth/server";
import { editImageWithFlare } from "lib/ai/image/edit-image";
import {
  DEFAULT_IMAGE_EDIT_MODEL,
  IMAGE_EDIT_MODEL_MAP,
} from "lib/ai/image/edit-models";
import {
  GatewayInpaintInputError,
  GatewayInpaintProviderError,
  generateGatewayInpaint,
  isGatewayInpaintConfigured,
} from "lib/ai/image/gateway-inpaint";
import {
  ImageEditRequestError,
  readImageEditRequest,
} from "lib/ai/image/image-edit-request";
import { validateProviderImageBytes } from "lib/ai/image/provider-image";
import { loadOwnedImageForEdit } from "lib/ai/tools/image/image-source";
import { userRepository } from "lib/db/repository";
import { serverFileStorage } from "lib/file-storage";
import {
  isManagedStorageKey,
  isUserStorageKey,
  storageKeyFromUrl,
} from "lib/file-storage/storage-utils";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import {
  canUseFreeTierImageEdit,
  getFreeTierLimits,
  recordFreeTierImageEditSuccess,
} from "lib/rate-limit/free-tier-usage";
import logger from "logger";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Extend timeout for polling-based models (up to 5 minutes)
export const maxDuration = 300;

export async function GET() {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(
    { maskedEditingAvailable: isGatewayInpaintConfigured() },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function POST(request: Request) {
  try {
    const session = await getSession();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const currentUser = await userRepository.getUserById(session.user.id);
    const enforceFreeLimits = isFreeTier(currentUser?.tier);
    if (enforceFreeLimits) {
      const check = await canUseFreeTierImageEdit(session.user.id);
      if (!check.allowed) {
        const limits = await getFreeTierLimits();
        return NextResponse.json(
          {
            error: `Free plan allows ${limits.dailyImageEdits} image edits per day. Upgrade to continue.`,
            code: "free-tier-image-edit-limit-exceeded",
          },
          { status: 429 },
        );
      }
    }

    let body: unknown;
    try {
      body = await readImageEditRequest(request);
    } catch (error) {
      if (error instanceof ImageEditRequestError) {
        return NextResponse.json(
          { error: error.message },
          { status: error.status },
        );
      }
      throw error;
    }
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return NextResponse.json(
        { error: "Invalid image edit request." },
        { status: 400 },
      );
    }
    const {
      imageBase64,
      imageMimeType,
      imageUrl,
      maskUrl,
      prompt,
      model,
      size,
    } = body as Record<string, unknown>;

    if (!imageBase64 && !imageUrl) {
      return NextResponse.json(
        { error: "An image source is required" },
        { status: 400 },
      );
    }

    if (typeof prompt !== "string" || !prompt.trim() || prompt.length > 4_000) {
      return NextResponse.json(
        { error: "prompt is required" },
        { status: 400 },
      );
    }

    const selectedModel =
      typeof model === "string" && IMAGE_EDIT_MODEL_MAP[model]
        ? model
        : DEFAULT_IMAGE_EDIT_MODEL;
    const modelConfig = IMAGE_EDIT_MODEL_MAP[selectedModel];
    const provider = modelConfig?.provider || "flare";

    logger.info(
      `Image edit request: model=${selectedModel}, provider=${provider}`,
    );

    let result;
    if (maskUrl) {
      if (!isGatewayInpaintConfigured()) {
        return NextResponse.json(
          {
            error: "Masked edits require AI_GATEWAY_API_KEY to be configured.",
          },
          { status: 503 },
        );
      }
      if (
        typeof imageUrl !== "string" ||
        typeof maskUrl !== "string" ||
        imageUrl.length > 4096 ||
        maskUrl.length > 4096
      ) {
        return NextResponse.json(
          { error: "Masked edits require uploaded source and mask images." },
          { status: 400 },
        );
      }
      const sourceKey = storageKeyFromUrl(imageUrl);
      const maskKey = storageKeyFromUrl(maskUrl);
      if (
        !sourceKey ||
        !maskKey ||
        !isManagedStorageKey(sourceKey) ||
        !isManagedStorageKey(maskKey) ||
        !isUserStorageKey(sourceKey, session.user.id) ||
        !isUserStorageKey(maskKey, session.user.id)
      ) {
        return NextResponse.json(
          { error: "Masked edits require images uploaded to this account." },
          { status: 403 },
        );
      }
      const maskLimit = await checkApiRateLimit({
        kind: "image-mask-edit",
        id: session.user.id,
        limit: 20,
        windowMs: 60 * 60 * 1000,
      });
      if (!maskLimit.allowed) {
        return NextResponse.json(
          { error: "Masked image edits are temporarily rate limited." },
          {
            status: 429,
            headers: {
              "Retry-After": String(Math.ceil(maskLimit.retryAfterMs / 1000)),
              "Cache-Control": "private, no-store",
            },
          },
        );
      }
      const [source, mask] = await Promise.all([
        loadOwnedImageForEdit(
          {
            url: imageUrl,
            mimeType:
              typeof imageMimeType === "string" ? imageMimeType : "image/png",
          },
          session.user.id,
          request.signal,
        ),
        loadOwnedImageForEdit(
          { url: maskUrl, mimeType: "image/png" },
          session.user.id,
          request.signal,
        ),
      ]);
      try {
        result = await generateGatewayInpaint({
          imageBase64: source.base64,
          maskBase64: mask.base64,
          imageMimeType: source.mimeType,
          prompt,
          abortSignal: request.signal,
        });
      } catch (error) {
        if (error instanceof GatewayInpaintInputError) {
          return NextResponse.json({ error: error.message }, { status: 400 });
        }
        if (error instanceof GatewayInpaintProviderError) {
          return NextResponse.json({ error: error.message }, { status: 502 });
        }
        throw error;
      }
    } else {
      // Preserve the existing single-image Flare edit path.
      let validatedImage;
      try {
        if (typeof imageBase64 !== "string") {
          throw new Error("Image data is required.");
        }
        const bytes = Buffer.from(imageBase64, "base64");
        if (bytes.toString("base64") !== imageBase64) {
          throw new Error("Image data is malformed.");
        }
        validatedImage = validateProviderImageBytes(
          bytes,
          typeof imageMimeType === "string" ? imageMimeType : "image/png",
        );
      } catch (validationError) {
        return NextResponse.json(
          {
            error:
              validationError instanceof Error
                ? validationError.message
                : "Invalid image data.",
          },
          { status: 400 },
        );
      }
      result = await editImageWithFlare({
        imageBase64: validatedImage.base64,
        imageMimeType: validatedImage.mimeType,
        prompt,
        model: selectedModel,
        size: typeof size === "string" ? size : undefined,
        abortSignal: request.signal,
      });
    }

    // Upload edited images to storage
    const uploadedImages = await Promise.all(
      result.images.map(async (img) => {
        if (img.base64) {
          try {
            const uploaded = await serverFileStorage.upload(
              Buffer.from(img.base64, "base64"),
              {
                contentType: img.mimeType || "image/png",
                ownerId: session.user.id,
              },
            );
            return {
              url: uploaded.sourceUrl,
              mimeType: img.mimeType,
            };
          } catch (err) {
            logger.error("Failed to upload edited image", err);
            // Fall back to original URL if upload fails
            return { url: img.url, mimeType: img.mimeType };
          }
        }
        return { url: img.url, mimeType: img.mimeType };
      }),
    );

    if (enforceFreeLimits && uploadedImages.length > 0) {
      await recordFreeTierImageEditSuccess(session.user.id);
    }

    return NextResponse.json({
      images: uploadedImages,
      model: result.model,
    });
  } catch (error) {
    logger.error("Image edit failed", error);
    return NextResponse.json(
      { error: "Image edit failed. Please try again." },
      { status: 500 },
    );
  }
}
