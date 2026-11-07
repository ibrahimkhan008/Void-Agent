import { describe, expect, it } from "vitest";
import {
  classifyCockpitConnection,
  parseCockpitConnectionStatus,
} from "./overview";

describe("classifyCockpitConnection", () => {
  it("distinguishes verified, failed, untested, disconnected and unavailable states", () => {
    expect(
      classifyCockpitConnection({
        connected: true,
        lastTestedAt: "2026-11-07T00:00:00.000Z",
        lastTestOk: true,
        canManage: true,
      }),
    ).toBe("ready");
    expect(
      classifyCockpitConnection({
        connected: true,
        lastTestedAt: "2026-11-07T00:00:00.000Z",
        lastTestOk: false,
        canManage: false,
      }),
    ).toBe("needs-attention");
    expect(
      classifyCockpitConnection({
        connected: true,
        lastTestedAt: null,
        lastTestOk: null,
        canManage: true,
      }),
    ).toBe("connected-untested");
    expect(
      classifyCockpitConnection({
        connected: false,
        lastTestedAt: null,
        lastTestOk: null,
        canManage: true,
      }),
    ).toBe("not-connected");
    expect(classifyCockpitConnection(null)).toBe("unavailable");
  });

  it("rejects incomplete or unexpected provider status payloads", () => {
    expect(parseCockpitConnectionStatus(null)).toBeNull();
    expect(parseCockpitConnectionStatus({ connected: "yes" })).toBeNull();
    expect(
      parseCockpitConnectionStatus({
        connected: true,
        lastTestedAt: null,
        lastTestOk: null,
        canManage: true,
      }),
    ).toEqual({
      connected: true,
      lastTestedAt: null,
      lastTestOk: null,
      canManage: true,
    });
  });
});
