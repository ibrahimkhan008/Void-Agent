import "server-only";

import { randomUUID } from "node:crypto";
import { XMLBuilder, XMLParser } from "fast-xml-parser";
import JSZip from "jszip";
import { OoxmlPackage } from "lib/file-ingest/ooxml";

/*
 * MIT License
 *
 * Copyright (c) 2025 better-chatbot
 *
 * Adapted from better-chatbot's `lib/document/apply-tracked-edits.ts`.
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to
 * deal in the Software without restriction, including without limitation the
 * rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
 * sell copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions: The above copyright
 * notice and this permission notice shall be included in all copies or
 * substantial portions of the Software. THE SOFTWARE IS PROVIDED "AS IS",
 * WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED.
 */

/** Keep uploaded Office packages and generated revisions bounded. */
export const MAX_TRACKED_DOCX_INPUT_BYTES = 20 * 1024 * 1024;
export const MAX_TRACKED_DOCX_OUTPUT_BYTES = 24 * 1024 * 1024;
export const MAX_TRACKED_DOCX_EDITS = 50;
export const MAX_TRACKED_DOCX_TEXT = 4_000;

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const ATTR = ":@";
const TEXT = "#text";
type XmlNode = Record<string, unknown>;

export type TrackedDocxEditInput = {
  find: string;
  replace: string;
  context_before?: string;
  context_after?: string;
  reason?: string;
};

/** Proposal fields persisted by the project-document edit workflow. */
export type TrackedDocxProposal = {
  originalText: string;
  suggestedText: string;
  rationale: string;
};

export type TrackedDocxChange = {
  id: string;
  delId?: string;
  insId?: string;
  deletedText: string;
  insertedText: string;
  contextBefore: string;
  contextAfter: string;
  reason?: string;
};

export type TrackedDocxEditError = { index: number; reason: string };

export type TrackedDocxEditResult = {
  bytes: Buffer;
  changes: TrackedDocxChange[];
  errors: TrackedDocxEditError[];
};

export type TrackedDocxResolution = {
  bytes: Buffer;
  found: string[];
  missing: string[];
};

export class TrackedDocxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TrackedDocxError";
  }
}

function elementName(node: unknown): string | null {
  if (!node || typeof node !== "object") return null;
  for (const key of Object.keys(node as XmlNode)) {
    if (key !== ATTR && key !== TEXT) return key;
  }
  return null;
}

function children(node: unknown): XmlNode[] {
  const name = elementName(node);
  if (!name || !node || typeof node !== "object") return [];
  const value = (node as XmlNode)[name];
  return Array.isArray(value) ? (value as XmlNode[]) : [];
}

function setChildren(node: XmlNode, next: XmlNode[]): void {
  const name = elementName(node);
  if (name) node[name] = next;
}

function attributes(node: XmlNode): Record<string, unknown> {
  const value = node[ATTR];
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function makeElement(
  name: string,
  nested: XmlNode[],
  attrs?: Record<string, string>,
): XmlNode {
  const element: XmlNode = { [name]: nested };
  if (attrs) {
    element[ATTR] = Object.fromEntries(
      Object.entries(attrs).map(([key, value]) => [`@_${key}`, value]),
    );
  }
  return element;
}

function makeText(value: string): XmlNode {
  return { [TEXT]: value };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function textOf(node: XmlNode): string {
  return children(node)
    .filter((child) => TEXT in child)
    .map((child) => String(child[TEXT] ?? ""))
    .join("");
}

function getRunProperties(run: XmlNode): XmlNode | null {
  return children(run).find((child) => elementName(child) === "w:rPr") ?? null;
}

function buildRun(
  properties: XmlNode | null,
  value: string,
  textTag: "w:t" | "w:delText",
): XmlNode {
  const runChildren: XmlNode[] = [];
  if (properties) runChildren.push(clone(properties));
  if (value.length) {
    runChildren.push(
      makeElement(textTag, [makeText(value)], { "xml:space": "preserve" }),
    );
  }
  return makeElement("w:r", runChildren);
}

function parser(): XMLParser {
  return new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    preserveOrder: true,
    trimValues: false,
    parseAttributeValue: false,
    processEntities: true,
  });
}

