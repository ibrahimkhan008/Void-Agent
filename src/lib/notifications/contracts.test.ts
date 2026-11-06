import { describe, expect, it } from "vitest";
import {
  notificationReadSchema,
  pushSubscriptionSchema,
  readBoundedJson,
  safeNotificationHref,
} from "./contracts";

describe("notification contracts", () => {
  it("bounds subscription keys and requires a strict endpoint object", () => {
    expect(
      pushSubscriptionSchema.safeParse({
        endpoint: "https://push.example/sub",
        keys: { p256dh: "p".repeat(16), auth: "a".repeat(8) },
      }).success,
    ).toBe(true);
    expect(
      pushSubscriptionSchema.safeParse({
        endpoint: "http://127.0.0.1",
        keys: { p256dh: "p".repeat(16), auth: "a".repeat(8) },
      }).success,
    ).toBe(false);
    expect(
      pushSubscriptionSchema.safeParse({
        endpoint: "https://push.example",
        keys: { p256dh: "short", auth: "short" },
        extra: 1,
      }).success,
    ).toBe(false);
  });
  it("bounds read batches", () => {
    expect(notificationReadSchema.safeParse({ ids: [] }).success).toBe(false);
    expect(
      notificationReadSchema.safeParse({
        ids: Array.from({ length: 101 }, () => crypto.randomUUID()),
      }).success,
    ).toBe(false);
  });
  it("accepts only local absolute navigation paths", () => {
    expect(safeNotificationHref("/projects")).toBe("/projects");
    expect(safeNotificationHref("/chat/thread%20one?tab=history")).toBe(
      "/chat/thread%20one?tab=history",
    );
    expect(safeNotificationHref("//evil.example")).toBeNull();
    expect(safeNotificationHref("/\\\\evil.example")).toBeNull();
    expect(safeNotificationHref("/%5c%5cevil.example")).toBeNull();
    expect(safeNotificationHref("/%255c%255cevil.example")).toBeNull();
    expect(safeNotificationHref("/line\nbreak")).toBeNull();
    expect(safeNotificationHref("https://evil.example")).toBeNull();

    const origin = "https://void-agent.invalid";
    const maliciousPath = "/\\\\evil.example";
    expect(new URL(maliciousPath, origin).origin).not.toBe(origin);
  });
  it("enforces actual streamed body size even without content-length", async () => {
    const tooLarge = await readBoundedJson(
      new Request("https://app.example", {
        method: "POST",
        body: JSON.stringify({ x: "x".repeat(128) }),
      }),
      32,
    );
    const valid = await readBoundedJson(
      new Request("https://app.example", {
        method: "POST",
        body: JSON.stringify({ x: 1 }),
      }),
      32,
    );
    expect(tooLarge).toEqual({ ok: false, tooLarge: true });
    expect(valid).toEqual({ ok: true, value: { x: 1 } });
  });
});
