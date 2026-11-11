import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  after: vi.fn(),
  createIfCapacity: vi.fn(),
  updateActiveForOwner: vi.fn(),
  getForOwner: vi.fn(),
  beginResumeForOwner: vi.fn(),
  rate: vi.fn(),
  billing: vi.fn(),
  execute: vi.fn(),
  resume: vi.fn(),
  clarify: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/server", async () => {
  const actual =
    await vi.importActual<typeof import("next/server")>("next/server");
  return { ...actual, after: mocks.after };
});
vi.mock("lib/ai/app-builder", () => ({
  isAppBuilderConfigured: () => true,
  clarifyAppPrompt: mocks.clarify,
}));
vi.mock("lib/ai/app-build-runner", () => ({
  executeAppBuild: mocks.execute,
  resumeAppBuild: mocks.resume,
}));
vi.mock("lib/db/pg/repositories/app-build-repository.pg", () => ({
  pgAppBuildRepository: {
    createIfCapacity: mocks.createIfCapacity,
    updateActiveForOwner: mocks.updateActiveForOwner,
    getForOwner: mocks.getForOwner,
    beginResumeForOwner: mocks.beginResumeForOwner,
  },
}));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: mocks.rate,
}));
vi.mock("lib/gate", () => ({ requireBillingContext: mocks.billing }));
vi.mock("lib/logger", () => ({ default: { error: vi.fn() } }));
vi.mock("logger", () => ({
  default: { error: vi.fn(), withDefaults: vi.fn() },
}));

import { buildAppTool } from "./build-tool";

const executeTool = (
  tool: ReturnType<typeof buildAppTool>,
  input: Record<string, unknown> = { prompt: "a small timer" },
) => tool.execute?.(input as never, {} as never);

