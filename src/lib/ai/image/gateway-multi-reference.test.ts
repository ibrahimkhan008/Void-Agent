import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generateImage: vi.fn(),
  imageModel: vi.fn((id: string) => ({ provider: "gateway", id })),
  createGatewayProvider: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("ai-image-v7", () => ({ generateImage: mocks.generateImage }));
vi.mock("@ai-sdk/gateway-image-v4", () => ({
  createGatewayProvider: mocks.createGatewayProvider,
}));

import {
  GATEWAY_MULTI_REFERENCE_MODEL,
  generateGatewayMultiReferenceImage,
  isGatewayMultiReferenceConfigured,
} from "./gateway-multi-reference";

const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const images = [1, 2].map(() => ({
  base64: png.toString("base64"),
  mimeType: "image/png",
}));

describe("AI Gateway multi-reference image generation", () => {
  const previousKey = process.env.AI_GATEWAY_API_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AI_GATEWAY_API_KEY = "test-gateway-key";
    mocks.createGatewayProvider.mockReturnValue({
      imageModel: mocks.imageModel,
    });
    mocks.generateImage.mockResolvedValue({
      images: [
        {
          base64: png.toString("base64"),
          mediaType: "image/png",
        },
      ],
    });
  });

  afterEach(() => {
    if (previousKey === undefined) delete process.env.AI_GATEWAY_API_KEY;
    else process.env.AI_GATEWAY_API_KEY = previousKey;
  });

  it("is disabled without the server-side Gateway key", async () => {
    delete process.env.AI_GATEWAY_API_KEY;
    expect(isGatewayMultiReferenceConfigured()).toBe(false);
    await expect(
      generateGatewayMultiReferenceImage({ prompt: "Combine", images }),
    ).rejects.toThrow("AI_GATEWAY_API_KEY");
    expect(mocks.createGatewayProvider).not.toHaveBeenCalled();
    expect(mocks.generateImage).not.toHaveBeenCalled();
  });

  it("sends only bounded input image bytes to the capability-specific Gateway model", async () => {
    expect(isGatewayMultiReferenceConfigured()).toBe(true);
    const result = await generateGatewayMultiReferenceImage({
      prompt: "Combine the two references",
      images,
    });

    expect(mocks.createGatewayProvider).toHaveBeenCalledWith({
      apiKey: "test-gateway-key",
    });
    expect(mocks.imageModel).toHaveBeenCalledWith(
      GATEWAY_MULTI_REFERENCE_MODEL,
    );
    expect(mocks.generateImage).toHaveBeenCalledWith(
      expect.objectContaining({
        model: { provider: "gateway", id: GATEWAY_MULTI_REFERENCE_MODEL },
        prompt: {
          text: "Combine the two references",
          images: images.map((image) => Buffer.from(image.base64, "base64")),
        },
        n: 1,
        maxRetries: 0,
      }),
    );
    expect(result.model).toBe(GATEWAY_MULTI_REFERENCE_MODEL);
    expect(result.images[0]).toEqual({
      url: "",
      base64: png.toString("base64"),
      mimeType: "image/png",
    });
  });

  it("rejects unsupported image counts and malformed provider output", async () => {
    await expect(
      generateGatewayMultiReferenceImage({
        prompt: "One",
        images: images.slice(0, 1),
      }),
    ).rejects.toThrow("2 to 4");
    await expect(
      generateGatewayMultiReferenceImage({
        prompt: "Many",
        images: [...images, ...images, ...images],
      }),
    ).rejects.toThrow("2 to 4");

    mocks.generateImage.mockResolvedValueOnce({
      images: [
        {
          base64: Buffer.from("<svg").toString("base64"),
          mediaType: "image/png",
        },
      ],
    });
    await expect(
      generateGatewayMultiReferenceImage({ prompt: "Combine", images }),
    ).rejects.toThrow("supported raster");
  });

  it("enforces the combined byte cap, bounds prompts, and accepts one output only", async () => {
    const largeBytes = Buffer.concat([
      png,
      Buffer.alloc(8 * 1024 * 1024 - png.length),
    ]);
    const largeImage = {
      base64: largeBytes.toString("base64"),
      mimeType: "image/png",
    };
    await expect(
      generateGatewayMultiReferenceImage({
        prompt: "Combine",
        images: [largeImage, largeImage],
      }),
    ).rejects.toThrow("Combined reference images exceed");
    expect(mocks.generateImage).not.toHaveBeenCalled();

    await generateGatewayMultiReferenceImage({
      prompt: `Make a composition ${"details ".repeat(200)}`,
      images,
    });
    expect(mocks.generateImage.mock.calls[0]?.[0].prompt.text.length).toBe(600);

    mocks.generateImage.mockResolvedValueOnce({
      images: [
        { base64: png.toString("base64"), mediaType: "image/png" },
        { base64: png.toString("base64"), mediaType: "image/png" },
      ],
    });
    await expect(
      generateGatewayMultiReferenceImage({ prompt: "Combine", images }),
    ).rejects.toThrow("more images than requested");
  });
});
