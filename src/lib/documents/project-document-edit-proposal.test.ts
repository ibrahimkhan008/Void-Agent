import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  owners: vi.fn(),
  select: vi.fn(),
  builder: {} as Record<string, ReturnType<typeof vi.fn>>,
  downloadLimited: vi.fn(),
  upload: vi.fn(),
  delete: vi.fn(),
  apply: vi.fn(),
  createPending: vi.fn(),
}));

mocks.builder.from = vi.fn(() => mocks.builder);
mocks.builder.innerJoin = vi.fn(() => mocks.builder);
mocks.builder.where = vi.fn(() => mocks.builder);
mocks.builder.limit = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("drizzle-orm", async (importOriginal) => ({
  ...(await importOriginal<typeof import("drizzle-orm")>()),
  and: (...args: unknown[]) => ({ op: "and", args }),
  eq: (...args: unknown[]) => ({ op: "eq", args }),
  inArray: (...args: unknown[]) => ({ op: "inArray", args }),
}));
vi.mock("lib/projects/access", () => ({
  getProjectAccess: mocks.access,
  getProjectCollectionSourceOwnerIds: mocks.owners,
  mayEditProject: (role: string) => role === "owner" || role === "editor",
}));
vi.mock("lib/db/pg/db.pg", () => ({ pgDb: { select: mocks.select } }));
vi.mock("lib/file-storage", () => ({
  serverFileStorage: {
    downloadLimited: mocks.downloadLimited,
    upload: mocks.upload,
    delete: mocks.delete,
  },
  storageDriver: "local",
}));
vi.mock("lib/documents/project-tracked-docx", () => ({
  MAX_TRACKED_DOCX_EDITS: 50,
  MAX_TRACKED_DOCX_INPUT_BYTES: 20 * 1024 * 1024,
  MAX_TRACKED_DOCX_OUTPUT_BYTES: 24 * 1024 * 1024,
  TRACKED_DOCX_CONTENT_TYPE:
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  TrackedDocxError: class TrackedDocxError extends Error {},
  applyTrackedEdits: mocks.apply,
}));
vi.mock(
  "lib/db/pg/repositories/project-document-edit-repository.pg",
  async () => {
    const { z } = await import("zod");
    return {
      projectDocumentEditProposalsSchema: z
        .array(
          z
            .object({
              originalText: z.string().min(1).max(10_000),
              suggestedText: z.string().min(1).max(10_000),
              rationale: z.string().max(2_000),
            })
            .strict(),
        )
        .max(50),
      projectDocumentEditRepository: { createPending: mocks.createPending },
    };
  },
);

import { ProjectDocumentTable } from "lib/db/pg/schema.pg";
import { createPendingProjectDocumentEdit } from "./project-document-edit-proposal";

const access = {
  project: { id: "project-1", collectionIds: ["collection-1"] },
  role: "editor",
};
const bytes = Buffer.from("source revision 1");
const source = {
  projectDocumentId: "project-document-1",
  filename: "draft.docx",
  storageKey: "user-1/project/draft.docx",
};
const args = {
  userId: "user-1",
  projectId: "project-1",
  documentId: "d7f4d9db-7e12-4f40-a620-40784839f14e",
  collectionIds: ["collection-1", "outside-collection"],
  filename: "draft.docx",
  proposals: [
    {
      originalText: "Original text",
      suggestedText: "Updated text",
      rationale: "Clarifies the point.",
    },
  ],
};

describe("chat-created project DOCX proposal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.access.mockResolvedValue(access);
    mocks.owners.mockResolvedValue(["source-owner"]);
    mocks.select.mockReturnValue(mocks.builder);
    mocks.builder.limit.mockResolvedValue([source]);
    mocks.downloadLimited.mockResolvedValue(bytes);
    mocks.apply.mockResolvedValue({
      bytes: Buffer.from("tracked candidate"),
      changes: [
        {
          id: "d7f4d9db-7e12-4f40-a620-40784839f14f",
          delId: "1",
          insId: "2",
        },
      ],
      errors: [],
    });
    mocks.upload.mockResolvedValue({ key: "user-1/project/candidate.docx" });
    mocks.delete.mockResolvedValue(undefined);
    mocks.createPending.mockResolvedValue({ id: "edit-1" });
  });

  it("requires current project editor access before reading a source", async () => {
    mocks.access.mockResolvedValue({ ...access, role: "viewer" });
    await expect(createPendingProjectDocumentEdit(args)).rejects.toThrow(
      /permission/i,
    );
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.downloadLimited).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("binds the pending proposal to the exact source revision and project document", async () => {
    const result = await createPendingProjectDocumentEdit(args);
    const sourceRevisionHash = createHash("sha256").update(bytes).digest("hex");

    expect(result).toEqual({
      editId: "edit-1",
      changes: args.proposals,
      sourceRevisionHash,
    });
    expect(mocks.apply).toHaveBeenCalledWith(bytes, args.proposals, {
      author: "Void-Agent",
    });
    expect(mocks.createPending).toHaveBeenCalledWith({
      projectId: args.projectId,
      projectDocumentId: source.projectDocumentId,
      createdByUserId: args.userId,
      sourceRevisionHash,
      candidateStorageKey: "user-1/project/candidate.docx",
      proposedEdits: args.proposals,
      trackedChanges: [
        {
          id: "d7f4d9db-7e12-4f40-a620-40784839f14f",
          delId: "1",
          insId: "2",
        },
      ],
    });
    expect(mocks.builder.where).toHaveBeenCalledTimes(2);
    expect(mocks.builder.where.mock.calls[0]?.[0]).toEqual({
      op: "and",
      args: expect.arrayContaining([
        { op: "eq", args: [ProjectDocumentTable.projectId, args.projectId] },
        {
          op: "eq",
          args: [ProjectDocumentTable.collectionItemId, args.documentId],
        },
      ]),
    });
  });

  it("refuses to persist when the source revision changes during preparation", async () => {
    mocks.downloadLimited
      .mockResolvedValueOnce(bytes)
      .mockResolvedValueOnce(Buffer.from("source revision 2"));

    await expect(createPendingProjectDocumentEdit(args)).rejects.toThrow(
      /source document changed/i,
    );
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.createPending).not.toHaveBeenCalled();
  });

  it("refuses partial or ambiguous anchors without uploading a review copy", async () => {
    mocks.apply.mockResolvedValue({
      bytes: Buffer.from("partial candidate"),
      changes: [],
      errors: [{ index: 0, reason: "anchor is ambiguous" }],
    });

    await expect(createPendingProjectDocumentEdit(args)).rejects.toThrow(
      /could not be matched exactly and uniquely/i,
    );
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.createPending).not.toHaveBeenCalled();
  });

  it("cleans up the private candidate if pending persistence fails", async () => {
    mocks.createPending.mockRejectedValue(new Error("database unavailable"));
    await expect(createPendingProjectDocumentEdit(args)).rejects.toThrow(
      "database unavailable",
    );
    expect(mocks.delete).toHaveBeenCalledWith("user-1/project/candidate.docx");
  });
});
