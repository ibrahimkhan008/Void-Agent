import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getProjectAccess: vi.fn(),
  getProjectCollectionSourceOwnerIds: vi.fn(),
  select: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: mocks.getSession }));
vi.mock("lib/projects/access", () => ({
  getProjectAccess: mocks.getProjectAccess,
  getProjectCollectionSourceOwnerIds: mocks.getProjectCollectionSourceOwnerIds,
}));
vi.mock("lib/db/pg/db.pg", () => ({ pgDb: { select: mocks.select } }));

import { GET } from "./route";

const projectId = "00000000-0000-4000-8000-000000000001";
const collectionId = "00000000-0000-4000-8000-000000000002";
const params = {
  params: Promise.resolve({ id: projectId, nodeId: "northstar" }),
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue({ user: { id: "member-1" } });
  mocks.getProjectAccess.mockResolvedValue({
    project: { id: projectId, collectionIds: [collectionId] },
    role: "viewer",
  });
  mocks.getProjectCollectionSourceOwnerIds.mockResolvedValue(["owner-1"]);
});

describe("GET project brain graph node detail", () => {
  it("requires project access before querying source-backed graph data", async () => {
    mocks.getSession.mockResolvedValue(null);
    expect((await GET(new Request("http://localhost"), params)).status).toBe(
      401,
    );
    expect(mocks.select).not.toHaveBeenCalled();

    mocks.getSession.mockResolvedValue({ user: { id: "member-1" } });
    mocks.getProjectAccess.mockResolvedValue(null);
    expect((await GET(new Request("http://localhost"), params)).status).toBe(
      404,
    );
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("rejects malformed graph node IDs", async () => {
    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ id: projectId, nodeId: "north\nstar" }),
    });
    expect(response.status).toBe(400);
    expect(mocks.getProjectAccess).not.toHaveBeenCalled();
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("returns current project node detail with fact evidence and aliases", async () => {
    const rows = [
      {
        id: "fact-1",
        subject: "Northstar",
        predicate: "alias",
        object: "North Star",
        reviewStatus: "accepted",
        evidence: "Northstar is also called North Star.",
        confidence: 0.9,
        sourceItemId: "source-1",
        collectionId,
        filename: "plan.pdf",
        sourceUrl: null,
      },
    ];
    const query = {
      from: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue(rows),
    };
    mocks.select.mockReturnValue(query);

    const response = await GET(new Request("http://localhost"), params);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      detail: {
        node: { id: "northstar", label: "Northstar" },
        aliases: ["North Star"],
        facts: [
          { id: "fact-1", evidence: "Northstar is also called North Star." },
        ],
      },
    });
    expect(mocks.getProjectCollectionSourceOwnerIds).toHaveBeenCalled();
    expect(query.limit).toHaveBeenCalledWith(500);
  });
});
