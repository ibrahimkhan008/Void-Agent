import { describe, expect, it } from "vitest";
import {
  appendProjectBrainDreamWarning,
  getNextProjectBrainDreamStage,
  hasProjectBrainStatusSnapshotForFingerprint,
  makeProjectBrainDreamIdempotencyKey,
  sanitizeProjectBrainDreamError,
} from "./brain-dream-state";

describe("project brain dream queue state", () => {
  it("advances one bounded stage at a time and ends after archival", () => {
    expect(getNextProjectBrainDreamStage("dedupe")).toBe("contradictions");
    expect(getNextProjectBrainDreamStage("contradictions")).toBe("salience");
    expect(getNextProjectBrainDreamStage("salience")).toBe("archive");
    expect(getNextProjectBrainDreamStage("archive")).toBe("status");
    expect(getNextProjectBrainDreamStage("status")).toBe("done");
    expect(getNextProjectBrainDreamStage("done")).toBe("done");
  });

  it("reuses only a snapshot for the current source fingerprint", () => {
    expect(hasProjectBrainStatusSnapshotForFingerprint("same", "same")).toBe(
      true,
    );
    expect(hasProjectBrainStatusSnapshotForFingerprint("old", "new")).toBe(
      false,
    );
    expect(hasProjectBrainStatusSnapshotForFingerprint(null, "new")).toBe(
      false,
    );
  });

  it("deduplicates manual requests hourly and recurring runs once per UTC day", () => {
    const date = new Date("2026-11-07T23:59:59.000Z");
    expect(makeProjectBrainDreamIdempotencyKey("manual", date)).toBe(
      "manual:2026-11-07T23",
    );
    expect(makeProjectBrainDreamIdempotencyKey("nightly", date)).toBe(
      "nightly:2026-11-07",
    );
    expect(
      makeProjectBrainDreamIdempotencyKey(
        "nightly",
        new Date("2026-11-08T00:00:00Z"),
      ),
    ).not.toBe(makeProjectBrainDreamIdempotencyKey("nightly", date));
  });

  it("keeps stage-specific warnings bounded for partial outcomes", () => {
    const warning = appendProjectBrainDreamWarning(
      [],
      "contradictions",
      "x".repeat(1000),
    );
    expect(warning).toHaveLength(1);
    expect(warning[0]).toBe(`contradictions: ${"x".repeat(300)}`);
  });

  it("does not persist raw provider or exception details", () => {
    const privateError = new Error(
      "Authorization: Bearer secret-token provider response body",
    );
    const persisted = sanitizeProjectBrainDreamError(privateError);
    expect(persisted).toBe(
      "Stage processing failed; details were not exposed.",
    );
    expect(persisted).not.toContain("secret-token");
    expect(persisted).not.toContain("provider response");
  });
});
