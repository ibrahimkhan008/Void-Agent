import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSandboxMock, runCodeMock, killMock } = vi.hoisted(() => ({
  createSandboxMock: vi.fn(),
  runCodeMock: vi.fn(),
  killMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/e2b/create-sandbox", () => ({
  createSandbox: (...args: unknown[]) => createSandboxMock(...args),
  errorLabel: (error: unknown) =>
    error instanceof Error ? `${error.name}: ${error.message}` : String(error),
}));
vi.mock("@/lib/e2b/sandbox-registry", () => ({
  getExecutionTemplateId: () => "void-agent-code-interpreter",
}));

import { executeHookScript } from "./script-executor";

describe("executeHookScript", () => {
  beforeEach(() => {
    vi.stubEnv("E2B_API_KEY", "test-key");
    createSandboxMock.mockReset();
    runCodeMock.mockReset();
    killMock.mockReset();
    runCodeMock.mockResolvedValue({
      logs: { stdout: ["script output"], stderr: [] },
      results: [],
    });
    killMock.mockResolvedValue(undefined);
    createSandboxMock.mockResolvedValue({
      runCode: runCodeMock,
      kill: killMock,
    });
  });

  it("runs JavaScript with bounded payload and network disabled, then kills the sandbox", async () => {
    const result = await executeHookScript({
      script: { language: "javascript", source: "console.log(payload.value)" },
      payload: { value: "ok" },
      userId: "user-1",
    });

    expect(result).toMatchObject({ success: true, output: "script output" });
    expect(createSandboxMock).toHaveBeenCalledWith(
      "void-agent-code-interpreter",
      expect.objectContaining({
        allowInternetAccess: false,
        secure: true,
        network: { allowOut: [], denyOut: ["0.0.0.0/0", "::/0"] },
        billing: { userId: "user-1", customerId: null },
      }),
    );
    expect(runCodeMock.mock.calls[0][0]).toContain("payload.value");
    expect(runCodeMock.mock.calls[0][0]).toContain("JSON.parse");
    expect(runCodeMock.mock.calls[0][1]).toEqual({
      language: "js",
      timeoutMs: 30_000,
    });
    expect(killMock).toHaveBeenCalledOnce();
  });

  it("transpiles TypeScript before JavaScript execution", async () => {
    await executeHookScript({
      script: {
        language: "typescript",
        source: "const answer: number = 42; console.log(answer);",
      },
      payload: {},
      userId: "user-1",
    });

    expect(runCodeMock.mock.calls[0][0]).toContain("const answer = 42");
    expect(runCodeMock.mock.calls[0][1].language).toBe("js");
  });

  it("runs Python using the Python runtime", async () => {
    await executeHookScript({
      script: { language: "python", source: "print(payload['value'])" },
      payload: { value: "ok" },
      userId: "user-1",
    });

    expect(runCodeMock.mock.calls[0][0]).toContain("payload = json.loads");
    expect(runCodeMock.mock.calls[0][1].language).toBe("python");
  });

  it("fails closed when E2B is unavailable or source exceeds its limit", async () => {
    vi.stubEnv("E2B_API_KEY", "");
    const unavailable = await executeHookScript({
      script: { language: "javascript", source: "" },
      payload: {},
      userId: "u1",
    });
    expect(unavailable.success).toBe(false);
    expect(createSandboxMock).not.toHaveBeenCalled();

    vi.stubEnv("E2B_API_KEY", "test-key");
    const oversized = await executeHookScript({
      script: { language: "javascript", source: "x".repeat(16_001) },
      payload: {},
      userId: "u1",
    });
    expect(oversized.error).toContain("character limit");
    expect(createSandboxMock).not.toHaveBeenCalled();
  });

  it("rejects oversized event payloads before allocating a sandbox", async () => {
    const result = await executeHookScript({
      script: { language: "python", source: "print(payload)" },
      payload: { message: "x".repeat(24_001) },
      userId: "u1",
    });
    expect(result.error).toContain("payload exceeds");
    expect(createSandboxMock).not.toHaveBeenCalled();
  });

  it("caps output returned from the sandbox", async () => {
    runCodeMock.mockResolvedValue({
      logs: { stdout: ["x".repeat(20_000)], stderr: [] },
      results: [],
    });
    const result = await executeHookScript({
      script: { language: "javascript", source: "console.log('x')" },
      payload: {},
      userId: "u1",
    });
    expect(result.output).toHaveLength(12_000);
  });

  it("returns sandbox runtime errors and always kills the sandbox", async () => {
    runCodeMock.mockResolvedValue({
      logs: { stdout: [], stderr: [] },
      results: [],
      error: { name: "RuntimeError", value: "failed" },
    });
    const result = await executeHookScript({
      script: { language: "javascript", source: "throw new Error('failed')" },
      payload: {},
      userId: "u1",
    });
    expect(result).toMatchObject({
      success: false,
      error: "RuntimeError: failed",
    });
    expect(killMock).toHaveBeenCalledOnce();
  });
});
