import JSZip from "jszip";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  MAX_TRACKED_DOCX_INPUT_BYTES,
  TrackedDocxError,
  applyProjectTrackedDocxEdits,
  applyTrackedEdits,
  resolveAllTrackedChanges,
  resolveProjectTrackedDocxChanges,
  validateProjectTrackedDocx,
} from "./project-tracked-docx";

const DOCUMENT_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">A better chatbot helps.</w:t></w:r></w:p><w:sectPr/></w:body></w:document>`;

async function makeDocx(documentXml = DOCUMENT_XML): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
  );
  zip.file("word/document.xml", documentXml);
  zip.file(
    "word/styles.xml",
    '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"/>',
  );
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

async function readDocument(bytes: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(bytes);
  const file = zip.file("word/document.xml");
  if (!file) throw new Error("missing document.xml");
  return file.async("string");
}

function visibleText(xml: string): string {
  return [
    ...xml.matchAll(/<w:(?:t|delText)\b[^>]*>([\s\S]*?)<\/w:(?:t|delText)>/g),
  ]
    .map((match) => match[1])
    .join("");
}

describe("project tracked DOCX transformation", () => {
  let input: Buffer;

  beforeEach(async () => {
    input = await makeDocx();
  });

  it("creates genuine insert/delete revisions and preserves affected run formatting", async () => {
    const result = await applyProjectTrackedDocxEdits(
      input,
      [
        {
          find: "chatbot",
          replace: "assistant",
          context_before: "A better ",
          context_after: " helps.",
          reason: "Use the product term.",
        },
      ],
      { author: "Reviewer", now: new Date("2026-01-02T03:04:05.000Z") },
    );

    expect(result.changes).toHaveLength(1);
    expect(result.errors).toEqual([]);
    const xml = await readDocument(result.bytes);
    expect(xml).toMatch(/<w:ins\b/);
    expect(xml).toMatch(/<w:del\b/);
    expect(xml).toContain('w:author="Reviewer"');
    expect(xml).toContain("<w:b>");
    expect(xml).toContain("<w:delText");
  });

  it("maps normalized whitespace back to original character offsets", async () => {
    const spaced = await makeDocx(
      DOCUMENT_XML.replace("A better chatbot", "A  better chatbot"),
    );
    const result = await applyProjectTrackedDocxEdits(spaced, [
      {
        find: "better chatbot",
        replace: "great assistant",
        context_before: "A ",
        context_after: " helps.",
      },
    ]);
    expect(result.changes).toHaveLength(1);
    const xml = await readDocument(result.bytes);
    expect(xml).toContain('<w:t xml:space="preserve">A  </w:t>');
    expect(xml).toContain("<w:delText");
  });

  it("accepts or rejects selected Word revisions and preserves unselected revisions", async () => {
    const first = await applyProjectTrackedDocxEdits(input, [
      {
        find: "chatbot",
        replace: "assistant",
        context_before: "A better ",
        context_after: " helps.",
      },
    ]);
    const second = await applyProjectTrackedDocxEdits(
      await makeDocx(
        DOCUMENT_XML.replace(
          "A better chatbot helps.",
          "A better chatbot helps. Also chatbot.",
        ),
      ),
      [
        {
          find: "chatbot",
          replace: "agent",
          context_before: "Also ",
          context_after: ".",
        },
      ],
    );
    const accepted = await resolveProjectTrackedDocxChanges(
      first.bytes,
      first.changes.map(({ id, delId, insId }) => ({ id, delId, insId })),
      "accept",
    );
    const rejected = await resolveProjectTrackedDocxChanges(
      second.bytes,
      second.changes.map(({ id, delId, insId }) => ({ id, delId, insId })),
      "reject",
    );
    const acceptedXml = await readDocument(accepted.bytes);
    const rejectedXml = await readDocument(rejected.bytes);
    expect(visibleText(acceptedXml)).toBe("A better assistant helps.");
    expect(acceptedXml).not.toMatch(/<w:del\b/);
    expect(visibleText(rejectedXml)).toBe(
      "A better chatbot helps. Also chatbot.",
    );
    expect(rejectedXml).not.toMatch(/<w:ins\b/);
  });

  it("uses the persisted proposal contract and resolves a batch without stored OOXML IDs", async () => {
    const generated = await applyTrackedEdits(input, [
      {
        originalText: "chatbot",
        suggestedText: "assistant",
        rationale: "Use clearer terminology.",
      },
    ]);
    expect(generated.changes).toHaveLength(1);
    expect(generated.errors).toEqual([]);
    const accepted = await resolveAllTrackedChanges(generated.bytes, "accept");
    expect(accepted.found).toBe(2);
    expect(visibleText(await readDocument(accepted.bytes))).toBe(
      "A better assistant helps.",
    );
  });

  it("returns an error for ambiguous anchors rather than editing the wrong occurrence", async () => {
    const repeated = await makeDocx(
      DOCUMENT_XML.replace("A better chatbot helps.", "chatbot and chatbot"),
    );
    const result = await applyProjectTrackedDocxEdits(repeated, [
      { find: "chatbot", replace: "assistant" },
    ]);
    expect(result.changes).toEqual([]);
    expect(result.errors[0]?.reason).toMatch(/ambiguous/i);
    expect(result.bytes).toBe(repeated);
  });

  it("rejects anchors crossing runs and leaves the source bytes untouched", async () => {
    const split = await makeDocx(
      DOCUMENT_XML.replace(
        '<w:t xml:space="preserve">A better chatbot helps.</w:t>',
        '<w:t xml:space="preserve">A better chat</w:t></w:r><w:r><w:t>bot helps.</w:t>',
      ),
    );
    const before = Buffer.from(split);
    const result = await applyProjectTrackedDocxEdits(split, [
      { find: "chatbot", replace: "assistant" },
    ]);
    expect(result.changes).toEqual([]);
    expect(result.errors[0]?.reason).toMatch(/crosses Word runs/i);
    expect(split).toEqual(before);
  });

  it("rejects invalid, oversized, and DOCTYPE-bearing packages", async () => {
    await expect(
      validateProjectTrackedDocx(Buffer.from("not zip")),
    ).rejects.toBeInstanceOf(TrackedDocxError);
    await expect(
      validateProjectTrackedDocx(
        Buffer.alloc(MAX_TRACKED_DOCX_INPUT_BYTES + 1),
      ),
    ).rejects.toThrow(/20 MiB/);
    const hostile = await makeDocx(
      `<!DOCTYPE w:document [<!ENTITY x "boom">]>${DOCUMENT_XML}`,
    );
    await expect(validateProjectTrackedDocx(hostile)).rejects.toThrow(
      /DOCTYPE/i,
    );
  });
});
