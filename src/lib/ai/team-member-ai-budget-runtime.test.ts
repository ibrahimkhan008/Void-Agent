import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  budgetsEnabled: vi.fn(),
  configuredPrice: vi.fn(),
  policy: vi.fn(),
  gate: vi.fn(),
  reserve: vi.fn(),
  finalize: vi.fn(),
  release: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("./model-pricing.server", () => ({
  getConfiguredModelPrice: mocks.configuredPrice,
  getTeamMemberBudgetsEnabled: mocks.budgetsEnabled,
}));
vi.mock("./team-member-ai-budget", () => ({
  finalizeTeamMemberBudget: mocks.finalize,
  getTeamMemberBudgetPolicy: mocks.policy,
  reserveTeamMemberBudget: mocks.reserve,
  releaseTeamMemberBudget: mocks.release,
}));
vi.mock("./team-member-ai-budget-gate", () => ({
  resolveTeamMemberBudgetGate: mocks.gate,
}));

import {
  normalizeModelUsage,
  reserveTeamBudgetForAiRequest,
  settleTeamBudgetForAiRequest,
} from "./team-member-ai-budget-runtime";

describe("team-member AI budget runtime adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.budgetsEnabled.mockResolvedValue(true);
    mocks.gate.mockResolvedValue({
      teamId: "team-1",
      price: {
        inputMicrosPerMillion: 2_000_000,
        outputMicrosPerMillion: 4_000_000,
        currency: "EUR",
      },
    });
    mocks.reserve.mockResolvedValue({ id: "reservation-1" });
    mocks.finalize.mockResolvedValue(undefined);
    mocks.release.mockResolvedValue(undefined);
  });

  it("does no team-ledger lookup for an unassociated request", async () => {
    await expect(
      reserveTeamBudgetForAiRequest({
        userId: "user-1",
        teamId: null,
        model: { provider: "google", model: "Gemini 3 Flash" },
        promptCharacters: 80,
        idempotencyScope: "title",
      }),
    ).resolves.toBeUndefined();
    expect(mocks.budgetsEnabled).not.toHaveBeenCalled();
    expect(mocks.gate).not.toHaveBeenCalled();
    expect(mocks.reserve).not.toHaveBeenCalled();
  });

  it("keeps the existing rollout opt-in and does not reserve when disabled", async () => {
    mocks.budgetsEnabled.mockResolvedValue(false);
    await expect(
      reserveTeamBudgetForAiRequest({
        userId: "user-1",
        teamId: "team-1",
        model: { provider: "google", model: "Gemini 3 Flash" },
        promptCharacters: 80,
        idempotencyScope: "title",
      }),
    ).resolves.toBeUndefined();
    expect(mocks.gate).not.toHaveBeenCalled();
    expect(mocks.reserve).not.toHaveBeenCalled();
  });

  it("reserves only the server-supplied team with the effective model and bounded estimate", async () => {
    const lease = await reserveTeamBudgetForAiRequest({
      userId: "user-1",
      teamId: "team-1",
      model: { provider: "google", model: "Gemini 3 Flash" },
      promptCharacters: 400,
      idempotencyScope: "chat-title",
    });

    expect(mocks.gate).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: true,
        teamId: "team-1",
        userId: "user-1",
      }),
    );
    expect(mocks.reserve).toHaveBeenCalledWith(
      expect.objectContaining({
        teamId: "team-1",
        userId: "user-1",
        modelKey: "google/gemini 3 flash",
        currency: "EUR",
        estimateMicros: 16_584,
        idempotencyKey: expect.stringMatching(/^team-1:user-1:chat-title:/),
      }),
    );
    expect(lease).toMatchObject({
      reservationId: "reservation-1",
      estimateMicros: 16_584,
      price: { currency: "EUR" },
    });
  });

  it("assigns a fresh one-use reservation key to every generation run", async () => {
    const input = {
      userId: "user-1",
      teamId: "team-1",
      model: { provider: "flare", model: "Model A" },
      promptCharacters: 100,
      idempotencyScope: "project-brain-status:project-1:fingerprint",
    };
    await reserveTeamBudgetForAiRequest(input);
    await reserveTeamBudgetForAiRequest(input);
    const firstKey = mocks.reserve.mock.calls[0]?.[0].idempotencyKey;
    const secondKey = mocks.reserve.mock.calls[1]?.[0].idempotencyKey;
    expect(firstKey).toMatch(
      /^team-1:user-1:project-brain-status:project-1:fingerprint:/,
    );
    expect(secondKey).toMatch(
      /^team-1:user-1:project-brain-status:project-1:fingerprint:/,
    );
    expect(firstKey).not.toBe(secondKey);
  });

  it("finalizes using provider input/output usage and falls back to its reservation estimate", async () => {
    const lease = {
      reservationId: "reservation-1",
      estimateMicros: 99,
      price: {
        inputMicrosPerMillion: 2_000_000,
        outputMicrosPerMillion: 4_000_000,
        currency: "EUR",
      },
    };

    expect(
      normalizeModelUsage({ promptTokens: 3, completionTokens: 2 }),
    ).toEqual({ inputTokens: 3, outputTokens: 2 });
    await settleTeamBudgetForAiRequest(lease, {
      usage: { inputTokens: 3, outputTokens: 2 },
    });
    expect(mocks.finalize).toHaveBeenCalledWith({
      reservationId: "reservation-1",
      actualMicros: 14,
    });

    await settleTeamBudgetForAiRequest(lease, { usage: undefined });
    expect(mocks.finalize).toHaveBeenLastCalledWith({
      reservationId: "reservation-1",
      actualMicros: 99,
    });
  });

  it("releases aborted work without charging the estimate", async () => {
    const lease = {
      reservationId: "reservation-1",
      estimateMicros: 99,
      price: {
        inputMicrosPerMillion: 2_000_000,
        outputMicrosPerMillion: 4_000_000,
        currency: "EUR",
      },
    };
    await settleTeamBudgetForAiRequest(lease, { aborted: true });
    expect(mocks.release).toHaveBeenCalledWith("reservation-1");
    expect(mocks.finalize).not.toHaveBeenCalled();
  });
});
