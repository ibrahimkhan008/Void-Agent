import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generate: vi.fn(),
  model: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("lib/ai/resilient-object", () => ({
  generateObjectResilient: mocks.generate,
}));
vi.mock("lib/ai/models", () => ({
  customModelProvider: {
    getModelWithFailureFallbackAsync: mocks.model,
  },
}));

import {
  appPlanSchema,
  clarifyAppPrompt,
  generateAppPlan,
  isAppBuildMode,
  isAppBuilderConfigured,
  validateGeneratedAppPath,
} from "./app-builder";

const plan = {
  title: "Focus Timer",
  summary: "A small focus timer.",
  files: [{ path: "index.html", content: "<main>Focus timer</main>" }],
};

describe("app builder output boundary", () => {
  const valid = { ...plan };

  it("accepts bounded files only for the preinstalled template", () => {
    expect(appPlanSchema.safeParse(valid).success).toBe(true);
    expect(validateGeneratedAppPath("index.html")).toBe(true);
  });

  it("does not treat missing or masked E2B credentials as configured", () => {
    const previous = process.env.E2B_API_KEY;
    delete process.env.E2B_API_KEY;
    expect(isAppBuilderConfigured()).toBe(false);
    process.env.E2B_API_KEY = "****";
    expect(isAppBuilderConfigured()).toBe(false);
    process.env.E2B_API_KEY = "real-looking-key";
    expect(isAppBuilderConfigured()).toBe(true);
    if (previous === undefined) delete process.env.E2B_API_KEY;
    else process.env.E2B_API_KEY = previous;
  });

  it.each([
    "../../tmp/payload.tsx",
    "/etc/passwd",
    "package.json",
    "server.js",
    "index.html; touch /tmp/x",
  ])("rejects generated path %s", (path) => {
    expect(
      appPlanSchema.safeParse({
        ...valid,
        files: [{ ...valid.files[0], path }],
      }).success,
    ).toBe(false);
    expect(validateGeneratedAppPath(path)).toBe(false);
  });

  it("rejects missing entrypoints, duplicate paths, and oversized output", () => {
    expect(
      appPlanSchema.safeParse({
        ...valid,
        files: [{ path: "styles.css", content: "" }],
      }).success,
    ).toBe(false);
    expect(
      appPlanSchema.safeParse({
        ...valid,
        files: [valid.files[0], valid.files[0]],
      }).success,
    ).toBe(false);
    expect(
      appPlanSchema.safeParse({
        ...valid,
        files: [{ ...valid.files[0], content: "x".repeat(120_001) }],
      }).success,
    ).toBe(false);
  });
});

