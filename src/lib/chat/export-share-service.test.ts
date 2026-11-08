import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  selectThread: vi.fn(),
  exportChat: vi.fn(),
  createShareToken: vi.fn(),
  deleteById: vi.fn(),
  revokeShareToken: vi.fn(),
}));

vi.mock("lib/db/repository", () => ({
  chatRepository: { selectThread: mocks.selectThread },
  chatExportRepository: {
    exportChat: mocks.exportChat,
    createShareToken: mocks.createShareToken,
    deleteById: mocks.deleteById,
    revokeShareToken: mocks.revokeShareToken,
  },
}));

import {
  createOwnerChatShare,
  revokeOwnerChatShare,
  rotateOwnerChatShare,
} from "./export-share-service";
import { hashPublicShareToken } from "./public-share";

describe("owner-controlled export sharing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.selectThread.mockResolvedValue({ id: "thread-1", userId: "owner-1" });
    mocks.exportChat.mockResolvedValue("export-1");
    mocks.createShareToken.mockResolvedValue(true);
    mocks.revokeShareToken.mockResolvedValue(true);
  });

  test("creates an immutable snapshot and stores only the token hash", async () => {
    const result = await createOwnerChatShare("thread-1", "owner-1");

    expect(result.exportId).toBe("export-1");
    expect(result.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(mocks.exportChat).toHaveBeenCalledWith({
      threadId: "thread-1",
      exporterId: "owner-1",
      expiresAt: undefined,
    });
    expect(mocks.createShareToken).toHaveBeenCalledWith(
      "export-1",
      "owner-1",
      hashPublicShareToken(result.token),
    );
  });

  test("does not export a thread unless the caller owns it", async () => {
    mocks.selectThread.mockResolvedValueOnce({
      id: "thread-1",
      userId: "someone-else",
    });

    await expect(createOwnerChatShare("thread-1", "owner-1")).rejects.toThrow(
      "Thread not found",
    );
    expect(mocks.exportChat).not.toHaveBeenCalled();
    expect(mocks.createShareToken).not.toHaveBeenCalled();
  });

  test("removes a newly created snapshot if token persistence fails", async () => {
    mocks.createShareToken.mockResolvedValueOnce(false);

    await expect(createOwnerChatShare("thread-1", "owner-1")).rejects.toThrow(
      "Could not create share link",
    );
    expect(mocks.deleteById).toHaveBeenCalledWith("export-1");
  });

  test("rotates and revokes only through owner-scoped repository methods", async () => {
    const token = await rotateOwnerChatShare("export-1", "owner-1");

    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(mocks.createShareToken).toHaveBeenCalledWith(
      "export-1",
      "owner-1",
      hashPublicShareToken(token!),
    );
    await revokeOwnerChatShare("export-1", "owner-1");
    expect(mocks.revokeShareToken).toHaveBeenCalledWith("export-1", "owner-1");
  });
});
