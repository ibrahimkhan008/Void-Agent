import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("n8n client workflow execution", () => {
  it("forwards bounded manual-trigger input to the n8n execution endpoint", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("{}", {
          status: 200,
          headers: { "set-cookie": "n8n-auth=session-token; Path=/" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { executionId: "run-1" } }), {
          status: 200,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const { createUserClient } = await import("./client");
    const client = createUserClient("user@example.test", "password");
    const input = { prompt: "hello" };
    await client.runWorkflow("workflow_123", {
      name: "Manual Trigger",
      data: { data: { main: [[{ json: input }]] } },
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[0]).toContain(
      "/rest/workflows/workflow_123/run",
    );
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({
      includeData: false,
      triggerToStartFrom: {
        name: "Manual Trigger",
        data: { data: { main: [[{ json: input }]] } },
      },
    });
  });
});
