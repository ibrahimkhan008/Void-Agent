import { beforeEach, describe, expect, it, vi } from "vitest";

const pdfMocks = vi.hoisted(() => ({
  getDocumentProxy: vi.fn(),
  getPage: vi.fn(),
  getTextContent: vi.fn(),
  destroy: vi.fn(),
}));

vi.mock("unpdf", () => ({
  getDocumentProxy: pdfMocks.getDocumentProxy,
}));

import { extractPdfPreview } from "./pdf-preview";

describe("extractPdfPreview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pdfMocks.getDocumentProxy.mockResolvedValue({
      numPages: 2,
      getPage: pdfMocks.getPage,
      destroy: pdfMocks.destroy,
    });
    pdfMocks.getPage.mockImplementation(async (pageNumber: number) => ({
      getTextContent: async () => ({
        items: [{ str: `text from page ${pageNumber}` }, { type: "marked" }],
      }),
    }));
  });

  it("extracts page-labeled text and destroys the PDF document", async () => {
    const result = await extractPdfPreview(new Uint8Array([1]), {
      maxChars: 100,
    });
    expect(result).toMatchObject({
      text: "Page 1\ntext from page 1\n\nPage 2\ntext from page 2",
      totalPages: 2,
      pagesShown: 2,
      truncated: false,
      partial: true,
    });
    expect(pdfMocks.getPage).toHaveBeenCalledTimes(2);
    expect(pdfMocks.destroy).toHaveBeenCalledOnce();
  });

  it("caps page and character work", async () => {
    pdfMocks.getDocumentProxy.mockResolvedValueOnce({
      numPages: 1000,
      getPage: pdfMocks.getPage,
      destroy: pdfMocks.destroy,
    });
    const result = await extractPdfPreview(new Uint8Array([1]), {
      maxChars: 10,
      maxPages: 2,
    });
    expect(result.totalPages).toBe(1000);
    expect(result.pagesShown).toBe(2);
    expect(result.text.length).toBeLessThanOrEqual(10);
    expect(result.truncated).toBe(true);
    expect(pdfMocks.getPage).toHaveBeenCalledTimes(1);
    expect(pdfMocks.destroy).toHaveBeenCalledOnce();
  });

  it("destroys the parser when page extraction throws", async () => {
    pdfMocks.getPage.mockRejectedValueOnce(new Error("malformed page"));
    await expect(
      extractPdfPreview(new Uint8Array([1]), { maxChars: 100 }),
    ).rejects.toThrow("malformed page");
    expect(pdfMocks.destroy).toHaveBeenCalledOnce();
  });
});
