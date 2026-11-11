import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: { user: { id: "owner" } } as { user: { id: string } } | null,
  after: vi.fn(),
  getForOwner: vi.fn(),
  beginResumeForOwner: vi.fn(),
  updateActiveForOwner: vi.fn(),
  rate: vi.fn(),
  sameOrigin: vi.fn(),
  billing: vi.fn(),
  resume: vi.fn(),
}));
type Session = { user: { id: string } };
type Context = { params: Promise<{ id: string }> };
type Handler = (
  request: Request,
  session: Session,
  context: Context,
) => Promise<Response>;
vi.mock("auth/route-guard", () => ({
  withAuth:
    (handler: Handler) => async (request: Request, context: Context) => {
      if (!mocks.session)
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      return handler(request, mocks.session, context);
    },
}));
vi.mock("next/server", async () => {
  const actual =
    await vi.importActual<typeof import("next/server")>("next/server");
  return { ...actual, after: mocks.after };
});
vi.mock("lib/ai/app-build-runner", () => ({ resumeAppBuild: mocks.resume }));
vi.mock("lib/db/pg/repositories/app-build-repository.pg", () => ({
  pgAppBuildRepository: {
    getForOwner: mocks.getForOwner,
    beginResumeForOwner: mocks.beginResumeForOwner,
    updateActiveForOwner: mocks.updateActiveForOwner,
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

import { POST } from "./route";

const id = "00000000-0000-4000-8000-000000000001";
const context = { params: Promise.resolve({ id }) };
const request = () =>
  new Request(`https://app.test/api/build/${id}/resume`, {
    method: "POST",
    headers: { origin: "https://app.test" },
  });

describe("POST /api/build/[id]/resume", () => {
  const oldKey = process.env.E2B_API_KEY;
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.E2B_API_KEY = "test-key";
    mocks.session = { user: { id: "owner" } };
    mocks.after.mockImplementation(() => undefined);
    mocks.getForOwner.mockResolvedValue({
      id,
      userId: "owner",
      status: "failed",
      files: [{ path: "index.html", content: "<main>x</main>" }],
    });
    mocks.beginResumeForOwner.mockResolvedValue({
      id,
      userId: "owner",
      status: "provisioning",
      files: [{ path: "index.html", content: "<main>x</main>" }],
    });
    mocks.updateActiveForOwner.mockResolvedValue({ id });
    mocks.rate.mockResolvedValue({ allowed: true });
    mocks.sameOrigin.mockReturnValue(true);
    mocks.billing.mockResolvedValue({ customerId: null });
    mocks.resume.mockResolvedValue("https://preview.test");
  });
  afterAll(() => {
    if (oldKey === undefined) delete process.env.E2B_API_KEY;
    else process.env.E2B_API_KEY = oldKey;
  });

  it("requires authentication and same-origin", async () => {
    mocks.session = null;
    expect((await POST(request() as never, context as never)).status).toBe(401);
    mocks.session = { user: { id: "owner" } };
    mocks.sameOrigin.mockReturnValue(false);
    expect((await POST(request() as never, context as never)).status).toBe(403);
  });

  it("returns indistinguishable not-found for a foreign build", async () => {
    mocks.getForOwner.mockResolvedValue(null);
    expect((await POST(request() as never, context as never)).status).toBe(404);
    expect(mocks.beginResumeForOwner).not.toHaveBeenCalled();
  });

  it("does not resume when the stored files are empty or capacity is unavailable", async () => {
    mocks.getForOwner.mockResolvedValue({ id, files: [] });
    expect((await POST(request() as never, context as never)).status).toBe(409);
    mocks.getForOwner.mockResolvedValue({
      id,
      files: [{ path: "index.html", content: "<main>x</main>" }],
    });
    mocks.beginResumeForOwner.mockResolvedValue(null);
    expect((await POST(request() as never, context as never)).status).toBe(409);
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it("queues only an owner-scoped bounded resume task", async () => {
    expect((await POST(request() as never, context as never)).status).toBe(202);
    expect(mocks.beginResumeForOwner).toHaveBeenCalledWith(id, "owner", 2);
    const [task] = mocks.after.mock.calls[0]!;
    await task();
    expect(mocks.resume).toHaveBeenCalledWith(
      expect.objectContaining({
        build: expect.objectContaining({ id, userId: "owner" }),
        userId: "owner",
        customerId: null,
      }),
    );
  });
});
