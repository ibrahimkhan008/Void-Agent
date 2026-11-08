import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const sessionMock = vi.fn();
const checkAccessMock = vi.fn();
const selectThreadMock = vi.fn();
const forkThreadMock = vi.fn();
const getProjectAccessMock = vi.fn();
const getTeamRoleMock = vi.fn();

vi.mock("auth/server", () => ({
  getSession: (...args: any[]) => sessionMock(...args),
}));

vi.mock("lib/db/repository", () => ({
  chatRepository: {
    checkAccess: (...args: any[]) => checkAccessMock(...args),
    selectThread: (...args: any[]) => selectThreadMock(...args),
    forkThread: (...args: any[]) => forkThreadMock(...args),
  },
}));
vi.mock("lib/projects/access", () => ({
  getProjectAccess: (...args: any[]) => getProjectAccessMock(...args),
  getTeamRole: (...args: any[]) => getTeamRoleMock(...args),
}));
vi.mock("lib/projects/policy", () => ({
  canEditProjectRole: (role: string | null | undefined) =>
    role === "owner" || role === "editor",
}));

import { ForkSnapshotLimitError } from "lib/chat/fork-limits";
// Import after mocks.
import { POST } from "./route";

const validParams = { params: Promise.resolve({ id: "src-thread-1" }) } as any;

