import { pgDb } from "@/lib/db/pg/db.pg";
import { UserTable } from "@/lib/db/pg/schema.pg";
import { getDevicesPayload } from "@/lib/plan/devices";
import { getSession } from "auth/server";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** GET /api/devices — the Void Devices payload for the signed-in user. */
export const GET = async () => {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const [userRow] = await pgDb
    .select({ tier: UserTable.tier })
    .from(UserTable)
    .where(eq(UserTable.id, session.user.id))
    .limit(1);
  const payload = await getDevicesPayload(
    session.user.id,
    userRow?.tier ?? null,
  );
  return NextResponse.json(payload);
};
