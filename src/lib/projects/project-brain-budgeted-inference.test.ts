import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  enabled: vi.fn(),
  model: vi.fn(),
  reserve: vi.fn(),
  settle: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("lib/ai/model-pricing.server", () => ({
  getTeamMemberBudgetsEnabled: mocks.enabled,
}));
vi.mock("lib/projects/project-brain-status", () => ({
  getProjectBrainStatusModel: mocks.model,
}));
vi.mock("lib/ai/team-member-ai-budget-runtime", () => ({
  reserveTeamBudgetForAiRequest: mocks.reserve,
  settleTeamBudgetForAiRequest: mocks.settle,
}));

import { runProjectBrainBudgetedInference } from "./project-brain-budgeted-inference";

describe("project brain budgeted inference", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enabled.mockResolvedValue(true);
    mocks.model.mockResolvedValue({ provider: "configured", model: "model" });
    mocks.reserve.mockResolvedValue({ reservationId: "lease" });
  });

  it("preserves the fallback path when personal or team budgets are disabled", async () => {
    mocks.enabled.mockResolvedValue(false);
    const run = vi.fn(async ({ model }: { model?: unknown }) => ({
      value: model ?? "fallback",
    }));
    await expect(
      runProjectBrainBudgetedInference({
        userId: "u1",
        role: "owner",
        promptCharacters: 10,
        idempotencyScope: "scope",
        run,
      }),
    ).resolves.toBe("fallback");
    expect(mocks.reserve).not.toHaveBeenCalled();
  });

  it("pins member calls and settles provider usage against the persisted scope", async () => {
    const run = vi.fn(async ({ model }: { model?: unknown }) => ({
      value: "ok",
      usage: { inputTokens: 4, outputTokens: 2 },
      selectedModel: model,
    }));
    await expect(
      runProjectBrainBudgetedInference({
        teamId: "team-1",
        userId: "member-1",
        role: "editor",
        promptCharacters: 500,
        idempotencyScope: "brain-status:run-1",
        run,
      }),
    ).resolves.toBe("ok");
    expect(mocks.reserve).toHaveBeenCalledWith({
      teamId: "team-1",
      userId: "member-1",
      model: { provider: "configured", model: "model" },
      promptCharacters: 500,
      idempotencyScope: "brain-status:run-1",
    });
    expect(run).toHaveBeenCalledWith({
      model: { provider: "configured", model: "model" },
      onProviderStart: expect.any(Function),
    });
    expect(mocks.settle).toHaveBeenCalledWith(
      { reservationId: "lease" },
      { usage: { inputTokens: 4, outputTokens: 2 } },
    );
  });

  it("fails closed when no configured model or reservation exists for a member", async () => {
    mocks.model.mockResolvedValue(null);
    const run = vi.fn();
    await expect(
      runProjectBrainBudgetedInference({
        teamId: "team-1",
        userId: "member-1",
        role: "editor",
        promptCharacters: 1,
        idempotencyScope: "scope",
        run,
      }),
    ).rejects.toThrow("No enabled project-brain model");
    expect(run).not.toHaveBeenCalled();

    mocks.model.mockResolvedValue({ provider: "configured", model: "model" });
    mocks.reserve.mockResolvedValue(undefined);
    await expect(
      runProjectBrainBudgetedInference({
        teamId: "team-1",
        userId: "member-1",
        role: "editor",
        promptCharacters: 1,
        idempotencyScope: "scope",
        run,
      }),
    ).rejects.toThrow("reservation was not created");
    expect(run).not.toHaveBeenCalled();
  });

  it("releases pre-provider failures but retains leases after provider start", async () => {
    await expect(
      runProjectBrainBudgetedInference({
        teamId: "team-1",
        userId: "member-1",
        role: "editor",
        promptCharacters: 1,
        idempotencyScope: "before-start",
        run: async () => {
          throw new Error("model resolution failed");
        },
      }),
    ).rejects.toThrow("model resolution failed");
    expect(mocks.settle).toHaveBeenCalledWith(
      { reservationId: "lease" },
      { aborted: true },
    );

    mocks.settle.mockClear();
    await expect(
      runProjectBrainBudgetedInference({
        teamId: "team-1",
        userId: "member-1",
        role: "editor",
        promptCharacters: 1,
        idempotencyScope: "after-start",
        run: async ({ onProviderStart }) => {
          onProviderStart();
          throw new Error("provider failed");
        },
      }),
    ).rejects.toThrow("provider failed");
    expect(mocks.settle).not.toHaveBeenCalled();
  });

  it("exempts owners from member reservations while using the configured model", async () => {
    const run = vi.fn(async ({ model }) => ({ value: model }));
    await expect(
      runProjectBrainBudgetedInference({
        teamId: "team-1",
        userId: "owner-1",
        role: "owner",
        promptCharacters: 1,
        idempotencyScope: "owner-run",
        run,
      }),
    ).resolves.toEqual({ provider: "configured", model: "model" });
    expect(mocks.reserve).not.toHaveBeenCalled();
    expect(mocks.settle).not.toHaveBeenCalled();
  });
});
