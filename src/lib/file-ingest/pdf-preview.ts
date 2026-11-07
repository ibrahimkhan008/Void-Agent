import { getDocumentProxy } from "unpdf";

export const MAX_PDF_PREVIEW_PAGES = 50;

/**
 * Extract a bounded, text-only PDF preview. Page-by-page extraction avoids
 * parsing the entire document when a file has a large page count.
 */
export async function extractPdfPreview(
  data: Uint8Array,
  options: { maxChars: number; maxPages?: number },
) {
  const maxPages = Math.max(
    1,
    Math.min(options.maxPages ?? MAX_PDF_PREVIEW_PAGES, MAX_PDF_PREVIEW_PAGES),
  );
  const maxChars = Math.max(1, options.maxChars);
  const pdf = await getDocumentProxy(data);
  const pages: string[] = [];
  let remaining = maxChars;
  let truncated = false;

  try {
    const pageCount = Math.min(pdf.numPages, maxPages);
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = content.items
        .map((item) =>
          "str" in item && typeof item.str === "string" ? item.str : "",
        )
        .filter(Boolean)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();

      if (!text) continue;
      const pageText = `Page ${pageNumber}\n${text}`;
      if (pageText.length > remaining) {
        pages.push(pageText.slice(0, remaining));
        remaining = 0;
        truncated = true;
        break;
      }
      pages.push(pageText);
      remaining -= pageText.length + 2;
      if (remaining <= 0) {
        truncated = true;
        break;
      }
    }

    if (pdf.numPages > pageCount) truncated = true;
    return {
      text: pages.join("\n\n"),
      totalPages: pdf.numPages,
      pagesShown: pageCount,
      truncated,
      partial: true,
    };
  } finally {
    await pdf.destroy();
  }
}