function builder(): XMLBuilder {
  return new XMLBuilder({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    preserveOrder: true,
    suppressEmptyNode: false,
    processEntities: true,
  });
}

function documentBody(tree: XmlNode[]): XmlNode[] | null {
  for (const top of tree) {
    if (elementName(top) !== "w:document") continue;
    const body = children(top).find((child) => elementName(child) === "w:body");
    if (body) return children(body);
  }
  return null;
}

type RunSlot = {
  run: XmlNode;
  parent: XmlNode[];
  childIndex: number;
  paragraph: number;
  start: number;
  end: number;
  value: string;
  safeToRewrite: boolean;
};

type ParagraphInfo = { index: number; text: string; slots: RunSlot[] };

function inspectParagraphs(body: XmlNode[]): ParagraphInfo[] {
  const paragraphs: ParagraphInfo[] = [];
  const collect = (nodes: XmlNode[], paragraphIndex?: number) => {
    for (const node of nodes) {
      const name = elementName(node);
      if (!name) continue;
      if (name === "w:p") {
        const index = paragraphs.length;
        const paragraph: ParagraphInfo = { index, text: "", slots: [] };
        paragraphs.push(paragraph);
        collect(children(node), index);
      } else if (name === "w:r" && paragraphIndex !== undefined) {
        const nested = children(node);
        const textNodes = nested.filter(
          (child) => elementName(child) === "w:t",
        );
        const value = textNodes.map(textOf).join("");
        const paragraph = paragraphs[paragraphIndex];
        const start = paragraph.text.length;
        paragraph.text += value;
        const parentTextNodeArray = nodes;
        const childIndex = nodes.indexOf(node);
        if (value) {
          paragraph.slots.push({
            run: node,
            parent: parentTextNodeArray,
            childIndex,
            paragraph: paragraphIndex,
            start,
            end: start + value.length,
            value,
            safeToRewrite:
              textNodes.length === 1 &&
              nested.every((child) =>
                ["w:rPr", "w:t"].includes(elementName(child) ?? ""),
              ),
          });
        }
      } else if (
        paragraphIndex !== undefined &&
        ["w:hyperlink", "w:sdt", "w:sdtContent", "w:smartTag"].includes(name)
      ) {
        collect(children(node), paragraphIndex);
      } else if (
        paragraphIndex === undefined &&
        ["w:tbl", "w:tr", "w:tc", "w:sdt", "w:sdtContent"].includes(name)
      ) {
        collect(children(node));
      }
    }
  };
  collect(body);
  return paragraphs;
}

function nextTrackedId(tree: XmlNode[]): number {
  let max = 0;
  const walk = (node: XmlNode) => {
    const name = elementName(node);
    if (!name) return;
    if (name === "w:ins" || name === "w:del") {
      const raw = attributes(node)["@_w:id"];
      const id = Number.parseInt(String(raw ?? ""), 10);
      if (Number.isFinite(id)) max = Math.max(max, id);
    }
    for (const child of children(node)) walk(child);
  };
  for (const node of tree) walk(node);
  return max + 1;
}

function normalizeWithOffsets(value: string): {
  text: string;
  offsets: number[];
} {
  const input = value
    .replace(/[\u2018\u2019\u2032]/g, "'")
    .replace(/[\u201c\u201d\u2033]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u00a0/g, " ")
    .replace(/\u200b/g, " ");
  const chars: string[] = [];
  const offsets: number[] = [];
  let previousSpace = false;
  for (let index = 0; index < input.length; index++) {
    const character = input[index];
    if (/\s/.test(character)) {
      if (!previousSpace) {
        chars.push(" ");
        offsets.push(index);
      }
      previousSpace = true;
    } else {
      chars.push(character);
      offsets.push(index);
      previousSpace = false;
    }
  }
  return { text: chars.join(""), offsets };
}

function collapseDiff(find: string, replace: string) {
  let prefix = 0;
  const min = Math.min(find.length, replace.length);
  while (prefix < min && find[prefix] === replace[prefix]) prefix++;
  let suffix = 0;
  while (
    suffix < min - prefix &&
    find[find.length - 1 - suffix] === replace[replace.length - 1 - suffix]
  ) {
    suffix++;
  }
  return {
    prefix,
    deleted: find.slice(prefix, find.length - suffix),
    inserted: replace.slice(prefix, replace.length - suffix),
    suffix,
  };
}

