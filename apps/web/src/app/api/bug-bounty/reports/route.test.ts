import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listByUser: vi.fn(),
  create: vi.fn(),
  hasSameOrigin: vi.fn(),
}));

vi.mock("auth/route-guard", () => ({
  withAuth: (handler: (...args: any[]) => unknown) => (request?: Request) =>
    handler(
      request ?? new NextRequest("https://app.test/api/bug-bounty/reports"),
      {
        user: { id: "user-1" },
      },
    ),
}));
vi.mock("lib/security/same-origin", () => ({
  hasSameOrigin: mocks.hasSameOrigin,
}));
vi.mock("lib/db/repository", () => ({
  bugReportRepository: { listByUser: mocks.listByUser, create: mocks.create },
}));

import { GET, POST } from "./route";

const VALID_PAYLOAD = {
  title: "Streaming drops after 30s",
  description:
    "The chat stream dies mid-answer on long responses. Reproducible every time.",
  severity: "high",
};

const post = (body: string, origin = "https://app.test") =>
  new NextRequest("https://app.test/api/bug-bounty/reports", {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body,
  });

describe("/api/bug-bounty/reports", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasSameOrigin.mockReturnValue(true);
    mocks.listByUser.mockResolvedValue([
      { id: "r1", userId: "user-1", status: "pending" },
    ]);
    mocks.create.mockImplementation(
      async (userId: string, input: Record<string, unknown>) => ({
        id: "r2",
        userId,
        status: "pending",
        ...input,
      }),
    );
  });

  it("lists only the signed-in reporter's own reports", async () => {
    const response = await GET(
      new NextRequest("https://app.test/api/bug-bounty/reports"),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      reports: [{ id: "r1", userId: "user-1", status: "pending" }],
    });
    expect(mocks.listByUser).toHaveBeenCalledWith("user-1");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("creates a validated, owner-scoped report with defaults applied", async () => {
    const response = await POST(
      post(JSON.stringify({ ...VALID_PAYLOAD, affectedArea: "  Chat  " })),
    );
    expect(response.status).toBe(201);
    // Omitted optional fields stay absent from the parsed payload; the
    // repository coerces them to their storage defaults.
    const stored = mocks.create.mock.calls[0][1] as Record<string, unknown>;
    expect(stored).toMatchObject({
      title: "Streaming drops after 30s",
      severity: "high",
      category: "other",
      reproductionSteps: "",
      impact: "",
      affectedArea: "Chat",
    });
    expect(stored.proofOfConcept).toBeUndefined();
  });

  it("strips unknown fields instead of trusting them", async () => {
    await POST(post(JSON.stringify({ ...VALID_PAYLOAD, userId: "attacker" })));
    const stored = mocks.create.mock.calls[0][1] as Record<string, unknown>;
    expect(stored.userId).toBeUndefined();
  });

  it("rejects cross-origin submissions", async () => {
    mocks.hasSameOrigin.mockReturnValue(false);
    const response = await POST(
      post(JSON.stringify(VALID_PAYLOAD), "https://evil.test"),
    );
    expect(response.status).toBe(403);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON without touching the repository", async () => {
    const response = await POST(post("not-json"));
    expect(response.status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("enforces the title lower bound of 8 characters", async () => {
    const response = await POST(
      post(JSON.stringify({ ...VALID_PAYLOAD, title: "short" })),
    );
    expect(response.status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("enforces the title upper bound of 160 characters", async () => {
    const response = await POST(
      post(
        JSON.stringify({
          ...VALID_PAYLOAD,
          title: "x".repeat(161),
        }),
      ),
    );
    expect(response.status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("accepts a title of exactly 160 characters", async () => {
    const response = await POST(
      post(JSON.stringify({ ...VALID_PAYLOAD, title: "x".repeat(160) })),
    );
    expect(response.status).toBe(201);
  });

  it("enforces the description lower bound of 20 characters", async () => {
    const response = await POST(
      post(JSON.stringify({ ...VALID_PAYLOAD, description: "too short" })),
    );
    expect(response.status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("enforces the description upper bound of 20,000 characters", async () => {
    const response = await POST(
      post(
        JSON.stringify({
          ...VALID_PAYLOAD,
          description: "y".repeat(20_001),
        }),
      ),
    );
    expect(response.status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("rejects severities outside the published enum", async () => {
    const response = await POST(
      post(JSON.stringify({ ...VALID_PAYLOAD, severity: "apocalyptic" })),
    );
    expect(response.status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("rejects categories outside the published enum", async () => {
    const response = await POST(
      post(JSON.stringify({ ...VALID_PAYLOAD, category: "haha" })),
    );
    expect(response.status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("returns a generic 500 when the repository fails", async () => {
    mocks.create.mockRejectedValue(new Error("pool exhausted"));
    const response = await POST(post(JSON.stringify(VALID_PAYLOAD)));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Internal error" });
  });
});
