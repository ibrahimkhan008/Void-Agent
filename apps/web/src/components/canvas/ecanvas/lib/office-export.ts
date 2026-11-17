import { Document, ImageRun, Packer, Paragraph, TextRun } from "docx";
import PptxGenJS from "pptxgenjs";

export interface ExportImage {
  base64: string;
  label: string;
}

export interface Size {
  width: number;
  height: number;
}

export function containImage(
  image: Size,
  box: Size,
): Size & { x: number; y: number } {
  const scale = Math.min(box.width / image.width, box.height / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  return {
    width,
    height,
    x: (box.width - width) / 2,
    y: (box.height - height) / 2,
  };
}

function readImageSize(base64: string): Promise<Size> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () =>
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () =>
      reject(new Error("Could not read exported canvas image"));
    image.src = `data:image/png;base64,${base64}`;
  });
}

function download(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Export each canvas frame as a slide, preserving its aspect ratio. */
export async function exportImagesAsPptx(
  images: ExportImage[],
  fileName: string,
): Promise<boolean> {
  if (images.length === 0) return false;

  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "Void Agent";
  pptx.subject = "Canvas export";
  pptx.title = fileName;
  const slideWidth = 13.333;
  const slideHeight = 7.5;

  for (const image of images) {
    const size = await readImageSize(image.base64);
    const slide = pptx.addSlide();
    const box = { width: slideWidth - 0.6, height: slideHeight - 0.6 };
    const fitted = containImage(size, box);
    slide.addImage({
      data: `data:image/png;base64,${image.base64}`,
      x: 0.3 + fitted.x,
      y: 0.3 + fitted.y,
      w: fitted.width,
      h: fitted.height,
    });
  }

  const output = await pptx.write({ outputType: "blob" });
  download(
    output as Blob,
    fileName.endsWith(".pptx") ? fileName : `${fileName}.pptx`,
  );
  return true;
}

/** Export each canvas frame as an image on a landscape Word page. */
export async function exportImagesAsDocx(
  images: ExportImage[],
  fileName: string,
): Promise<boolean> {
  if (images.length === 0) return false;

  const children: (Paragraph | TextRun)[] = [];
  for (const [index, image] of images.entries()) {
    const size = await readImageSize(image.base64);
    const fitted = containImage(size, { width: 900, height: 500 });
    if (index > 0)
      children.push(new Paragraph({ children: [], pageBreakBefore: true }));
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: image.label || `Canvas ${index + 1}`,
            bold: true,
          }),
        ],
        spacing: { after: 240 },
      }),
      new Paragraph({
        children: [
          new ImageRun({
            type: "png",
            data: Uint8Array.from(atob(image.base64), (character) =>
              character.charCodeAt(0),
            ),
            transformation: { width: fitted.width, height: fitted.height },
          }),
        ],
      }),
    );
  }

  const documentFile = new Document({
    creator: "Void Agent",
    title: fileName,
    sections: [
      {
        properties: {
          page: {
            size: { width: 15840, height: 12240, orientation: "landscape" },
            margin: { top: 720, right: 720, bottom: 720, left: 720 },
          },
        },
        children: children as Paragraph[],
      },
    ],
  });
  const blob = await Packer.toBlob(documentFile);
  download(blob, fileName.endsWith(".docx") ? fileName : `${fileName}.docx`);
  return true;
}
