import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  select: vi.fn(),
  query: {} as Record<string, ReturnType<typeof vi.fn>>,
  access: vi.fn(),
  owners: vi.fn(),
  sameOrigin: vi.fn(),
  rate: vi.fn(),
  downloadLimited: vi.fn(),
  upload: vi.fn(),
  delete: vi.fn(),
  parseDocx: vi.fn(),
  generateObject: vi.fn(),
  apply: vi.fn(),
  resolve: vi.fn(),
  createPending: vi.fn(),
  selectByProject: vi.fn(),
  list: vi.fn(),
  resolvePending: vi.fn(),
}));

mocks.query.from = vi.fn(() => mocks.query);
mocks.query.innerJoin = vi.fn(() => mocks.query);
mocks.query.where = vi.fn(() => mocks.query);
mocks.query.limit = vi.fn();

vi.mock("auth/server", () => ({ getSession: mocks.session }));
vi.mock("lib/db/pg/db.pg", () => ({ pgDb: { select: mocks.select } }));
vi.mock("lib/projects/access", () => ({
  getProjectAccess: mocks.access,
  getProjectCollectionSourceOwnerIds: mocks.owners,
  mayEditProject: (role: string) => role === "owner" || role === "editor",
}));
vi.mock("lib/security/same-origin", () => ({
  hasSameOrigin: mocks.sameOrigin,
}));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: mocks.rate,
}));
vi.mock("lib/file-storage", () => ({
  serverFileStorage: {
    downloadLimited: mocks.downloadLimited,
    upload: mocks.upload,
    delete: mocks.delete,
  },
  storageDriver: "local",
}));
vi.mock("lib/file-ingest/docx", () => ({ parseDocxPreview: mocks.parseDocx }));
vi.mock("lib/documents/project-tracked-docx", () => ({
  MAX_TRACKED_DOCX_INPUT_BYTES: 20 * 1024 * 1024,
  MAX_TRACKED_DOCX_EDITS: 50,
  MAX_TRACKED_DOCX_OUTPUT_BYTES: 24 * 1024 * 1024,
  MAX_TRACKED_DOCX_TEXT: 4_000,
  TRACKED_DOCX_CONTENT_TYPE:
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  TrackedDocxError: class TrackedDocxError extends Error {},
  applyTrackedEdits: mocks.apply,
  resolveProjectTrackedDocxChanges: mocks.resolve,
}));
vi.mock(
  "lib/db/pg/repositories/project-document-edit-repository.pg",
  async () => {
    const { z } = await import("zod");
    return {
      projectDocumentEditProposalSchema: z
        .object({
          originalText: z.string().min(1).max(10_000),
          suggestedText: z.string().min(1).max(10_000),
          rationale: z.string().max(2_000),
        })
        .strict(),
      projectDocumentEditRepository: {
        createPending: mocks.createPending,
        selectByProject: mocks.selectByProject,
        listByProjectDocument: mocks.list,
        resolvePending: mocks.resolvePending,
      },
    };
  },
);
vi.mock("ai", () => ({ generateObject: mocks.generateObject }));
vi.mock("lib/ai/models", () => ({
  customModelProvider: {
    getModelWithFailureFallbackAsync: vi.fn().mockResolvedValue("test-model"),
    getModelAsync: vi.fn().mockResolvedValue("test-model"),
  },
}));
vi.mock("lib/ai/model-pricing.server", () => ({
  getTeamMemberBudgetsEnabled: vi.fn().mockResolvedValue(false),
}));
vi.mock("lib/ai/team-member-ai-budget-runtime", () => ({
  normalizeModelUsage: vi.fn(),
  reserveTeamBudgetForAiRequest: vi.fn(),
  settleTeamBudgetForAiRequest: vi.fn(),
}));
vi.mock("lib/projects/project-brain-status", () => ({
  getProjectBrainStatusModel: vi.fn(),
}));
vi.mock("lib/logger", () => ({ default: { error: vi.fn(), warn: vi.fn() } }));

import { GET, POST } from "./route";

