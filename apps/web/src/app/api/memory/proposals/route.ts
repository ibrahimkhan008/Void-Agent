import { listPendingProposals } from "@/lib/db/pg/repositories/user-records-repository.pg";
import { withAuth } from "auth/route-guard";

/** GET — pending agent record proposals awaiting the user's approval. */
export const GET = withAuth(async (_request, session) => {
  const proposals = await listPendingProposals(session.user.id);
  return Response.json({ proposals });
});
