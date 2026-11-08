import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  owners: vi.fn(),
  select: vi.fn(),
  and: vi.fn((...args: unknown[]) => ({ op: "and", args })),
  eq: vi.fn((...args: unknown[]) => ({ op: "eq", args })),
  inArray: vi.fn((...args: unknown[]) => ({ op: "inArray", args })),
  asc: vi.fn((...args: unknown[]) => ({ op: "asc", args })),
  query: [] as unknown[],
  builder: undefined as any,
  createPending: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("drizzle-orm", async (importOriginal) => ({
  ...(await importOriginal<typeof import("drizzle-orm")>()),
  and: mocks.and,
  eq: mocks.eq,
  inArray: mocks.inArray,
  asc: mocks.asc,
}));
vi.mock("lib/projects/access", () => ({
  getProjectAccess: mocks.access,
  getProjectCollectionSourceOwnerIds: mocks.owners,
}));
vi.mock("lib/db/pg/db.pg", () => ({ pgDb: { select: mocks.select } }));
vi.mock("lib/documents/project-document-edit-proposal", () => ({
  createPendingProjectDocumentEdit: mocks.createPending,
}));

import {
  CollectionItemTable,
  CollectionTable,
  ProjectDocumentTable,
} from "lib/db/pg/schema.pg";
import {
  createProjectDocumentChatTools,
  createProjectDocumentEditProposalTool,
  createProjectDocumentTool,
  formatProjectDocumentList,
  listAccessibleProjectDocuments,
  resolveAccessibleProjectCitationIds,
} from "./project-document";

const scopedArgs = {
  userId: "user-1",
  projectId: "project-1",
  collectionIds: ["collection-1", "collection-outside"],
};

