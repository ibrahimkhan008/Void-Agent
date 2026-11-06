import type { UIMessage } from "ai";
import { describe, expect, it } from "vitest";
import { findPendingUserAction } from "./use-chat-background-alerts";

const message = (part: Record<string, unknown>) =>
  ({ role: "assistant", parts: [part] }) as unknown as UIMessage;

describe("findPendingUserAction", () => {
  it("identifies proposal tools waiting for user approval", () => {
    expect(
      findPendingUserAction([
        message({
          type: "tool-proposeEmail",
          toolCallId: "call-1",
          state: "input-available",
          input: {},
        }),
      ]),
    ).toEqual({ eventId: "call-1", kind: "needs_approval" });
  });

  it("identifies requestInput without treating completed tools as pending", () => {
    expect(
      findPendingUserAction([
        message({
          type: "tool-requestInput",
          toolCallId: "call-2",
          state: "input-available",
          input: {},
        }),
      ]),
    ).toEqual({ eventId: "call-2", kind: "needs_input" });
    expect(
      findPendingUserAction([
        message({
          type: "tool-proposeEmail",
          toolCallId: "call-3",
          state: "output-available",
          input: {},
          output: { approved: false },
        }),
      ]),
    ).toBeNull();
  });
});
