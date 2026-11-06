import { describe, expect, it } from "vitest";
import {
  hashHttpRequestApproval,
  httpRequestApprovalSchema,
} from "./http-request-approval";

const valid = {
  url: "https://api.example.com/v1/items",
  method: "POST",
  headers: {
    authorization: "Bearer example",
    "content-type": "application/json",
  },
  body: '{"name":"reviewed"}',
  timeout: 10_000,
};

describe("HTTP request approval schema", () => {
  it("accepts bounded, reviewable outbound requests", () => {
    expect(httpRequestApprovalSchema.safeParse(valid).success).toBe(true);
  });
  it("rejects oversized bodies, unsafe headers, and invalid timeouts", () => {
    expect(
      httpRequestApprovalSchema.safeParse({
        ...valid,
        body: "x".repeat(16_001),
      }).success,
    ).toBe(false);
    expect(
      httpRequestApprovalSchema.safeParse({
        ...valid,
        headers: { host: "127.0.0.1" },
      }).success,
    ).toBe(false);
    expect(
      httpRequestApprovalSchema.safeParse({ ...valid, timeout: 60_000 })
        .success,
    ).toBe(false);
  });
  it("binds approval to every request field independent of object key order", () => {
    const first = httpRequestApprovalSchema.parse(valid);
    const reordered = httpRequestApprovalSchema.parse({
      ...valid,
      headers: {
        "content-type": "application/json",
        authorization: "Bearer example",
      },
    });
    expect(hashHttpRequestApproval(first)).toBe(
      hashHttpRequestApproval(reordered),
    );
    expect(hashHttpRequestApproval(first)).not.toBe(
      hashHttpRequestApproval({ ...first, body: "changed" }),
    );
    expect(hashHttpRequestApproval(first)).not.toBe(
      hashHttpRequestApproval({ ...first, url: "https://other.example.com" }),
    );
  });
});
