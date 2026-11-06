import { describe, expect, it } from "vitest";
import {
  VOICE_THREAD_MAX_PART_CHARS,
  type VoiceSessionMessage,
  capVoiceTurnParts,
  deriveVoiceThreadTitle,
  readVoiceJsonBody,
  selectVoiceTurnsToPersist,
} from "./session-thread-contract";

const message = (overrides: Partial<VoiceSessionMessage> & { id: string }): VoiceSessionMessage => ({
  role: "user",
  parts: [{ type: "text", text: "hello" }],
  completed: true,
  ...overrides,
});

describe("voice session persistence contract", () => {
  it("persists completed conversation turns only after the user speaks", () => {
    const greeting = message({ id: "hello", role: "assistant" });
    expect(selectVoiceTurnsToPersist([greeting], new Map()).turns).toEqual([]);
    expect(selectVoiceTurnsToPersist([greeting, message({ id: "user" })], new Map()).turns.map((turn) => turn.id)).toEqual(["hello", "user"]);
  });

  it("retries changed turns by signature and ignores already saved turns", () => {
    const prior = JSON.stringify([{ type: "text", text: "old" }]);
    expect(selectVoiceTurnsToPersist([message({ id: "a" })], new Map([["a", prior]])).turns).toHaveLength(1);
    const same = JSON.stringify([{ type: "text", text: "hello" }]);
    expect(selectVoiceTurnsToPersist([message({ id: "a" })], new Map([["a", same]])).turns).toHaveLength(0);
  });

  it("caps persisted tool output and derives titles from user speech", () => {
    const parts = capVoiceTurnParts([
      { type: "text", text: "spoken" },
      { type: "tool-search", output: { huge: "x".repeat(VOICE_THREAD_MAX_PART_CHARS) } },
    ]) as Array<{ type: string; text?: string; output?: { truncated?: boolean } }>;
    expect(parts[0].text).toBe("spoken");
    expect(parts[1].output?.truncated).toBe(true);
    expect(JSON.stringify(parts).length).toBeLessThan(VOICE_THREAD_MAX_PART_CHARS);
    const adversarial = capVoiceTurnParts([{ type: "text", text: "\u0001😀\"".repeat(20_000) }]);
    expect(JSON.stringify(adversarial).length).toBeLessThanOrEqual(VOICE_THREAD_MAX_PART_CHARS);
    expect(deriveVoiceThreadTitle([{ id: "u", role: "user", parts: [{ type: "text", text: "Find my schedule" }] }])).toBe("Find my schedule");
  });

  it("bounds and validates raw request JSON", async () => {
    expect(await readVoiceJsonBody(new Request("https://local.test", { method: "POST", body: "{}" }))).toEqual({ ok: true, value: {} });
    expect(await readVoiceJsonBody(new Request("https://local.test", { method: "POST", body: "x".repeat(20) }), 10)).toEqual({ ok: false, reason: "too-large" });
    expect(await readVoiceJsonBody(new Request("https://local.test", { method: "POST", body: "{" }))).toEqual({ ok: false, reason: "invalid-json" });
  });
});
