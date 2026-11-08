import { describe, expect, it, vi } from "vitest";
import {
  requestVoiceMcpApproval,
  stripMcpApprovalField,
} from "./mcp-voice-approval";

const draft = {
  agentId: "00000000-0000-4000-8000-000000000002",
  serverId: "00000000-0000-4000-8000-000000000001",
  serverName: "CRM",
  toolName: "update_record",
  serverConfigFingerprint: "a".repeat(64),
  payload: { id: "42", fields: { status: "active" } },
};

describe("requestVoiceMcpApproval", () => {
  it("shows the exact action and issues a token only after approval", async () => {
    const confirmAction = vi.fn((_message: string) => true);
    const fetcher = vi.fn(
      async (_url: RequestInfo | URL, init?: RequestInit) => {
        expect(JSON.parse(String(init?.body))).toEqual(draft);
        return Response.json({ approvalToken: "one-use-token" });
      },
    );
    await expect(
      requestVoiceMcpApproval(draft, { confirmAction, fetcher }),
    ).resolves.toBe("one-use-token");
    expect(confirmAction).toHaveBeenCalledWith(
      expect.stringContaining('"status": "active"'),
    );
    expect(confirmAction.mock.calls[0]?.[0]).not.toContain(
      draft.serverConfigFingerprint,
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("shows secret-like fields redacted first, then requires review of exact values", async () => {
    const confirmAction = vi.fn((_message: string) => true);
    const fetcher = vi.fn(
      async (_url: RequestInfo | URL, init?: RequestInit) => {
        expect(JSON.parse(String(init?.body))).toMatchObject({
          agentId: draft.agentId,
          payload: { api_key: "private-value" },
        });
        return Response.json({ approvalToken: "one-use-token" });
      },
    );
    await expect(
      requestVoiceMcpApproval(
        { ...draft, payload: { api_key: "private-value", action: "update" } },
        { confirmAction, fetcher },
      ),
    ).resolves.toBe("one-use-token");
    expect(confirmAction).toHaveBeenCalledTimes(2);
    expect(confirmAction.mock.calls[0]?.[0]).not.toContain("private-value");
    expect(confirmAction.mock.calls[0]?.[0]).toContain("[redacted");
    expect(confirmAction.mock.calls[1]?.[0]).toContain("private-value");
  });

  it("does not issue or dispatch when exact secret-field review is declined", async () => {
    const confirmAction = vi
      .fn((_message: string) => true)
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false);
    const fetcher = vi.fn();
    await expect(
      requestVoiceMcpApproval(
        { ...draft, payload: { password: "private-value" } },
        { confirmAction, fetcher },
      ),
    ).resolves.toBeNull();
    expect(confirmAction).toHaveBeenCalledTimes(2);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("does not request a token when the user rejects the action", async () => {
    const confirmAction = vi.fn((_message: string) => false);
    const fetcher = vi.fn();
    await expect(
      requestVoiceMcpApproval(draft, { confirmAction, fetcher }),
    ).resolves.toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("fails closed if the session has no valid proposal-time config fingerprint", async () => {
    const confirmAction = vi.fn((_message: string) => true);
    const fetcher = vi.fn();
    await expect(
      requestVoiceMcpApproval(
        { ...draft, serverConfigFingerprint: "" },
        { confirmAction, fetcher },
      ),
    ).rejects.toThrow(/configuration changed/i);
    expect(confirmAction).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("fails closed when the approval service does not return a token", async () => {
    await expect(
      requestVoiceMcpApproval(draft, {
        confirmAction: () => true,
        fetcher: vi.fn(async () =>
          Response.json({ error: "denied" }, { status: 403 }),
        ),
      }),
    ).rejects.toThrow("denied");
  });
});

describe("stripMcpApprovalField", () => {
  it("removes the internal approval property from provider-visible voice schemas without mutating the source", () => {
    const source = {
      type: "object",
      properties: {
        id: { type: "string" },
        voidAgentApprovalToken: { type: "string" },
      },
      required: ["id", "voidAgentApprovalToken"],
    };
    const result = stripMcpApprovalField(source, "voidAgentApprovalToken");
    expect(result.properties).toEqual({ id: { type: "string" } });
    expect(result.required).toEqual(["id"]);
    expect(source.required).toEqual(["id", "voidAgentApprovalToken"]);
  });

  it("preserves ordinary schemas when no approval field was injected", () => {
    const schema = { properties: { id: { type: "string" } }, required: ["id"] };
    expect(stripMcpApprovalField(schema, undefined)).toBe(schema);
  });
});
