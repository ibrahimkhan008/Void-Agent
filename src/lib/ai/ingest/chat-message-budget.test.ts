import { describe, expect, it, vi } from "vitest";
import {
  type IngestionPreviewPart,
  MAX_CHAT_ATTACHMENT_CONTEXT_CHARS,
  buildAggregateIngestionPreviews,
  buildMessagePartsWithIngestion,
} from "./chat-message-budget";

const preview = (text: string) => ({
  type: "text",
  text,
  ingestionPreview: true as const,
});

describe("aggregate chat attachment context budget", () => {
  it("caps mixed attachment text together and stops processing in input order", async () => {
    const processed: string[] = [];
    const attachments = ["csv", "pdf", "office"];
    const processAttachment = vi.fn(async (attachment: string) => {
      processed.push(attachment);
      return [preview(`${attachment}:${"x".repeat(60)}`)];
    });

    const result = await buildAggregateIngestionPreviews<
      string,
      IngestionPreviewPart
    >({
      attachments,
      processAttachment,
      maxTextChars: 180,
    });

    expect(processed).toEqual(["csv", "pdf"]);
    expect(result.omitted).toBe(true);
    expect(result.parts.map((part) => part.text)).toEqual([
      `csv:${"x".repeat(60)}`,
      "[Some attachment content was omitted because the combined message context limit was reached.]",
    ]);
    expect(result.textChars).toBeLessThanOrEqual(180);
  });

  it("returns stable output for the same attachments and enforces a cap across formats", async () => {
    const attachments = ["pdf", "xlsx", "audio"];
    const processAttachment = async (kind: string) => [preview(`${kind}:read`)];
    const run = () =>
      buildAggregateIngestionPreviews({
        attachments,
        processAttachment,
        maxTextChars: 180,
      });

    const first = await run();
    const second = await run();
    expect(first).toEqual(second);
    expect(first.textChars).toBeLessThanOrEqual(180);
    expect(first.parts.map((part) => part.text)).toEqual([
      "pdf:read",
      "xlsx:read",
      "audio:read",
    ]);
    expect(first.omitted).toBe(false);
  });

  it("caps generated PDF page parts while leaving original attached images alone", async () => {
    const result = await buildAggregateIngestionPreviews<
      string,
      IngestionPreviewPart
    >({
      attachments: ["pdf", "pdf"],
      maxTextChars: 180,
      maxPreviewFiles: 1,
      processAttachment: async (name) => [
        {
          type: "file",
          url: `private://${name}/page.png`,
          ingestionPreview: true,
        },
      ],
    });

    expect(result.parts).toHaveLength(2);
    expect(result.parts[0]?.type).toBe("file");
    expect(result.parts[1]?.text).toContain("omitted");
    expect(result.omitted).toBe(true);
  });

  it("separates model-only previews from persisted user transcript parts", () => {
    const originalParts = [
      { type: "text", text: "Summarize these files" },
      { type: "file", url: "private://owner/upload.pdf" },
    ];
    const persistedBefore = structuredClone(originalParts);
    const previews = [preview("untrusted extracted text")];

    const { persistedParts, modelParts } = buildMessagePartsWithIngestion(
      originalParts,
      previews,
    );

    expect(persistedParts).toEqual(persistedBefore);
    expect(originalParts).toEqual(persistedBefore);
    expect(modelParts).toContainEqual(previews[0]);
    modelParts.push({ type: "text", text: "later model-only change" });
    expect(persistedParts).toEqual(persistedBefore);
  });

  it("uses a single 40k default message budget", async () => {
    const result = await buildAggregateIngestionPreviews({
      attachments: ["one", "two"],
      processAttachment: async (value) => [preview(`${value}:ok`)],
    });
    expect(result.textChars).toBeLessThanOrEqual(
      MAX_CHAT_ATTACHMENT_CONTEXT_CHARS,
    );
  });

  it("limits expensive processing to the first ten attachments", async () => {
    const processed: number[] = [];
    const result = await buildAggregateIngestionPreviews({
      attachments: Array.from({ length: 12 }, (_, index) => index),
      processAttachment: async (index) => {
        processed.push(index);
        return [preview(`attachment-${index}`)];
      },
      maxTextChars: 1_000,
    });

    expect(processed).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(result.omitted).toBe(true);
    expect(result.parts.map((part) => part.text)).toContain(
      "[Some attachment content was omitted because the combined message context limit was reached.]",
    );
  });
});
