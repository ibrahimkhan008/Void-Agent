import { parseFragment, serialize } from "parse5";

/** A bounded, read-only HTML document renderer for private sandbox artifacts. */
export const SANDBOX_HTML_PREVIEW_CSP =
  "sandbox; default-src 'none'; script-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:; connect-src 'none'; media-src 'none'; object-src 'none'; frame-src 'none'; child-src 'none'; form-action 'none'; base-uri 'none'; navigate-to 'none'; frame-ancestors 'self'";

const ALLOWED_TAGS = new Set([
  "html",
  "head",
  "body",
  "title",
  "style",
  "main",
  "section",
  "article",
  "header",
  "footer",
  "nav",
  "div",
  "span",
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "ul",
  "ol",
  "li",
  "dl",
  "dt",
  "dd",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "small",
  "sub",
  "sup",
  "blockquote",
  "pre",
  "code",
  "hr",
  "br",
  "table",
  "caption",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "th",
  "td",
  "img",
  "details",
  "summary",
  "figure",
  "figcaption",
  "progress",
  "meter",
]);

const DROP_SUBTREE_TAGS = new Set([
  "script",
  "noscript",
  "template",
  "iframe",
  "frame",
  "frameset",
  "object",
  "embed",
  "portal",
  "svg",
  "math",
  "form",
  "input",
  "button",
  "select",
  "textarea",
  "option",
  "meta",
  "link",
  "base",
  "video",
  "audio",
  "source",
]);

const SAFE_ATTRIBUTES = new Set([
  "alt",
  "class",
  "colspan",
  "dir",
  "height",
  "id",
  "lang",
  "open",
  "role",
  "rowspan",
  "scope",
  "start",
  "style",
  "title",
  "width",
]);

interface MutableHtmlNode {
  nodeName: string;
  tagName?: string;
  attrs?: Array<{ name: string; value: string }>;
  childNodes?: MutableHtmlNode[];
  parentNode?: MutableHtmlNode;
}

const isSafeDataImage = (value: string) =>
  value.length <= 1_500_000 &&
  /^data:image\/(?:png|jpeg|gif|webp);base64,[a-z0-9+/]+={0,2}$/i.test(value);

/**
 * Remove executable, navigable, form, and external-resource capabilities
 * before placing sandbox output in a private preview document. The response
 * CSP and iframe sandbox remain the enforcement boundary; this allowlist also
 * strips clickable links and resource-bearing attributes to prevent requests.
 */
export function sanitizeSandboxHtmlPreview(html: string): string {
  const document = parseFragment(html) as unknown as MutableHtmlNode;

  const cleanChildren = (parent: MutableHtmlNode) => {
    const children = parent.childNodes ?? [];
    const next: MutableHtmlNode[] = [];

    for (const node of children) {
      if (!node.tagName) {
        next.push(node);
        continue;
      }

      const tag = node.tagName.toLowerCase();
      if (DROP_SUBTREE_TAGS.has(tag)) continue;

      cleanChildren(node);
      if (tag === "a") {
        next.push(...(node.childNodes ?? []));
        continue;
      }
      if (!ALLOWED_TAGS.has(tag)) {
        next.push(...(node.childNodes ?? []));
        continue;
      }

      const attrs = node.attrs ?? [];
      node.attrs = attrs.filter((attribute) => {
        const name = attribute.name.toLowerCase();
        if (name.startsWith("on") || name === "srcdoc") return false;
        if (tag === "img" && name === "src")
          return isSafeDataImage(attribute.value);
        return SAFE_ATTRIBUTES.has(name) || name.startsWith("aria-");
      });

      if (
        tag === "img" &&
        !node.attrs.some((attribute) => attribute.name.toLowerCase() === "src")
      ) {
        continue;
      }
      next.push(node);
    }

    parent.childNodes = next;
    for (const child of next) child.parentNode = parent;
  };

  cleanChildren(document);
  return serialize(document as never);
}

export function wrapSandboxHtmlPreview(fragment: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><style>html{color-scheme:light dark}body{margin:0;padding:16px;font:14px/1.5 ui-sans-serif,system-ui,sans-serif;overflow-wrap:anywhere}img{display:block;max-width:100%;max-height:70vh;object-fit:contain}table{border-collapse:collapse}td,th{border:1px solid #888;padding:4px 8px;text-align:left}</style></head><body>${fragment}</body></html>`;
}
