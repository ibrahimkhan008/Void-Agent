import type { TeamModelRouteProfile } from "lib/db/pg/schema.pg";
import { describe, expect, it } from "vitest";
import {
  TeamModelRouteUnavailableError,
  estimateTeamRouteMinimumContextTokens,
  inferTeamModelRouteTask,
  materializeTeamRoute,
  prioritizePinnedTeamModel,
  rankTeamModels,
} from "./team-model-routing";

const candidates = [
  { provider: "OpenAI", model: "gpt-fast", toolCalling: true, vision: true },
  { provider: "google", model: "gemini-pro", toolCalling: true, vision: true },
  { provider: "local", model: "text-only", toolCalling: false, vision: false },
];

const profiles: TeamModelRouteProfile[] = [
  {
    provider: "OpenAI",
    model: "gpt-fast",
    priority: 20,
    taskScores: { coding: 4 },
  },
  {
    provider: "google",
    model: "gemini-pro",
    priority: 10,
    taskScores: { coding: 4 },
  },
  {
    provider: "local",
    model: "text-only",
    priority: 1,
    taskScores: { coding: 100 },
  },
];

describe("team model routing", () => {
  it("uses deterministic score, priority, provider and model ordering", () => {
    expect(
      rankTeamModels({
        policy: { enabled: true, profiles },
        availableModels: candidates,
        requirements: {
          task: "coding",
          requiresTools: false,
          requiresVision: false,
        },
      }).map(({ provider }) => provider),
    ).toEqual(["local", "google", "OpenAI"]);
  });

  it("excludes unapproved, tool-incompatible and vision-incompatible models", () => {
    expect(
      rankTeamModels({
        policy: { enabled: true, profiles },
        availableModels: candidates,
        requirements: {
          task: "coding",
          requiresTools: true,
          requiresVision: true,
        },
      }).map(({ model }) => model),
    ).toEqual(["gemini-pro", "gpt-fast"]);
    expect(() =>
      rankTeamModels({
        policy: { enabled: true, profiles: [profiles[2]!] },
        availableModels: candidates,
        requirements: {
          task: "vision",
          requiresTools: false,
          requiresVision: true,
        },
      }),
    ).toThrow(TeamModelRouteUnavailableError);
  });

  it("filters context-inadequate models and fails closed for unknown windows", () => {
    const withWindows = [
      { ...candidates[0]!, contextTokens: 16_000 },
      { ...candidates[1]!, contextTokens: 128_000 },
      { ...candidates[2]!, contextTokens: undefined },
    ];
    const requirements = {
      task: "coding" as const,
      requiresTools: false,
      requiresVision: false,
      minimumContextTokens: 32_000,
    };
    expect(
      rankTeamModels({
        policy: { enabled: true, profiles },
        availableModels: withWindows,
        requirements,
      }).map(({ model }) => model),
    ).toEqual(["gemini-pro"]);
    expect(() =>
      rankTeamModels({
        policy: { enabled: true, profiles: [profiles[2]!] },
        availableModels: withWindows,
        requirements,
      }),
    ).toThrow(TeamModelRouteUnavailableError);
  });

  it("estimates serialized conversation context with explicit system and output reserves", () => {
    expect(
      estimateTeamRouteMinimumContextTokens({ text: "x".repeat(200) }),
    ).toBe(36_970);
    expect(estimateTeamRouteMinimumContextTokens(undefined)).toBe(
      Number.POSITIVE_INFINITY,
    );
  });

  it("fails closed for disabled policies and no eligible models", () => {
    expect(() =>
      rankTeamModels({
        policy: { enabled: false, profiles },
        availableModels: candidates,
        requirements: {
          task: "general_chat",
          requiresTools: false,
          requiresVision: false,
        },
      }),
    ).toThrow(TeamModelRouteUnavailableError);
    expect(() =>
      rankTeamModels({
        policy: { enabled: true, profiles: [] },
        availableModels: candidates,
        requirements: {
          task: "general_chat",
          requiresTools: false,
          requiresVision: false,
        },
      }),
    ).toThrow(TeamModelRouteUnavailableError);
  });

  it("keeps a thread pin only while it remains in the policy-filtered set", () => {
    expect(
      prioritizePinnedTeamModel(candidates, {
        provider: "GOOGLE",
        model: "gemini-pro",
      })[0],
    ).toEqual(candidates[1]);
    expect(
      prioritizePinnedTeamModel(candidates, {
        provider: "other",
        model: "removed",
      }),
    ).toEqual(candidates);
  });

  it("falls back deterministically only within the caller-provided allowlist", async () => {
    const selected: string[] = [];
    const result = await materializeTeamRoute(candidates, async (candidate) => {
      selected.push(candidate.model);
      if (candidate.model === "gpt-fast") throw new Error("not available");
      return candidate.model;
    });
    expect(result).toEqual({
      candidate: candidates[1],
      value: "gemini-pro",
      fallbackUsed: true,
    });
    expect(selected).toEqual(["gpt-fast", "gemini-pro"]);
  });

  it("classifies an explicit request using stable task rules", () => {
    expect(
      inferTeamModelRouteTask("Please debug this TypeScript function"),
    ).toBe("coding");
    expect(
      inferTeamModelRouteTask("Can you find current information on this? "),
    ).toBe("web_search");
    expect(inferTeamModelRouteTask("Hello there")).toBe("general_chat");
  });
});
