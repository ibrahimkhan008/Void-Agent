import type { UIMessage } from "ai";
import { describe, expect, test } from "vitest";
import { getRetryTurnSettings } from "./retry-settings";

const message = (
  id: string,
  role: UIMessage["role"],
  metadata?: UIMessage["metadata"],
) => ({ id, role, parts: [{ type: "text", text: id }], metadata }) as UIMessage;

describe("getRetryTurnSettings", () => {
  test("keeps the provider model and tool mode from the last assistant turn", () => {
    const messages = [
      message("user-1", "user"),
      message("assistant-1", "assistant", {
        chatModel: { provider: "groq", model: "model-at-send-time" },
        toolChoice: "manual",
      }),
      message("user-2", "user"),
    ];

    expect(getRetryTurnSettings(messages)).toEqual({
      chatModel: { provider: "groq", model: "model-at-send-time" },
      toolChoice: "manual",
    });
  });

  test("does not invent turn settings when no prior assistant metadata exists", () => {
    expect(getRetryTurnSettings([message("user-1", "user")])).toEqual({});
  });
});
