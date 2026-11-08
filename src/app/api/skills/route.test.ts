import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  getPreferences: vi.fn(),
  updatePreferences: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: mocks.session }));
vi.mock("lib/db/repository", () => ({
  userRepository: {
    getPreferences: mocks.getPreferences,
    updatePreferences: mocks.updatePreferences,
  },
}));
vi.mock("server-only", () => ({}));
vi.mock("lib/skills/registry", () => ({
  isSupportedSkillLicense: (license: string) => license === "MIT",
}));

import { DELETE, POST, PUT } from "./route";

const makeRequest = (body: unknown, origin = "https://example.test") =>
  new Request("https://example.test/api/skills", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as never;

describe("skill import persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ user: { id: "user-1" } });
    mocks.getPreferences.mockResolvedValue({ skills: [] });
    mocks.updatePreferences.mockResolvedValue(undefined);
  });

  it("requires explicit import confirmation before persisting external content", async () => {
    const response = await POST(
      makeRequest({
        name: "Imported",
        markdown: "reviewed content",
        source: "owner/repo",
        slug: "skill",
        license: "MIT",
      }),
    );
    expect(response.status).toBe(400);
    expect(mocks.updatePreferences).not.toHaveBeenCalled();
  });

  it("persists source attribution and SPDX license after explicit confirmation", async () => {
    const response = await POST(
      makeRequest({
        name: "Imported",
        markdown: "reviewed content",
        source: "owner/repo",
        slug: "skill",
        license: "MIT",
        licenseNotice: "MIT License",
        importConfirmed: true,
      }),
    );
    expect(response.status).toBe(201);
    expect(mocks.updatePreferences).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({
        skills: [
          expect.objectContaining({
            source: "owner/repo",
            slug: "skill",
            license: "MIT",
            licenseNotice: "MIT License",
            sourceUrl: "https://github.com/owner/repo",
          }),
        ],
      }),
    );
  });

  it("rejects oversized streaming JSON before parsing or persistence", async () => {
    const response = await POST(
      makeRequest({ name: "large", markdown: "x".repeat(520_000) }),
    );
    expect(response.status).toBe(413);
    expect(mocks.updatePreferences).not.toHaveBeenCalled();
  });

  it("rejects cross-origin skill preference mutations", async () => {
    expect(
      (
        await POST(
          makeRequest(
            { name: "skill", markdown: "body" },
            "https://attacker.test",
          ),
        )
      ).status,
    ).toBe(403);
    const update = new Request("https://example.test/api/skills", {
      method: "PUT",
      headers: {
        origin: "https://attacker.test",
        "content-type": "application/json",
      },
      body: JSON.stringify({ id: "skill", name: "skill", markdown: "body" }),
    }) as never;
    expect((await PUT(update)).status).toBe(403);
    const deletion = new Request("https://example.test/api/skills?id=skill", {
      method: "DELETE",
      headers: { origin: "https://attacker.test" },
    }) as never;
    expect((await DELETE(deletion)).status).toBe(403);
    expect(mocks.getPreferences).not.toHaveBeenCalled();
    expect(mocks.updatePreferences).not.toHaveBeenCalled();
  });
});
