import JSZip from "jszip";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ selectByIdForZip: vi.fn() }));

vi.mock("lib/db/pg/repositories/canvas-export-repository.pg", () => ({
  pgCanvasExportRepository: {
    selectByIdForZip: (...args: unknown[]) => mocks.selectByIdForZip(...args),
  },
}));

import { GET } from "./route";

const id = "217c9e15-a2d5-4e68-9d2a-16bc1532ff56";
const request = new Request(
  `https://void-agent.test/api/ecanvas/export/${id}/zip`,
);
const context = { params: Promise.resolve({ id }) };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.selectByIdForZip.mockResolvedValue({
    id,
    exporterId: "owner-1",
    title: "Portfolio / Private!",
    html: "<!doctype html><p>Portfolio</p>",
    canvasId: "canvas-1",
    scene: { elements: [{ id: "element-1" }] },
    metadata: { providerName: "test" },
    createdAt: new Date("2026-11-09T00:00:00.000Z"),
    updatedAt: new Date("2026-11-09T00:00:00.000Z"),
    revokedAt: null,
  });
});

describe("GET /api/ecanvas/export/[id]/zip", () => {
  it("creates a fixed-path archive with bounded export content and safe headers", async () => {
    const response = await GET(request, context);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/zip");
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="portfolio-private.zip"',
    );
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");

    const zip = await JSZip.loadAsync(await response.arrayBuffer());
    expect(Object.keys(zip.files).sort()).toEqual([
      "index.html",
      "metadata.json",
      "scene.json",
    ]);
    expect(await zip.file("index.html")?.async("string")).toContain(
      "Portfolio",
    );
    expect(await zip.file("scene.json")?.async("string")).toContain(
      "element-1",
    );
  });

  it("hides missing and revoked exports and rejects legacy oversized data", async () => {
    mocks.selectByIdForZip.mockResolvedValue(null);
    expect((await GET(request, context)).status).toBe(404);
    mocks.selectByIdForZip.mockResolvedValue({
      html: "x".repeat(512 * 1024 + 1),
      scene: null,
    });
    expect((await GET(request, context)).status).toBe(413);
  });
});
