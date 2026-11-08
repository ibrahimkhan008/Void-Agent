import { describe, expect, it } from "vitest";
import { vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  formatProjectChatTranscript,
  isCurrentProjectChatBrainRun,
} from "./project-chat-brain-source";

describe("project chat brain sources", () => {
  it("keeps visible user and completed assistant text, not tools or attachments", () => {
    expect(
      formatProjectChatTranscript([
        {
          role: "user",
          parts: [
            { type: "text", text: "  What is next?  " },
            { type: "file", url: "private://file", filename: "secret.pdf" },
          ],
        },
        {
          role: "tool",
          parts: [{ type: "text", text: "tool output" }],
        },
        {
          role: "assistant",
          metadata: { runStatus: "incomplete" },
          parts: [{ type: "text", text: "partial response" }],
        },
        {
          role: "assistant",
          metadata: { runStatus: "completed" },
          parts: [{ type: "text", text: "Ship the tested build." }],
        },
      ]),
    ).toBe("User: What is next?\n\nAssistant: Ship the tested build.");
  });

  it("rejects stale, detached, revoked, or cross-owner worker sources", () => {
    const input = {
      run: {
        projectId: "project-a",
        requestedByUserId: "user-a",
        chatSourceId: "source-a",
        sourceFingerprint: "sha256-current",
      },
      source: {
        id: "source-a",
        projectId: "project-a",
        ownerUserId: "user-a",
        activeFingerprint: "sha256-current",
        revokedAt: null,
      },
      thread: { projectId: "project-a", userId: "user-a" },
    };
    expect(isCurrentProjectChatBrainRun(input)).toBe(true);
    expect(
      isCurrentProjectChatBrainRun({
        ...input,
        source: { ...input.source, activeFingerprint: "sha256-old" },
      }),
    ).toBe(false);
    expect(
      isCurrentProjectChatBrainRun({
        ...input,
        source: { ...input.source, revokedAt: new Date() },
      }),
    ).toBe(false);
    expect(
      isCurrentProjectChatBrainRun({
        ...input,
        thread: { projectId: "project-b", userId: "user-a" },
      }),
    ).toBe(false);
    expect(
      isCurrentProjectChatBrainRun({
        ...input,
        source: { ...input.source, ownerUserId: "user-b" },
      }),
    ).toBe(false);
  });
});