describe("buildAppTool", () => {
  const oldKey = process.env.E2B_API_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.E2B_API_KEY = "test-key";
    mocks.after.mockImplementation(() => undefined);
    mocks.createIfCapacity.mockResolvedValue({
      status: "created",
      build: { id: "build-1", status: "queued" },
    });
    mocks.updateActiveForOwner.mockResolvedValue({ id: "build-1" });
    mocks.getForOwner.mockResolvedValue(null);
    mocks.beginResumeForOwner.mockResolvedValue(null);
    mocks.rate.mockResolvedValue({ allowed: true });
    mocks.billing.mockResolvedValue({
      customerId: "customer",
      entityId: "owner",
    });
    mocks.execute.mockResolvedValue({
      previewUrl: "https://preview.test",
      files: [],
    });
    mocks.resume.mockResolvedValue("https://preview.test");
    // The clarifier defaults to "ready" so the plain build path is unaffected.
    mocks.clarify.mockResolvedValue({
      readyToBuild: true,
      questions: [],
      assumptions: [],
    });
  });

  afterAll(() => {
    if (oldKey === undefined) delete process.env.E2B_API_KEY;
    else process.env.E2B_API_KEY = oldKey;
  });

  it("persists and queues the owner-scoped build without waiting for E2B", async () => {
    const result = await executeTool(
      buildAppTool({ userId: "owner", threadId: "thread-1" }),
    );

    expect(mocks.createIfCapacity).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "owner",
        threadId: "thread-1",
        prompt: "a small timer",
      }),
    );
    expect(mocks.after).toHaveBeenCalledTimes(1);
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(result).toMatchObject({ buildId: "build-1", status: "queued" });

    const backgroundTask = mocks.after.mock.calls[0]?.[0];
    expect(backgroundTask).toBeTypeOf("function");
    await backgroundTask?.();
    expect(mocks.execute).toHaveBeenCalledWith({
      buildId: "build-1",
      userId: "owner",
      threadId: "thread-1",
      prompt: "a small timer",
      customerId: "customer",
      entityId: "owner",
      mode: "static",
    });
  });

  it("marks the queued record failed if background scheduling is unavailable", async () => {
    mocks.after.mockImplementation(() => {
      throw new Error("outside request context");
    });

    const result = await executeTool(
      buildAppTool({ userId: "owner", threadId: "thread-1" }),
    );

    expect(mocks.updateActiveForOwner).toHaveBeenCalledWith(
      "build-1",
      "owner",
      { status: "failed", error: "Build could not be scheduled." },
    );
    expect(result).toMatchObject({ error: "build_unavailable" });
  });

  it("asks clarifying questions instead of spending a sandbox on a vague prompt", async () => {
    mocks.clarify.mockResolvedValue({
      readyToBuild: false,
      questions: ["Should data persist between visits?"],
      assumptions: ["Single user"],
    });

    const result = await executeTool(
      buildAppTool({ userId: "owner", threadId: "thread-1" }),
    );

    expect(result).toMatchObject({
      needsAnswers: true,
      questions: ["Should data persist between visits?"],
      assumptions: ["Single user"],
    });
    expect(mocks.createIfCapacity).not.toHaveBeenCalled();
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it("builds immediately when the model says the user already answered", async () => {
    const result = await executeTool(
      buildAppTool({ userId: "owner", threadId: "thread-1" }),
      { prompt: "a timer that persists", skipQuestions: true, mode: "agent" },
    );

    expect(mocks.clarify).not.toHaveBeenCalled();
    expect(result).toMatchObject({ buildId: "build-1", mode: "agent" });
    const backgroundTask = mocks.after.mock.calls[0]?.[0];
    await backgroundTask?.();
    expect(mocks.execute).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "agent" }),
    );
  });

  it("resumes a known build instead of queueing a new one", async () => {
    const resumed = {
      id: "build-9",
      userId: "owner",
      status: "provisioning",
      files: [{ path: "index.html", content: "<main>x</main>" }],
    };
    mocks.getForOwner.mockResolvedValue({
      id: "build-9",
      userId: "owner",
      files: [{ path: "index.html", content: "<main>x</main>" }],
      sandboxId: "sbx_old",
    });
    mocks.beginResumeForOwner.mockResolvedValue(resumed);

    const result = await executeTool(
      buildAppTool({ userId: "owner", threadId: "thread-1" }),
      { prompt: "bring back my app", buildId: "build-9" },
    );

    expect(mocks.beginResumeForOwner).toHaveBeenCalledWith(
      "build-9",
      "owner",
      2,
    );
    expect(mocks.createIfCapacity).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      buildId: "build-9",
      status: "provisioning",
    });
    const backgroundTask = mocks.after.mock.calls[0]?.[0];
    await backgroundTask?.();
    expect(mocks.resume).toHaveBeenCalledWith({
      build: resumed,
      userId: "owner",
      customerId: "customer",
      entityId: "owner",
    });
  });

  it("builds fresh when the buildId is unknown to this user", async () => {
    mocks.getForOwner.mockResolvedValue(null);

    const result = await executeTool(
      buildAppTool({ userId: "owner", threadId: "thread-1" }),
      { prompt: "a timer", buildId: "build-unknown" },
    );

    expect(mocks.beginResumeForOwner).not.toHaveBeenCalled();
    expect(result).toMatchObject({ buildId: "build-1" });
  });

  it("does not resume when admission capacity is unavailable", async () => {
    mocks.getForOwner.mockResolvedValue({
      id: "build-9",
      userId: "owner",
      files: [{ path: "index.html", content: "<main>x</main>" }],
    });
    mocks.beginResumeForOwner.mockResolvedValue(null);

    const result = await executeTool(
      buildAppTool({ userId: "owner", threadId: "thread-1" }),
      { prompt: "bring it back", buildId: "build-9" },
    );

    expect(result).toMatchObject({ error: "resume_unavailable" });
    expect(mocks.after).not.toHaveBeenCalled();
  });
});
