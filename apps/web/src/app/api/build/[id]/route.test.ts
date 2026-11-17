import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: { user: { id: "owner" } } as { user: { id: string } } | null,
  getForOwner: vi.fn(),
  cancelForOwner: vi.fn(),
  deleteForOwner: vi.fn(),
  isSandboxOwner: vi.fn(),
  markState: vi.fn(),
  kill: vi.fn(),
  sameOrigin: vi.fn(),
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
vi.mock("lib/db/pg/repositories/app-build-repository.pg", () => ({
  pgAppBuildRepository: {
    getForOwner: mocks.getForOwner,
    cancelForOwner: mocks.cancelForOwner,
    deleteForOwner: mocks.deleteForOwner,
  },
}));
vi.mock("lib/db/pg/repositories/sandbox-session-repository.pg", () => ({
  pgSandboxSessionRepository: { markState: mocks.markState },
}));
vi.mock("lib/e2b/sandbox-ownership", () => ({
  isSandboxOwner: mocks.isSandboxOwner,
}));
vi.mock("@e2b/code-interpreter", () => ({ Sandbox: { kill: mocks.kill } }));
vi.mock("lib/security/same-origin", () => ({
  hasSameOrigin: mocks.sameOrigin,
}));
vi.mock("lib/logger", () => ({ default: { error: vi.fn() } }));

import { DELETE, GET } from "./route";

const id = "00000000-0000-4000-8000-000000000001";
const context = { params: Promise.resolve({ id }) };
const req = (method: string) =>
  new Request(`https://app.test/api/build/${id}`, {
    method,
    headers: { origin: "https://app.test" },
  });

describe("owner-scoped build detail lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session = { user: { id: "owner" } };
    mocks.getForOwner.mockResolvedValue({
      id,
      userId: "owner",
      status: "ready",
      sandboxId: null,
    });
    mocks.cancelForOwner.mockResolvedValue({
      id,
      status: "cancelled",
      sandboxId: null,
    });
    mocks.deleteForOwner.mockResolvedValue(true);
    mocks.isSandboxOwner.mockResolvedValue(true);
    mocks.markState.mockResolvedValue(undefined);
    mocks.kill.mockResolvedValue(undefined);
    mocks.sameOrigin.mockReturnValue(true);
  });

  it("conceals foreign and invalid build IDs", async () => {
    mocks.getForOwner.mockResolvedValue(null);
    expect((await GET(req("GET") as never, context)).status).toBe(404);
    expect(
      (
        await GET(req("GET") as never, {
          params: Promise.resolve({ id: "bad" }),
        })
      ).status,
    ).toBe(404);
  });

  it("returns the owner's persisted build log with no-store caching", async () => {
    mocks.getForOwner.mockResolvedValue({
      id,
      userId: "owner",
      status: "generating",
      buildLog: "2026-11-17T00:00:00.000Z App generation started\\n",
    });
    const response = await GET(req("GET") as never, context);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    await expect(response.json()).resolves.toMatchObject({
      build: { buildLog: expect.stringContaining("App generation started") },
    });
    expect(mocks.getForOwner).toHaveBeenCalledWith(id, "owner");
  });

  it("requires same-origin before cancellation/deletion", async () => {
    mocks.sameOrigin.mockReturnValue(false);
    expect((await DELETE(req("DELETE") as never, context)).status).toBe(403);
    expect(mocks.getForOwner).not.toHaveBeenCalled();
  });

  it("cancels an active owner build without deleting its recovery record", async () => {
    mocks.getForOwner.mockResolvedValue({
      id,
      status: "generating",
      sandboxId: null,
    });
    expect((await DELETE(req("DELETE") as never, context)).status).toBe(202);
    expect(mocks.cancelForOwner).toHaveBeenCalledWith(id, "owner");
    expect(mocks.deleteForOwner).not.toHaveBeenCalled();
  });

  it("refuses to kill a sandbox when provider ownership cannot be proven", async () => {
    mocks.getForOwner.mockResolvedValue({
      id,
      status: "ready",
      sandboxId: "sbx_other",
    });
    mocks.isSandboxOwner.mockResolvedValue(false);
    expect((await DELETE(req("DELETE") as never, context)).status).toBe(409);
    expect(mocks.kill).not.toHaveBeenCalled();
    expect(mocks.deleteForOwner).not.toHaveBeenCalled();
  });

  it("kills the verified owner sandbox before deleting the completed build", async () => {
    mocks.getForOwner.mockResolvedValue({
      id,
      status: "ready",
      sandboxId: "sbx_owned",
    });
    expect((await DELETE(req("DELETE") as never, context)).status).toBe(204);
    expect(mocks.isSandboxOwner).toHaveBeenCalledWith("sbx_owned", "owner");
    expect(mocks.kill).toHaveBeenCalledWith("sbx_owned", {
      apiKey: process.env.E2B_API_KEY,
    });
    expect(mocks.markState).toHaveBeenCalledWith("sbx_owned", "killed");
    expect(mocks.deleteForOwner).toHaveBeenCalledWith(id, "owner");
  });
});
