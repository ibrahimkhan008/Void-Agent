import { Buffer } from "node:buffer";
import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_PDF_VISION_MAX_PAGES,
  getPdfVisionPageLimit,
  rasterizePdfPages,
} from "./pdf-rasterize";

function onePagePdf(text = "RASTER OK"): Buffer {
  const stream = `BT /F1 24 Tf 30 100 Td (${text}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}

function transparentPagePdf(): Buffer {
  const pageContent = "q /GS1 gs 1 0 0 rg 0 0 300 200 re f Q";
  const maskContent = "0.5 g 0 0 300 200 re f";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /ExtGState << /GS1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${pageContent.length} >>\nstream\n${pageContent}\nendstream`,
    "<< /Type /ExtGState /SMask << /S /Alpha /G 6 0 R >> >>",
    `<< /Type /XObject /Subtype /Form /BBox [0 0 300 200] /Group << /S /Transparency /CS /DeviceGray >> /Resources << >> /Length ${maskContent.length} >>\nstream\n${maskContent}\nendstream`,
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}

const originalMaxPages = process.env.PDF_VISION_MAX_PAGES;
afterEach(() => {
  if (originalMaxPages === undefined) delete process.env.PDF_VISION_MAX_PAGES;
  else process.env.PDF_VISION_MAX_PAGES = originalMaxPages;
});

describe("PDF vision page rasterization", () => {
  it("renders bounded PDF pages as model-ready PNG data URLs", async () => {
    const pages = await rasterizePdfPages(onePagePdf(), "fixture.pdf", {
      maxPages: 1,
    });
    expect(pages).toHaveLength(1);
    expect(pages[0]).toMatchObject({
      pageNumber: 1,
      mediaType: "image/png",
      filename: "fixture.pdf (page 1)",
    });
    const bytes = Buffer.from(pages[0]!.url.split(",")[1]!, "base64");
    expect(bytes.subarray(1, 4).toString("latin1")).toBe("PNG");
    expect(bytes.length).toBe(pages[0]!.byteLength);
    expect(bytes.length).toBeLessThanOrEqual(2 * 1024 * 1024);
  }, 30_000);

  it("renders a page with a transparency soft mask using the shared canvas factory", async () => {
    const pages = await rasterizePdfPages(transparentPagePdf(), "mask.pdf", {
      maxPages: 1,
    });
    expect(pages).toHaveLength(1);
    const bytes = Buffer.from(pages[0]!.url.split(",")[1]!, "base64");
    expect(bytes.subarray(1, 4).toString("latin1")).toBe("PNG");
  }, 30_000);

  it("does not rasterize when disabled, over the output budget, or invalid", async () => {
    expect(
      await rasterizePdfPages(onePagePdf(), "fixture.pdf", { maxPages: 0 }),
    ).toEqual([]);
    expect(
      await rasterizePdfPages(onePagePdf(), "fixture.pdf", {
        maxTotalBytes: 1,
      }),
    ).toEqual([]);
    expect(
      await rasterizePdfPages(Buffer.from("not pdf"), "invalid.pdf"),
    ).toEqual([]);
  }, 30_000);

  it("caps environment configuration and accepts an explicit zero kill switch", () => {
    delete process.env.PDF_VISION_MAX_PAGES;
    expect(getPdfVisionPageLimit()).toBe(DEFAULT_PDF_VISION_MAX_PAGES);
    process.env.PDF_VISION_MAX_PAGES = "99";
    expect(getPdfVisionPageLimit()).toBe(DEFAULT_PDF_VISION_MAX_PAGES);
    process.env.PDF_VISION_MAX_PAGES = "0";
    expect(getPdfVisionPageLimit()).toBe(0);
  });
});