function findMatches(
  text: string,
  find: string,
  before: string,
  after: string,
): number[] {
  const matches: number[] = [];
  let offset = 0;
  while (offset <= text.length - find.length) {
    const index = text.indexOf(find, offset);
    if (index < 0) break;
    const beforeMatches =
      !before || text.slice(index - before.length, index) === before;
    const afterIndex = index + find.length;
    const afterMatches =
      !after || text.slice(afterIndex, afterIndex + after.length) === after;
    if (beforeMatches && afterMatches) matches.push(index);
    offset = index + Math.max(1, find.length);
  }
  return matches;
}

function hasTrackedChanges(tree: XmlNode[]): boolean {
  let found = false;
  const walk = (node: XmlNode) => {
    const name = elementName(node);
    if (!name || found) return;
    if (name === "w:ins" || name === "w:del") {
      found = true;
      return;
    }
    for (const child of children(node)) walk(child);
  };
  tree.forEach(walk);
  return found;
}

function ensureDeclaration(xml: string): string {
  return xml.startsWith("<?xml")
    ? xml
    : `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n${xml}`;
}

function findDocumentPart(zip: JSZip) {
  return zip.file("word/document.xml") ?? zip.file("word\\document.xml");
}

async function loadDocx(bytes: Buffer): Promise<{
  zip: JSZip;
  tree: XmlNode[];
}> {
  if (bytes.byteLength > MAX_TRACKED_DOCX_INPUT_BYTES) {
    throw new TrackedDocxError("DOCX exceeds the 20 MiB input limit.");
  }
  try {
    const safetyCheck = await OoxmlPackage.open(bytes);
    await safetyCheck.verifyAllEntries();
    const guardedPackage = await OoxmlPackage.open(bytes);
    const documentXml = await guardedPackage.read("word/document.xml");
    if (!documentXml) throw new TrackedDocxError("DOCX has no document.xml.");

    const zip = await JSZip.loadAsync(bytes);
    const documentPart = findDocumentPart(zip);
    if (!documentPart) throw new TrackedDocxError("DOCX has no document.xml.");
    const tree = parser().parse(documentXml) as XmlNode[];
    if (!documentBody(tree)) throw new TrackedDocxError("DOCX has no body.");
    return { zip, tree };
  } catch (error) {
    if (error instanceof TrackedDocxError) throw error;
    throw new TrackedDocxError(
      error instanceof Error ? error.message : "Invalid DOCX package.",
    );
  }
}

async function saveDocx(zip: JSZip, tree: XmlNode[]): Promise<Buffer> {
  const documentPart = findDocumentPart(zip);
  if (!documentPart) throw new TrackedDocxError("DOCX has no document.xml.");
  const documentPath = zip.file("word/document.xml")
    ? "word/document.xml"
    : "word\\document.xml";
  zip.file(documentPath, ensureDeclaration(builder().build(tree)));
  const output = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
  });
  if (output.byteLength > MAX_TRACKED_DOCX_OUTPUT_BYTES) {
    throw new TrackedDocxError(
      "Generated DOCX exceeds the 24 MiB output limit.",
    );
  }
  const validation = await OoxmlPackage.open(output);
  await validation.verifyAllEntries();
  const outputPackage = await OoxmlPackage.open(output);
  const xml = await outputPackage.read("word/document.xml");
  if (!xml || !documentBody(parser().parse(xml) as XmlNode[])) {
    throw new TrackedDocxError("Generated DOCX could not be reopened.");
  }
  return output;
}

/**
 * Add genuine WordprocessingML revisions. Anchors must be unique in the body;
 * a change must fit inside one simple text run so its original run formatting
 * can be copied without flattening fields, drawings, or other run content.
 */
