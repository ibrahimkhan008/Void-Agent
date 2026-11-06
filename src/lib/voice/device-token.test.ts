import { afterEach, describe, expect, it } from "vitest";
import { generateVoiceDeviceToken, generateVoicePairingCode, hashVoiceDeviceSecret, isVoiceDeviceToken } from "./device-token";

describe("voice device credentials", () => {
  afterEach(() => { delete process.env.VOICE_DEVICE_TOKEN_PEPPER; });
  it("generates high entropy bearer tokens and six digit pairing codes", () => {
    const token = generateVoiceDeviceToken();
    expect(isVoiceDeviceToken(token)).toBe(true);
    expect(generateVoicePairingCode()).toMatch(/^\d{6}$/);
  });
  it("hashes codes with a server pepper and fails closed when missing", () => {
    expect(() => hashVoiceDeviceSecret("pair", "123456")).toThrow(/pepper/);
    process.env.VOICE_DEVICE_TOKEN_PEPPER = "x".repeat(32);
    const hash = hashVoiceDeviceSecret("pair", "123456");
    expect(hash).toHaveLength(64);
    expect(hash).not.toContain("123456");
  });
});
