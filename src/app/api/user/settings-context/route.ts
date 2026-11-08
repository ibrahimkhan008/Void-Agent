import { getSession } from "auth/server";
import { getUser, getUserAccounts } from "lib/user/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
const noStoreHeaders = { "Cache-Control": "no-store" };

/** Self-scoped profile context for the settings drawer, loaded only when opened. */
export async function GET() {
  const session = await getSession();
  if (!session?.user.id)
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: noStoreHeaders },
    );

  try {
    const [user, accounts] = await Promise.all([
      getUser(session.user.id),
      getUserAccounts(session.user.id),
    ]);
    if (!user)
      return NextResponse.json(
        { error: "Not found" },
        { status: 404, headers: noStoreHeaders },
      );

    return NextResponse.json(
      {
        currentUserId: session.user.id,
        user,
        userAccountInfo: {
          hasPassword: accounts.hasPassword,
          oauthProviders: accounts.oauthProviders,
        },
      },
      { headers: noStoreHeaders },
    );
  } catch (error) {
    console.error("Failed to load settings context:", error);
    return NextResponse.json(
      { error: "Failed to load settings context" },
      { status: 500, headers: noStoreHeaders },
    );
  }
}
