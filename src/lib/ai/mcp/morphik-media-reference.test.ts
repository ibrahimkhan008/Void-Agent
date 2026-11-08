import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  protectMorphikMcpResult,
  resolveMorphikImageReference,
} from "./morphik-media-reference";

const url =
  "https://s3.amazonaws.com/bucket/image.png?X-Amz-Signature=private-signature";

function setup() {
  const references = new Map<string, string>();
  let tokenId = 0;
  const seal = (value: string) => {
    tokenId += 1;
    const reference = `opaque-${tokenId}`;
    references.set(reference, value);
    return reference;
  };
  const unseal = (reference: string) => {
    const value = references.get(reference);
    if (!value) throw new Error("unknown token");
    return value;
  };
  return { references, seal, unseal };
}

describe("Morphik image references", () => {
  it("removes bearer URLs before returning an MCP result to model and transcript", () => {
    const deps = setup();
    const result = protectMorphikMcpResult(
      {
        content: [
          {
            type: "text",
            text: `[IMAGE_URL]${url}[/IMAGE_URL][DOC_URL]${url}[/DOC_URL][PREVIEW]base64[/PREVIEW]`,
          },
        ],
      },
      "user-1",
      { now: 1_000, seal: deps.seal },
    ) as { content: Array<{ text: string }> };

    expect(result.content[0]?.text).toMatch(
      /\[IMAGE_REF\]opaque-1\[\/IMAGE_REF\]/,
    );
    expect(result.content[0]?.text).not.toContain("X-Amz-Signature");
    expect(result.content[0]?.text).not.toContain("private-signature");
    expect(result.content[0]?.text).not.toContain("base64");
    expect(
      resolveMorphikImageReference("opaque-1", "user-1", {
        now: 1_001,
        unseal: deps.unseal,
      }),
    ).toBe(url);
  });

  it("binds references to a user and expiry and rejects invalid S3 destinations", () => {
    const deps = setup();
    const protectedResult = protectMorphikMcpResult(
      { content: [{ type: "text", text: `[IMAGE_URL]${url}[/IMAGE_URL]` }] },
      "owner-1",
      { now: 1_000, seal: deps.seal },
    ) as { content: Array<{ text: string }> };
    const ref = protectedResult.content[0]?.text.match(
      /\[IMAGE_REF\](.*?)\[\/IMAGE_REF\]/,
    )?.[1];

    expect(
      resolveMorphikImageReference(ref, "owner-2", {
        now: 1_001,
        unseal: deps.unseal,
      }),
    ).toBeNull();
    expect(
      resolveMorphikImageReference(ref, "owner-1", {
        now: 1_000 + 5 * 60_000,
        unseal: deps.unseal,
      }),
    ).toBeNull();

    const invalid = setup();
    const invalidSeal = vi.fn(invalid.seal);
    const invalidResult = protectMorphikMcpResult(
      {
        content: [
          {
            type: "text",
            text: "[IMAGE_URL]https://evil.example/image.png[/IMAGE_URL]",
          },
        ],
      },
      "owner-1",
      { now: 1_000, seal: invalidSeal },
    ) as { content: Array<{ text: string }> };
    expect(invalidResult.content[0]?.text).toBe("[IMAGE_REF][/IMAGE_REF]");
    expect(invalidSeal).not.toHaveBeenCalled();
  });

  it("fails closed when encryption is unavailable and caps encrypted previews", () => {
    const unavailable = protectMorphikMcpResult(
      { content: [{ type: "text", text: `[IMAGE_URL]${url}[/IMAGE_URL]` }] },
      "user-1",
      {
        seal: () => {
          throw new Error("key unavailable");
        },
      },
    ) as { content: Array<{ text: string }> };
    expect(unavailable.content[0]?.text).toBe("[IMAGE_REF][/IMAGE_REF]");
    expect(unavailable.content[0]?.text).not.toContain("X-Amz-Signature");

    const capped = setup();
    const repeated = Array.from(
      { length: 10 },
      () => `[IMAGE_URL]${url}[/IMAGE_URL]`,
    ).join("");
    const cappedResult = protectMorphikMcpResult(
      { content: [{ type: "text", text: repeated }] },
      "user-1",
      { seal: capped.seal },
    ) as { content: Array<{ text: string }> };
    expect(capped.references.size).toBe(8);
    expect(cappedResult.content[0]?.text).not.toContain("X-Amz-Signature");
  });
});
