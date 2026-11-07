import { Buffer } from "node:buffer";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { renderDocxHtml } from "./docx-html";

async function makeDocx() {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
  );
  zip.file(
    "word/_rels/document.xml.rels",
    `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdLink" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://attacker.example" TargetMode="External"/>
</Relationships>`,
  );
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    <w:p><w:r><w:t>Agreement heading</w:t></w:r></w:p>
    <w:p><w:hyperlink r:id="rIdLink"><w:r><w:t>external link</w:t></w:r></w:hyperlink></w:p>
    <w:tbl><w:tr><w:tc><w:p><w:r><w:t>Party</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Term</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
  </w:body>
</w:document>`,
  );
  return Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));
}

describe("renderDocxHtml", () => {
  it("preserves table structure but removes navigable links", async () => {
    const html = await renderDocxHtml(await makeDocx());
    expect(html).toContain("Agreement heading");
    expect(html).toContain("<table>");
    expect(html).toContain("Party");
    expect(html).toContain("<span>external link</span>");
    expect(html).not.toContain("<a ");
    expect(html).not.toContain("attacker.example");
    expect(html).not.toContain("<script");
  });

  it("rejects non-OOXML bytes before invoking the document renderer", async () => {
    await expect(renderDocxHtml(Buffer.from("not a docx"))).rejects.toThrow();
  });
});
