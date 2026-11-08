import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  byHash: vi.fn(),
  legacy: vi.fn(),
}));

vi.mock("lib/db/repository", () => ({
  chatExportRepository: {
    selectByShareTokenHash: mocks.byHash,
    selectLegacyByIdWithUser: mocks.legacy,
  },
}));

import { loadPublicChatExport } from "./load-public-export";
import { hashPublicShareToken } from "./public-share";

describe("public export resolution", () => {
  beforeEach(() => vi.clearAllMocks());

  test("looks up the digest and returns only a sanitized transcript", async () => {
    const record = {
      id: "internal-export-id",
      exporterId: "owner-id",
      exporterName: "Owner",
      title: "Shared chat",
      exportedAt: new Date(0),
      messages: [
        {
          id: "private-message-id",
          role: "assistant",
          parts: [
            { type: "text", text: "Hello" },
            { type: "tool-result", output: "private" },
          ],
          metadata: { runId: "private-run" },
        },
      ],
    };
    mocks.byHash.mockResolvedValue(record);
    const token = "A".repeat(43);

    const result = await loadPublicChatExport(token);

    expect(mocks.byHash).toHaveBeenCalledWith(hashPublicShareToken(token));
    expect(mocks.legacy).not.toHaveBeenCalled();
    expect(result?.messages).toEqual([
      {
        id: "shared-1",
        role: "assistant",
        parts: [{ type: "text", text: "Hello" }],
      },
    ]);
    expect(result?.messages[0]).not.toHaveProperty("metadata");
  });

  test("keeps legacy UUID links only through the gated compatibility lookup", async () => {
    mocks.legacy.mockResolvedValue(null);
    expect(
      await loadPublicChatExport("11111111-1111-4111-8111-111111111111"),
    ).toBeNull();
    expect(mocks.legacy).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
    );
    expect(mocks.byHash).not.toHaveBeenCalled();
  });

  test("does not query storage for malformed or low-entropy tokens", async () => {
    expect(await loadPublicChatExport("guess-me")).toBeNull();
    expect(mocks.byHash).not.toHaveBeenCalled();
    expect(mocks.legacy).not.toHaveBeenCalled();
  });
});
