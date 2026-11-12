import { readFile } from "node:fs/promises";
import { LegalPage, type LegalSection } from "./legal-page";

/**
 * Renders a markdown legal document through the Cognix LegalPage layout.
 *
 * Parses the markdown by `## ` headings into LegalSection objects, then
 * renders the Cognix article: hero, sticky TOC sidebar, and sectioned body.
 * Markdown formatting (bold, lists, code) is converted to the matching
 * Cognix classes.
 */
export async function MarkdownLegalPage({
  filePath,
  title,
  description,
  version,
  effective,
  eyebrow,
  accentTitle,
  introParagraph,
  siblings = [],
  activeSibling,
}: {
  filePath: string;
  title: string;
  description: string;
  version?: string;
  effective?: string;
  eyebrow?: string;
  accentTitle?: string;
  introParagraph?: string;
  siblings?: Array<{ label: string; href: string }>;
  activeSibling?: number;
}) {
  const raw = await readFile(filePath, "utf8");
  const sections = parseMarkdownSections(raw);

  return (
    <LegalPage
      title={title}
      description={description}
      version={version}
      effective={effective}
      eyebrow={eyebrow}
      accentTitle={accentTitle}
      introParagraph={introParagraph}
      siblings={siblings}
      activeSibling={activeSibling}
      sections={sections}
    />
  );
}

/** Parse `## ` heading-delimited markdown into LegalSection objects. */
function parseMarkdownSections(raw: string): LegalSection[] {
  const lines = raw.split("\n");
  const sections: LegalSection[] = [];
  let current: {
    id: string;
    title: string;
    tocTitle?: string;
    lines: string[];
  } | null = null;
  let inToc = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip the markdown H1 (it becomes the page title in LegalPage)
    if (trimmed.startsWith("# ") && !trimmed.startsWith("## ")) {
      continue;
    }

    // Skip the horizontal rules and meta blocks before the first section
    if (trimmed === "---") {
      continue;
    }

    // Skip the "Table of Contents" section
    if (trimmed === "## Table of Contents") {
      inToc = true;
      continue;
    }
    if (inToc) {
      if (trimmed === "") continue;
      if (trimmed.startsWith("## ")) {
        inToc = false;
      } else {
        continue;
      }
    }

    // New section
    if (trimmed.startsWith("## ")) {
      if (current) {
        sections.push(toSection(current));
      }
      // Keep the authored "1." number on the article H2 (cognix style:
      // "1. Agreement") but expose a plain label for the TOC rail, which
      // carries its own 01/02 numbering.
      const headingText = trimmed.replace(/^##\s+/, "").trim();
      const tocTitle = headingText.replace(/^\d+[.)]\s+/, "").trim();
      const id = slugify(tocTitle);
      current = { id, title: headingText, tocTitle, lines: [] };
      continue;
    }

    // Skip content before the first ## heading
    if (!current) continue;

    current.lines.push(line);
  }

  if (current) {
    sections.push(toSection(current));
  }

  return sections;
}

function toSection(current: {
  id: string;
  title: string;
  tocTitle?: string;
  lines: string[];
}): LegalSection {
  const html = renderMarkdown(current.lines);
  return {
    id: current.id,
    title: current.title,
    tocTitle: current.tocTitle,
    body: <div dangerouslySetInnerHTML={{ __html: html }} />,
  };
}

/** Render consecutive `|`-pipe lines as a cognix tray+card table. */
function renderMarkdownTable(lines: string[]): string {
  const rows = lines
    .map((line) => line.trim())
    .filter((line) => line.startsWith("|"));
  if (rows.length < 2) {
    return `<p class="mt-5">${inline(rows.join(" "))}</p>`;
  }
  const cells = (row: string) =>
    row
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((cell) => cell.trim());

  const header = cells(rows[0]);
  // Skip the |---|---| separator row (and any stray blank-ish rows).
  const bodyRows = rows
    .slice(1)
    .filter((row) => !/^\|[\s:|-]+\|$/.test(row))
    .map(cells);

  const th = header
    .map(
      (h) =>
        `<th class="bg-(--ink-2)/60 px-4 py-2.5 text-left text-[11px] font-medium tracking-[0.12em] text-(--paper)/55 uppercase">${inline(h)}</th>`,
    )
    .join("");
  const tr = bodyRows
    .map(
      (row) =>
        `<tr>${row
          .map(
            (c) =>
              `<td class="border-t border-black/[0.06] px-4 py-3 align-top text-sm/6 text-(--paper)/75">${inline(c)}</td>`,
          )
          .join("")}</tr>`,
    )
    .join("");

  return `<div class="bs-tray mt-6 overflow-x-auto"><div class="bs-card overflow-hidden"><table class="min-w-full border-collapse text-left text-sm"><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table></div></div>`;
}

/** Minimal markdown-to-HTML for legal body text. */
function renderMarkdown(lines: string[]): string {
  const html: string[] = [];
  let inList = false;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    if (trimmed === "") {
      if (inList) {
        html.push("</ul>");
        inList = false;
      }
      continue;
    }

    // Unordered list items
    if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      if (!inList) {
        html.push(
          '<ul class="mt-5 list-disc space-y-2 pl-5 marker:text-(--brand-glow)">',
        );
        inList = true;
      }
      html.push(`<li>${inline(trimmed.slice(2))}</li>`);
      continue;
    }

    if (inList) {
      html.push("</ul>");
      inList = false;
    }

    // Pipe tables — collect the whole block and render tray+card (§7.7)
    if (trimmed.startsWith("|")) {
      const tableLines: string[] = [];
      let j = i;
      while (j < lines.length && lines[j].trim().startsWith("|")) {
        tableLines.push(lines[j]);
        j++;
      }
      html.push(renderMarkdownTable(tableLines));
      i = j - 1;
      continue;
    }

    // Bold headers inside sections
    if (trimmed.startsWith("### ")) {
      html.push(
        `<p class="mt-5 font-medium text-(--paper)">${inline(trimmed.slice(4))}</p>`,
      );
      continue;
    }

    // Blockquotes
    if (trimmed.startsWith("> ")) {
      html.push(
        `<blockquote class="mt-5 border-l-2 border-(--brand)/30 pl-4 text-(--paper)/60">${inline(trimmed.slice(2))}</blockquote>`,
      );
      continue;
    }

    // Regular paragraph
    html.push(`<p class="mt-5">${inline(trimmed)}</p>`);
  }

  if (inList) {
    html.push("</ul>");
  }

  return html.join("\n");
}

/** Inline markdown: bold, links, code. */
function inline(text: string): string {
  let result = text;
  // Bold: **text**
  result = result.replace(
    /\*\*(.+?)\*\*/g,
    '<span class="font-medium text-(--paper)">$1</span>',
  );
  // Links: [text](url)
  result = result.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" class="font-medium text-(--brand) underline decoration-(--brand)/30 underline-offset-4">$1</a>',
  );
  // Inline code: `text`
  result = result.replace(
    /`([^`]+)`/g,
    '<code class="rounded-md bg-black/[0.05] px-1.5 py-0.5 text-[0.88em]">$1</code>',
  );
  return result;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