const userId = "00000000-0000-4000-8000-000000000001";
const projectId = "00000000-0000-4000-8000-000000000002";
const itemId = "00000000-0000-4000-8000-000000000003";
const editId = "00000000-0000-4000-8000-000000000004";
const source = {
  projectDocumentId: "00000000-0000-4000-8000-000000000005",
  projectId,
  itemId,
  filename: "brief.docx",
  mediaType:
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  storageKey: `${userId}/project-documents/original.docx`,
  status: "ready",
  collectionId: "00000000-0000-4000-8000-000000000006",
  collectionOwnerId: userId,
};
const proposals = [
  {
    originalText: "Original wording.",
    suggestedText: "Updated wording.",
    rationale: "Improve clarity.",
  },
];

function params() {
  return Promise.resolve({ id: projectId, itemId });
}

function request(body: unknown) {
  return new Request(
    `https://void.test/api/projects/${projectId}/documents/${itemId}/edits`,
    {
      method: "POST",
      headers: {
        Origin: "https://void.test",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({ user: { id: userId, name: "Reviewer" } });
  mocks.select.mockReturnValue(mocks.query);
  mocks.query.limit.mockResolvedValue([source]);
  mocks.access.mockResolvedValue({
    project: {
      id: projectId,
      userId,
      teamId: null,
      collectionIds: [source.collectionId],
    },
    role: "owner",
  });
  mocks.owners.mockResolvedValue([userId]);
  mocks.sameOrigin.mockReturnValue(true);
  mocks.rate.mockResolvedValue({ allowed: true });
  mocks.downloadLimited.mockResolvedValue(Buffer.from("source-docx"));
  mocks.upload.mockResolvedValue({
    key: `${userId}/project-edits/candidate.docx`,
  });
  mocks.delete.mockResolvedValue(undefined);
  mocks.parseDocx.mockResolvedValue({
    text: "Original wording.",
    truncated: false,
  });
  mocks.generateObject.mockResolvedValue({
    object: { edits: proposals },
    usage: {},
  });
  mocks.apply.mockResolvedValue({
    bytes: Buffer.from("tracked-docx"),
    changes: [
      {
        id: "00000000-0000-4000-8000-000000000007",
        delId: "1",
        insId: "2",
        deletedText: "Original wording.",
        insertedText: "Updated wording.",
        contextBefore: "",
        contextAfter: "",
        reason: "Improve clarity.",
      },
    ],
    errors: [],
  });
  mocks.resolve.mockResolvedValue({
    bytes: Buffer.from("accepted-docx"),
    found: ["change-1"],
    missing: [],
  });
  mocks.createPending.mockResolvedValue({
    id: editId,
    status: "pending",
    proposedEdits: proposals,
    createdByUserId: userId,
    projectDocumentId: source.projectDocumentId,
    createdAt: new Date("2026-11-07T12:00:00.000Z"),
    updatedAt: new Date("2026-11-07T12:00:00.000Z"),
  });
});

describe("project tracked DOCX edit API", () => {
  it("lists only public edit metadata and never exposes storage keys", async () => {
    mocks.list.mockResolvedValue([
      {
        id: editId,
        status: "pending",
        proposedEdits: proposals,
        trackedChanges: [{ id: "change-1", delId: "1", insId: "2" }],
        createdByUserId: userId,
        candidateStorageKey: "private-candidate-key",
        outputStorageKey: null,
        createdAt: new Date("2026-11-07T12:00:00.000Z"),
        updatedAt: new Date("2026-11-07T12:00:00.000Z"),
      },
    ]);
    const response = await GET(new Request("https://void.test"), {
      params: params(),
    });
    const payload = await response.text();
    expect(response.status).toBe(200);
    expect(payload).toContain('"canResolve":true');
    expect(payload).not.toContain("private-candidate-key");
  });

  it("creates a private, source-bound candidate from an explicit instruction", async () => {
    const response = await POST(
      request({ action: "propose", instruction: "Improve clarity" }),
      { params: params() },
    );
    const payload = await response.json();
    expect(response.status).toBe(201);
    expect(mocks.apply).toHaveBeenCalledWith(
      Buffer.from("source-docx"),
      proposals,
      { author: "Reviewer" },
    );
    expect(mocks.createPending).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId,
        projectDocumentId: source.projectDocumentId,
        createdByUserId: userId,
        candidateStorageKey: `${userId}/project-edits/candidate.docx`,
        proposedEdits: proposals,
        trackedChanges: [
          {
            id: "00000000-0000-4000-8000-000000000007",
            delId: "1",
            insId: "2",
          },
        ],
      }),
    );
    expect(JSON.stringify(payload)).not.toContain("candidate.docx");
  });

  it("rejects non-origin actions before storage access", async () => {
    mocks.sameOrigin.mockReturnValue(false);
    const response = await POST(
      request({ action: "propose", instruction: "Improve clarity" }),
      { params: params() },
    );
    expect(response.status).toBe(403);
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.downloadLimited).not.toHaveBeenCalled();
  });

  it("prevents another editor from resolving a creator-owned private artifact", async () => {
    mocks.selectByProject.mockResolvedValue({
      id: editId,
      status: "pending",
      createdByUserId: "00000000-0000-4000-8000-000000000099",
      projectDocumentId: source.projectDocumentId,
      candidateStorageKey: `${userId}/project-edits/candidate.docx`,
      sourceRevisionHash: "0".repeat(64),
      proposedEdits: proposals,
    });
    const response = await POST(
      request({ action: "resolve", editId, decision: "accepted" }),
      { params: params() },
    );
    expect(response.status).toBe(403);
    expect(mocks.resolve).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("accepts only the proposed tracked revisions and returns a private download path", async () => {
    const sourceRevisionHash = createHash("sha256")
      .update(Buffer.from("source-docx"))
      .digest("hex");
    const trackedChanges = [
      {
        id: "00000000-0000-4000-8000-000000000007",
        delId: "1",
        insId: "2",
      },
    ];
    mocks.selectByProject.mockResolvedValue({
      id: editId,
      status: "pending",
      createdByUserId: userId,
      projectDocumentId: source.projectDocumentId,
      candidateStorageKey: `${userId}/project-edits/candidate.docx`,
      sourceRevisionHash,
      trackedChanges,
      proposedEdits: proposals,
    });
    mocks.downloadLimited
      .mockResolvedValueOnce(Buffer.from("source-docx"))
      .mockResolvedValueOnce(Buffer.from("tracked-docx"));
    mocks.upload.mockResolvedValueOnce({
      key: `${userId}/project-edits/accepted.docx`,
    });
    mocks.resolvePending.mockResolvedValue({ outcome: "resolved" });

    const response = await POST(
      request({ action: "resolve", editId, decision: "accepted" }),
      { params: params() },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "accepted",
      downloadUrl: `/api/projects/${projectId}/documents/${itemId}/edits/${editId}/download`,
    });
    expect(mocks.resolve).toHaveBeenCalledWith(
      Buffer.from("tracked-docx"),
      trackedChanges,
      "accept",
    );
    expect(mocks.resolvePending).toHaveBeenCalledWith(
      expect.objectContaining({
        id: editId,
        currentSourceRevisionHash: sourceRevisionHash,
        decision: "accepted",
        outputStorageKey: `${userId}/project-edits/accepted.docx`,
      }),
    );
  });

  it("retires a stale proposal and queues its candidate cleanup", async () => {
    mocks.selectByProject.mockResolvedValue({
      id: editId,
      status: "pending",
      createdByUserId: userId,
      projectDocumentId: source.projectDocumentId,
      candidateStorageKey: `${userId}/project-edits/candidate.docx`,
      sourceRevisionHash: "a".repeat(64),
      trackedChanges: [
        {
          id: "00000000-0000-4000-8000-000000000007",
          delId: "1",
          insId: "2",
        },
      ],
      proposedEdits: proposals,
    });
    mocks.resolvePending.mockResolvedValue({ outcome: "stale" });
    const response = await POST(
      request({ action: "resolve", editId, decision: "accepted" }),
      { params: params() },
    );
    expect(response.status).toBe(409);
    expect(mocks.resolvePending).toHaveBeenCalledWith({
      id: editId,
      projectId,
      currentSourceRevisionHash: createHash("sha256")
        .update(Buffer.from("source-docx"))
        .digest("hex"),
      decision: "rejected",
    });
    expect(mocks.downloadLimited).toHaveBeenCalledTimes(1);
    expect(mocks.upload).not.toHaveBeenCalled();
  });
});
