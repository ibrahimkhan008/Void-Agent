import {
  applyProposal,
  rejectProposal,
} from "@/lib/db/pg/repositories/user-records-repository.pg";
import { withAuth } from "auth/route-guard";

/**
 * POST — resolve a proposal. `action: "approve"` applies it (project scope →
 * a new project-record revision; global scope → saveUserRecord); `reject`
 * keeps the audit trail. Only the user the proposal belongs to can resolve it.
 */
export const POST = withAuth(async (request, session, { params }) => {
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as {
    action?: "approve" | "reject";
  } | null;
  if (body?.action !== "approve" && body?.action !== "reject") {
    return Response.json(
      { error: "action must be approve or reject" },
      { status: 400 },
    );
  }
  try {
    if (body.action === "approve") {
      const result = await applyProposal(id, session.user.id);
      return Response.json(result);
    }
    await rejectProposal(id, session.user.id);
    return Response.json({ applied: false, rejected: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not resolve proposal";
    const notFound = /not found|already resolved/i.test(message);
    return Response.json({ error: message }, { status: notFound ? 404 : 422 });
  }
});
