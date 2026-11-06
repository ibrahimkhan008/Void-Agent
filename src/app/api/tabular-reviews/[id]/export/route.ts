import { getSession } from "auth/server";
import { and, asc, eq } from "drizzle-orm";
import JSZip from "jszip";
import { pgDb } from "lib/db/pg/db.pg";
import { CollectionItemTable, TabularReviewCellTable, TabularReviewItemTable, TabularReviewTable } from "lib/db/pg/schema.pg";
import type { ReviewColumn } from "lib/tabular/review-schema";

export const dynamic = "force-dynamic";

function xml(value: string) {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/[<>&"']/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[char]!);
}

function excelColumn(index: number) {
  let value = index + 1;
  let name = "";
  while (value) {
    const digit = (value - 1) % 26;
    name = String.fromCharCode(65 + digit) + name;
    value = Math.floor((value - 1) / 26);
  }
  return name;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.user.id) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const [review] = await pgDb.select().from(TabularReviewTable).where(and(eq(TabularReviewTable.id, id), eq(TabularReviewTable.userId, session.user.id))).limit(1);
  if (!review) return new Response("Review not found", { status: 404 });
  const [items, cells] = await Promise.all([
    pgDb.select({ itemId: TabularReviewItemTable.itemId, filename: CollectionItemTable.filename }).from(TabularReviewItemTable).innerJoin(CollectionItemTable, eq(CollectionItemTable.id, TabularReviewItemTable.itemId)).where(eq(TabularReviewItemTable.reviewId, id)).orderBy(asc(TabularReviewItemTable.rowIndex)),
    pgDb.select().from(TabularReviewCellTable).where(eq(TabularReviewCellTable.reviewId, id)),
  ]);
  const columns = review.columns as ReviewColumn[];
  const rows = [["Document", ...columns.map((column) => column.label)], ...items.map((item) => {
    const byColumn = new Map(cells.filter((cell) => cell.itemId === item.itemId).map((cell) => [cell.columnId, cell.value ?? ""]));
    return [item.filename || item.itemId, ...columns.map((column) => byColumn.get(column.id) ?? "")];
  })];
  const sheetRows = rows.map((row, rowIndex) => {
    const cellsXml = row.map((value, colIndex) => {
      const ref = `${excelColumn(colIndex)}${rowIndex + 1}`;
      return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
    }).join("");
    return `<row r="${rowIndex + 1}">${cellsXml}</row>`;
  }).join("");
  const zip = new JSZip();
  zip.file("[Content_Types].xml", '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>');
  zip.file("_rels/.rels", '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
  zip.file("xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xml(review.title.slice(0, 31) || "Review")}" sheetId="1" r:id="rId1"/></sheets></workbook>`);
  zip.file("xl/_rels/workbook.xml.rels", '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>');
  zip.file("xl/worksheets/sheet1.xml", `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>`);
  const bytes = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
  const filename = review.title.replace(/[^a-z0-9_-]/gi, "_").slice(0, 50) || "review";
  return new Response(Uint8Array.from(bytes) as unknown as BodyInit, { headers: {
    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": `attachment; filename="${filename}.xlsx"`,
    "Cache-Control": "private, no-store",
  } });
}