export async function applyProjectTrackedDocxEdits(
  sourceBytes: Buffer,
  edits: TrackedDocxEditInput[],
  options?: { author?: string; now?: Date },
): Promise<TrackedDocxEditResult> {
  if (
    !Array.isArray(edits) ||
    edits.length < 1 ||
    edits.length > MAX_TRACKED_DOCX_EDITS
  ) {
    throw new TrackedDocxError(
      `Provide between 1 and ${MAX_TRACKED_DOCX_EDITS} edits.`,
    );
  }
  for (const edit of edits) {
    if (
      typeof edit.find !== "string" ||
      typeof edit.replace !== "string" ||
      edit.find.length > MAX_TRACKED_DOCX_TEXT ||
      edit.replace.length > MAX_TRACKED_DOCX_TEXT ||
      (edit.context_before?.length ?? 0) > MAX_TRACKED_DOCX_TEXT ||
      (edit.context_after?.length ?? 0) > MAX_TRACKED_DOCX_TEXT ||
      (edit.reason?.length ?? 0) > 500
    ) {
      throw new TrackedDocxError("An edit field exceeds its allowed length.");
    }
  }

  const { zip, tree } = await loadDocx(sourceBytes);
  if (hasTrackedChanges(tree)) {
    throw new TrackedDocxError(
      "Resolve existing tracked changes before applying another edit batch.",
    );
  }
  const body = documentBody(tree)!;
  const paragraphs = inspectParagraphs(body);
  let nextId = nextTrackedId(tree);
  const changes: TrackedDocxChange[] = [];
  const errors: TrackedDocxEditError[] = [];
  const editsBySlot = new Map<
    RunSlot,
    Array<{
      start: number;
      end: number;
      deleted: string;
      inserted: string;
      id: string;
      delId?: string;
      insId?: string;
      reason?: string;
      contextBefore: string;
      contextAfter: string;
    }>
  >();

  for (let index = 0; index < edits.length; index++) {
    const edit = edits[index];
    if (
      (!edit.find && !edit.replace) ||
      (!edit.find && !edit.context_before && !edit.context_after)
    ) {
      errors.push({
        index,
        reason: "An empty edit or unanchored insertion is not allowed.",
      });
      continue;
    }
    const normalizedFind = normalizeWithOffsets(edit.find).text;
    const normalizedBefore = normalizeWithOffsets(
      edit.context_before ?? "",
    ).text;
    const normalizedAfter = normalizeWithOffsets(edit.context_after ?? "").text;
    const candidates: Array<{
      paragraph: ParagraphInfo;
      start: number;
      end: number;
    }> = [];
    for (const paragraph of paragraphs) {
      const normalizedParagraph = normalizeWithOffsets(paragraph.text);
      for (const normalizedStart of findMatches(
        normalizedParagraph.text,
        normalizedFind,
        normalizedBefore,
        normalizedAfter,
      )) {
        const start =
          normalizedStart < normalizedParagraph.offsets.length
            ? normalizedParagraph.offsets[normalizedStart]
            : paragraph.text.length;
        const normalizedEnd = normalizedStart + normalizedFind.length;
        const end =
          normalizedEnd > normalizedStart
            ? normalizedParagraph.offsets[normalizedEnd - 1] + 1
            : start;
        candidates.push({ paragraph, start, end });
      }
    }
    if (candidates.length !== 1) {
      errors.push({
        index,
        reason: candidates.length
          ? "The edit anchor is ambiguous; add exact surrounding context."
          : "The edit anchor was not found.",
      });
      continue;
    }

    const { paragraph, start, end } = candidates[0];
    let slot: RunSlot | undefined;
    if (edit.find) {
      slot = paragraph.slots.find(
        (candidate) => start >= candidate.start && end <= candidate.end,
      );
    } else {
      slot = paragraph.slots.find(
        (candidate) => start >= candidate.start && start <= candidate.end,
      );
    }
    if (!slot || !slot.safeToRewrite) {
      errors.push({
        index,
        reason:
          "The anchor crosses Word runs or contains non-text formatting; narrow the edit to one plain text run.",
      });
      continue;
    }
    const rawStart = start - slot.start;
    const rawEnd = end - slot.start;
    const original = slot.value.slice(rawStart, rawEnd);
    const diff = collapseDiff(original, edit.replace);
    if (!diff.deleted && !diff.inserted) {
      errors.push({
        index,
        reason: "The replacement is identical to the selected text.",
      });
      continue;
    }
    const change: TrackedDocxChange = {
      id: randomUUID(),
      delId: diff.deleted ? String(nextId++) : undefined,
      insId: diff.inserted ? String(nextId++) : undefined,
      deletedText: diff.deleted,
      insertedText: diff.inserted,
      contextBefore: edit.context_before ?? "",
      contextAfter: edit.context_after ?? "",
      reason: edit.reason,
    };
    const plans = editsBySlot.get(slot) ?? [];
    const planStart = rawStart + diff.prefix;
    const planEnd = rawEnd - diff.suffix;
    if (
      plans.some((plan) => !(planEnd <= plan.start || planStart >= plan.end))
    ) {
      errors.push({
        index,
        reason: "The edit overlaps another edit in this batch.",
      });
      continue;
    }
    plans.push({
      start: planStart,
      end: planEnd,
      deleted: diff.deleted,
      inserted: diff.inserted,
      id: change.id,
      delId: change.delId,
      insId: change.insId,
      reason: change.reason,
      contextBefore: change.contextBefore,
      contextAfter: change.contextAfter,
    });
    editsBySlot.set(slot, plans);
    changes.push(change);
  }

  const now = (options?.now ?? new Date()).toISOString();
  const author =
    (options?.author ?? "AI Assistant").trim().slice(0, 120) || "AI Assistant";
  for (const [slot, plans] of editsBySlot) {
    plans.sort((a, b) => a.start - b.start);
    const properties = getRunProperties(slot.run);
    const replacementRuns: XmlNode[] = [];
    let cursor = 0;
    for (const plan of plans) {
      if (plan.start > cursor) {
        replacementRuns.push(
          buildRun(properties, slot.value.slice(cursor, plan.start), "w:t"),
        );
      }
      if (plan.inserted) {
        replacementRuns.push(
          makeElement("w:ins", [buildRun(properties, plan.inserted, "w:t")], {
            "w:id": plan.insId!,
            "w:author": author,
            "w:date": now,
          }),
        );
      }
      if (plan.deleted) {
        replacementRuns.push(
          makeElement(
            "w:del",
            [buildRun(properties, plan.deleted, "w:delText")],
            {
              "w:id": plan.delId!,
              "w:author": author,
              "w:date": now,
            },
          ),
        );
      }
      cursor = plan.end;
    }
    if (cursor < slot.value.length) {
      replacementRuns.push(
        buildRun(properties, slot.value.slice(cursor), "w:t"),
      );
    }
    slot.parent.splice(slot.childIndex, 1, ...replacementRuns);
  }

  return {
    bytes: changes.length ? await saveDocx(zip, tree) : sourceBytes,
    changes,
    errors,
  };
}

