import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getThreadSandbox: vi.fn(),
  resetThreadSandbox: vi.fn(),
  stageAgentFiles: vi.fn(),
  upload: vi.fn(),
  getInfo: vi.fn(),
  read: vi.fn(),
  run: vi.fn(),
}));

vi.mock("ai", () => ({ tool: (definition: unknown) => definition }));
vi.mock("lib/file-storage", () => ({
  serverFileStorage: { upload: mocks.upload },
}));
vi.mock("lib/sandbox/session", () => ({
  getThreadSandbox: mocks.getThreadSandbox,
  resetThreadSandbox: mocks.resetThreadSandbox,
}));
vi.mock("lib/sandbox/agent-files", () => ({
  stageAgentFiles: mocks.stageAgentFiles,
}));
vi.mock("lib/sandbox/client", () => ({
  getPreviewUrl: vi.fn(() => "https://sandbox.test"),
  isE2BConfigured: vi.fn(() => true),
  startDevServer: vi.fn(),
}));
vi.mock("lib/sandbox/templates", () => ({
  WORK_DIR: "/workspace",
  describeEnvironmentContents: vi.fn(() => ""),
  describeEnvironments: vi.fn(() => ""),
}));

import { MAX_SANDBOX_ARTIFACT_BYTES } from "lib/sandbox/artifact-export";
import { sandboxTool } from "./sandbox-tool";

function execute() {
  return (
    sandboxTool({ userId: "user-1", threadId: "thread-1" }) as unknown as {
      execute: (input: { action: string; path?: string }) => Promise<unknown>;
    }
  ).execute;
}

function setupSandbox(size = 7) {
  mocks.getInfo.mockImplementation(async (target: string) => ({
    type: ["/workspace", "/workspace/reports"].includes(target)
      ? "dir"
      : "file",
    size,
  }));
  mocks.read.mockResolvedValue(
    new Response(Uint8Array.from([1, 2, 3, 4, 5, 6, 7])).body,
  );
  mocks.getThreadSandbox.mockResolvedValue({
    sandbox: {
      files: {
        getInfo: mocks.getInfo,
        read: mocks.read,
      },
      commands: { run: mocks.run },
    },
    resolved: { id: "node", environment: {} },
    created: false,
  });
  mocks.stageAgentFiles.mockResolvedValue({ staged: 0, unavailable: [] });
  mocks.upload.mockResolvedValue({
    sourceUrl:
      "/api/files/uploads/user-1/00000000-0000-4000-8000-000000000001-report.pdf",
  });
}

describe("sandbox private artifact export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupSandbox();
  });

  it("uploads a bounded supported file with authenticated owner metadata", async () => {
    const result = await execute()({
      action: "export",
      path: "reports/report.pdf",
    });

    expect(result).toMatchObject({
      artifacts: [
        {
          filename: "report.pdf",
          mimeType: "application/pdf",
          sizeBytes: 7,
          url: "/api/files/uploads/user-1/00000000-0000-4000-8000-000000000001-report.pdf",
        },
      ],
    });
    expect(mocks.upload).toHaveBeenCalledWith(expect.any(Buffer), {
      filename: "report.pdf",
      contentType: "application/pdf",
      ownerId: "user-1",
    });
  });

  it("exports HTML only as an owner-bound private artifact for isolated preview", async () => {
    const html = Buffer.from("<main>preview</main>");
    setupSandbox(html.byteLength);
    mocks.read.mockResolvedValueOnce(new Response(html).body);

    const result = await execute()({
      action: "export",
      path: "preview.html",
    });

    expect(result).toMatchObject({
      artifacts: [
        {
          filename: "preview.html",
          mimeType: "text/html",
          sizeBytes: html.byteLength,
        },
      ],
    });
    expect(mocks.upload).toHaveBeenCalledWith(expect.any(Buffer), {
      filename: "preview.html",
      contentType: "text/html",
      ownerId: "user-1",
    });
  });

  it("rejects active content and path traversal before reading sandbox files", async () => {
    await expect(
      execute()({ action: "export", path: "../secret.pdf" }),
    ).resolves.toMatchObject({ error: "unsupported-artifact" });
    await expect(
      execute()({ action: "export", path: "image.svg" }),
    ).resolves.toMatchObject({ error: "unsupported-artifact" });
    expect(mocks.getInfo).not.toHaveBeenCalled();
    expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("rejects oversized files before reading or uploading bytes", async () => {
    setupSandbox(MAX_SANDBOX_ARTIFACT_BYTES + 1);
    await expect(
      execute()({ action: "export", path: "large.pdf" }),
    ).resolves.toMatchObject({ error: "artifact-too-large" });
    expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("rejects a symlinked workspace parent", async () => {
    mocks.getInfo.mockResolvedValueOnce({ type: "symlink", size: 0 });
    await expect(
      execute()({ action: "export", path: "reports/report.pdf" }),
    ).resolves.toMatchObject({ error: "artifact-not-found" });
    expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("does not upload when the file changes during bounded streaming", async () => {
    mocks.read.mockResolvedValueOnce(
      new Response(Uint8Array.from([1, 2])).body,
    );
    await expect(
      execute()({ action: "export", path: "report.pdf" }),
    ).resolves.toMatchObject({ error: "artifact-changed" });
    expect(mocks.upload).not.toHaveBeenCalled();
  });
});
