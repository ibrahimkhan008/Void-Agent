import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  textApi: vi.fn(),
  consume: vi.fn(),
}));

vi.mock("lib/connectors/provider-api", () => ({
  callConnectorApi: mocks.api,
  callConnectorTextApi: mocks.textApi,
  ConnectorApiError: class ConnectorApiError extends Error {},
}));
vi.mock(
  "lib/db/pg/repositories/connector-action-approval-repository.pg",
  () => ({
    connectorActionApprovalRepository: { consume: mocks.consume },
  }),
);

import { createDriveToolForUser } from "./drive-tool";

const execute = (input: Record<string, unknown>) =>
  (createDriveToolForUser("drive-owner") as any).execute(input, {});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.consume.mockResolvedValue(false);
  mocks.api.mockImplementation(
    async (_user: string, _provider: string, path: string) => {
      if (path === "/drive/v3/files")
        return { files: [{ id: "file-1", name: "Notes" }] };
      if (path === "/drive/v3/files/file-1")
        return { id: "file-1", name: "Notes.txt", mimeType: "text/plain" };
      if (path === "/upload/drive/v3/files")
        return { id: "created-1", name: "Notes.txt" };
      return {};
    },
  );
  mocks.textApi.mockResolvedValue("bounded file contents");
});

describe("Google Drive connector tool", () => {
  it("lists a bounded result set for the authenticated owner", async () => {
    const result = await execute({ action: "list", maxResults: 1 });
    expect(result.files).toHaveLength(1);
    expect(mocks.api).toHaveBeenCalledWith(
      "drive-owner",
      "google-drive",
      "/drive/v3/files",
      expect.objectContaining({
        query: expect.objectContaining({ pageSize: 1 }),
      }),
    );
  });

  it("reads metadata and content only through owner-bound provider calls", async () => {
    const result = await execute({ action: "read", fileId: "file-1" });
    expect(result).toMatchObject({
      id: "file-1",
      content: "bounded file contents",
    });
    expect(mocks.api).toHaveBeenCalledWith(
      "drive-owner",
      "google-drive",
      "/drive/v3/files/file-1",
      expect.anything(),
    );
    expect(mocks.textApi).toHaveBeenCalledWith(
      "drive-owner",
      "google-drive",
      "/drive/v3/files/file-1",
      expect.objectContaining({
        query: { alt: "media" },
        maxResponseBytes: 100_000,
      }),
    );
  });

  it("does not create a file without exact owner-bound approval", async () => {
    const result = await execute({
      action: "create",
      name: "Notes.txt",
      mimeType: "text/plain",
      content: "approved bytes",
      approvalToken: "d".repeat(43),
    });
    expect(result).toMatchObject({
      error: expect.stringContaining("not been approved"),
    });
    expect(mocks.consume).toHaveBeenCalledWith("drive-owner", "d".repeat(43), {
      provider: "google-drive",
      action: "create",
      payload: {
        name: "Notes.txt",
        mimeType: "text/plain",
        content: "approved bytes",
      },
    });
    expect(mocks.api).not.toHaveBeenCalled();
  });

  it("creates only the exact approved file payload", async () => {
    mocks.consume.mockResolvedValue(true);
    const result = await execute({
      action: "create",
      name: "Notes.txt",
      mimeType: "text/plain",
      content: "approved bytes",
      approvalToken: "e".repeat(43),
    });
    expect(result).toEqual({
      success: true,
      file: { id: "created-1", name: "Notes.txt" },
    });
    expect(mocks.api).toHaveBeenCalledTimes(1);
    const [owner, provider, path, options] = mocks.api.mock.calls[0];
    expect([owner, provider, path]).toEqual([
      "drive-owner",
      "google-drive",
      "/upload/drive/v3/files",
    ]);
    expect(options.method).toBe("POST");
    expect(options.contentType).toMatch(
      /^multipart\/related; boundary=void-agent-/u,
    );
    expect(options.rawBody).toContain(
      '"name":"Notes.txt","mimeType":"text/plain"',
    );
    expect(options.rawBody).toContain("approved bytes");
  });
});
