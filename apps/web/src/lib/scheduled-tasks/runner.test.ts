import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
// The runner imports these at module load; the executeAgentRun path under test
// does not touch them, so trivial stubs are enough to let the module import.
vi.mock("@/lib/db/pg/db.pg", () => ({ pgDb: {} }));
const internalEventMock = vi.hoisted(() => ({ fn: vi.fn(async () => 0) }));
vi.mock("@/lib/hooks/internal-events", () => ({
  publishInternalHookEvent: internalEventMock.fn,
}));
vi.mock("@/lib/push/send-push-to-user", () => ({
  sendPushToUser: vi.fn(),
}));

import { publishInternalHookEvent } from "@/lib/hooks/internal-events";
import { executeAgentRun, executeScheduledRun, isValidUUID } from "./runner";

const TASK = {
  id: "task-1",
  userId: "11111111-1111-1111-1111-111111111111",
  agentId: "22222222-2222-2222-2222-222222222222",
  inputPrompt: "Check my tasks",
  lastChatThreadId: "33333333-3333-3333-3333-333333333333",
} as any;

const AGENT = {
  id: "22222222-2222-2222-2222-222222222222",
  name: "Todoist Agent",
  model: "anthropic/claude-sonnet-5",
  organizationId: null,
} as any;

function streamResponse(
  status: number,
  finishReason: string | null = "stop",
  blockedReason?: string,
) {
  const body =
    finishReason === null
      ? "data: ok\n\n"
      : `data: ${JSON.stringify({
          type: "finish",
          finishReason,
          ...(blockedReason
            ? {
                messageMetadata: {
                  blocked: {
                    source: "browser-automation",
                    reason: blockedReason,
                  },
                },
              }
            : {}),
        })}\n\n`;
  return new Response(
    status === 200
      ? new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(body));
            controller.close();
          },
        })
      : "err",
    {
      status,
      headers:
        status === 200 ? { "content-type": "text/event-stream" } : undefined,
    },
  );
}

describe("executeAgentRun", () => {
  beforeEach(() => {
    internalEventMock.fn.mockClear();
    process.env.SCHEDULED_TASK_SECRET = "secret";
    process.env.NEXT_PUBLIC_BASE_URL = "https://staging.example.com";
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns success and reuses the stored thread on 200", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(streamResponse(200));

    const result = await executeAgentRun(TASK, AGENT);

    expect(result).toEqual({
      success: true,
      threadId: "33333333-3333-3333-3333-333333333333",
    });
    expect(publishInternalHookEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "agent.run.completed",
        userId: TASK.userId,
      }),
    );
    // Loopback carries the scheduled-task auth header + the agent's model.
    const [, init] = fetchMock.mock.calls[0]!;
    expect(
      (init!.headers as Record<string, string>)["X-Scheduled-Task-Auth"],
    ).toBe("secret");
    expect(JSON.parse(init!.body as string).chatModel).toEqual({
      provider: "anthropic",
      model: "claude-sonnet-5",
    });
  });

  /**
   * The false-success bug. A browser run that hits an identity check ends the
   * turn normally (`finishReason: "stop"`), so before this the owner was told
   * their scheduled run had "finished" when it had done nothing.
   */
  it("records a blocked run as a failure, not a success", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      streamResponse(200, "stop", "The sign-in needs a Smart-ID confirmation."),
    );

    const result = await executeAgentRun(TASK, AGENT);

    expect(result.success).toBe(false);
    expect(result.error).toContain("Smart-ID");
  });

  it("sends the task id so the route can load its per-task grants", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(streamResponse(200));

    await executeAgentRun(TASK, AGENT);

    const [, init] = fetchMock.mock.calls[0]!;
    expect(
      (init!.headers as Record<string, string>)["X-Scheduled-Task-Id"],
    ).toBe(TASK.id);
  });

  it("records a permanent failure (4xx) without throwing", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(streamResponse(403));

    const result = await executeAgentRun(TASK, AGENT);

    expect(result.success).toBe(false);
    expect(result.error).toContain("403");
  });

  it("throws on a transient failure (5xx) so Inngest retries", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(streamResponse(503));

    await expect(executeAgentRun(TASK, AGENT)).rejects.toThrow(/503/);
  });

  it("records a permanent failure (not success) when the secret is missing", async () => {
    delete process.env.SCHEDULED_TASK_SECRET;
    const fetchMock = vi.spyOn(globalThis, "fetch");

    const result = await executeAgentRun(TASK, AGENT);

    // The whole point of the fix: a missing secret must NOT report success.
    expect(result.success).toBe(false);
    expect(result.error).toContain("SCHEDULED_TASK_SECRET");
    // And it must fail before making the loopback request at all.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("treats a redirect (auth bounce) as failure, never success", async () => {
    // The old code followed redirects to /sign-in (200 HTML) and reported
    // success. redirect:manual surfaces the 3xx; we must reject it.
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 307, headers: { location: "/sign-in" } }),
    );

    const result = await executeAgentRun(TASK, AGENT);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/bounce|redirect|SCHEDULED_TASK_SECRET/i);
  });

  it("rejects a non-event-stream body (e.g. an auth HTML page)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("<html>sign in</html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
    );

    const result = await executeAgentRun(TASK, AGENT);

    expect(result.success).toBe(false);
    expect(result.error).toContain("content-type");
  });

  it("fails a run that stopped on an unanswered tool call", async () => {
    // The incident: the model called a client-side code tool on a run with no
    // browser, the loop halted, and the drained stream still looked healthy.
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      streamResponse(200, "tool-calls"),
    );

    const result = await executeAgentRun(TASK, AGENT);

    expect(result.success).toBe(false);
    expect(result.error).toContain("tool-calls");
  });

  it("fails a run whose stream ended without finishing", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(streamResponse(200, null));

    const result = await executeAgentRun(TASK, AGENT);

    expect(result.success).toBe(false);
    expect(result.error).toContain("without completing");
  });

  it("passes redirect:manual so fetch does not silently follow the bounce", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(streamResponse(200));

    await executeAgentRun(TASK, AGENT);

    const [, init] = fetchMock.mock.calls[0]!;
    expect(init!.redirect).toBe("manual");
  });
});

