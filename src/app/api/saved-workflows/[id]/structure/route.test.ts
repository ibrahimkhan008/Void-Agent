import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  session,
  selectWorkflow,
  saveStructure,
  sameOrigin,
  rateLimit,
  canEdit,
} = vi.hoisted(() => ({
  session: vi.fn(),
  selectWorkflow: vi.fn(),
  saveStructure: vi.fn(),
  sameOrigin: vi.fn(),
  rateLimit: vi.fn(),
  canEdit: vi.fn(),
}));
vi.mock("auth/server", () => ({ getSession: session }));
vi.mock("lib/db/repository", () => ({
  workflowRepository: { selectById: selectWorkflow, saveStructure },
}));
vi.mock("lib/security/same-origin", () => ({ hasSameOrigin: sameOrigin }));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: rateLimit,
}));
vi.mock("lib/auth/permissions", () => ({ canEditWorkflow: canEdit }));

import { POST } from "./route";
const id = "6f2e8d72-9709-4d7c-a2ec-55aa564631a0";
const params = Promise.resolve({ id });
const makeRequest = (value: unknown) =>
  new Request(`http://local/api/saved-workflows/${id}/structure`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://local" },
    body: JSON.stringify(value),
  });

describe("saved workflow graph writes", () => {
  beforeEach(() => {
    session.mockReset();
    selectWorkflow.mockReset();
    saveStructure.mockReset();
    sameOrigin.mockReset();
    rateLimit.mockReset();
    canEdit.mockReset();
    session.mockResolvedValue({ user: { id: "owner" } });
    selectWorkflow.mockResolvedValue({
      id,
      userId: "owner",
      isPublished: false,
    });
    sameOrigin.mockReturnValue(true);
    rateLimit.mockResolvedValue({ allowed: true });
    canEdit.mockResolvedValue(true);
  });
  it("persists bounded graph changes for the draft owner", async () => {
    const nodeId = "6f2e8d72-9709-4d7c-a2ec-55aa564631a1";
    const response = await POST(
      makeRequest({
        nodes: [
          {
            id: nodeId,
            workflowId: "6f2e8d72-9709-4d7c-a2ec-55aa564631a2",
            kind: "input",
            name: "INPUT",
            description: "",
            nodeConfig: {},
            uiConfig: {},
          },
        ],
        edges: [],
        deleteNodes: [],
        deleteEdges: [],
      }),
      { params },
    );
    expect(response.status).toBe(200);
    expect(saveStructure).toHaveBeenCalledWith({
      workflowId: id,
      nodes: [
        expect.objectContaining({ id: nodeId, workflowId: id, kind: "input" }),
      ],
      edges: [],
      deleteNodes: [],
      deleteEdges: [],
    });
  });
  it("rejects foreign, cross-origin, published, and over-limit graph writes", async () => {
    sameOrigin.mockReturnValue(false);
    expect((await POST(makeRequest({ nodes: [] }), { params })).status).toBe(
      403,
    );
    sameOrigin.mockReturnValue(true);
    selectWorkflow.mockResolvedValue({
      id,
      userId: "other",
      isPublished: false,
    });
    expect((await POST(makeRequest({ nodes: [] }), { params })).status).toBe(
      404,
    );
    selectWorkflow.mockResolvedValue({
      id,
      userId: "owner",
      isPublished: true,
    });
    expect((await POST(makeRequest({ nodes: [] }), { params })).status).toBe(
      409,
    );
    selectWorkflow.mockResolvedValue({
      id,
      userId: "owner",
      isPublished: false,
    });
    expect(
      (
        await POST(
          makeRequest({ nodes: Array.from({ length: 201 }, () => ({})) }),
          { params },
        )
      ).status,
    ).toBe(400);
    expect(saveStructure).not.toHaveBeenCalled();
  });
});