/**
 * Apply proposals from the project edit workflow. The exact original text is
 * required to occur once, so persistence need not retain generated OOXML IDs.
 */
export async function applyTrackedEdits(
  sourceBytes: Buffer,
  proposals: TrackedDocxProposal[],
  options?: { author?: string; now?: Date },
): Promise<TrackedDocxEditResult> {
  if (
    !Array.isArray(proposals) ||
    proposals.some(
      (proposal) =>
        !proposal ||
        typeof proposal.originalText !== "string" ||
        typeof proposal.suggestedText !== "string" ||
        typeof proposal.rationale !== "string",
    )
  ) {
    throw new TrackedDocxError("Invalid tracked edit proposals.");
  }
  return applyProjectTrackedDocxEdits(
    sourceBytes,
    proposals.map((proposal) => ({
      find: proposal.originalText,
      replace: proposal.suggestedText,
      reason: proposal.rationale,
    })),
    options,
  );
}

function unwrapDeletedText(node: XmlNode): XmlNode {
  if (elementName(node) === "w:delText") {
    return {
      "w:t": children(node),
      ...(node[ATTR] ? { [ATTR]: clone(node[ATTR]) } : {}),
    };
  }
  const nested = children(node);
  if (nested.length) setChildren(node, nested.map(unwrapDeletedText));
  return node;
}

