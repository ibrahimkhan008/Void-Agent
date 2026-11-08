import { describe, expect, it } from "vitest";
import {
  MAX_FORK_CONTENT_BYTES,
  MAX_FORK_MESSAGES,
  exceedsForkSnapshotLimits,
} from "./fork-limits";

describe("fork snapshot limits", () => {
  it("allows a prefix at the configured bounds", () => {
    expect(
      exceedsForkSnapshotLimits({
        messageCount: MAX_FORK_MESSAGES,
        contentBytes: MAX_FORK_CONTENT_BYTES,
      }),
    ).toBe(false);
  });

  it("rejects a prefix that exceeds either bound", () => {
    expect(
      exceedsForkSnapshotLimits({
        messageCount: MAX_FORK_MESSAGES + 1,
        contentBytes: 1,
      }),
    ).toBe(true);
    expect(
      exceedsForkSnapshotLimits({
        messageCount: 1,
        contentBytes: MAX_FORK_CONTENT_BYTES + 1,
      }),
    ).toBe(true);
  });
});