describe("isValidUUID", () => {
  it("accepts a v4 uuid and rejects junk", () => {
    expect(isValidUUID("33333333-3333-3333-3333-333333333333")).toBe(true);
    expect(isValidUUID("scheduled-task-abc")).toBe(false);
    expect(isValidUUID(null)).toBe(false);
  });
});

describe("executeScheduledRun (cloud-agent)", () => {
  let originalE2bKey: string | undefined;

  beforeEach(() => {
    process.env.SCHEDULED_TASK_SECRET = "secret";
    process.env.NEXT_PUBLIC_BASE_URL = "https://staging.example.com";
    originalE2bKey = process.env.E2B_API_KEY;
    process.env.E2B_API_KEY = "test-e2b-key";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalE2bKey === undefined) {
      delete process.env.E2B_API_KEY;
    } else {
      process.env.E2B_API_KEY = originalE2bKey;
    }
  });

  const CLOUD_TASK = {
    ...TASK,
    agentId: null,
    executionMode: "cloud-agent" as const,
  };

  it("fails permanently, without a loopback call, when E2B is not configured", async () => {
    delete process.env.E2B_API_KEY;
    const fetchMock = vi.spyOn(globalThis, "fetch");

    const result = await executeScheduledRun(CLOUD_TASK, null);

    // The run promises an E2B sandbox in its prompt; without the key that
    // promise is a lie, so the run must fail instead of "succeeding" with a
    // model that can only apologize for failed code calls.
    expect(result.success).toBe(false);
    expect(result.error).toContain("E2B");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the E2B-backed code toolkit and the Cloud Agent framing", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(streamResponse(200));

    const result = await executeScheduledRun(CLOUD_TASK, null);

    expect(result).toEqual({
      success: true,
      threadId: TASK.lastChatThreadId,
    });
    const body = JSON.parse(fetchMock.mock.calls[0]![1]!.body as string);
    expect(body.allowedAppDefaultToolkit).toEqual([
      "webSearch",
      "memory",
      "code",
    ]);
    expect(body.message.parts[0].text).toContain("Cloud Agent");
    expect(body.message.parts[0].text).toContain("E2B code sandbox");
  });

  it("does not gate chat-mode runs on E2B", async () => {
    delete process.env.E2B_API_KEY;
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(streamResponse(200));

    const result = await executeScheduledRun(
      { ...TASK, agentId: null, executionMode: "chat" },
      null,
    );

    expect(result.success).toBe(true);
    const body = JSON.parse(fetchMock.mock.calls[0]![1]!.body as string);
    expect(body.allowedAppDefaultToolkit).toEqual(["webSearch", "memory"]);
    expect(body.message.parts[0].text).not.toContain("Cloud Agent");
  });
});
