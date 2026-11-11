import { describe, expect, it } from "vitest";
import { isVoiceDeviceType } from "app-types/voice-device";

describe("voice device type boundary", () => {
  it("accepts only the hardware types supported by the product", () => {
    expect(isVoiceDeviceType("m5stack_atom_echo_s3r")).toBe(true);
    expect(isVoiceDeviceType("unknown-device")).toBe(false);
    expect(isVoiceDeviceType(null)).toBe(false);
  });
});
