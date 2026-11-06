import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getProjectAccess: vi.fn(),
  getProjectCollectionSourceOwnerIds: vi.fn(),
  checkApiRateLimit: vi.fn(),
  download: vi.fn(),
  select: vi.fn(),
}));
vi.mock("auth/server", () => ({ getSession: mocks.getSession }));
vi.mock("lib/projects/access", () => ({
  getProjectAccess: mocks.getProjectAccess,
  getProjectCollectionSourceOwnerIds: mocks.getProjectCollectionSourceOwnerIds,
}));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: mocks.checkApiRateLimit,
}));
vi.mock("lib/file-storage", () => ({
  serverFileStorage: { download: mocks.download },
}));
vi.mock("lib/db/pg/db.pg", () => ({ pgDb: { select: mocks.select } }));

import { GET } from "./route";

const projectId = "00000000-0000-4000-8000-000000000001";
const itemId = "00000000-0000-4000-8000-000000000002";
const collectionId = "00000000-0000-4000-8000-000000000003";
const params = { params: Promise.resolve({ id: projectId, itemId }) };

function builder(row: unknown) {
  const value: Record<string, unknown> = {};
  for (const method of ["from", "innerJoin", "where"])
    value[method] = vi.fn(() => value);
  value.limit = vi.fn(async () => (row ? [row] : []));
  return value;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue({ user: { id: "member-1" } });
  mocks.getProjectAccess.mockResolvedValue({
    project: { id: projectId, collectionIds: [collectionId], teamId: "team-1" },
    role: "viewer",
  });
  mocks.getProjectCollectionSourceOwnerIds.mockResolvedValue([
    "member-1",
    "creator-1",
  ]);
  mocks.checkApiRateLimit.mockResolvedValue({ allowed: true });
  mocks.select.mockReturnValue(
    builder({
      filename: "private-plan.pdf",
      mediaType: "application/pdf",
      storageKey: "uploads/uploader/private-plan.pdf",
      status: "ready",
    }),
  );
  mocks.download.mockResolvedValue(Buffer.from("private bytes"));
});

describe("project document download", () => {
  it("resolves the private storage key from the authorized project row and proxies safe bytes", async () => {
    const response = await GET(new Request("http://localhost"), params);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("private bytes");
    expect(mocks.download).toHaveBeenCalledWith(
      "uploads/uploader/private-plan.pdf",
    );
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("content-disposition")).toContain("attachment");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("does not download data when current project access is missing", async () => {
    mocks.getProjectAccess.mockResolvedValue(null);
    const response = await GET(new Request("http://localhost"), params);
    expect(response.status).toBe(404);
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.download).not.toHaveBeenCalled();
  });

  it("returns 404 for files not linked to the project", async () => {
    mocks.select.mockReturnValue(builder(null));
    const response = await GET(new Request("http://localhost"), params);
    expect(response.status).toBe(404);
    expect(mocks.download).not.toHaveBeenCalled();
  });
});
