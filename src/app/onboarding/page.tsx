import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";
import { getSession } from "auth/server";
import { userRepository } from "lib/db/repository";
import { redirect } from "next/navigation";
import React from "react";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const session = await getSession();
  if (!session?.user?.id) redirect("/sign-in?callbackUrl=%2Fonboarding");

  const preferences = await userRepository.getPreferences(session.user.id);
  if (preferences?.onboarding?.step === "done") {
    // The route verifies persisted completion before setting the device cookie.
    redirect("/api/onboarding/complete");
  }

  const initialStep =
    preferences?.onboarding?.step === "connect_tools" ||
    preferences?.onboarding?.step === "connect_rube"
      ? "connect_tools"
      : "automation_overview";

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <OnboardingWizard initialStep={initialStep} />
    </main>
  );
}
