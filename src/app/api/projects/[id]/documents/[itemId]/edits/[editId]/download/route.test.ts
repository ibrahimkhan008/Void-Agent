import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  access: vi.fn(),
  rate: vi.fn(),
  selectByProject: vi.fn(),
  resolvePending: vi.fn(),
  downloadLimited: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: mocks.session }));
vi.mock("lib/projects/project-document-edit-access", () => ({
  projectDocumentEditSource: mocks.access,
}));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: mocks.rate,
}));
vi.mock("lib/db/pg/repositories/project-document-edit-repository.pg", () => ({
  projectDocumentEditRepository: {
    selectByProject: mocks.selectByProject,
    resolvePending: mocks.resolvePending,
  },
}));
vi.mock("lib/file-storage", () => ({
  serverFileStorage: { downloadLimited: mocks.downloadLimited },
}));
vi.mock("lib/file-storage/storage-utils", () => ({
  sanitizeFilename: (name: string) => name.replace(/[\\/]/g, "_"),
}));
vi.mock("lib/errors", () => ({
  FileNotFoundError: class FileNotFoundError extends Error {},
}));
vi.mock("lib/logger", () => ({ default: { error: vi.fn() } }));

import { GET } from "./route";

const userId = "00000000-0000-4000-8000-000000000001";
const projectId = "00000000-0000-4000-8000-000000000002";
const itemId = "00000000-0000-4000-8000-000000000003";
const editId = "00000000-0000-4000-8000-000000000004";
const sourceBytes = Buffer.from("source-docx");

function params() {
  return Promise.resolve({ id: projectId, itemId, editId });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({ user: { id: userId } });
  mocks.access.mockResolvedValue({
    projectDocumentId: "00000000-0000-4000-8000-000000000005",
    filename: "brief.docx",
    storageKey: `${userId}/project-documents/original.docx`,
  });
  mocks.rate.mockResolvedValue({ allowed: true });
  mocks.selectByProject.mockResolvedValue({
    id: editId,
    projectDocumentId: "00000000-0000-4000-8000-000000000005",
    sourceRevisionHash: createHash("sha256").update(sourceBytes).digest("hex"),
    candidateStorageKey: `${userId}/project-edits/candidate.docx`,
    outputStorageKey: null,
    status: "pending",
  });
  mocks.downloadLimited.mockResolvedValue(sourceBytes);
  mocks.resolvePending.mockResolvedValue({ outcome: "stale" });
});

describe("project tracked DOCX download", () => {
  it("streams an owner-authorized current candidate without exposing its key", async () => {
    mocks.downloadLimited
      .mockResolvedValueOnce(sourceBytes)
      .mockResolvedValueOnce(Buffer.from("tracked-docx"));
    const response = await GET(new Request("https://void.test"), {
      params: params(),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("content-disposition")).toContain(
      "brief_tracked.docx",
    );
    expect(await response.text()).toBe("tracked-docx");
  });

  it("invalidates a candidate after its source document changes", async () => {
    mocks.selectByProject.mockResolvedValue({
      id: editId,
      projectDocumentId: "00000000-0000-4000-8000-000000000005",
      sourceRevisionHash: "f".repeat(64),
      candidateStorageKey: `${userId}/project-edits/candidate.docx`,
      outputStorageKey: null,
      status: "pending",
    });
    const response = await GET(new Request("https://void.test"), {
      params: params(),
    });
    expect(response.status).toBe(410);
    expect(mocks.resolvePending).toHaveBeenCalledWith({
      id: editId,
      projectId,
      currentSourceRevisionHash: createHash("sha256")
        .update(sourceBytes)
        .digest("hex"),
      decision: "rejected",
    });
    expect(mocks.downloadLimited).toHaveBeenCalledTimes(1);
  });
});
