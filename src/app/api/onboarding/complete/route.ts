import { getSession } from "auth/server";
import { userRepository } from "lib/db/repository";
import { hasSameOrigin } from "lib/security/same-origin";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const noStoreHeaders = { "Cache-Control": "private, no-store" };

async function isOnboardingComplete(userId: string) {
  const preferences = await userRepository.getPreferences(userId);
  return preferences?.onboarding?.step === "done";
}

function setCompletionCookie(response: NextResponse) {
  response.cookies.set("onboarding_complete", "1", {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  });
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

/** Set the device cookie after verifying the server-side completion state. */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session?.user?.id)
    return new Response("Unauthorized", {
      status: 401,
      headers: noStoreHeaders,
    });

  try {
    if (!(await isOnboardingComplete(session.user.id))) {
      return NextResponse.redirect(new URL("/onboarding", request.url), 303);
    }
    return setCompletionCookie(
      NextResponse.redirect(new URL("/", request.url), 303),
    );
  } catch {
    return new Response("Unable to verify onboarding", {
      status: 503,
      headers: noStoreHeaders,
    });
  }
}

/** Backfill the same cookie on new devices without navigating away from a page. */
export async function POST(request: Request) {
  if (!hasSameOrigin(request))
    return new Response("Forbidden", { status: 403 });
  const session = await getSession();
  if (!session?.user?.id)
    return new Response("Unauthorized", {
      status: 401,
      headers: noStoreHeaders,
    });

  try {
    if (!(await isOnboardingComplete(session.user.id))) {
      return NextResponse.json(
        { error: "Onboarding is not complete" },
        { status: 409, headers: noStoreHeaders },
      );
    }
    return setCompletionCookie(NextResponse.json({ success: true }));
  } catch {
    return NextResponse.json(
      { error: "Unable to verify onboarding" },
      { status: 503, headers: noStoreHeaders },
    );
  }
}
