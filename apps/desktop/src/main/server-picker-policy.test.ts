import { describe, expect, it } from "vitest";
import {
  isCompatibleServerHealthResponse,
  isTrustedServerPickerCall,
} from "./server-picker-policy.js";

describe("Void-Agent desktop server health identity", () => {
  it("accepts the exact healthy Void-Agent health contract", () => {
    expect(
      isCompatibleServerHealthResponse({
        status: 200,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify({ service: "flare-ai", status: "ok" }),
      }),
    ).toBe(true);
  });

  it("accepts recognized degraded health when an optional dependency is down", () => {
    expect(
      isCompatibleServerHealthResponse({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ service: "flare-ai", status: "degraded" }),
      }),
    ).toBe(true);
  });

  it("rejects unrelated services, unknown states, redirects, and oversized bodies", () => {
    const contentType = "application/json";
    expect(
      isCompatibleServerHealthResponse({
        status: 200,
        contentType,
        body: JSON.stringify({ service: "other", status: "ok" }),
      }),
    ).toBe(false);
    expect(
      isCompatibleServerHealthResponse({
        status: 503,
        contentType,
        body: JSON.stringify({ service: "flare-ai", status: "error" }),
      }),
    ).toBe(false);
    expect(
      isCompatibleServerHealthResponse({
        status: 302,
        contentType,
        body: JSON.stringify({ service: "flare-ai", status: "ok" }),
      }),
    ).toBe(false);
    expect(
      isCompatibleServerHealthResponse({
        status: 200,
        contentType,
        body: "x".repeat(8_193),
      }),
    ).toBe(false);
  });
});

describe("desktop server-picker IPC trust boundary", () => {
  const trusted = {
    hasPicker: true,
    pickerDestroyed: false,
    senderMatches: true,
    mainFrameMatches: true,
    frameUrl: "data:text/html;charset=utf-8,%3Chtml%3E",
  };

  it("accepts only the live dedicated picker main frame", () => {
    expect(isTrustedServerPickerCall(trusted)).toBe(true);
    expect(
      isTrustedServerPickerCall({ ...trusted, senderMatches: false }),
    ).toBe(false);
    expect(
      isTrustedServerPickerCall({ ...trusted, mainFrameMatches: false }),
    ).toBe(false);
    expect(
      isTrustedServerPickerCall({ ...trusted, pickerDestroyed: true }),
    ).toBe(false);
    expect(
      isTrustedServerPickerCall({
        ...trusted,
        frameUrl: "https://void-agent.example/",
      }),
    ).toBe(false);
  });
});
