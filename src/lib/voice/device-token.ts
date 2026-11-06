import { createHash, randomBytes, randomInt } from "node:crypto";

const TOKEN_PREFIX = "nvdev_live_";

const getPepper = () => {
  const pepper = process.env.VOICE_DEVICE_TOKEN_PEPPER;
  if (!pepper || pepper.length < 32)
    throw new Error("Voice device token pepper is not configured securely");
  return pepper;
};

export const hashVoiceDeviceSecret = (
  kind: "token" | "pair" | "bootstrap",
  value: string,
) =>
  createHash("sha256").update(`${getPepper()}:${kind}:${value}`).digest("hex");
export const generateVoiceDeviceToken = () =>
  `${TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
export const generateVoicePairingCode = () =>
  String(randomInt(100_000, 1_000_000));
export const isVoiceDeviceToken = (value: string) =>
  value.startsWith(TOKEN_PREFIX) && value.length === TOKEN_PREFIX.length + 43;
