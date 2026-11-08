import { Buffer } from "node:buffer";

export type RasterizedPdfPage = {
  pageNumber: number;
  url: string;
  mediaType: "image/png";
  filename: string;
  byteLength: number;
};

export const DEFAULT_PDF_VISION_MAX_PAGES = 5;
const MAX_PAGE_PIXELS = 2_000_000;
const TARGET_LONG_EDGE_PIXELS = 1400;
const MAX_RENDERED_PAGE_BYTES = 2 * 1024 * 1024;
const MAX_RENDERED_TOTAL_BYTES = 6 * 1024 * 1024;

export function getPdfVisionPageLimit(): number {
  const configured = Number.parseInt(
    process.env.PDF_VISION_MAX_PAGES ?? "",
    10,
  );
  if (!Number.isFinite(configured)) return DEFAULT_PDF_VISION_MAX_PAGES;
  return Math.max(0, Math.min(DEFAULT_PDF_VISION_MAX_PAGES, configured));
}

/**
 * Renders a small, bounded number of PDF pages for vision models. Text
 * extraction remains the primary representation; images add layout and
 * scanned-page context. Both the PDF parser's image decoder and our canvas
 * viewport have pixel limits, and rendered PNG bytes have per-page and
 * per-document caps.
 */
export async function rasterizePdfPages(
  content: Buffer,
  filename: string,
  options: { maxPages?: number; maxTotalBytes?: number } = {},
): Promise<RasterizedPdfPage[]> {
  const maxPages = Math.max(
    0,
    Math.min(
      options.maxPages ?? getPdfVisionPageLimit(),
      DEFAULT_PDF_VISION_MAX_PAGES,
    ),
  );
  const maxTotalBytes = Math.max(
    0,
    Math.min(
      options.maxTotalBytes ?? MAX_RENDERED_TOTAL_BYTES,
      MAX_RENDERED_TOTAL_BYTES,
    ),
  );
  if (maxPages === 0 || maxTotalBytes === 0 || content.length === 0) return [];

  let pdf: Awaited<
    ReturnType<typeof import("unpdf")["getDocumentProxy"]>
  > | null = null;
  try {
    const {
      createIsomorphicCanvasFactory,
      getDocumentProxy,
      renderPageAsImage,
    } = await import("unpdf");
    const canvasImport = () => import("@napi-rs/canvas");
    const CanvasFactory = await createIsomorphicCanvasFactory(canvasImport);
    const data = new Uint8Array(content.length);
    data.set(content);
    pdf = await getDocumentProxy(data, {
      CanvasFactory,
      maxImageSize: MAX_PAGE_PIXELS,
      stopAtErrors: true,
      isEvalSupported: false,
      disableFontFace: true,
      disableAutoFetch: true,
    });

    const pages: RasterizedPdfPage[] = [];
    let renderedBytes = 0;
    const pageCount = Math.min(pdf.numPages, maxPages);
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      try {
        const page = await pdf.getPage(pageNumber);
        const viewport = page.getViewport({ scale: 1 });
        const width = Number(viewport.width);
        const height = Number(viewport.height);
        const area = width * height;
        if (
          !Number.isFinite(width) ||
          !Number.isFinite(height) ||
          width <= 0 ||
          height <= 0 ||
          !Number.isFinite(area) ||
          area <= 0
        ) {
          continue;
        }

        const scale = Math.min(
          3,
          TARGET_LONG_EDGE_PIXELS / Math.max(width, height),
          Math.sqrt(MAX_PAGE_PIXELS / area),
        );
        const png = await renderPageAsImage(pdf, pageNumber, {
          scale,
          canvasImport,
        });
        const bytes = Buffer.from(png);
        if (
          bytes.byteLength === 0 ||
          bytes.byteLength > MAX_RENDERED_PAGE_BYTES ||
          renderedBytes + bytes.byteLength > maxTotalBytes
        ) {
          continue;
        }

        renderedBytes += bytes.byteLength;
        pages.push({
          pageNumber,
          url: `data:image/png;base64,${bytes.toString("base64")}`,
          mediaType: "image/png",
          filename: `${filename} (page ${pageNumber})`,
          byteLength: bytes.byteLength,
        });
      } catch {
        // Page rendering is best-effort. The text extraction still provides
        // useful content if a particular page cannot be rendered.
      }
    }
    return pages;
  } catch {
    return [];
  } finally {
    if (pdf) {
      try {
        await pdf.destroy();
      } catch {
        // Cleanup failure must not replace usable extracted text.
      }
    }
  }
}