describe("generateAppPlan modes", () => {
  beforeEach(() => {
    // mockReset (not clearAllMocks): a persistent implementation from a
    // previous test must not answer this test's un-queued refine calls.
    mocks.generate.mockReset();
    mocks.model.mockReset().mockResolvedValue({ modelId: "test-model" });
  });

  it("static mode makes exactly one generation pass", async () => {
    mocks.generate.mockResolvedValue({ object: plan, via: "primary" });

    await expect(generateAppPlan("a timer")).resolves.toEqual(plan);
    expect(mocks.generate).toHaveBeenCalledTimes(1);
    expect(mocks.generate).toHaveBeenCalledWith(
      expect.objectContaining({ label: "app-builder-plan" }),
    );
  });

  it("agent mode refines the plan in a bounded multi-pass loop", async () => {
    const refined = {
      title: plan.title,
      summary: plan.summary,
      files: [
        {
          path: "index.html",
          content: "<main>Focus timer</main><section>Refined</section>",
        },
      ],
    };
    mocks.generate
      .mockResolvedValueOnce({ object: plan, via: "primary" })
      .mockResolvedValueOnce({ object: refined, via: "primary" })
      .mockRejectedValueOnce(new Error("second refinement failed"));

    await expect(
      generateAppPlan("a timer", { mode: "agent" }),
    ).resolves.toEqual(refined);
    // Initial pass plus MAX_REFINE_PASSES bounded refinement attempts.
    expect(mocks.generate).toHaveBeenCalledTimes(3);
    expect(mocks.generate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ label: "app-builder-refine-1" }),
    );
    expect(mocks.generate).toHaveBeenLastCalledWith(
      expect.objectContaining({ label: "app-builder-refine-2" }),
    );
    // The refinement pass sees the current plan, not just the raw request.
    const refinePrompt = String(mocks.generate.mock.calls[1]![0]!.prompt);
    expect(refinePrompt).toContain("currentPlan");
  });

  it("keeps the previous plan when a refinement pass fails", async () => {
    mocks.generate
      .mockResolvedValueOnce({ object: plan, via: "primary" })
      .mockRejectedValueOnce(new Error("refinement blew up"));

    await expect(
      generateAppPlan("a timer", { mode: "agent" }),
    ).resolves.toEqual(plan);
    expect(mocks.generate).toHaveBeenCalledTimes(2);
  });

  it("forwards the abort signal to every pass", async () => {
    const controller = new AbortController();
    mocks.generate.mockResolvedValue({ object: plan, via: "primary" });

    await generateAppPlan("a timer", {
      mode: "agent",
      abortSignal: controller.signal,
    });
    for (const call of mocks.generate.mock.calls) {
      expect(call[0]!.abortSignal).toBe(controller.signal);
    }
  });
});

describe("clarifyAppPrompt", () => {
  beforeEach(() => {
    mocks.generate.mockReset();
    mocks.model.mockReset().mockResolvedValue({ modelId: "test-model" });
  });

  it("returns questions when the request is not buildable yet", async () => {
    mocks.generate.mockResolvedValue({
      object: {
        readyToBuild: false,
        questions: ["Should data persist between visits?"],
        assumptions: ["Single user"],
      },
      via: "primary",
    });

    await expect(clarifyAppPrompt("a habit tracker")).resolves.toEqual({
      readyToBuild: false,
      questions: ["Should data persist between visits?"],
      assumptions: ["Single user"],
    });
  });

  it("answers ready-to-build on any clarifier failure so builds never block", async () => {
    mocks.generate.mockRejectedValue(new Error("provider down"));
    await expect(clarifyAppPrompt("a timer")).resolves.toEqual({
      readyToBuild: true,
      questions: [],
      assumptions: [],
    });
  });

  it("falls back to ready-to-build when the clarifier exceeds the bounded list sizes", async () => {
    // The result schema caps questions at 4 and assumptions at 6; a model that
    // ignores the caps fails validation and must not block the build.
    mocks.generate.mockResolvedValue({
      object: {
        readyToBuild: false,
        questions: Array.from({ length: 9 }, (_, i) => `q${i}`),
        assumptions: [],
      },
      via: "primary",
    });

    await expect(clarifyAppPrompt("a dashboard")).resolves.toEqual({
      readyToBuild: true,
      questions: [],
      assumptions: [],
    });
  });

  it("returns the bounded lists verbatim for a well-formed clarifier", async () => {
    mocks.generate.mockResolvedValue({
      object: {
        readyToBuild: false,
        questions: ["q1", "q2", "q3", "q4"],
        assumptions: ["a1", "a2", "a3", "a4", "a5", "a6"],
      },
      via: "primary",
    });

    const result = await clarifyAppPrompt("a dashboard");
    expect(result.questions).toHaveLength(4);
    expect(result.assumptions).toHaveLength(6);
  });
});

describe("isAppBuildMode", () => {
  it("accepts only the registered modes", () => {
    expect(isAppBuildMode("static")).toBe(true);
    expect(isAppBuildMode("agent")).toBe(true);
    expect(isAppBuildMode("vibesdk")).toBe(false);
    expect(isAppBuildMode("")).toBe(false);
    expect(isAppBuildMode(undefined)).toBe(false);
  });
});
