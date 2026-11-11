import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// lib/ai/memory/memory-source carries `server-only`; neutralize it for the
// vitest node environment (same pattern as app/api/connectors/route.test.ts).
vi.mock("server-only", () => ({}));

vi.mock("auth/route-guard", () => ({
  withAuth:
    (
      handler: (request: Request, session: { user: { id: string } }) => unknown,
    ) =>
    (request: Request) =>
      handler(request, { user: { id: "user-1" } }),
}));

const mocks = vi.hoisted(() => ({
  repo: {
    getAll: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    deleteAll: vi.fn(),
  },
  enrich: vi.fn(),
}));

vi.mock("lib/db/repository", () => ({
  memoryRepository: mocks.repo,
}));

vi.mock("lib/ai/memory/memory-source", () => ({
  enrichMemoriesWithSource: mocks.enrich,
}));

import { DELETE, GET, POST, PUT } from "./route";

const jsonRequest = (body: unknown, init: RequestInit = {}) =>
  new NextRequest("http://localhost:3000/api/user/memory", {
    method: init.method ?? "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });

const memory = {
  id: "m-1",
  userId: "user-1",
  content: "likes dark mode",
  category: "preferences",
  sourceMessageId: null,
  createdAt: new Date("2026-11-11T00:00:00Z"),
  updatedAt: new Date("2026-11-11T00:00:00Z"),
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.enrich.mockImplementation(async (rows) => rows);
});

describe("GET /api/user/memory", () => {
  it("returns the owner's memories, source-enriched", async () => {
    mocks.repo.getAll.mockResolvedValue([memory]);
    const response = await GET(
      new NextRequest("http://localhost/api/user/memory"),
    );
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload).toHaveLength(1);
    expect(mocks.repo.getAll).toHaveBeenCalledWith("user-1");
    expect(mocks.enrich).toHaveBeenCalledWith([memory], "user-1");
  });
});

describe("POST /api/user/memory", () => {
  it("creates a memory with an optional category", async () => {
    mocks.repo.create.mockResolvedValue(memory);
    const response = await POST(
      jsonRequest({ content: "  likes dark mode ", category: " prefs " }),
    );
    expect(response.status).toBe(201);
    expect(mocks.repo.create).toHaveBeenCalledWith({
      userId: "user-1",
      content: "likes dark mode",
      category: "prefs",
    });
  });

  it("rejects empty or oversized content", async () => {
    expect((await POST(jsonRequest({ content: "   " }))).status).toBe(400);
    expect(
      (await POST(jsonRequest({ content: "x".repeat(4_001) }))).status,
    ).toBe(400);
    expect(mocks.repo.create).not.toHaveBeenCalled();
  });
});

describe("PUT /api/user/memory", () => {
  it("updates an owned memory", async () => {
    mocks.repo.update.mockResolvedValue({ ...memory, content: "updated" });
    const response = await PUT(
      jsonRequest({ id: "m-1", content: "updated" }, { method: "PUT" }),
    );
    expect(response.status).toBe(200);
    expect(mocks.repo.update).toHaveBeenCalledWith("m-1", "user-1", {
      content: "updated",
      category: undefined,
    });
  });

  it("404s when the memory is missing or not owned", async () => {
    mocks.repo.update.mockResolvedValue(null);
    const response = await PUT(
      jsonRequest({ id: "m-other", content: "updated" }, { method: "PUT" }),
    );
    expect(response.status).toBe(404);
  });

  it("rejects missing id or content", async () => {
    expect(
      (await PUT(jsonRequest({ id: "m-1" }, { method: "PUT" }))).status,
    ).toBe(400);
    expect(
      (await PUT(jsonRequest({ content: "x" }, { method: "PUT" }))).status,
    ).toBe(400);
  });
});

describe("DELETE /api/user/memory", () => {
  it("deletes one memory by id", async () => {
    mocks.repo.delete.mockResolvedValue(true);
    const response = await DELETE(
      new NextRequest("http://localhost/api/user/memory?id=m-1"),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(mocks.repo.delete).toHaveBeenCalledWith("m-1", "user-1");
  });

  it("404s when nothing was deleted for this owner", async () => {
    mocks.repo.delete.mockResolvedValue(false);
    expect(
      (await DELETE(new NextRequest("http://localhost/api/user/memory?id=m-x")))
        .status,
    ).toBe(404);
  });

  it("deletes all memories for the owner", async () => {
    mocks.repo.deleteAll.mockResolvedValue(7);
    const response = await DELETE(
      new NextRequest("http://localhost/api/user/memory?all=true"),
    );
    expect(await response.json()).toEqual({ deleted: 7 });
    expect(mocks.repo.deleteAll).toHaveBeenCalledWith("user-1");
  });

  it("requires an id when not deleting all", async () => {
    expect(
      (await DELETE(new NextRequest("http://localhost/api/user/memory")))
        .status,
    ).toBe(400);
  });
});
