import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getProjectAccess: vi.fn(),
  select: vi.fn(),
  insert: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: mocks.getSession }));
vi.mock("lib/projects/access", () => ({
  getProjectAccess: mocks.getProjectAccess,
  mayEditProject: (role: string) => role === "owner" || role === "editor",
}));
vi.mock("lib/db/pg/db.pg", () => ({
  pgDb: { select: mocks.select, insert: mocks.insert, delete: mocks.delete },
}));

import { DELETE, GET, POST } from "./route";

const params = Promise.resolve({ id: "project-1" });
const actorAccess = {
  role: "owner",
  project: {
    id: "project-1",
    userId: "00000000-0000-4000-8000-000000000002",
    teamId: "team-1",
    accessMode: "team",
  },
};

function postRequest(
  body: unknown,
  options: { origin?: string; contentType?: string } = {},
) {
  return new Request("https://example.test/api/projects/project-1/members", {
    method: "POST",
    headers: {
      ...(options.origin === undefined
        ? { origin: "https://example.test" }
        : options.origin
          ? { origin: options.origin }
          : {}),
      "content-type": options.contentType ?? "application/json",
    },
    body: JSON.stringify(body),
  });
}

function deleteRequest(userId: string, origin?: string, body?: string) {
  return new Request(
    `https://example.test/api/projects/project-1/members?userId=${userId}`,
    {
      method: "DELETE",
      headers: {
        ...(origin ? { origin } : { origin: "https://example.test" }),
        ...(body === undefined ? {} : { "content-type": "text/plain" }),
      },
      ...(body === undefined ? {} : { body }),
    },
  );
}

