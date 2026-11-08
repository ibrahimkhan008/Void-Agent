import { describe, expect, it } from "vitest";
import {
  filterUserOwnedChatAttachments,
  sanitizeChatMessageParts,
} from "./chat-attachment-ownership";

describe("chat attachment ownership", () => {
  it("keeps only owner-scoped managed files and safe direct image data", () => {
    const attachments = filterUserOwnedChatAttachments(
      [
        {
          type: "file",
          url: "/api/files/uploads/user-1/notes.pdf",
          filename: "notes.pdf",
        },
        {
          type: "file",
          url: "/api/files/uploads/user-2/private.pdf",
          filename: "private.pdf",
        },
        {
          type: "source-url",
          url: "https://example.test/reference",
        },
        {
          type: "file",
          url: "data:image/png;base64,aGVsbG8=",
        },
        {
          type: "file",
          url: "https://untrusted.test/foreign.pdf",
        },
      ],
      "user-1",
    );

    expect(attachments).toEqual([
      {
        type: "file",
        url: "/api/files/uploads/user-1/notes.pdf",
        filename: "notes.pdf",
      },
      {
        type: "source-url",
        url: "https://example.test/reference",
      },
      {
        type: "file",
        url: "data:image/png;base64,aGVsbG8=",
      },
    ]);
  });

  it("replaces foreign managed file parts before privileged ingestion", () => {
    const parts = sanitizeChatMessageParts(
      [
        { type: "file", url: "/api/files/uploads/user-2/secret.pdf" },
        { type: "file", url: "/api/files/uploads/user-1/notes.pdf" },
        { type: "source-url", url: "https://example.test/reference" },
      ],
      "user-1",
    );

    expect(parts).toEqual([
      {
        type: "text",
        text: "[Attached file was not processed because its storage owner could not be verified.]",
      },
      { type: "file", url: "/api/files/uploads/user-1/notes.pdf" },
      { type: "source-url", url: "https://example.test/reference" },
    ]);
  });
});
