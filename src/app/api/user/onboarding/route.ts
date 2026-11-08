import { getSession } from "auth/server";
import { userRepository } from "lib/db/repository";
import { readBoundedJson } from "lib/notifications/contracts";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import { hasSameOrigin } from "lib/security/same-origin";
import { NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

const onboardingStepUpdateSchema = z
  .object({
    step: z.enum(["automation_overview", "connect_tools", "done"]),
  })
  .strict();

const noStoreHeaders = { "Cache-Control": "private, no-store" };

/** Persist only onboarding state, preserving the caller's other preferences. */
export async function POST(request: Request) {
  if (!hasSameOrigin(request))
    return new Response("Forbidden", { status: 403 });

  const session = await getSession();
  if (!session?.user?.id)
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: noStoreHeaders },
    );

  const rate = await checkApiRateLimit({
    kind: "user-onboarding",
    id: session.user.id,
    limit: 20,
    windowMs: 60_000,
  });
  if (!rate.allowed)
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: noStoreHeaders },
    );

  const body = await readBoundedJson(request, 1_000);
  if (!body.ok)
    return NextResponse.json(
      { error: body.tooLarge ? "Request too large" : "Invalid JSON" },
      { status: body.tooLarge ? 413 : 400, headers: noStoreHeaders },
    );

  const parsed = onboardingStepUpdateSchema.safeParse(body.value);
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid onboarding state" },
      { status: 400, headers: noStoreHeaders },
    );

  try {
    const onboarding = {
      step: parsed.data.step,
      ...(parsed.data.step === "done"
        ? { completedAt: new Date().toISOString() }
        : {}),
    } as const;
    await userRepository.updateOnboardingPreference(
      session.user.id,
      onboarding,
    );
    return NextResponse.json(
      { success: true, onboarding },
      { headers: noStoreHeaders },
    );
  } catch {
    return NextResponse.json(
      { error: "Failed to update onboarding" },
      { status: 500, headers: noStoreHeaders },
    );
  }
}
