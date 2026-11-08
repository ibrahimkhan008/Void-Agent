import { getSession } from "auth/server";
import { getProjectStatusForUser } from "lib/ai/tools/project-status";
import { readBoundedJson } from "lib/notifications/contracts";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import { hasSameOrigin } from "lib/security/same-origin";
import {
  getAccessibleProjectStatusScope,
  getOwnedProjectThreadScope,
} from "lib/voice/project-status";
import { z } from "zod";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "private, no-store" };
const requestSchema = z
  .object({
    threadId: z.string().uuid().optional(),
    projectId: z.string().uuid().optional(),
    projectName: z.string().trim().min(1).max(200).optional(),
  })
  .strict()
  .refine(
    (value) =>
      Boolean(value.threadId || value.projectId || value.projectName) &&
      !(value.projectId && value.projectName),
    "Choose an active project chat or one project identifier.",
  );

/** Read project status through an owned, project-attached main chat thread. */
export async function POST(request: Request) {
  const session = await getSession();
  const userId = session?.user.id;
  if (!userId)
    return new Response("Unauthorized", { status: 401, headers: noStore });
  if (!hasSameOrigin(request))
    return new Response("Forbidden", { status: 403, headers: noStore });

  const rate = await checkApiRateLimit({
    kind: "voice-project-status",
    id: userId,
    limit: 30,
    windowMs: 60_000,
  });
  if (!rate.allowed)
    return new Response("Too many requests", { status: 429, headers: noStore });

  const body = await readBoundedJson(request, 1_024);
  if (!body.ok)
    return Response.json(
      { error: body.tooLarge ? "Request body too large" : "Invalid JSON" },
      { status: body.tooLarge ? 413 : 400, headers: noStore },
    );
  const parsed = requestSchema.safeParse(body.value);
  if (!parsed.success)
    return Response.json(
      { error: "Invalid chat thread" },
      { status: 400, headers: noStore },
    );

  try {
    const scope =
      parsed.data.projectId || parsed.data.projectName
        ? await getAccessibleProjectStatusScope(userId, {
            projectId: parsed.data.projectId,
            projectName: parsed.data.projectName,
          })
        : await getOwnedProjectThreadScope(userId, parsed.data.threadId);
    if (!scope)
      return Response.json(
        { error: "No project status is available for this chat." },
        { status: 404, headers: noStore },
      );

    const result = await getProjectStatusForUser({
      userId,
      projectId: scope.projectId,
      collectionIds: scope.collectionIds,
    });
    if (!result.success)
      return Response.json(
        { error: "No project status is available for this chat." },
        { status: 404, headers: noStore },
      );
    return Response.json(result, { headers: noStore });
  } catch {
    return Response.json(
      { error: "Project status could not be loaded." },
      { status: 503, headers: noStore },
    );
  }
}
