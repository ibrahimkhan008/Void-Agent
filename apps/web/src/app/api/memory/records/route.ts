import { listUserRecords } from "@/lib/db/pg/repositories/user-records-repository.pg";
import { withAuth } from "auth/route-guard";

/** GET — the five global Void Memory records (auto-seeded on first visit). */
export const GET = withAuth(async (_request, session) => {
  const records = await listUserRecords(session.user.id);
  return Response.json({ records });
});
