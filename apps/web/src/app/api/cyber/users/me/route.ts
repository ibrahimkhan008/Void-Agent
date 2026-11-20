import { getSession } from "lib/auth/server";
import { getOrBootstrapCyberProfile } from "lib/cyber/auth";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const profile = await getOrBootstrapCyberProfile(session);
    return NextResponse.json({ profile: profile ?? null });
  } catch {
    return NextResponse.json(
      { error: "Void Cyber is unavailable", unavailable: true },
      { status: 503 },
    );
  }
}
