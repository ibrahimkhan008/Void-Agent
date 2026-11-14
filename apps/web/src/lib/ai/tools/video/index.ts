import { trackUsage } from "@/lib/gate";
import { tool as createTool } from "ai";
import { serverFileStorage } from "lib/file-storage";
import logger from "logger";
import { z } from "zod";

/**
 * Video generation tool (master prompt §3.7 Void Motion — the AI-video slice):
 * text-to-video through the Gemini API (Veo). Runs through the SAME chat UI —
 * the user's prompt carries the clip length and dimensions, and the finished
 * MP4 lands in the thread like an image does.
 *
 * The model call is a long-running operation: POST → poll → fetch. Total wall
 * time is typically 20 s–2 min for an 8 s clip. The chat stream keeps the
 * tool-call part visible while it runs.
 */

export const VideoToolName = "video-generator";

const VEO_MODEL =
  process.env.VIDEO_GENERATION_MODEL || "veo-3.0-generate-preview";
const GEMINI_API_BASE =
  process.env.GEMINI_API_BASE ||
  "https://generativelanguage.googleapis.com/v1beta";

const POLL_INTERVAL_MS = 10_000;
const POLL_TIMEOUT_MS = 5 * 60_000;

type VeoAspectRatio = "16:9" | "9:16";

/** Veo only supports 16:9 and 9:16 — map the requested dimensions to one. */
function pickAspectRatio(width: number, height: number): VeoAspectRatio {
  return width >= height ? "16:9" : "9:16";
}

export const createVideoTool = (
  billingCustomerId?: string | null,
  threadId?: string,
) => {
  return createTool({
    description:
      "Generate a short video clip from a text prompt using Veo. Call this whenever the user asks for a video, an animation clip, or motion footage. The clip length and dimensions come from the user's request; omit them for the defaults.",
    inputSchema: z.object({
      prompt: z
        .string()
        .min(1)
        .describe(
          "What the video shows, in concrete visual language: subjects, action, camera, mood.",
        ),
      durationSeconds: z
        .number()
        .int()
        .min(4)
        .max(8)
        .nullable()
        .default(8)
        .describe(
          "Clip length in seconds. Clamps to the model's supported range.",
        ),
      width: z
        .number()
        .int()
        .min(256)
        .max(1920)
        .nullable()
        .default(1280)
        .describe(
          "Requested frame width in px; mapped to the nearest supported aspect ratio.",
        ),
      height: z
        .number()
        .int()
        .min(256)
        .max(1080)
        .nullable()
        .default(720)
        .describe(
          "Requested frame height in px; mapped to the nearest supported aspect ratio.",
        ),
    }),
    execute: async ({ prompt, durationSeconds, width, height }, options) => {
      const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
      if (!apiKey) {
        return {
          error:
            "Video generation is not configured on this deployment (missing GOOGLE_GENERATIVE_AI_API_KEY).",
        };
      }

      const aspect = pickAspectRatio(width ?? 1280, height ?? 720);
      const duration = Math.min(Math.max(durationSeconds ?? 8, 4), 8);

      logger.info(
        `[Video Tool] Generating ${duration}s ${aspect} clip with ${VEO_MODEL}: ${JSON.stringify(prompt.slice(0, 120))}`,
      );

      try {
        // 1. Kick off the long-running generation.
        const startResponse = await fetch(
          `${GEMINI_API_BASE}/models/${VEO_MODEL}:predictLongRunning`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": apiKey,
            },
            signal: options?.abortSignal,
            body: JSON.stringify({
              instances: [{ prompt }],
              parameters: {
                aspectRatio: aspect,
                durationSeconds,
                personGeneration: "allow_all",
              },
            }),
          },
        );

        if (!startResponse.ok) {
          const detail = await startResponse.text().catch(() => "");
          logger.error(
            `[Video Tool] Generation start failed ${startResponse.status}: ${detail.slice(0, 200)}`,
          );
          return {
            error: `Video generation failed to start (${startResponse.status}).`,
          };
        }

        const started = (await startResponse.json()) as { name?: string };
        const operationName = started.name;
        if (!operationName) {
          return { error: "Video generation did not return an operation." };
        }

        // 2. Poll the operation until done (10 s interval, 5 min ceiling).
        let videoUri: string | undefined;
        const deadline = Date.now() + POLL_TIMEOUT_MS;
        while (Date.now() < deadline) {
          if (options?.abortSignal?.aborted) {
            return { error: "Video generation was cancelled." };
          }
          await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

          const pollResponse = await fetch(
            `${GEMINI_API_BASE}/${operationName}`,
            {
              headers: { "x-goog-api-key": apiKey },
              signal: options?.abortSignal,
            },
          );
          if (!pollResponse.ok) continue;

          const operation = (await pollResponse.json()) as {
            done?: boolean;
            error?: { message?: string };
            response?: {
              generateVideoResponse?: {
                generatedSamples?: Array<{ video?: { uri?: string } }>;
              };
            };
          };

          if (operation.error) {
            return {
              error: operation.error.message ?? "Video generation failed.",
            };
          }
          if (!operation.done) continue;

          videoUri =
            operation.response?.generateVideoResponse?.generatedSamples?.[0]
              ?.video?.uri;
          break;
        }

        if (!videoUri) {
          return { error: "Video generation timed out. Try again." };
        }

        // 3. Fetch the MP4 bytes (the file URI needs the API key).
        const videoResponse = await fetch(videoUri, {
          headers: { "x-goog-api-key": apiKey },
          signal: options?.abortSignal,
        });
        if (!videoResponse.ok) {
          return { error: "Could not fetch the generated video." };
        }
        const bytes = new Uint8Array(await videoResponse.arrayBuffer());

        // 4. Store it, so the link in the thread is stable.
        const stamp = Date.now();
        const key = `videos/${threadId ?? "direct"}/${stamp}-${aspect.replace(":", "x")}.mp4`;
        const uploaded = await serverFileStorage.upload(bytes, {
          contentType: "video/mp4",
          filename: `void-motion-${stamp}.mp4`,
          userId: billingCustomerId ?? undefined,
          uploadType: "ai-generated",
        });
        const videoUrl =
          typeof uploaded === "string"
            ? uploaded
            : ((uploaded as { url?: string }).url ?? videoUri);

        // 5. Usage gate (mirrors the image tool).
        if (billingCustomerId) {
          void trackUsage({
            kind: "tokens",
            customerId: billingCustomerId,
            modelId: VEO_MODEL,
            // Video seconds are the billable unit — 1s ≈ 1000 tokens keeps the
            // existing token-based usage accounting meaningful.
            promptTokens: duration * 1000,
            completionTokens: 0,
            idempotencyKey: `video-${threadId ?? "direct"}-${stamp}`,
            properties: {
              threadId: threadId,
              durationSeconds: duration,
              aspectRatio: aspect,
            },
          }).catch(() => undefined);
        }

        return {
          videoUrl: videoUrl ?? videoUri,
          mimeType: "video/mp4",
          durationSeconds: duration,
          aspectRatio: aspect,
          width: width ?? 1280,
          height: height ?? 720,
          model: VEO_MODEL,
          storageKey: key,
        };
      } catch (error) {
        logger.error("[Video Tool] Generation failed:", error);
        return {
          error:
            error instanceof Error && error.message.includes("abort")
              ? "Video generation was cancelled."
              : "Video generation failed. Try again.",
        };
      }
    },
  });
};
