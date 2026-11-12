import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SUPPORTED_LOCALES } from "./const";

/**
 * Guards translation completeness.
 *
 * `i18n/request.ts` deep-merges every locale over `en.json`, so a key that is
 * missing from a locale silently renders in English instead of failing. That
 * makes English-only drift invisible in the product — a whole page can ship
 * untranslated without anything breaking. These tests turn that drift into a
 * failing build.
 */

const MESSAGES_DIR = join(__dirname, "../../messages");

/**
 * ICU argument names used by a message.
 *
 * A regex cannot do this: literal text inside a plural branch (`other {s}`)
 * looks exactly like an argument, so walk the message and only collect names
 * that sit in true argument position.
 */
function icuArguments(message: string): Set<string> {
  const args = new Set<string>();
  const n = message.length;

  /** Consumes a message body; returns the index of its closing brace. */
  function parseBody(i: number): number {
    while (i < n && message[i] !== "}") {
      i = message[i] === "{" ? parseArgument(i + 1) : i + 1;
    }
    return i;
  }

  /** `i` points just past the opening brace; returns the index past `}`. */
  function parseArgument(i: number): number {
    let start = i;
    while (i < n && message[i] !== "," && message[i] !== "}") i++;
    args.add(message.slice(start, i).trim());
    if (message[i] === ",") {
      i++;
      start = i;
      while (i < n && message[i] !== "," && message[i] !== "}") i++;
      const kind = message.slice(start, i).trim();
      if (message[i] === ",") {
        i++;
        if (
          kind === "plural" ||
          kind === "select" ||
          kind === "selectordinal"
        ) {
          while (i < n && message[i] !== "}") {
            i = message[i] === "{" ? parseBody(i + 1) + 1 : i + 1;
          }
        } else {
          // A format style (number, date, …): skip ahead to our own brace.
          let depth = 0;
          while (i < n) {
            if (message[i] === "{") depth++;
            else if (message[i] === "}") {
              if (depth === 0) break;
              depth--;
            }
            i++;
          }
        }
      }
    }
    return i + 1;
  }

  parseBody(0);
  return args;
}

// The product ships English-only; this suite now guards the on-disk catalog
// set so stale locale files cannot silently reappear.
describe("locale message files", () => {
  it("ships exactly the supported locale catalogs", () => {
    const onDisk = readdirSync(MESSAGES_DIR)
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(/\.json$/, ""))
      .sort();
    expect(onDisk).toEqual(SUPPORTED_LOCALES.map((l) => l.code).sort());
  });
});

describe("icuArguments", () => {
  it("reads argument names", () => {
    expect(icuArguments("Invited {succeeded} · {failed} failed")).toEqual(
      new Set(["succeeded", "failed"]),
    );
  });

  it("ignores literal text inside plural branches", () => {
    expect(
      icuArguments("{count} user{count, plural, =1 {} other {s}} total"),
    ).toEqual(new Set(["count"]));
  });

  it("reads arguments around a plural", () => {
    expect(
      icuArguments(
        "{tokens} tokens across {count} model{count, plural, =1 {} other {s}} in {period}.",
      ),
    ).toEqual(new Set(["tokens", "count", "period"]));
  });

  it("finds nothing in a plain message", () => {
    expect(icuArguments("Organizations")).toEqual(new Set());
  });
});
