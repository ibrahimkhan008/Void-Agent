import { describe, expect, it } from "vitest";
import { chatApiSchemaRequestBodySchema } from "./chat";

describe("chat request planMode field", () => {
  const base = {
    id: "thread-1",
    message: {
      id: "message-1",
      role: "user",
      parts: [{ type: "text", text: "Plan" }],
    },
    toolChoice: "none" as const,
  };

  it("accepts the optional plan-mode flag without changing normal requests", () => {
    expect(chatApiSchemaRequestBodySchema.safeParse(base).success).toBe(true);
    expect(
      chatApiSchemaRequestBodySchema.safeParse({ ...base, planMode: true })
        .success,
    ).toBe(true);
    expect(
      chatApiSchemaRequestBodySchema.safeParse({ ...base, planMode: "true" })
        .success,
    ).toBe(false);
  });
});
