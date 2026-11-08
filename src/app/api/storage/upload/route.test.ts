import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: { user: { id: "owner-1" } } as { user: { id: string } } | null,
  storageCheck: { isValid: true } as {
    isValid: boolean;
    error?: string;
    solution?: string;
  },
  upload: vi.fn(),
  contentLength: null as string | null,
  formData: vi.fn(),
}));

vi.mock("auth/server", () => ({
  getSession: vi.fn(async () => mocks.session),
}));
vi.mock("lib/file-storage", () => ({
  storageDriver: "test",
  serverFileStorage: { upload: mocks.upload },
}));
vi.mock("../actions", () => ({
  checkStorageAction: vi.fn(async () => mocks.storageCheck),
}));

import { POST } from "./route";

function request() {
  return {
    headers: {
      get: (name: string) =>
        name === "content-length" ? mocks.contentLength : null,
    },
    formData: mocks.formData,
  } as unknown as Request;
}

beforeEach(() => {
  mocks.session = { user: { id: "owner-1" } };
  mocks.storageCheck = { isValid: true };
  mocks.contentLength = null;
  mocks.formData.mockReset();
  mocks.upload.mockReset().mockResolvedValue({
    key: "uploads/owner-1/file.txt",
    sourceUrl: "/api/files/uploads/owner-1/file.txt",
    metadata: { size: 4 },
  });
});

describe("POST /api/storage/upload", () => {
  it("requires authentication before checking storage or parsing the body", async () => {
    mocks.session = null;
    const response = await POST(request());
    expect(response.status).toBe(401);
    expect(mocks.formData).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("rejects oversized declared multipart bodies before parsing", async () => {
    mocks.contentLength = String(17 * 1024 * 1024);
    const response = await POST(request());
    expect(response.status).toBe(413);
    expect(mocks.formData).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("rejects a file over 15 MiB before reading its bytes", async () => {
    const file = {
      size: 15 * 1024 * 1024 + 1,
      arrayBuffer: vi.fn(),
    };
    mocks.formData.mockResolvedValue({ get: () => file });
    const response = await POST(request());
    expect(response.status).toBe(413);
    expect(file.arrayBuffer).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("blocks active content types before reading or storing the file", async () => {
    const file = new File(["<svg/>"], "unsafe.svg", { type: "image/svg+xml" });
    mocks.formData.mockResolvedValue({ get: () => file });
    const response = await POST(request());
    expect(response.status).toBe(415);
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("passes the authenticated owner to storage for valid files", async () => {
    const file = new File(["safe"], "notes.txt", { type: "text/plain" });
    mocks.formData.mockResolvedValue({ get: () => file });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(mocks.upload).toHaveBeenCalledWith(expect.any(Buffer), {
      filename: "notes.txt",
      contentType: "text/plain",
      ownerId: "owner-1",
    });
  });

  it("does not upload when storage configuration is unavailable", async () => {
    mocks.storageCheck = {
      isValid: false,
      error: "storage unavailable",
      solution: "configure storage",
    };
    const response = await POST(request());
    expect(response.status).toBe(500);
    expect(mocks.formData).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
  });
});
