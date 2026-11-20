import { getSession } from "lib/auth/server";
import { getOrBootstrapCyberProfile } from "lib/cyber/auth";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profile = await getOrBootstrapCyberProfile(session);
  return NextResponse.json({ profile: profile ?? null });
}
