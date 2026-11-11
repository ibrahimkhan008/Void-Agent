import { describe, expect, it } from "vitest";
import {
  getChatRunConflictResponse,
  getChatThreadOwnershipError,
} from "./chat-route-guards";

describe("chat request lifecycle guards", () => {
  it("rejects a thread owned by another user", () => {
    const response = getChatThreadOwnershipError(
      { userId: "owner" },
      "attacker",
    );
    expect(response?.status).toBe(403);
  });

  it("allows the owning user to continue their thread", () => {
    expect(
      getChatThreadOwnershipError({ userId: "owner" }, "owner"),
    ).toBeNull();
  });

  it.each(["ChatMessageRunConflictError", "ChatMessageIdCollisionError"])(
    "returns 409 for %s",
    async (name) => {
      const response = getChatRunConflictResponse(
        Object.assign(new Error(), { name }),
      );
      expect(response?.status).toBe(409);
      await expect(response?.json()).resolves.toMatchObject({
        code: "duplicate_message",
        retryable: false,
      });
    },
  );

  it("does not turn unrelated failures into duplicate-request responses", () => {
    expect(
      getChatRunConflictResponse(new Error("database unavailable")),
    ).toBeNull();
  });
});
