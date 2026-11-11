export const PUBLIC_CANVAS_EXPORT_CSP =
  "default-src 'none'; img-src data: blob:; media-src data: blob:; font-src data:; style-src 'unsafe-inline' data:; script-src 'unsafe-inline' blob:; connect-src 'none'; frame-src 'none'; child-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";

/**
 * Public HTML exports are untrusted generated content. Keep the CSP before
 * any supplied markup so later meta elements cannot widen it. The page also
 * renders this inside an opaque-origin sandboxed iframe.
 */
export function buildSandboxedCanvasHtml(html: string): string {
  const policy = `<meta http-equiv="Content-Security-Policy" content="${PUBLIC_CANVAS_EXPORT_CSP}">`;
  const doctype = /^\s*<!doctype\s+html[^>]*>/iu.exec(html);
  if (doctype) {
    return `${html.slice(0, doctype.index + doctype[0].length)}${policy}${html.slice(doctype.index + doctype[0].length)}`;
  }
  return `<!doctype html>${policy}${html}`;
}

export function sanitizeCanvasExportFilename(name: string): string {
  return (
    name
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[^a-z0-9-_\s]/gu, "")
      .trim()
      .replace(/\s+/gu, "-")
      .slice(0, 80) || "canvas-export"
  );
}

export function canvasExportJsonBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}
