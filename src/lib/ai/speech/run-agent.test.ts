import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ approve: vi.fn(), dispatch: vi.fn() }));
vi.mock("@/app/api/mcp/actions", () => ({
  callApprovedVoiceMcpToolAction: mocks.dispatch,
}));
vi.mock("./mcp-voice-approval", () => ({
  requestVoiceMcpApproval: mocks.approve,
}));

import { runVoiceAgent } from "./run-agent";

afterEach(() => vi.unstubAllGlobals());
beforeEach(() => {
  vi.clearAllMocks();
  mocks.approve.mockReset().mockResolvedValue(null);
  mocks.dispatch.mockReset().mockResolvedValue({ ok: true });
});

const agentId = "00000000-0000-4000-8000-000000000001";
const proposal = {
  serverId: "00000000-0000-4000-8000-000000000010",
  serverName: "CRM",
  toolName: "update_record",
  serverConfigFingerprint: "a".repeat(64),
  payload: { id: "42", status: "active" },
};

describe("runVoiceAgent", () => {
  it("posts only validated, bounded agent input to the same-origin route", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        agentId,
        agent: "Researcher",
        answer: "Answer.",
        proposals: [],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      runVoiceAgent({ agent: " Researcher ", question: " What changed? " }),
    ).resolves.toEqual({
      agent: "Researcher",
      answer: "Answer.",
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/voice/run-agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent: "Researcher", question: "What changed?" }),
    });
  });

  it("rejects malformed input before making a request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      runVoiceAgent({ agent: "Agent", question: "x".repeat(2_001) }),
    ).rejects.toThrow("up to 2,000 characters");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces the route's safe error and rejects malformed responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json(
            { error: "That agent is unavailable." },
            { status: 404 },
          ),
        ),
    );
    await expect(
      runVoiceAgent({ agent: "Hidden", question: "Help" }),
    ).rejects.toThrow("That agent is unavailable.");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ answer: "missing name" })),
    );
    await expect(
      runVoiceAgent({ agent: "Visible", question: "Help" }),
    ).rejects.toThrow("invalid response");
  });

  it("shows the exact proposal for approval and dispatches only with its one-use token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        agentId,
        agent: "Researcher",
        answer: "I prepared an update.",
        proposals: [proposal],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    mocks.approve.mockResolvedValueOnce("one-use-token");
    mocks.dispatch.mockResolvedValueOnce({ updated: true });

    const result = await runVoiceAgent({
      agent: "Researcher",
      question: "Update the record.",
    });

    expect(mocks.approve).toHaveBeenCalledWith({
      agentId,
      ...proposal,
      reviewLabel: "Delegated agent Researcher requests this MCP action.",
    });
    expect(mocks.dispatch).toHaveBeenCalledWith(
      agentId,
      proposal.serverId,
      proposal.serverName,
      proposal.toolName,
      proposal.payload,
      "one-use-token",
    );
    expect(result.actions).toEqual([
      {
        serverName: "CRM",
        toolName: "update_record",
        status: "approved",
        result: '{"updated":true}',
      },
    ]);
  });

  it("marks a fulfilled MCP error result as failed instead of claiming success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          agentId,
          agent: "Researcher",
          answer: "Review requested.",
          proposals: [proposal],
        }),
      ),
    );
    mocks.approve.mockResolvedValueOnce("one-use-token");
    mocks.dispatch.mockResolvedValueOnce({
      isError: true,
      error: { name: "ApprovalRequired", message: "Approval expired." },
    });

    const result = await runVoiceAgent({
      agent: "Researcher",
      question: "Update the record.",
    });

    expect(result.actions).toEqual([
      {
        serverName: "CRM",
        toolName: "update_record",
        status: "failed",
        error: "Approval expired.",
      },
    ]);
  });

  it("does not dispatch rejected or expired approvals", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() =>
        Promise.resolve(
          Response.json({
            agentId,
            agent: "Researcher",
            answer: "Review requested.",
            proposals: [proposal],
          }),
        ),
      ),
    );
    mocks.approve
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(new Error("MCP approval expired"));

    const rejected = await runVoiceAgent({
      agent: "Researcher",
      question: "Do it.",
    });
    expect(rejected.actions?.[0]?.status).toBe("rejected");
    expect(mocks.dispatch).not.toHaveBeenCalled();

    const expired = await runVoiceAgent({
      agent: "Researcher",
      question: "Do it.",
    });
    expect(expired.actions?.[0]).toMatchObject({
      status: "failed",
      error: "MCP approval expired",
    });
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });

  it("rejects excessive proposal arrays before execution", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          agentId,
          agent: "Researcher",
          answer: "Review requested.",
          proposals: Array.from({ length: 4 }, () => proposal),
        }),
      ),
    );
    await expect(
      runVoiceAgent({ agent: "Researcher", question: "Do it." }),
    ).rejects.toThrow("invalid response");
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });
});
