import { describe, expect, it } from "vitest";
import {
  TEAM_INVITATION_TTL_MS,
  createTeamInvitationToken,
  hashTeamInvitationEmail,
  hashTeamInvitationToken,
  normalizeInvitationEmail,
} from "./team-invitations";

describe("team invitation token primitives", () => {
  it("creates high-entropy URL-safe tokens and stores only a fixed digest", () => {
    const token = createTeamInvitationToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const digest = hashTeamInvitationToken(token);
    expect(digest).toMatch(/^[a-f0-9]{64}$/);
    expect(digest).not.toContain(token);
    expect(hashTeamInvitationToken(token)).toBe(digest);
    expect(hashTeamInvitationToken(createTeamInvitationToken())).not.toBe(
      digest,
    );
  });

  it("normalizes addresses for case-insensitive invitation matching", () => {
    expect(normalizeInvitationEmail("  Team.User+One@Example.TEST ")).toBe(
      "team.user+one@example.test",
    );
    expect(hashTeamInvitationEmail(" Person@Example.test ")).toBe(
      hashTeamInvitationEmail("person@example.test"),
    );
    expect(hashTeamInvitationEmail("person@example.test")).not.toContain(
      "person@example.test",
    );
  });

  it("uses a bounded seven-day expiration", () => {
    expect(TEAM_INVITATION_TTL_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });
});
