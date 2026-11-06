import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  rate: vi.fn(),
  download: vi.fn(),
  metadata: vi.fn(),
  docx: vi.fn(),
  pptx: vi.fn(),
}));
vi.mock("auth/server", () => ({ getSession: mocks.session }));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: mocks.rate,
}));
vi.mock("lib/file-storage", () => ({
  serverFileStorage: { download: mocks.download, getMetadata: mocks.metadata },
}));
vi.mock("lib/file-storage/storage-utils", () => ({
  isUserStorageKey: (key: string, userId: string) =>
    key.startsWith(`uploads/${userId}/`),
  storageKeyFromUrl: (url: string) => {
    try {
      return new URL(url).pathname.replace(/^\//, "");
    } catch {
      return null;
    }
  },
}));
vi.mock("lib/file-ingest/docx", () => ({ parseDocxPreview: mocks.docx }));
vi.mock("lib/file-ingest/pptx", () => ({ parsePptxPreview: mocks.pptx }));
vi.mock("lib/logger", () => ({ default: { error: vi.fn() } }));
import { GET } from "./route";

const request = (query: string) =>
  new Request(`https://void.test/api/storage/document?${query}`);

describe("GET /api/storage/document", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ user: { id: "user-1" } });
    mocks.rate.mockResolvedValue({ allowed: true });
    mocks.metadata.mockResolvedValue({ size: 10 });
    mocks.download.mockResolvedValue(Buffer.from("hello"));
    mocks.docx.mockResolvedValue({ text: "word text", truncated: false });
    mocks.pptx.mockResolvedValue({
      slides: [{ index: 1, title: "Intro", text: "slide text", hidden: false }],
      totalSlides: 1,
      skipped: 0,
      truncated: false,
      partial: true,
    });
  });

  it("requires authentication and user-owned storage before reading", async () => {
    mocks.session.mockResolvedValueOnce(null);
    expect((await GET(request("key=uploads%2Fuser-1%2Ffile.txt"))).status).toBe(
      401,
    );
    expect((await GET(request("key=uploads%2Fuser-2%2Ffile.txt"))).status).toBe(
      404,
    );
    expect(mocks.download).not.toHaveBeenCalled();
  });

  it("previews bounded UTF-8 text with private no-store caching", async () => {
    const response = await GET(request("key=uploads%2Fuser-1%2Freadme.md"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toMatchObject({
      text: "hello",
      truncated: false,
    });
  });

  it("dispatches supported document formats and rejects other formats", async () => {
    const docx = await GET(request("key=uploads%2Fuser-1%2Ffile.docx"));
    expect(docx.status).toBe(200);
    expect(await docx.json()).toMatchObject({ partial: true });
    expect(mocks.docx).toHaveBeenCalled();
    const slides = await (
      await GET(request("key=uploads%2Fuser-1%2Fslides.pptx"))
    ).json();
    expect(slides.text).toContain("Slide 1: Intro");
    expect(
      (await GET(request("key=uploads%2Fuser-1%2Farchive.pdf"))).status,
    ).toBe(400);
  });

  it("checks metadata and downloaded size before parsing", async () => {
    mocks.metadata.mockResolvedValueOnce(null);
    expect(
      (await GET(request("key=uploads%2Fuser-1%2Fmissing.txt"))).status,
    ).toBe(404);
    expect(mocks.download).not.toHaveBeenCalled();
    mocks.metadata.mockResolvedValueOnce({ size: 5 * 1024 * 1024 + 1 });
    expect(
      (await GET(request("key=uploads%2Fuser-1%2Flarge.txt"))).status,
    ).toBe(413);
    expect(mocks.download).not.toHaveBeenCalled();
    mocks.download.mockResolvedValueOnce(Buffer.alloc(5 * 1024 * 1024 + 1));
    expect(
      (await GET(request("key=uploads%2Fuser-1%2Factorial-large.txt"))).status,
    ).toBe(413);
  });

  it("rate limits previews before storage reads", async () => {
    mocks.rate.mockResolvedValueOnce({ allowed: false });
    expect((await GET(request("key=uploads%2Fuser-1%2Ffile.txt"))).status).toBe(
      429,
    );
    expect(mocks.download).not.toHaveBeenCalled();
  });
});
