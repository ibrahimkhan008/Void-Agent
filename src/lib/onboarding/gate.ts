export type OnboardingGate = "allow" | "sync-cookie" | "redirect";

/** The database remains authoritative when a device has no completion cookie. */
export function resolveOnboardingGate(input: {
  hasCompletionCookie: boolean;
  step?: string | null;
}): OnboardingGate {
  if (input.hasCompletionCookie) return "allow";
  if (input.step === "done") return "sync-cookie";
  return "redirect";
}
