import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  rate: vi.fn(),
  download: vi.fn(),
  metadata: vi.fn(),
  docxHtml: vi.fn(),
  pptx: vi.fn(),
  pdfPreview: vi.fn(),
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
vi.mock("lib/file-ingest/docx-html", () => ({
  renderDocxHtml: mocks.docxHtml,
}));
vi.mock("lib/file-ingest/pptx", () => ({ parsePptxPreview: mocks.pptx }));
vi.mock("lib/file-ingest/pdf-preview", () => ({
  extractPdfPreview: mocks.pdfPreview,
}));
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
    mocks.docxHtml.mockResolvedValue("<h1>Word title</h1><table></table>");
    mocks.pptx.mockResolvedValue({
      slides: [{ index: 1, title: "Intro", text: "slide text", hidden: false }],
      totalSlides: 1,
      skipped: 0,
      truncated: false,
      partial: true,
    });
    mocks.pdfPreview.mockResolvedValue({
      text: "Page 1\nPDF text",
      totalPages: 1,
      pagesShown: 1,
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
    expect(await docx.json()).toMatchObject({
      html: "<h1>Word title</h1><table></table>",
      partial: true,
    });
    expect(mocks.docxHtml).toHaveBeenCalled();
    const pdf = await GET(request("key=uploads%2Fuser-1%2Ffile.pdf"));
    expect(pdf.status).toBe(200);
    expect(pdf.headers.get("cache-control")).toBe("private, no-store");
    expect(await pdf.json()).toMatchObject({
      text: "PDF, 1 page(s)\n\nPage 1\nPDF text",
      partial: true,
      truncated: false,
    });
    expect(mocks.pdfPreview).toHaveBeenCalledWith(
      expect.any(Uint8Array),
      expect.objectContaining({ maxChars: expect.any(Number) }),
    );
    const slides = await (
      await GET(request("key=uploads%2Fuser-1%2Fslides.pptx"))
    ).json();
    expect(slides.text).toContain("Slide 1: Intro");
    expect(
      (await GET(request("key=uploads%2Fuser-1%2Farchive.zip"))).status,
    ).toBe(400);
  });

  it("rejects oversized rendered DOCX output and does not return HTML", async () => {
    mocks.docxHtml.mockResolvedValueOnce("<p>x</p>".repeat(70_000));
    const response = await GET(request("key=uploads%2Fuser-1%2Flarge.docx"));
    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({ reason: "too_large" });
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
