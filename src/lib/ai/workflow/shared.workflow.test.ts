import { describe, expect, it } from "vitest";
import { convertTiptapJsonToText } from "./shared.workflow";

const getOutput = () => "";

describe("convertTiptapJsonToText", () => {
  it("preserves plain text, mentions, and hard breaks", () => {
    const result = convertTiptapJsonToText({
      json: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", text: "Read " },
              {
                type: "mention",
                attrs: {
                  id: "node-1",
                  label: JSON.stringify({ nodeId: "node-1", path: ["result"] }),
                },
              },
              { type: "hardBreak" },
              { type: "text", text: "carefully." },
            ],
          },
        ],
      },
      getOutput,
      mentionParser: () => "the result",
    });

    expect(result).toBe("Read the result\n\ncarefully.");
  });

  it("recursively renders nested bullet lists and following paragraphs", () => {
    const json = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Checklist" }] },
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "First" }],
                },
                {
                  type: "bulletList",
                  content: [
                    {
                      type: "listItem",
                      content: [
                        {
                          type: "paragraph",
                          content: [{ type: "text", text: "Nested" }],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Second" }],
                },
              ],
            },
          ],
        },
        { type: "paragraph", content: [{ type: "text", text: "Finish" }] },
      ],
    } as never;

    expect(convertTiptapJsonToText({ json, getOutput })).toBe(
      "Checklist\n• First\n• Nested\n• Second\nFinish",
    );
  });
});
