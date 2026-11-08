import { createCanvas, loadImage } from "@napi-rs/canvas";
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
  GATEWAY_INPAINT_MODEL,
  generateGatewayInpaint,
  normalizeInpaintPair,
} from "./gateway-inpaint";

const imageFixture = () => {
  const canvas = createCanvas(4, 2);
  const context = canvas.getContext("2d");
  context.fillStyle = "#2255aa";
  context.fillRect(0, 0, 4, 2);
  return canvas.toBuffer("image/png");
};

const maskFixture = () => {
  const canvas = createCanvas(4, 2);
  const context = canvas.getContext("2d");
  context.fillStyle = "rgba(255,255,255,0.7)";
  context.fillRect(0, 0, 1, 2);
  return canvas.toBuffer("image/png");
};

const source = imageFixture();
const mask = maskFixture();
const fixtureArgs = {
  imageBase64: source.toString("base64"),
  maskBase64: mask.toString("base64"),
  imageMimeType: "image/png",
  prompt: "Replace the painted part with blue flowers",
};

describe("Gateway image inpainting", () => {
  const previousKey = process.env.AI_GATEWAY_API_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AI_GATEWAY_API_KEY = "test-gateway-key";
    mocks.createGatewayProvider.mockReturnValue({
      imageModel: mocks.imageModel,
    });
    mocks.generateImage.mockResolvedValue({
      images: [{ base64: source.toString("base64"), mediaType: "image/png" }],
    });
  });

  afterEach(() => {
    if (previousKey === undefined) delete process.env.AI_GATEWAY_API_KEY;
    else process.env.AI_GATEWAY_API_KEY = previousKey;
  });

  it("normalizes source and mask to equal dimensions with opaque white painted pixels", async () => {
    const pair = await normalizeInpaintPair(
      fixtureArgs.imageBase64,
      fixtureArgs.maskBase64,
      "image/png",
    );
    const normalizedMask = await loadImage(Buffer.from(pair.mask));
    const canvas = createCanvas(normalizedMask.width, normalizedMask.height);
    const context = canvas.getContext("2d");
    context.drawImage(normalizedMask, 0, 0);
    const pixels = context.getImageData(0, 0, 4, 2).data;

    expect(pair.width).toBe(4);
    expect(pair.height).toBe(2);
    expect(normalizedMask.width).toBe(pair.width);
    expect(normalizedMask.height).toBe(pair.height);
    expect(Array.from(pixels.slice(0, 4))).toEqual([255, 255, 255, 255]);
    expect(Array.from(pixels.slice(4, 8))).toEqual([0, 0, 0, 255]);
  });

  it("sends the normalized associated pair to the dedicated fill model", async () => {
    await generateGatewayInpaint(fixtureArgs);
    const request = mocks.generateImage.mock.calls[0]?.[0];
    expect(mocks.imageModel).toHaveBeenCalledWith(GATEWAY_INPAINT_MODEL);
    expect(request.n).toBe(1);
    expect(request.prompt.text).toBe(fixtureArgs.prompt);
    expect(request.prompt.images).toHaveLength(1);
    expect(request.prompt.mask).toBeInstanceOf(Uint8Array);
    expect(Buffer.from(request.prompt.images[0]).byteLength).toBeGreaterThan(0);
    expect(request.abortSignal).toBeUndefined();
  });

  it("fails closed without Gateway configuration and enforces the combined input cap", async () => {
    delete process.env.AI_GATEWAY_API_KEY;
    await expect(generateGatewayInpaint(fixtureArgs)).rejects.toThrow(
      "AI_GATEWAY_API_KEY",
    );
    process.env.AI_GATEWAY_API_KEY = "test-gateway-key";
    const largeBase64 = Buffer.alloc(8 * 1024 * 1024).toString("base64");
    await expect(
      normalizeInpaintPair(largeBase64, largeBase64, "image/png"),
    ).rejects.toThrow("combined 15 MiB");
  });
});
