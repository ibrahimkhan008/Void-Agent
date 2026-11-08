import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  canCreateMCP: vi.fn(),
  saveMcpClientAction: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: mocks.getSession }));
vi.mock("lib/auth/permissions", () => ({
  canCreateMCP: mocks.canCreateMCP,
}));
vi.mock("./actions", () => ({
  saveMcpClientAction: mocks.saveMcpClientAction,
}));
vi.mock("better-auth", () => ({ logger: { error: mocks.loggerError } }));

import { POST } from "./route";

const validBody = {
  name: "Calendar-Server",
  config: { url: "https://calendar.example/mcp" },
};

function request(body: string, contentType = "application/json") {
  return new Request("https://app.example/api/mcp", {
    method: "POST",
    headers: { "content-type": contentType },
    body,
  });
}

describe("POST /api/mcp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: "user-1" } });
    mocks.canCreateMCP.mockResolvedValue(true);
    mocks.saveMcpClientAction.mockResolvedValue({
      client: { getInfo: () => ({ id: "mcp-1" }) },
    });
  });

  it("requires authentication and create permission before parsing or saving", async () => {
    mocks.getSession.mockResolvedValueOnce(null);
    expect(
      await POST(request(JSON.stringify(validBody))).then((r) => r.status),
    ).toBe(401);
    expect(mocks.canCreateMCP).not.toHaveBeenCalled();

    mocks.canCreateMCP.mockResolvedValueOnce(false);
    expect(
      await POST(request(JSON.stringify(validBody))).then((r) => r.status),
    ).toBe(403);
    expect(mocks.saveMcpClientAction).not.toHaveBeenCalled();
  });

  it("rejects malformed, unknown, and oversized payloads before connecting", async () => {
    const malformed = await POST(
      request(JSON.stringify({ ...validBody, config: { url: "not a URL" } })),
    );
    expect(malformed.status).toBe(400);

    const massAssignment = await POST(
      request(JSON.stringify({ ...validBody, userId: "another-user" })),
    );
    expect(massAssignment.status).toBe(400);

    const oversized = await POST(
      request(JSON.stringify({ ...validBody, padding: "x".repeat(65_536) })),
    );
    expect(oversized.status).toBe(413);
    expect(mocks.saveMcpClientAction).not.toHaveBeenCalled();
  });

  it("requires JSON content type", async () => {
    const response = await POST(
      request(JSON.stringify(validBody), "text/plain"),
    );
    expect(response.status).toBe(415);
    expect(mocks.saveMcpClientAction).not.toHaveBeenCalled();
  });

  it("passes only the validated MCP fields to the existing connection workflow", async () => {
    const response = await POST(
      request(JSON.stringify({ ...validBody, name: "  Calendar-Server  " })),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, id: "mcp-1" });
    expect(mocks.saveMcpClientAction).toHaveBeenCalledWith({
      ...validBody,
      userId: "user-1",
    });
  });
});
