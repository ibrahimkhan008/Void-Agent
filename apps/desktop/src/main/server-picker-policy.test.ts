import { describe, expect, it } from "vitest";
import {
  isCompatibleServerHealthResponse,
  isSameOriginServerResponse,
  isTrustedServerPickerUrl,
  readBoundedServerCheckBody,
} from "./server-picker-policy.js";

describe("desktop server picker network policy", () => {
  it("accepts only a bounded JSON response from the expected origin", () => {
    expect(
      isCompatibleServerHealthResponse({
        status: 200,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify({ ok: true }),
      }),
    ).toBe(true);
    expect(
      isCompatibleServerHealthResponse({
        status: 302,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      }),
    ).toBe(false);
    expect(
      isCompatibleServerHealthResponse({
        status: 200,
        contentType: "text/html",
        body: JSON.stringify({ ok: true }),
      }),
    ).toBe(false);
    expect(
      isCompatibleServerHealthResponse({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: false }),
      }),
    ).toBe(false);
    expect(isSameOriginServerResponse("https://app.example", "not a url")).toBe(
      false,
    );
    expect(
      isSameOriginServerResponse(
        "https://app.example",
        "https://attacker.example/api/auth/ok",
      ),
    ).toBe(false);
    expect(
      isTrustedServerPickerUrl("data:text/html;charset=utf-8,%3Chtml%3E"),
    ).toBe(true);
    expect(isTrustedServerPickerUrl("https://app.example/")).toBe(false);
  });

  it("limits a streaming health response even without a content-length", async () => {
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(4_096));
          controller.enqueue(new Uint8Array(4_097));
          controller.close();
        },
      }),
    );
    await expect(readBoundedServerCheckBody(response)).resolves.toBeNull();
  });
});
