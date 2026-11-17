import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  enable: vi.fn(),
  disable: vi.fn(),
  remove: vi.fn(),
  getRepoSetting: vi.fn(),
  listRepoSettings: vi.fn(),
}));

vi.mock("auth/route-guard", () => ({
  withAuth:
    (handler: (...args: any[]) => Promise<Response>) =>
    (request: Request, context?: unknown) =>
      handler(request, { user: { id: "owner-1" } }, context),
}));

vi.mock("@/lib/code-review/provision", () => ({
  enableCodeReview: (...args: unknown[]) => mocks.enable(...args),
  disableCodeReview: (...args: unknown[]) => mocks.disable(...args),
  removeCodeReview: (...args: unknown[]) => mocks.remove(...args),
}));

vi.mock("@/lib/db/pg/repositories/code-review-repository.pg", () => ({
  codeReviewRepository: {
    getRepoSetting: (...args: unknown[]) => mocks.getRepoSetting(...args),
    listRepoSettings: (...args: unknown[]) => mocks.listRepoSettings(...args),
    getUserPrefs: vi.fn(),
    updateUserPrefs: vi.fn(),
    upsertRepoSetting: vi.fn(),
    deleteRepoSetting: vi.fn(),
    findEnabledByRepository: vi.fn(),
    resolveEffective: vi.fn(),
  },
  CODE_REVIEW_TRIGGERS: ["pr_open", "every_push", "smart_detect"],
}));

import { DELETE, PUT } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.enable.mockResolvedValue({ endpointId: "ep-1", webhookId: 42 });
  mocks.disable.mockResolvedValue(undefined);
  mocks.remove.mockResolvedValue(undefined);
  mocks.getRepoSetting.mockResolvedValue({
    repository: "acme/widgets",
    autoReview: true,
    reviewTrigger: null,
    exhaustiveReview: null,
    reviewInstructions: null,
    webhookId: 42,
  });
});

const putRequest = (body: unknown, _repository = "acme%2Fwidgets") =>
  new Request("https://void.test/api/code-review/settings", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("PUT /api/code-review/settings/[repository]", () => {
  it("provisions the pipeline when autoReview is on", async () => {
    const response = await PUT(
      putRequest({
        autoReview: true,
        reviewTrigger: "every_push",
        exhaustiveReview: true,
        reviewInstructions: "Focus on SQL injection.",
      }),
      { params: Promise.resolve({ repository: "acme%2Fwidgets" }) },
    );
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      setting: Record<string, unknown>;
    };
    expect(payload.setting).toMatchObject({
      repository: "acme/widgets",
      autoReview: true,
      provisioned: true,
    });
    expect(mocks.enable).toHaveBeenCalledWith("owner-1", "acme/widgets", {
      autoReview: true,
      reviewTrigger: "every_push",
      exhaustiveReview: true,
      reviewInstructions: "Focus on SQL injection.",
    });
    expect(mocks.disable).not.toHaveBeenCalled();
  });

  it("tears the webhook down when autoReview is off", async () => {
    mocks.getRepoSetting.mockResolvedValue({
      repository: "acme/widgets",
      autoReview: false,
      reviewTrigger: null,
      exhaustiveReview: null,
      reviewInstructions: null,
      webhookId: null,
    });
    const response = await PUT(putRequest({ autoReview: false }), {
      params: Promise.resolve({ repository: "acme%2Fwidgets" }),
    });
    expect(response.status).toBe(200);
    expect((await response.json()).setting).toMatchObject({
      autoReview: false,
      provisioned: false,
    });
    expect(mocks.disable).toHaveBeenCalledWith("owner-1", "acme/widgets");
    expect(mocks.enable).not.toHaveBeenCalled();
  });

  it("rejects malformed repositories and payloads", async () => {
    const badRepo = await PUT(putRequest({ autoReview: true }), {
      params: Promise.resolve({ repository: "not-a-repo" }),
    });
    expect(badRepo.status).toBe(400);

    const noFlag = await PUT(putRequest({}), {
      params: Promise.resolve({ repository: "acme%2Fwidgets" }),
    });
    expect(noFlag.status).toBe(400);

    const badTrigger = await PUT(
      putRequest({ autoReview: true, reviewTrigger: "whenever" }),
      { params: Promise.resolve({ repository: "acme%2Fwidgets" }) },
    );
    expect(badTrigger.status).toBe(400);
  });

  it("surfaces provisioning failures as 502", async () => {
    mocks.enable.mockRejectedValue(new Error("github 403"));
    const response = await PUT(putRequest({ autoReview: true }), {
      params: Promise.resolve({ repository: "acme%2Fwidgets" }),
    });
    expect(response.status).toBe(502);
    expect((await response.json()).error).toContain("github 403");
  });
});

describe("DELETE /api/code-review/settings/[repository]", () => {
  it("removes the pipeline and the settings row", async () => {
    const response = await DELETE(new Request("https://void.test/api/x"), {
      params: Promise.resolve({ repository: "acme%2Fwidgets" }),
    });
    expect(response.status).toBe(200);
    expect(mocks.remove).toHaveBeenCalledWith("owner-1", "acme/widgets");
  });
});
