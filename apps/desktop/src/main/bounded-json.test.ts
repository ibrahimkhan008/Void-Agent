import { describe, expect, it } from "vitest";
import { stringifyBoundedJson } from "./bounded-json.js";

describe("stringifyBoundedJson", () => {
  it("preserves JSON values and escaping", () => {
    const value = { text: 'line\nwith "quotes"', values: [1, true, null] };
    expect(JSON.parse(stringifyBoundedJson(value, 100))).toEqual(value);
  });

  it("rejects output before producing a string beyond the cap", () => {
    expect(() =>
      stringifyBoundedJson({ text: "x".repeat(100_000) }, 64),
    ).toThrow("size limit");
  });

  it("rejects excessive nesting and accessor-backed values", () => {
    let nested: unknown = null;
    for (let index = 0; index < 66; index += 1) nested = { nested };
    expect(() => stringifyBoundedJson(nested, 10_000)).toThrow("nesting limit");

    const accessor = Object.defineProperty({}, "value", {
      enumerable: true,
      get: () => "not serialized",
    });
    expect(() => stringifyBoundedJson(accessor, 100)).toThrow(
      "accessor property",
    );
  });
});
