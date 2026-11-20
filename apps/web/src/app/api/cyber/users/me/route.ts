import { getSession } from "lib/auth/server";
import { parseRoleString } from "lib/auth/types";
import {
  getOrBootstrapCyberProfile,
  isCyberBootstrapAdmin,
} from "lib/cyber/auth";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const profile = await getOrBootstrapCyberProfile(session);
    return NextResponse.json({
      profile: profile ?? null,
      isPlatformAdmin: isCyberBootstrapAdmin(session.user),
      platformRole: parseRoleString(session.user.role) ?? null,
    });
  } catch (error) {
    // A missing cyber_* table (pending migration) or an unreachable database
    // must not be reported as "no access" — the admin would be told to ask
    // themselves for permission.
    console.error("[cyber] profile lookup failed", error);
    return NextResponse.json(
      {
        error:
          "Void Cyber is unavailable. Run the database migrations (pnpm db:migrate) and reload.",
        unavailable: true,
      },
      { status: 503 },
    );
  }
}
