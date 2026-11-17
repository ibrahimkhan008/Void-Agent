import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: { user: { id: "owner" } } as { user: { id: string } } | null,
  after: vi.fn(),
  createIfCapacity: vi.fn(),
  listForOwner: vi.fn(),
  rate: vi.fn(),
  sameOrigin: vi.fn(),
  billing: vi.fn(),
  execute: vi.fn(),
}));

type Session = { user: { id: string } };
type Handler = (request: Request, session: Session) => Promise<Response>;
vi.mock("server-only", () => ({}));
vi.mock("lib/ai/app-builder", () => ({
  isAppBuilderConfigured: () => true,
}));
vi.mock("auth/route-guard", () => ({
  withAuth: (handler: Handler) => async (request: Request) => {
    if (!mocks.session)
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    return handler(request, mocks.session);
  },
}));
vi.mock("next/server", async () => {
  const actual =
    await vi.importActual<typeof import("next/server")>("next/server");
  return { ...actual, after: mocks.after };
});
vi.mock("lib/ai/app-build-runner", () => ({ executeAppBuild: mocks.execute }));
vi.mock("lib/db/pg/repositories/app-build-repository.pg", () => ({
  pgAppBuildRepository: {
    createIfCapacity: mocks.createIfCapacity,
    listForOwner: mocks.listForOwner,
  },
}));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: mocks.rate,
}));
vi.mock("lib/security/same-origin", () => ({
  hasSameOrigin: mocks.sameOrigin,
}));
vi.mock("@/lib/gate", () => ({ requireBillingContext: mocks.billing }));
vi.mock("lib/logger", () => ({ default: { error: vi.fn() } }));

import { GET, POST } from "./route";

const threadId = "00000000-0000-4000-8000-000000000001";
const buildId = "00000000-0000-4000-8000-000000000002";
const post = (body: unknown) =>
  new Request("https://app.test/api/build", {
    method: "POST",
    headers: { origin: "https://app.test", "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("app builder API", () => {
  const oldKey = process.env.E2B_API_KEY;
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.E2B_API_KEY = "test-key";
    mocks.session = { user: { id: "owner" } };
    mocks.after.mockImplementation(() => undefined);
    mocks.createIfCapacity.mockResolvedValue({
      status: "created",
      build: { id: buildId, status: "queued" },
    });
    mocks.rate.mockResolvedValue({ allowed: true });
    mocks.sameOrigin.mockReturnValue(true);
    mocks.billing.mockResolvedValue({
      customerId: "customer",
      entityId: "owner",
    });
    mocks.execute.mockResolvedValue(undefined);
    mocks.listForOwner.mockResolvedValue([]);
  });
  afterAll(() => {
    if (oldKey === undefined) delete process.env.E2B_API_KEY;
    else process.env.E2B_API_KEY = oldKey;
  });

  it("requires authentication, same-origin, a valid owned thread and rate capacity", async () => {
    mocks.session = null;
    expect(
      (await POST(post({ prompt: "a timer", threadId }) as never)).status,
    ).toBe(401);
    mocks.session = { user: { id: "owner" } };
    mocks.sameOrigin.mockReturnValue(false);
    expect(
      (await POST(post({ prompt: "a timer", threadId }) as never)).status,
    ).toBe(403);
    mocks.sameOrigin.mockReturnValue(true);
    mocks.createIfCapacity.mockResolvedValue({ status: "thread_not_found" });
    expect(
      (await POST(post({ prompt: "a timer", threadId }) as never)).status,
    ).toBe(404);
    expect(mocks.createIfCapacity).toHaveBeenCalledTimes(1);
    mocks.rate.mockResolvedValue(null);
    expect(
      (await POST(post({ prompt: "a timer", threadId }) as never)).status,
    ).toBe(503);
  });

  it("persists an owner-scoped job before scheduling bounded background execution", async () => {
    const afterResponse = await POST(
      post({ prompt: "a timer", threadId }) as never,
    );
    expect(afterResponse.status).toBe(202);
    expect(mocks.createIfCapacity).toHaveBeenCalledWith(
      expect.objectContaining({
        id: expect.any(String),
        userId: "owner",
        threadId,
        prompt: "a timer",
      }),
    );
    expect(mocks.after).toHaveBeenCalledTimes(1);
    expect(mocks.execute).not.toHaveBeenCalled();
    const [backgroundTask] = mocks.after.mock.calls[0]!;
    await backgroundTask();
    expect(mocks.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        buildId,
        userId: "owner",
        threadId,
        prompt: "a timer",
        customerId: "customer",
      }),
    );
  });

  it("does not create a build when the active build cap is reached", async () => {
    mocks.createIfCapacity.mockResolvedValue({ status: "active_limit" });
    expect(
      (await POST(post({ prompt: "a timer", threadId }) as never)).status,
    ).toBe(429);
    expect(mocks.createIfCapacity).toHaveBeenCalledTimes(1);
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it("rejects the vibesdk mode with a stable unavailable code before admission", async () => {
    const response = await POST(
      post({ prompt: "a timer", threadId, mode: "vibesdk" }) as never,
    );
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: "vibesdk-unavailable",
    });
    expect(mocks.createIfCapacity).not.toHaveBeenCalled();
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it("rejects an unknown mode as an invalid request", async () => {
    expect(
      (
        await POST(
          post({ prompt: "a timer", threadId, mode: "shell" }) as never,
        )
      ).status,
    ).toBe(400);
    expect(mocks.createIfCapacity).not.toHaveBeenCalled();
  });

  it("forwards the agent mode to the background build", async () => {
    await POST(post({ prompt: "a game", threadId, mode: "agent" }) as never);
    const [backgroundTask] = mocks.after.mock.calls[0]!;
    await backgroundTask();
    expect(mocks.execute).toHaveBeenCalledWith(
      expect.objectContaining({ buildId, mode: "agent" }),
    );
  });

  it("lists only the authenticated owner's build collection", async () => {
    mocks.listForOwner.mockResolvedValue([
      {
        id: buildId,
        status: "ready",
        buildLog: "internal lifecycle log",
        files: [{ path: "index.html", content: "private source" }],
        prompt: "private prompt",
      },
    ]);
    const response = await GET(
      new Request("https://app.test/api/build") as never,
    );
    expect(response.status).toBe(200);
    expect(mocks.listForOwner).toHaveBeenCalledWith("owner");
    const payload = await response.json();
    expect(payload.builds[0]).not.toHaveProperty("buildLog");
    expect(payload.builds[0]).not.toHaveProperty("files");
    expect(payload.builds[0]).not.toHaveProperty("prompt");
  });
});
