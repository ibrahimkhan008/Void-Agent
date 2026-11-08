import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getUserById: vi.fn(),
  editImageWithFlare: vi.fn(),
  upload: vi.fn(),
  isFreeTier: vi.fn(),
  canUseFreeTierImageEdit: vi.fn(),
  getFreeTierLimits: vi.fn(),
  recordFreeTierImageEditSuccess: vi.fn(),
  checkApiRateLimit: vi.fn(),
  loadOwnedImageForEdit: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("auth/server", () => ({ getSession: mocks.getSession }));
vi.mock("lib/db/repository", () => ({
  userRepository: { getUserById: mocks.getUserById },
}));
vi.mock("lib/file-storage", () => ({
  serverFileStorage: { upload: mocks.upload },
}));
vi.mock("lib/file-storage/storage-utils", () => ({
  storageKeyFromUrl: (value: string) => value,
  isManagedStorageKey: (value: string) => value.startsWith("managed:"),
  isUserStorageKey: (value: string, userId: string) =>
    value.startsWith(`managed:${userId}:`),
}));
vi.mock("lib/ai/tools/image/image-source", () => ({
  loadOwnedImageForEdit: mocks.loadOwnedImageForEdit,
}));
vi.mock("lib/ai/image/edit-image", () => ({
  editImageWithFlare: mocks.editImageWithFlare,
}));
vi.mock("app-types/subscription", () => ({ isFreeTier: mocks.isFreeTier }));
vi.mock("lib/rate-limit/free-tier-usage", () => ({
  canUseFreeTierImageEdit: mocks.canUseFreeTierImageEdit,
  getFreeTierLimits: mocks.getFreeTierLimits,
  recordFreeTierImageEditSuccess: mocks.recordFreeTierImageEditSuccess,
}));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: mocks.checkApiRateLimit,
}));
vi.mock("lib/ai/image/gateway-inpaint", () => ({
  GatewayInpaintInputError: class GatewayInpaintInputError extends Error {},
  GatewayInpaintProviderError: class GatewayInpaintProviderError extends Error {},
  generateGatewayInpaint: vi.fn(),
  isGatewayInpaintConfigured: () => Boolean(process.env.AI_GATEWAY_API_KEY),
}));
vi.mock("logger", () => ({ default: { info: vi.fn(), error: vi.fn() } }));

import { POST } from "./route";

const validPng = Buffer.from([
  137,
  80,
  78,
  71,
  13,
  10,
  26,
  10,
  ...new Array(100_000).fill(1),
]);

describe("POST /api/images/edit", () => {
  const previousGatewayKey = process.env.AI_GATEWAY_API_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: "user-1" } });
    mocks.getUserById.mockResolvedValue({ tier: "pro" });
    mocks.isFreeTier.mockReturnValue(false);
    mocks.editImageWithFlare.mockResolvedValue({
      images: [{ base64: validPng.toString("base64"), mimeType: "image/png" }],
      model: "flare/test",
    });
    mocks.upload.mockResolvedValue({ sourceUrl: "/owner/image.png" });
    mocks.checkApiRateLimit.mockResolvedValue({
      allowed: true,
      retryAfterMs: 60_000,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    if (previousGatewayKey === undefined) delete process.env.AI_GATEWAY_API_KEY;
    else process.env.AI_GATEWAY_API_KEY = previousGatewayKey;
  });

  it("reports masked editing only as a boolean when Gateway is configured", async () => {
    process.env.AI_GATEWAY_API_KEY = "secret-key";
    const response = await (await import("./route")).GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ maskedEditingAvailable: true });
  });

  it("keeps masked editing unavailable when Gateway is not configured", async () => {
    delete process.env.AI_GATEWAY_API_KEY;
    const response = await (await import("./route")).GET();
    expect(await response.json()).toEqual({ maskedEditingAvailable: false });
  });

  it("accepts a valid bounded legacy base64 edit body larger than 64 KiB", async () => {
    const response = await POST(
      new Request("https://void-agent.example/api/images/edit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          imageBase64: validPng.toString("base64"),
          imageMimeType: "image/png",
          prompt: "Edit this image",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.editImageWithFlare).toHaveBeenCalledOnce();
  });

  it("rejects a declared oversized body before parsing", async () => {
    const response = await POST(
      new Request("https://void-agent.example/api/images/edit", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": String(22 * 1024 * 1024),
        },
        body: "{}",
      }),
    );

    expect(response.status).toBe(413);
    expect(mocks.editImageWithFlare).not.toHaveBeenCalled();
  });

  it("rate limits an authenticated owner before downloading paired mask inputs", async () => {
    process.env.AI_GATEWAY_API_KEY = "test-key";
    mocks.checkApiRateLimit.mockResolvedValue({
      allowed: false,
      retryAfterMs: 60_000,
    });
    const response = await POST(
      new Request("https://void-agent.example/api/images/edit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          imageUrl: "managed:user-1:source",
          maskUrl: "managed:user-1:mask",
          imageMimeType: "image/png",
          prompt: "Replace the painted region",
        }),
      }),
    );

    expect(response.status).toBe(429);
    expect(mocks.checkApiRateLimit).toHaveBeenCalledWith({
      kind: "image-mask-edit",
      id: "user-1",
      limit: 20,
      windowMs: 60 * 60 * 1000,
    });
    expect(mocks.loadOwnedImageForEdit).not.toHaveBeenCalled();
  });
});
