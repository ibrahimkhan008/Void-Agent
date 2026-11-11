import { describe, expect, it } from "vitest";
import { validateCollectionFile } from "./file-validation";

const encoder = new TextEncoder();

function makeStoredZip(
  entries: { name: string; content: string; declaredSize?: number }[],
) {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let localOffset = 0;
  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const body = encoder.encode(entry.content);
    const local = new Uint8Array(30 + name.length + body.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(8, 0, true);
    localView.setUint32(18, body.length, true);
    localView.setUint32(22, body.length, true);
    localView.setUint16(26, name.length, true);
    local.set(name, 30);
    local.set(body, 30 + name.length);
    localParts.push(local);

    const central = new Uint8Array(46 + name.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint32(20, body.length, true);
    centralView.setUint32(24, entry.declaredSize ?? body.length, true);
    centralView.setUint16(28, name.length, true);
    centralView.setUint32(42, localOffset, true);
    central.set(name, 46);
    centralParts.push(central);
    localOffset += local.length;
  }
  const centralSize = centralParts.reduce(
    (total, part) => total + part.length,
    0,
  );
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, localOffset, true);
  const parts = [...localParts, ...centralParts, end];
  const result = new Uint8Array(
    parts.reduce((total, part) => total + part.length, 0),
  );
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

describe("validateCollectionFile", () => {
  it("accepts valid text and PDF signatures with normalized media types", async () => {
    await expect(
      validateCollectionFile(
        new File(["hello"], "notes.txt", { type: "text/plain" }),
      ),
    ).resolves.toEqual({ valid: true, contentType: "text/plain" });
    await expect(
      validateCollectionFile(
        new File(["%PDF-1.7\nbody"], "paper.pdf", { type: "application/pdf" }),
      ),
    ).resolves.toEqual({ valid: true, contentType: "application/pdf" });
  });

  it("requires DOCX ZIP structure and rejects unsafe paths and expansion bombs", async () => {
    const valid = makeStoredZip([
      { name: "[Content_Types].xml", content: "<Types/>" },
      { name: "word/document.xml", content: "<document/>" },
    ]);
    expect(
      await validateCollectionFile(
        new File([valid], "valid.docx", {
          type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        }),
      ),
    ).toEqual({
      valid: true,
      contentType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });

    const unsafePath = makeStoredZip([
      { name: "[Content_Types].xml", content: "<Types/>" },
      { name: "word/../document.xml", content: "<document/>" },
    ]);
    expect(
      (await validateCollectionFile(new File([unsafePath], "unsafe.docx")))
        .valid,
    ).toBe(false);

    const bomb = makeStoredZip([
      { name: "[Content_Types].xml", content: "<Types/>" },
      {
        name: "word/document.xml",
        content: "x",
        declaredSize: 101 * 1024 * 1024,
      },
    ]);
    expect(
      (await validateCollectionFile(new File([bomb], "bomb.docx"))).valid,
    ).toBe(false);
  });

  it("rejects extension/MIME mismatches, binary text, invalid UTF-8, and fake PDFs", async () => {
    expect(
      (
        await validateCollectionFile(
          new File(["<html>"], "page.pdf", { type: "text/html" }),
        )
      ).valid,
    ).toBe(false);
    expect(
      (
        await validateCollectionFile(
          new File([new Uint8Array([65, 0, 66])], "binary.txt"),
        )
      ).valid,
    ).toBe(false);
    expect(
      (
        await validateCollectionFile(
          new File([new Uint8Array([0xff, 0xfe])], "encoding.txt"),
        )
      ).valid,
    ).toBe(false);
  });
});
