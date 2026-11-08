import { describe, expect, it, vi } from "vitest";
import { getScheduleCreateRequestKey } from "./create-request-key";

describe("getScheduleCreateRequestKey", () => {
  it("reuses the key for an unchanged create retry", () => {
    const createKey = vi.fn(() => "first-key");
    const original = getScheduleCreateRequestKey(null, "payload", createKey);

    expect(getScheduleCreateRequestKey(original, "payload", createKey)).toBe(
      original,
    );
    expect(createKey).toHaveBeenCalledOnce();
  });

  it("allocates a new key when the payload changes or a new schedule starts", () => {
    const createKey = vi
      .fn<() => string>()
      .mockReturnValueOnce("first-key")
      .mockReturnValueOnce("changed-key")
      .mockReturnValueOnce("next-schedule-key");
    const original = getScheduleCreateRequestKey(null, "payload", createKey);

    expect(
      getScheduleCreateRequestKey(original, "edited payload", createKey),
    ).toEqual({ payload: "edited payload", key: "changed-key" });
    expect(getScheduleCreateRequestKey(null, "payload", createKey)).toEqual({
      payload: "payload",
      key: "next-schedule-key",
    });
  });
});
