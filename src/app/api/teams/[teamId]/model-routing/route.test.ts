import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  getTeam: vi.fn(),
  getTeamMember: vi.fn(),
  getPolicy: vi.fn(),
  savePolicy: vi.fn(),
  hydrate: vi.fn(),
  providerEnabled: vi.fn(),
  modelsInfo: [
    {
      provider: "flare",
      hasAPIKey: true,
      models: [
        { name: "Vision Model", isToolCallUnsupported: false, isImageInputUnsupported: false },
        { name: "Text Model", isToolCallUnsupported: true, isImageInputUnsupported: true },
      ],
    },
  ],
}));

vi.mock("auth/server", () => ({ getSession: mocks.session }));
vi.mock("lib/ai/models", () => ({
  customModelProvider: { get modelsInfo() { return mocks.modelsInfo; } },
  ensureDynamicProvidersHydrated: mocks.hydrate,
}));
vi.mock("lib/ai/model-provider-availability", () => ({
  isChatModelProviderEnabled: mocks.providerEnabled,
}));
vi.mock("lib/db/repository", () => ({
  teamRepository: { getTeam: mocks.getTeam, getTeamMember: mocks.getTeamMember },
  teamModelRoutingRepository: { getPolicy: mocks.getPolicy, savePolicy: mocks.savePolicy },
}));
vi.mock("lib/security/same-origin", () => ({ hasSameOrigin: () => true }));

import { GET, PUT } from "./route";

const params = Promise.resolve({ teamId: "team-1" });
const origin = "https://app.example/api/teams/team-1/model-routing";
const validPolicy = {
  enabled: true,
  profiles: [{ provider: "flare", model: "Vision Model", priority: 0, taskScores: { vision: 10 } }],
};

describe("team model routing policy API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ user: { id: "user-1" } });
    mocks.getTeam.mockResolvedValue({ id: "team-1", ownerId: "user-1" });
    mocks.getTeamMember.mockResolvedValue({ role: "owner" });
    mocks.getPolicy.mockResolvedValue({ teamId: "team-1", enabled: false, profiles: [] });
    mocks.savePolicy.mockImplementation(async (input) => input);
    mocks.hydrate.mockResolvedValue(undefined);
    mocks.providerEnabled.mockResolvedValue(true);
  });

  it("exposes the policy and capability-only live catalog to team members", async () => {
    const response = await GET(new Request(origin), { params });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.policy.enabled).toBe(false);
    expect(body.models).toEqual([
      { provider: "flare", model: "Vision Model", toolCalling: true, vision: true },
      { provider: "flare", model: "Text Model", toolCalling: false, vision: false },
    ]);
  });

  it("allows only team owner/admin and rejects models outside current enabled catalog", async () => {
    mocks.getTeam.mockResolvedValueOnce({ id: "team-1", ownerId: "another-user" });
    mocks.getTeamMember.mockResolvedValueOnce({ role: "member" });
    const forbidden = await PUT(new Request(origin, {
      method: "PUT", headers: { Origin: "https://app.example", "Content-Type": "application/json" },
      body: JSON.stringify(validPolicy),
    }), { params });
    expect(forbidden.status).toBe(403);
    expect(mocks.savePolicy).not.toHaveBeenCalled();

    const unavailable = await PUT(new Request(origin, {
      method: "PUT", headers: { Origin: "https://app.example", "Content-Type": "application/json" },
      body: JSON.stringify({ ...validPolicy, profiles: [{ ...validPolicy.profiles[0], model: "Hidden Model" }] }),
    }), { params });
    expect(unavailable.status).toBe(400);
    expect(mocks.savePolicy).not.toHaveBeenCalled();
  });

  it("persists only bounded, unique profiles that are currently enabled", async () => {
    const response = await PUT(new Request(origin, {
      method: "PUT", headers: { Origin: "https://app.example", "Content-Type": "application/json" },
      body: JSON.stringify(validPolicy),
    }), { params });
    expect(response.status).toBe(200);
    expect(mocks.savePolicy).toHaveBeenCalledWith(expect.objectContaining({
      teamId: "team-1", enabled: true, updatedByUserId: "user-1",
    }));
  });
});
