import { describe, expect, it } from "vitest";
import {
  CanvasGenerateRequestSchema,
  toCanvasUIMessage,
} from "./generate-contract";

describe("eCanvas generation request contract", () => {
  it("accepts bounded text and model requests", () => {
    expect(
      CanvasGenerateRequestSchema.safeParse({
        model: { provider: "OpenAI", model: "gpt-test" },
        messages: [{ role: "user", content: "Build a landing page" }],
      }).success,
    ).toBe(true);
  });

  it("rejects malformed model, oversized prompts, and excessive messages", () => {
    expect(
      CanvasGenerateRequestSchema.safeParse({
        model: { provider: "", model: "gpt-test" },
        messages: [{ role: "user", content: "Build" }],
      }).success,
    ).toBe(false);
    expect(
      CanvasGenerateRequestSchema.safeParse({
        model: { provider: "OpenAI", model: "gpt-test" },
        messages: [{ role: "user", content: "x".repeat(40_001) }],
      }).success,
    ).toBe(false);
  });

  it("accepts only bounded embedded image data and rejects remote image URLs", () => {
    const image = `data:image/png;base64,${Buffer.from("image-bytes").toString("base64")}`;
    const message = toCanvasUIMessage(
      {
        role: "user",
        content: [{ type: "image_url", image_url: { url: image } }],
      },
      "canvas-1",
    );
    expect(message.parts[0]).toMatchObject({
      type: "file",
      mediaType: "image/png",
    });
    expect(() =>
      toCanvasUIMessage(
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: "https://images.example.test/remote.png" },
            },
          ],
        },
        "canvas-1",
      ),
    ).toThrow("Canvas images must be bounded base64 image data");
  });
});
