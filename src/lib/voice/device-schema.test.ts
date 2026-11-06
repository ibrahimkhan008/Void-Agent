import { describe, expect, it } from "vitest";
import {
  claimOtaRegistrationSchema,
  completeOtaRegistrationSchema,
  createDevicePairingSchema,
  redeemDevicePairingSchema,
} from "./device-schema";

describe("voice device pairing contracts", () => {
  it("accepts only the supported device type and bounded display name", () => {
    expect(
      createDevicePairingSchema.safeParse({ displayName: "Kitchen" }).success,
    ).toBe(true);
    expect(
      createDevicePairingSchema.safeParse({ displayName: "x".repeat(81) })
        .success,
    ).toBe(false);
    expect(
      createDevicePairingSchema.safeParse({ deviceType: "unknown" }).success,
    ).toBe(false);
  });
  it("requires six digit code and bounded device metadata on redemption", () => {
    const base = {
      code: "012345",
      deviceType: "m5stack_atom_echo_s3r",
      displayName: "Kitchen",
      firmwareVersion: "1.0",
    };
    expect(redeemDevicePairingSchema.safeParse(base).success).toBe(true);
    expect(
      redeemDevicePairingSchema.safeParse({ ...base, code: "12345" }).success,
    ).toBe(false);
    expect(
      redeemDevicePairingSchema.safeParse({
        ...base,
        displayName: "x".repeat(81),
      }).success,
    ).toBe(false);
  });
  it("validates OTA activation claims and device-held completion proofs", () => {
    expect(
      claimOtaRegistrationSchema.safeParse({
        code: "012345",
        displayName: "Office",
      }).success,
    ).toBe(true);
    expect(
      claimOtaRegistrationSchema.safeParse({ code: "012345", extra: true })
        .success,
    ).toBe(false);
    const valid = {
      registrationId: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
      code: "012345",
      bootstrapSecret: "a".repeat(43),
    };
    expect(completeOtaRegistrationSchema.safeParse(valid).success).toBe(true);
    expect(
      completeOtaRegistrationSchema.safeParse({
        ...valid,
        bootstrapSecret: "short",
      }).success,
    ).toBe(false);
    expect(
      completeOtaRegistrationSchema.safeParse({
        ...valid,
        registrationId: "not-a-uuid",
      }).success,
    ).toBe(false);
  });
});
