import { describe, expect, it } from "vitest";
import {
  canOfferProjectBrainRunRetry,
  isProjectBrainRunClaimable,
  isProjectBrainRunRecoverable,
  isProjectBrainRunStale,
} from "./brain-run-state";

describe("project brain run recovery state", () => {
  const now = Date.parse("2026-11-08T06:00:00.000Z");

  it("recognizes stale queued and running states from API timestamps", () => {
    expect(
      isProjectBrainRunStale("queued", "2026-11-08T05:54:59.000Z", now),
    ).toBe(true);
    expect(
      isProjectBrainRunStale("running", "2026-11-08T05:55:01.000Z", now),
    ).toBe(false);
    expect(isProjectBrainRunStale("succeeded", null, now)).toBe(false);
  });

  it("recovers failed runs and queued or running jobs beyond the lease", () => {
    expect(isProjectBrainRunRecoverable("failed", null, now)).toBe(true);
    expect(
      isProjectBrainRunRecoverable("running", "2026-11-08T05:54:00.000Z", now),
    ).toBe(true);
    expect(
      isProjectBrainRunRecoverable("running", "2026-11-08T05:59:00.000Z", now),
    ).toBe(false);
    expect(
      isProjectBrainRunRecoverable("queued", "2026-11-08T05:50:00.000Z", now),
    ).toBe(true);
    expect(
      isProjectBrainRunRecoverable("queued", "2026-11-08T05:59:00.000Z", now),
    ).toBe(false);
  });

  it("offers retry only to editors for runs the API can recover", () => {
    const staleRunning = "2026-11-08T05:54:00.000Z";
    expect(
      canOfferProjectBrainRunRetry(true, "running", staleRunning, now),
    ).toBe(true);
    expect(
      canOfferProjectBrainRunRetry(
        true,
        "queued",
        "2026-11-08T05:50:00.000Z",
        now,
      ),
    ).toBe(true);
    expect(
      canOfferProjectBrainRunRetry(false, "running", staleRunning, now),
    ).toBe(false);
    expect(
      canOfferProjectBrainRunRetry(
        true,
        "running",
        "2026-11-08T05:59:00Z",
        now,
      ),
    ).toBe(false);
  });

  it("allows the queue processor to claim queued or expired worker runs", () => {
    expect(isProjectBrainRunClaimable("queued", null, now)).toBe(true);
    expect(
      isProjectBrainRunClaimable("queued", "2026-11-08T05:50:00.000Z", now),
    ).toBe(true);
    expect(
      isProjectBrainRunClaimable("running", "2026-11-08T05:54:00.000Z", now),
    ).toBe(true);
    expect(
      isProjectBrainRunClaimable("running", "2026-11-08T05:59:00.000Z", now),
    ).toBe(false);
    expect(isProjectBrainRunClaimable("failed", null, now)).toBe(true);
  });
});
