import { describe, expect, it } from "vitest";
import { resolveAutoUpdater } from "./updater-interop.js";

describe("resolveAutoUpdater", () => {
  it("uses the ESM named export", () => {
    const updater = { checkForUpdates: () => undefined };
    expect(resolveAutoUpdater({ autoUpdater: updater })).toBe(updater);
  });

  it("supports a CommonJS default export shape", () => {
    const updater = { checkForUpdates: () => undefined };
    expect(resolveAutoUpdater({ default: { autoUpdater: updater } })).toBe(
      updater,
    );
  });

  it.each([null, {}, { default: {} }])(
    "rejects an invalid export shape",
    (value) => {
      expect(() => resolveAutoUpdater(value)).toThrow(
        "electron-updater did not expose",
      );
    },
  );
});
