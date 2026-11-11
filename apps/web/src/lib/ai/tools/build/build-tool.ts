import { randomUUID } from "node:crypto";
import { tool } from "ai";
import { executeAppBuild, resumeAppBuild } from "lib/ai/app-build-runner";
import {
  type AppBuildMode,
  clarifyAppPrompt,
  isAppBuilderConfigured,
} from "lib/ai/app-builder";
import { pgAppBuildRepository } from "lib/db/pg/repositories/app-build-repository.pg";
import { requireBillingContext } from "lib/gate";
import logger from "lib/logger";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import { after } from "next/server";
import { z } from "zod";

export const buildAppTool = (ctx: { userId: string; threadId: string }) =>
  tool({
    description:
      "Build a small interactive web app for the user and host it in an isolated E2B preview. Use this for a runnable app request, not for code explanations. Generated files are limited to the preinstalled Next.js template and are never executed as shell commands. If the user wants to revisit an app built earlier in this conversation, pass its buildId to bring it back instead of rebuilding.",
    inputSchema: z.object({
      prompt: z.string().trim().min(1).max(4000),
      mode: z
        .enum(["static", "agent"])
        .optional()
        .describe(
          "How to build. 'static' (default) is one fast generation pass. 'agent' runs a bounded multi-pass generate-review-refine loop before provisioning — slower, but better for anything substantial. Prefer 'agent' when the user asks for something complex or says a previous attempt was wrong.",
        ),
      skipQuestions: z
        .boolean()
        .optional()
        .describe(
          "Set true to build immediately without asking the user anything. Leave unset the first time you build something substantial — the tool may come back with questions worth asking.",
        ),
      buildId: z
        .string()
        .optional()
        .describe(
          "Existing build id to resume. Only set this to bring back an app built earlier; omit it for a new app.",
        ),
    }),
    execute: async ({
      prompt,
      mode,
      skipQuestions,
      buildId,
    }: {
      prompt: string;
      mode?: "static" | "agent";
      skipQuestions?: boolean;
      buildId?: string;
    }) => {
      if (!isAppBuilderConfigured()) {
        return {
          error: "unavailable",
          message: "The app builder is not configured.",
        };
      }
      try {
        const rate = await checkApiRateLimit({
          kind: "app-builder",
          id: ctx.userId,
          limit: 3,
          windowMs: 60_000,
        });
        if (!rate.allowed)
          return { error: "rate_limited", message: "Build limit reached." };
        const billing = await requireBillingContext();

        // Resume an existing build instead of spending a new sandbox, when the
        // id is known to this user. Ownership is enforced by the repository and
        // re-verified inside resumeAppBuild.
        if (buildId) {
          const existing = await pgAppBuildRepository.getForOwner(
            buildId,
            ctx.userId,
          );
          if (existing && existing.files.length > 0) {
            const resumed = await pgAppBuildRepository.beginResumeForOwner(
              buildId,
              ctx.userId,
              2,
            );
            if (!resumed) {
              return {
                error: "resume_unavailable",
                message:
                  "That build is already active or cannot be resumed right now.",
              };
            }
            try {
              after(async () => {
                try {
                  await resumeAppBuild({
                    build: resumed,
                    userId: ctx.userId,
                    customerId: billing.customerId,
                    entityId: billing.entityId,
                  });
                } catch (error) {
                  logger.error(
                    "Chat app build resume failed",
                    error instanceof Error ? error.name : "UnknownError",
                  );
                }
              });
            } catch {
              await pgAppBuildRepository
                .updateActiveForOwner(buildId, ctx.userId, {
                  status: "failed",
                  error: "Resume could not be scheduled.",
                })
                .catch(() => null);
              return {
                error: "build_unavailable",
                message: "The app could not be resumed. Try again later.",
              };
            }
            return {
              buildId,
              status: "provisioning",
              message:
                "Bringing your app back online. Open App Builder to view the preview.",
            };
          }
          // Unknown id for this user — fall through and build fresh.
        }

        // Ask before spending a sandbox on a guess. Text-only call, so this is
        // cheap; it only interrupts when the answer would change the app.
        if (!skipQuestions) {
          const check = await clarifyAppPrompt(
            prompt,
            AbortSignal.timeout(30_000),
          );
          if (!check.readyToBuild && check.questions.length) {
            return {
              needsAnswers: true,
              questions: check.questions,
              assumptions: check.assumptions,
              message:
                "Before building, I need to know:\n" +
                check.questions
                  .map((question, index) => `${index + 1}. ${question}`)
                  .join("\n") +
                '\n\nAnswer these and rebuild — or say "just build it" and I\'ll pick sensible defaults.',
            };
          }
        }

        const admission = await pgAppBuildRepository.createIfCapacity({
          id: randomUUID(),
          userId: ctx.userId,
          threadId: ctx.threadId,
          prompt,
          activeLimit: 2,
        });
        if (admission.status === "thread_not_found") {
          return {
            error: "not_found",
            message: "The conversation is unavailable.",
          };
        }
        if (admission.status === "active_limit") {
          return {
            error: "too_many_active",
            message: "Two builds are already active.",
          };
        }
        const { build } = admission;
        const buildMode: AppBuildMode = mode === "agent" ? "agent" : "static";
        // Persist first and let the request-bound background task provision
        // the sandbox. The chat response must not wait on provider or E2B work.
        try {
          after(async () => {
            try {
              await executeAppBuild({
                buildId: build.id,
                userId: ctx.userId,
                threadId: ctx.threadId,
                prompt,
                customerId: billing.customerId,
                entityId: billing.entityId,
                mode: buildMode,
              });
            } catch (error) {
              logger.error(
                "Chat app build execution failed",
                error instanceof Error ? error.name : "UnknownError",
              );
            }
          });
        } catch {
          await pgAppBuildRepository
            .updateActiveForOwner(build.id, ctx.userId, {
              status: "failed",
              error: "Build could not be scheduled.",
            })
            .catch(() => null);
          return {
            error: "build_unavailable",
            message: "The app build could not be scheduled. Try again later.",
          };
        }
        return {
          buildId: build.id,
          status: build.status,
          mode: buildMode,
          message:
            "Your app build is queued. Open App Builder to follow progress and view the preview.",
        };
      } catch {
        return {
          error: "build_failed",
          message: "The app could not be built. Try a smaller request.",
        };
      }
    },
  });
