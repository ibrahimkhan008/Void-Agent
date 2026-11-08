import { describe, expect, it } from "vitest";
import { UserPreferencesZodSchema } from "./user";

describe("onboarding user preferences", () => {
  it("accepts the new onboarding state alongside existing preference fields", () => {
    const result = UserPreferencesZodSchema.safeParse({
      savedNotes: [{ id: "note-1" }],
      skills: [{ id: "skill-1" }],
      notifications: { backgroundChatAlerts: true },
      onboarding: {
        step: "done",
        completedAt: "2026-11-08T10:00:00.000Z",
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.onboarding?.step).toBe("done");
    }
  });

  it("rejects malformed setup state and non-ISO completion timestamps", () => {
    expect(
      UserPreferencesZodSchema.safeParse({ onboarding: { step: "unknown" } })
        .success,
    ).toBe(false);
    expect(
      UserPreferencesZodSchema.safeParse({
        onboarding: { step: "done", completedAt: "yesterday" },
      }).success,
    ).toBe(false);
  });
});
