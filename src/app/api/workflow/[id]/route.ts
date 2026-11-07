import { getSession } from "auth/server";
import { createUserClient } from "lib/n8n/client";
import { ensureN8nUser } from "lib/n8n/provision";
import { readBoundedJson } from "lib/notifications/contracts";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";

export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await getSession();
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }
  const n8nUser = await ensureN8nUser(session);
  const workflow = await createUserClient(
    n8nUser.email ?? session.user.email ?? "",
    n8nUser.password ?? "",
  ).getWorkflow(id);
  return Response.json(workflow);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await getSession();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }
  try {
    const origin = request.headers.get("origin");
    if (!origin || new URL(origin).origin !== new URL(request.url).origin)
      return new Response("Forbidden", { status: 403 });
  } catch {
    return new Response("Forbidden", { status: 403 });
  }
  if (!/^[A-Za-z0-9_-]{1,128}$/u.test(id))
    return new Response("Invalid workflow ID", { status: 400 });
  const rate = await checkApiRateLimit({
    kind: "n8n-workflow-update",
    id: session.user.id,
    limit: 10,
    windowMs: 60_000,
  });
  if (!rate.allowed) return new Response("Too many requests", { status: 429 });
  const body = await readBoundedJson(request, 2_000);
  if (!body.ok)
    return new Response(body.tooLarge ? "Request too large" : "Invalid JSON", {
      status: body.tooLarge ? 413 : 400,
    });
  if (
    !body.value ||
    typeof body.value !== "object" ||
    Array.isArray(body.value) ||
    Object.keys(body.value).length !== 1 ||
    (body.value as Record<string, unknown>).active !== false
  ) {
    return Response.json(
      { error: "Workflow activation requires an explicit effect review." },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }

  const n8nUser = await ensureN8nUser(session);
  const workflow = await createUserClient(
    n8nUser.email ?? session.user.email ?? "",
    n8nUser.password ?? "",
  ).updateWorkflow(id, {
    active: false,
  });
  return Response.json(workflow);
}

export async function DELETE(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await getSession();
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }
  const n8nUser = await ensureN8nUser(session);
  await createUserClient(
    n8nUser.email ?? session.user.email ?? "",
    n8nUser.password ?? "",
  ).deleteWorkflow(id);
  return Response.json({ success: true });
}