describe("project document chat tool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.access.mockResolvedValue({
      project: { id: "project-1", collectionIds: ["collection-1"] },
      role: "viewer",
    });
    mocks.owners.mockResolvedValue(["owner-1"]);
    mocks.query = [];
    mocks.createPending.mockReset();
    mocks.builder = {
      from: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockImplementation(async () => mocks.query),
    };
    mocks.select.mockReturnValue(mocks.builder);
  });

  it("does not query documents after project access is revoked", async () => {
    mocks.access.mockResolvedValue(null);
    await expect(listAccessibleProjectDocuments(scopedArgs)).resolves.toEqual(
      [],
    );
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("exposes proposal tools only to authorized project editors for listed DOCX files", () => {
    const availableDocuments = [
      {
        id: "d7f4d9db-7e12-4f40-a620-40784839f14e",
        filename: "draft.docx",
      },
      {
        id: "e7f4d9db-7e12-4f40-a620-40784839f14e",
        filename: "notes.md",
      },
    ];
    const buildTools = (role: "owner" | "editor" | "viewer" | null) =>
      createProjectDocumentChatTools({
        ...scopedArgs,
        role,
        availableDocuments,
      });

    expect(buildTools(null)).toEqual({});
    expect(Object.keys(buildTools("viewer"))).toEqual(["readProjectDocument"]);
    expect(Object.keys(buildTools("owner"))).toEqual([
      "readProjectDocument",
      "proposeProjectDocumentEdits",
    ]);
    expect(Object.keys(buildTools("editor"))).toEqual([
      "readProjectDocument",
      "proposeProjectDocumentEdits",
    ]);
    expect(
      Object.keys(
        createProjectDocumentChatTools({
          ...scopedArgs,
          role: "owner",
          availableDocuments: [availableDocuments[1]],
        }),
      ),
    ).toEqual(["readProjectDocument"]);
    expect(mocks.createPending).not.toHaveBeenCalled();
  });

  it("restricts inventory to currently attached collections and valid owners", async () => {
    mocks.query = [
      {
        id: "d7f4d9db-7e12-4f40-a620-40784839f14e",
        filename: "plan.md",
        mediaType: "text/markdown",
      },
    ];
    await expect(listAccessibleProjectDocuments(scopedArgs)).resolves.toEqual(
      mocks.query,
    );
    expect(mocks.select.mock.calls[0]?.[0]).not.toHaveProperty("content");
    expect(mocks.inArray).toHaveBeenCalledWith(
      CollectionItemTable.collectionId,
      ["collection-1"],
    );
    expect(mocks.inArray).toHaveBeenCalledWith(CollectionTable.userId, [
      "owner-1",
    ]);
    expect(mocks.builder.limit).toHaveBeenCalledWith(25);
  });

  it("links only candidate citations still attached, ready, and owned in this project", async () => {
    const sourceId = "d7f4d9db-7e12-4f40-a620-40784839f14e";
    mocks.query = [{ id: sourceId }];

    await expect(
      resolveAccessibleProjectCitationIds(scopedArgs, [
        sourceId,
        "not-a-uuid",
        sourceId,
      ]),
    ).resolves.toEqual(new Set([sourceId]));

    const whereClause = mocks.builder.where.mock.calls[0]?.[0];
    expect(whereClause).toEqual({
      op: "and",
      args: expect.arrayContaining([
        { op: "eq", args: [ProjectDocumentTable.projectId, "project-1"] },
        {
          op: "inArray",
          args: [ProjectDocumentTable.collectionItemId, [sourceId]],
        },
        {
          op: "inArray",
          args: [CollectionItemTable.collectionId, ["collection-1"]],
        },
        {
          op: "inArray",
          args: [CollectionTable.userId, ["owner-1"]],
        },
        { op: "eq", args: [CollectionItemTable.status, "ready"] },
      ]),
    });
    expect(mocks.builder.limit).toHaveBeenCalledWith(1);
  });

  it("does not resolve links after access revocation or for detached/stale sources", async () => {
    const sourceId = "d7f4d9db-7e12-4f40-a620-40784839f14e";
    mocks.access.mockResolvedValue(null);
    await expect(
      resolveAccessibleProjectCitationIds(scopedArgs, [sourceId]),
    ).resolves.toEqual(new Set());
    expect(mocks.select).not.toHaveBeenCalled();

    mocks.access.mockResolvedValue({
      project: { id: "project-1", collectionIds: ["collection-1"] },
      role: "viewer",
    });
    mocks.query = [];
    await expect(
      resolveAccessibleProjectCitationIds(scopedArgs, [sourceId]),
    ).resolves.toEqual(new Set());
  });

  it("lists only safe labels and warns that returned file text is untrusted", () => {
    expect(
      formatProjectDocumentList([
        {
          id: "d7f4d9db-7e12-4f40-a620-40784839f14e",
          filename: "<plan & notes>.md\n",
        },
      ]),
    ).toContain("plan &amp; notes .md");
    expect(
      formatProjectDocumentList([
        {
          id: "d7f4d9db-7e12-4f40-a620-40784839f14e",
          filename: "<plan & notes>.md",
        },
      ]),
    ).not.toContain("<plan");
    expect(formatProjectDocumentList([])).toBe("");
    expect(
      formatProjectDocumentList(
        [
          {
            id: "d7f4d9db-7e12-4f40-a620-40784839f14e",
            filename: "draft.docx",
          },
        ],
        { canProposeDocxEdits: true },
      ),
    ).toContain("pending tracked review copy only");
    expect(
      formatProjectDocumentList([
        {
          id: "d7f4d9db-7e12-4f40-a620-40784839f14e",
          filename: "draft.docx",
        },
      ]),
    ).not.toContain("proposeProjectDocumentEdits");
  });

  it("binds chat proposals to listed project DOCX and creates only pending review", async () => {
    const documentId = "d7f4d9db-7e12-4f40-a620-40784839f14e";
    mocks.query = [
      {
        id: documentId,
        filename: "draft.docx",
        mediaType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        content: "Original paragraph",
        truncated: false,
      },
    ];
    mocks.createPending.mockResolvedValue({
      editId: "proposal-1",
      changes: [],
      sourceRevisionHash: "a".repeat(64),
    });
    const proposalTool = createProjectDocumentEditProposalTool({
      ...scopedArgs,
      allowedDocumentIds: [documentId],
    }) as any;
    const proposal = {
      originalText: "Original paragraph",
      suggestedText: "Revised paragraph",
      rationale: "Clarifies the sentence.",
    };
    const result = await proposalTool.execute({
      documentId,
      edits: [proposal],
    });

    expect(result.status).toBe("pending_review");
    expect(result.editId).toBe("proposal-1");
    expect(result.message).toContain("No source changes were applied");
    expect(result.reviewPath).toBe("/projects");
    expect(mocks.createPending).toHaveBeenCalledWith({
      ...scopedArgs,
      allowedDocumentIds: [documentId],
      documentId,
      filename: "draft.docx",
      proposals: [proposal],
    });
  });

  it("rejects unlisted IDs and any attempt to resolve from the model tool", async () => {
    const listedId = "d7f4d9db-7e12-4f40-a620-40784839f14e";
    const tool = createProjectDocumentEditProposalTool({
      ...scopedArgs,
      allowedDocumentIds: [listedId],
    }) as any;
    const unlisted = await tool.execute({
      documentId: "e7f4d9db-7e12-4f40-a620-40784839f14e",
      edits: [],
    });
    expect(unlisted.error).toMatch(/listed in this project's context/i);
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.createPending).not.toHaveBeenCalled();

    expect(
      tool.inputSchema.safeParse({
        documentId: listedId,
        edits: [
          {
            originalText: "Original paragraph",
            suggestedText: "Changed paragraph",
            rationale: "Improve clarity",
          },
        ],
        decision: "accepted",
      }).success,
    ).toBe(false);
  });

  it("does not create a proposal for listed non-DOCX or revoked project documents", async () => {
    const documentId = "d7f4d9db-7e12-4f40-a620-40784839f14e";
    const proposalTool = createProjectDocumentEditProposalTool({
      ...scopedArgs,
      allowedDocumentIds: [documentId],
    }) as any;
    mocks.query = [
      {
        id: documentId,
        filename: "notes.md",
        mediaType: "text/markdown",
        content: "Notes",
        truncated: false,
      },
    ];
    const notDocx = await proposalTool.execute({
      documentId,
      edits: [
        {
          originalText: "Notes",
          suggestedText: "Changed notes",
          rationale: "Test",
        },
      ],
    });
    expect(notDocx.error).toMatch(/DOCX is no longer available/i);
    expect(mocks.createPending).not.toHaveBeenCalled();

    mocks.access.mockResolvedValue(null);
    const revoked = await proposalTool.execute({
      documentId,
      edits: [
        {
          originalText: "Notes",
          suggestedText: "Changed notes",
          rationale: "Test",
        },
      ],
    });
    expect(revoked.error).toMatch(/no longer available/i);
    expect(mocks.createPending).not.toHaveBeenCalled();
  });

  it("returns bounded evidence only for a document in the current project scope", async () => {
    const documentId = "d7f4d9db-7e12-4f40-a620-40784839f14e";
    mocks.query = [
      {
        id: documentId,
        filename: "plan.md",
        mediaType: "text/markdown",
        content: `<injected>${"x".repeat(30_001)}`,
        truncated: true,
      },
    ];
    const projectTool = createProjectDocumentTool(scopedArgs) as unknown as {
      execute: (input: {
        documentId: string;
        question: string;
      }) => Promise<any>;
    };
    const result = await projectTool.execute({
      documentId,
      question: "Summarize milestones",
    });
    expect(mocks.select.mock.calls[0]?.[0]).toHaveProperty("content");
    expect(result.filename).toBe("plan.md");
    expect(result.truncated).toBe(true);
    expect(result.evidence).toContain("&lt;injected&gt;");

    mocks.query = [];
    const noLongerAvailable = await projectTool.execute({
      documentId,
      question: "Summarize milestones",
    });
    expect(noLongerAvailable.error).toMatch(/no longer available/);
  });

  it("bounds the selected-document content query to the current project scope", async () => {
    const documentId = "d7f4d9db-7e12-4f40-a620-40784839f14e";
    mocks.query = [
      {
        id: documentId,
        filename: "plan.md",
        mediaType: "text/markdown",
        content: "Approved project evidence",
        truncated: false,
      },
    ];
    const projectTool = createProjectDocumentTool(scopedArgs) as unknown as {
      execute: (input: {
        documentId: string;
        question: string;
      }) => Promise<unknown>;
    };

    await projectTool.execute({ documentId, question: "Summarize milestones" });

    const whereClause = mocks.builder.where.mock.calls[0]?.[0];
    expect(whereClause).toEqual({
      op: "and",
      args: expect.arrayContaining([
        {
          op: "eq",
          args: [ProjectDocumentTable.projectId, scopedArgs.projectId],
        },
        {
          op: "eq",
          args: [ProjectDocumentTable.collectionItemId, documentId],
        },
        {
          op: "inArray",
          args: [CollectionItemTable.collectionId, ["collection-1"]],
        },
        {
          op: "inArray",
          args: [CollectionTable.userId, ["owner-1"]],
        },
        { op: "eq", args: [CollectionItemTable.status, "ready"] },
      ]),
    });
  });

  it("does not issue the document content query after project access is revoked", async () => {
    const projectTool = createProjectDocumentTool(scopedArgs) as unknown as {
      execute: (input: {
        documentId: string;
        question: string;
      }) => Promise<{ error?: string }>;
    };
    mocks.access.mockResolvedValue(null);

    const result = await projectTool.execute({
      documentId: "d7f4d9db-7e12-4f40-a620-40784839f14e",
      question: "Summarize milestones",
    });

    expect(result.error).toMatch(/no longer available/);
    expect(mocks.select).not.toHaveBeenCalled();
  });
});