describe("project member management", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: "team-owner" } });
    mocks.getProjectAccess.mockResolvedValue(actorAccess);
  });

  it("returns implicit project and team owners as locked access principals", async () => {
    const projectOwner = "00000000-0000-4000-8000-000000000002";
    const teamOwner = "00000000-0000-4000-8000-000000000004";
    const explicitMember = "00000000-0000-4000-8000-000000000003";
    const eligible = "00000000-0000-4000-8000-000000000005";
    mocks.getProjectAccess.mockResolvedValueOnce({
      ...actorAccess,
      project: { ...actorAccess.project, userId: projectOwner },
    });
    const query = (rows: unknown[], joined = true) => ({
      from: () => ({
        ...(joined ? { innerJoin: () => ({ where: async () => rows }) } : {}),
        where: async () => rows,
      }),
    });
    mocks.select
      .mockReturnValueOnce(query([{ userId: explicitMember, role: "viewer" }]))
      .mockReturnValueOnce(
        query([
          {
            userId: teamOwner,
            name: "Team owner",
            email: "team@example.test",
            image: null,
          },
          {
            userId: explicitMember,
            name: "Existing",
            email: null,
            image: null,
          },
          { userId: eligible, name: "Eligible", email: null, image: null },
        ]),
      )
      .mockReturnValueOnce(
        query([
          {
            ownerId: teamOwner,
            name: "Team owner",
            email: "team@example.test",
            image: null,
          },
        ]),
      )
      .mockReturnValueOnce(
        query(
          [
            {
              userId: projectOwner,
              name: "Project owner",
              email: "project@example.test",
              image: null,
            },
          ],
          false,
        ),
      );

    const response = await GET(
      new Request("https://example.test/api/projects/project-1/members"),
      { params },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const body = await response.json();
    expect(body.members).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          userId: projectOwner,
          role: "owner",
          accessSource: "project",
        }),
        expect.objectContaining({
          userId: teamOwner,
          role: "owner",
          accessSource: "team",
        }),
        expect.objectContaining({
          userId: explicitMember,
          role: "viewer",
          accessSource: "explicit",
        }),
      ]),
    );
    expect(
      body.eligibleMembers.map((member: { userId: string }) => member.userId),
    ).toEqual([eligible]);
  });

  it("does not expose access principals when the requester has no project access", async () => {
    mocks.getProjectAccess.mockResolvedValueOnce(null);
    const response = await GET(
      new Request("https://example.test/api/projects/project-1/members"),
      { params },
    );
    expect(response.status).toBe(404);
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("rejects a user who is not a member of the project team", async () => {
    mocks.select.mockImplementationOnce(() => ({
      from: () => ({ where: async () => [{ ownerId: "team-owner" }] }),
    }));
    mocks.select.mockImplementationOnce(() => ({
      from: () => ({ where: async () => [] }),
    }));
    const response = await POST(
      postRequest({ userId: "00000000-0000-4000-8000-000000000001" }),
      { params },
    );
    expect(response.status).toBe(422);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("requires same-origin JSON and rejects malformed or oversized member requests", async () => {
    const payload = { userId: "00000000-0000-4000-8000-000000000003" };
    expect(
      (await POST(postRequest(payload, { origin: "" }), { params })).status,
    ).toBe(403);
    expect(
      (
        await POST(postRequest(payload, { origin: "https://attacker.test" }), {
          params,
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await POST(postRequest(payload, { contentType: "text/plain" }), {
          params,
        })
      ).status,
    ).toBe(415);
    expect(
      (
        await POST(
          new Request("https://example.test/api/projects/project-1/members", {
            method: "POST",
            headers: {
              origin: "https://example.test",
              "content-type": "application/json",
            },
            body: "{broken",
          }),
          { params },
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await POST(
          new Request("https://example.test/api/projects/project-1/members", {
            method: "POST",
            headers: {
              origin: "https://example.test",
              "content-type": "application/json",
            },
            body: JSON.stringify({ userId: "x", extra: "x".repeat(5_000) }),
          }),
          { params },
        )
      ).status,
    ).toBe(413);
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("adds a same-team collaborator with the requested least-privilege role", async () => {
    const collaboratorId = "00000000-0000-4000-8000-000000000003";
    mocks.select.mockImplementationOnce(() => ({
      from: () => ({ where: async () => [{ ownerId: "team-owner" }] }),
    }));
    mocks.select.mockImplementationOnce(() => ({
      from: () => ({ where: async () => [{ userId: collaboratorId }] }),
    }));
    mocks.insert.mockReturnValue({
      values: () => ({
        onConflictDoUpdate: () => ({
          returning: async () => [{ userId: collaboratorId, role: "viewer" }],
        }),
      }),
    });

    const response = await POST(
      postRequest({ userId: collaboratorId, role: "viewer" }),
      { params },
    );
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      member: { userId: collaboratorId, role: "viewer" },
    });
    expect(mocks.insert).toHaveBeenCalledOnce();
  });

  it("upserts an existing same-team collaborator's role", async () => {
    const collaboratorId = "00000000-0000-4000-8000-000000000003";
    const onConflictDoUpdate = vi.fn(() => ({
      returning: async () => [{ userId: collaboratorId, role: "editor" }],
    }));
    const values = vi.fn(() => ({ onConflictDoUpdate }));
    mocks.select.mockImplementationOnce(() => ({
      from: () => ({ where: async () => [{ ownerId: "team-owner" }] }),
    }));
    mocks.select.mockImplementationOnce(() => ({
      from: () => ({ where: async () => [{ userId: collaboratorId }] }),
    }));
    mocks.insert.mockReturnValue({ values });

    const response = await POST(
      postRequest({ userId: collaboratorId, role: "editor" }),
      { params },
    );
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      member: { userId: collaboratorId, role: "editor" },
    });
    expect(onConflictDoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ set: { role: "editor" } }),
    );
  });

  it("does not allow a project editor to manage collaborators", async () => {
    mocks.getProjectAccess.mockResolvedValueOnce({
      ...actorAccess,
      role: "viewer",
    });
    const response = await POST(
      postRequest({ userId: "00000000-0000-4000-8000-000000000001" }),
      { params },
    );
    expect(response.status).toBe(403);
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("does not allow the team owner to be added as a regular collaborator", async () => {
    mocks.select.mockImplementationOnce(() => ({
      from: () => ({
        where: async () => [
          { ownerId: "00000000-0000-4000-8000-000000000001" },
        ],
      }),
    }));
    mocks.select.mockImplementationOnce(() => ({
      from: () => ({
        where: async () => [{ userId: "00000000-0000-4000-8000-000000000001" }],
      }),
    }));
    const response = await POST(
      postRequest({ userId: "00000000-0000-4000-8000-000000000001" }),
      { params },
    );
    expect(response.status).toBe(409);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("rejects attempts to remove the project creator", async () => {
    const response = await DELETE(
      new Request(
        "https://example.test/api/projects/project-1/members?userId=00000000-0000-4000-8000-000000000002",
        { method: "DELETE", headers: { origin: "https://example.test" } },
      ),
      { params },
    );
    expect(response.status).toBe(409);
    expect(mocks.delete).not.toHaveBeenCalled();
  });

  it("requires same-origin and an empty body when removing a collaborator", async () => {
    const userId = "00000000-0000-4000-8000-000000000003";
    const missingOrigin = new Request(
      `https://example.test/api/projects/project-1/members?userId=${userId}`,
      { method: "DELETE" },
    );
    expect((await DELETE(missingOrigin, { params })).status).toBe(403);
    expect(
      (await DELETE(deleteRequest(userId, "https://attacker.test"), { params }))
        .status,
    ).toBe(403);
    expect(
      (await DELETE(deleteRequest(userId, undefined, "x"), { params })).status,
    ).toBe(413);
    expect(mocks.delete).not.toHaveBeenCalled();
  });
});