const makeRequest = (body: unknown) =>
  new Request("http://localhost/api/thread/src-thread-1/fork", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

const okSession = { user: { id: "user-1" } };

describe("POST /api/thread/[id]/fork", () => {
  beforeEach(() => {
    sessionMock.mockReset();
    checkAccessMock.mockReset();
    selectThreadMock.mockReset();
    forkThreadMock.mockReset();
    getProjectAccessMock.mockReset();
    getTeamRoleMock.mockReset();
    selectThreadMock.mockResolvedValue({
      id: "src-thread-1",
      userId: "user-1",
      projectId: null,
      orgId: null,
    });
  });

  it("returns 401 when not signed in", async () => {
    sessionMock.mockResolvedValue(null);
    const res = await POST(
      makeRequest({ forkFromMessageId: "m1" }),
      validParams,
    );
    expect(res.status).toBe(401);
    expect(forkThreadMock).not.toHaveBeenCalled();
  });

  it("returns 401 when session has no user id", async () => {
    sessionMock.mockResolvedValue({ user: {} });
    const res = await POST(
      makeRequest({ forkFromMessageId: "m1" }),
      validParams,
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid JSON", async () => {
    sessionMock.mockResolvedValue(okSession);
    const res = await POST(makeRequest("{not-json"), validParams);
    expect(res.status).toBe(400);
  });

  it("returns 400 when forkFromMessageId is missing", async () => {
    sessionMock.mockResolvedValue(okSession);
    const res = await POST(makeRequest({ branchLabel: "v2" }), validParams);
    expect(res.status).toBe(400);
    const text = await res.text();
    expect(text).toContain("forkFromMessageId");
  });

  it("returns 400 when forkFromMessageId is empty", async () => {
    sessionMock.mockResolvedValue(okSession);
    const res = await POST(makeRequest({ forkFromMessageId: "" }), validParams);
    expect(res.status).toBe(400);
  });

  it("returns 400 when branchLabel is empty string", async () => {
    sessionMock.mockResolvedValue(okSession);
    const res = await POST(
      makeRequest({ forkFromMessageId: "m1", branchLabel: "" }),
      validParams,
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when branchLabel is non-string", async () => {
    sessionMock.mockResolvedValue(okSession);
    const res = await POST(
      makeRequest({ forkFromMessageId: "m1", branchLabel: 42 }),
      validParams,
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when branchLabel is over 100 characters", async () => {
    sessionMock.mockResolvedValue(okSession);
    const res = await POST(
      makeRequest({
        forkFromMessageId: "m1",
        branchLabel: "x".repeat(101),
      }),
      validParams,
    );
    expect(res.status).toBe(400);
    const text = await res.text();
    expect(text).toContain("100");
  });

  it("returns 404 when the user does not own the source thread", async () => {
    sessionMock.mockResolvedValue(okSession);
    checkAccessMock.mockResolvedValue(false);
    const res = await POST(
      makeRequest({ forkFromMessageId: "m1" }),
      validParams,
    );
    expect(res.status).toBe(404);
    expect(forkThreadMock).not.toHaveBeenCalled();
  });

  it("rechecks project access and blocks viewers from creating a project fork", async () => {
    sessionMock.mockResolvedValue(okSession);
    checkAccessMock.mockResolvedValue(true);
    selectThreadMock.mockResolvedValue({
      id: "src-thread-1",
      userId: "user-1",
      projectId: "project-1",
      orgId: "team-1",
    });
    getProjectAccessMock.mockResolvedValue({ role: "viewer" });

    const res = await POST(
      makeRequest({ forkFromMessageId: "m1" }),
      validParams,
    );

    expect(res.status).toBe(403);
    expect(getProjectAccessMock).toHaveBeenCalledWith("project-1", "user-1");
    expect(forkThreadMock).not.toHaveBeenCalled();
  });

  it("allows an authorized project editor to fork while preserving project scope", async () => {
    sessionMock.mockResolvedValue(okSession);
    checkAccessMock.mockResolvedValue(true);
    selectThreadMock.mockResolvedValue({
      id: "src-thread-1",
      userId: "user-1",
      projectId: "project-1",
      orgId: "team-1",
    });
    getProjectAccessMock.mockResolvedValue({ role: "editor" });
    forkThreadMock.mockResolvedValue({
      id: "new-thread-3",
      title: "original (branch)",
      userId: "user-1",
      projectId: "project-1",
      createdAt: new Date(),
    });

    const res = await POST(
      makeRequest({ forkFromMessageId: "m1" }),
      validParams,
    );

    expect(res.status).toBe(200);
    expect(getProjectAccessMock).toHaveBeenCalledWith("project-1", "user-1");
    expect(forkThreadMock).toHaveBeenCalledWith(
      { sourceThreadId: "src-thread-1", forkFromMessageId: "m1" },
      "user-1",
    );
  });

  it("returns 200 with the new thread on success", async () => {
    sessionMock.mockResolvedValue(okSession);
    checkAccessMock.mockResolvedValue(true);
    const newThread = {
      id: "new-thread-1",
      title: "original (branch)",
      userId: "user-1",
      parentThreadId: "src-thread-1",
      forkFromMessageId: "m1",
      createdAt: new Date(),
    };
    forkThreadMock.mockResolvedValue(newThread);

    const res = await POST(
      makeRequest({ forkFromMessageId: "m1" }),
      validParams,
    );
    expect(res.status).toBe(200);
    expect(forkThreadMock).toHaveBeenCalledWith(
      { sourceThreadId: "src-thread-1", forkFromMessageId: "m1" },
      "user-1",
    );
    const body = await res.json();
    expect(body.id).toBe("new-thread-1");
  });

  it("forwards branchLabel when provided", async () => {
    sessionMock.mockResolvedValue(okSession);
    checkAccessMock.mockResolvedValue(true);
    forkThreadMock.mockResolvedValue({
      id: "new-thread-2",
      title: "original (v2)",
      userId: "user-1",
      parentThreadId: "src-thread-1",
      forkFromMessageId: "m1",
      branchLabel: "v2",
      createdAt: new Date(),
    });

    const res = await POST(
      makeRequest({ forkFromMessageId: "m1", branchLabel: "v2" }),
      validParams,
    );
    expect(res.status).toBe(200);
    expect(forkThreadMock).toHaveBeenCalledWith(
      {
        sourceThreadId: "src-thread-1",
        forkFromMessageId: "m1",
        branchLabel: "v2",
      },
      "user-1",
    );
  });

  it("returns 404 when repository reports fork message not in thread", async () => {
    sessionMock.mockResolvedValue(okSession);
    checkAccessMock.mockResolvedValue(true);
    forkThreadMock.mockRejectedValue(
      new Error("Fork message not found in source thread"),
    );
    const res = await POST(
      makeRequest({ forkFromMessageId: "m1" }),
      validParams,
    );
    expect(res.status).toBe(404);
  });

  it("returns 413 when the fork prefix exceeds bounded snapshot limits", async () => {
    sessionMock.mockResolvedValue(okSession);
    checkAccessMock.mockResolvedValue(true);
    forkThreadMock.mockRejectedValue(new ForkSnapshotLimitError());

    const res = await POST(
      makeRequest({ forkFromMessageId: "m1" }),
      validParams,
    );

    expect(res.status).toBe(413);
    expect(await res.text()).toContain("Fork prefix exceeds limits");
  });

  it("returns 500 for unexpected repository errors", async () => {
    sessionMock.mockResolvedValue(okSession);
    checkAccessMock.mockResolvedValue(true);
    forkThreadMock.mockRejectedValue(new Error("database is on fire"));
    const res = await POST(
      makeRequest({ forkFromMessageId: "m1" }),
      validParams,
    );
    expect(res.status).toBe(500);
  });
});
