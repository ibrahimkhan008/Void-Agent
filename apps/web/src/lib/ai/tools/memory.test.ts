import { beforeEach, describe, expect, it, vi } from "vitest";

import { DefaultToolName } from "lib/ai/tools";
import { MemoryToolName } from "./memory";

const createMock = vi.fn();
const searchMock = vi.fn();
const deleteMock = vi.fn();

vi.mock("lib/db/repository", () => ({
  memoryRepository: {
    create: (...args: unknown[]) => createMock(...args),
    search: (...args: unknown[]) => searchMock(...args),
    delete: (...args: unknown[]) => deleteMock(...args),
  },
}));

const { createMemoryTools, computeSimilarity } = await import("./memory");

describe("MemoryToolName matches staging DefaultToolName declarations", () => {
  it("uses the save_memory / delete_memory / search_memory names", () => {
    expect(MemoryToolName.SaveMemory).toBe(DefaultToolName.SaveMemory);
    expect(MemoryToolName.DeleteMemory).toBe(DefaultToolName.DeleteMemory);
    expect(MemoryToolName.SearchMemory).toBe(DefaultToolName.SearchMemory);
  });
});

describe("createMemoryTools", () => {
  beforeEach(() => {
    createMock.mockReset();
    searchMock.mockReset();
    deleteMock.mockReset();
  });

  it("saves a new memory when no near-duplicate exists", async () => {
    searchMock.mockResolvedValue([]);
    createMock.mockResolvedValue({ id: "mem-1" });

    const tools = createMemoryTools("user-1");
    const result = (await tools[MemoryToolName.SaveMemory].execute!(
      { content: "User prefers dark mode" },
      { messages: [], toolCallId: "t1", context: {} },
    )) as { status: string; id?: string };

    expect(result.status).toBe("saved");
    expect(result.id).toBe("mem-1");
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        content: "User prefers dark mode",
      }),
    );
  });

  it("skips saving a near-duplicate memory", async () => {
    searchMock.mockResolvedValue([
      { id: "mem-0", content: "User prefers dark mode" },
    ]);

    const tools = createMemoryTools("user-1");
    const result = (await tools[MemoryToolName.SaveMemory].execute!(
      { content: "User prefers dark mode" },
      { messages: [], toolCallId: "t2", context: {} },
    )) as { status: string };

    expect(result.status).toBe("skipped");
    expect(createMock).not.toHaveBeenCalled();
  });

  it("returns not_found when deleting a missing memory", async () => {
    deleteMock.mockResolvedValue(false);

    const tools = createMemoryTools("user-1");
    const result = (await tools[MemoryToolName.DeleteMemory].execute!(
      { memoryId: "mem-x" },
      { messages: [], toolCallId: "t3", context: {} },
    )) as { status: string };

    expect(result.status).toBe("not_found");
    expect(deleteMock).toHaveBeenCalledWith("mem-x", "user-1");
  });

  it("returns found memories with bounded fields", async () => {
    searchMock.mockResolvedValue([
      {
        id: "mem-1",
        content: "User works at Acme",
        category: "career",
        createdAt: "2026-01-01T00:00:00.000Z",
        embedding: [1, 2, 3],
        userId: "user-1",
      },
    ]);

    const tools = createMemoryTools("user-1");
    const result = (await tools[MemoryToolName.SearchMemory].execute!(
      { query: "work" },
      { messages: [], toolCallId: "t4", context: {} },
    )) as {
      status: string;
      count: number;
      memories: Array<Record<string, unknown>>;
    };

    expect(result.status).toBe("found");
    expect(result.count).toBe(1);
    expect(result.memories[0]).toEqual({
      id: "mem-1",
      content: "User works at Acme",
      category: "career",
      savedAt: "2026-01-01T00:00:00.000Z",
    });
  });

  it("reports empty search results", async () => {
    searchMock.mockResolvedValue([]);

    const tools = createMemoryTools("user-1");
    const result = (await tools[MemoryToolName.SearchMemory].execute!(
      { query: "nothing" },
      { messages: [], toolCallId: "t5", context: {} },
    )) as { status: string };

    expect(result.status).toBe("empty");
  });

  it("returns an error result when search fails", async () => {
    searchMock.mockRejectedValue(new Error("db down"));

    const tools = createMemoryTools("user-1");
    const result = (await tools[MemoryToolName.SearchMemory].execute!(
      { query: "boom" },
      { messages: [], toolCallId: "t6", context: {} },
    )) as { status: string; message: string };

    expect(result.status).toBe("error");
    expect(result.message).toContain("db down");
  });
});

describe("computeSimilarity", () => {
  it("returns 1 for identical word sets", () => {
    expect(computeSimilarity("user likes tea", "user likes tea")).toBe(1);
  });

  it("scores half overlap for partially disjoint word sets", () => {
    expect(computeSimilarity("user likes tea", "user likes coffee")).toBe(0.5);
  });

  it("returns 1 for two empty strings", () => {
    expect(computeSimilarity("", "")).toBe(1);
  });

  it("scores partial overlap between saved and new content", () => {
    const score = computeSimilarity(
      "user works as a backend engineer at acme corp",
      "user works as a backend engineer at acme corp inc",
    );
    expect(score).toBeGreaterThan(0.7);
  });
});