function collectRevisionIds(tree: XmlNode[]): Set<string> {
  const ids = new Set<string>();
  const walk = (node: XmlNode) => {
    const name = elementName(node);
    if (!name) return;
    if (name === "w:ins" || name === "w:del") {
      const raw = attributes(node)["@_w:id"];
      if (raw !== undefined) ids.add(String(raw));
    }
    children(node).forEach(walk);
  };
  tree.forEach(walk);
  return ids;
}

function resolveTree(
  tree: XmlNode[],
  ids: Set<string>,
  mode: "accept" | "reject",
): void {
  const rewrite = (nodes: XmlNode[]): XmlNode[] => {
    const output: XmlNode[] = [];
    for (const node of nodes) {
      const name = elementName(node);
      if (!name) {
        output.push(node);
        continue;
      }
      const nested = children(node);
      if (nested.length) setChildren(node, rewrite(nested));
      if (name === "w:ins" || name === "w:del") {
        const id = String(attributes(node)["@_w:id"] ?? "");
        if (ids.has(id)) {
          const keep =
            (name === "w:ins" && mode === "accept") ||
            (name === "w:del" && mode === "reject");
          if (keep) {
            const inner =
              name === "w:del"
                ? children(node).map(unwrapDeletedText)
                : children(node);
            output.push(...inner);
          }
          continue;
        }
      }
      output.push(node);
    }
    return output;
  };
  for (const top of tree) {
    if (elementName(top) === "w:document")
      setChildren(top, rewrite(children(top)));
  }
}

/** Accept or reject selected change UUIDs, preserving unselected revisions. */
export async function resolveProjectTrackedDocxChanges(
  sourceBytes: Buffer,
  changes: Array<Pick<TrackedDocxChange, "id" | "delId" | "insId">>,
  mode: "accept" | "reject",
): Promise<TrackedDocxResolution> {
  if (
    !Array.isArray(changes) ||
    changes.length < 1 ||
    changes.length > MAX_TRACKED_DOCX_EDITS
  ) {
    throw new TrackedDocxError(
      `Select between 1 and ${MAX_TRACKED_DOCX_EDITS} changes.`,
    );
  }
  if (changes.some((change) => !/^[0-9a-f-]{36}$/i.test(change.id))) {
    throw new TrackedDocxError("A tracked-change identifier is invalid.");
  }
  const { zip, tree } = await loadDocx(sourceBytes);
  const present = collectRevisionIds(tree);
  const ids = new Set<string>();
  const changeIdToWIds = new Map<string, string[]>();
  for (const change of changes) {
    const requested = [change.delId, change.insId].filter(
      (value): value is string =>
        typeof value === "string" && /^\d{1,10}$/.test(value),
    );
    const matched = requested.filter((id) => present.has(id));
    if (matched.length) {
      changeIdToWIds.set(change.id, matched);
      matched.forEach((id) => ids.add(id));
    }
  }
  const found = [...changeIdToWIds.keys()];
  const missing = changes
    .map((change) => change.id)
    .filter((id) => !changeIdToWIds.has(id));
  if (ids.size) resolveTree(tree, ids, mode);
  const output = ids.size ? await saveDocx(zip, tree) : sourceBytes;
  return { bytes: output, found, missing };
}

/** Resolve every tracked revision in a candidate generated by applyTrackedEdits. */
export async function resolveAllTrackedChanges(
  candidateBytes: Buffer,
  mode: "accept" | "reject",
): Promise<{ bytes: Buffer; found: number }> {
  const { zip, tree } = await loadDocx(candidateBytes);
  const ids = collectRevisionIds(tree);
  if (!ids.size) return { bytes: candidateBytes, found: 0 };
  resolveTree(tree, ids, mode);
  return { bytes: await saveDocx(zip, tree), found: ids.size };
}

/** Verify a source is a bounded, valid DOCX before exposing it to editing. */
export async function validateProjectTrackedDocx(bytes: Buffer): Promise<void> {
  const { tree } = await loadDocx(bytes);
  if (!documentBody(tree)) throw new TrackedDocxError("DOCX has no body.");
}

export const TRACKED_DOCX_CONTENT_TYPE = DOCX_MIME;
