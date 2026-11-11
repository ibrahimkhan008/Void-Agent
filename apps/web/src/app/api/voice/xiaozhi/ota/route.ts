import { createHash, randomBytes } from "node:crypto";
import { getBaseUrl } from "lib/const";
import { voiceDeviceCustomRepository } from "lib/db/repository";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import { authenticateVoiceDevice } from "lib/voice/device-auth";
import { generateVoicePairingCode } from "lib/voice/device-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TTL_MS = 10 * 60_000;
const textHeader = (request: Request, name: string, max: number) => {
  const value = request.headers.get(name)?.trim();
  return value && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value)
    ? value
    : null;
};

async function handle(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader) {
    const device = await authenticateVoiceDevice(request);
    if (!device)
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    return Response.json(
      {
        device_id: device.deviceId,
        api_base_url: getBaseUrl() || null,
        firmware_version: process.env.VOICE_DEVICE_FIRMWARE_VERSION ?? null,
        protocol: "void-agent-device-rest-v1",
        server_time: { timestamp: Date.now(), timezone_offset: 0 },
        websocket_available: false,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const ip =
    request.headers.get("x-real-ip") ??
    request.headers.get("x-forwarded-for")?.split(",", 1)[0]?.trim() ??
    "unknown";
  const ipHash = createHash("sha256").update(ip).digest("hex");
  const rate = await checkApiRateLimit({
    kind: "voice-device-ota-registration",
    id: ipHash,
    limit: 10,
    windowMs: 60_000,
  });
  if (!rate.allowed)
    return Response.json(
      { error: "Too many registration requests" },
      { status: 429 },
    );

  const code = generateVoicePairingCode();
  const bootstrapSecret = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + TTL_MS);
  const firmwareVersion =
    textHeader(request, "x-firmware-version", 40) ??
    textHeader(request, "user-agent", 256)
      ?.split("/")
      .at(-1)
      ?.trim()
      .slice(0, 40) ??
    "0.1.0";
  const registration = await voiceDeviceCustomRepository.createOtaRegistration({
    code,
    bootstrapSecret,
    deviceType: "m5stack_atom_echo_s3r",
    firmwareVersion,
    hardwareId:
      textHeader(request, "x-hardware-id", 64) ??
      textHeader(request, "device-id", 64) ??
      textHeader(request, "client-id", 64),
    expiresAt,
  });
  return Response.json(
    {
      activation: {
        message: "Enter this code in Void-Agent Voice devices",
        code,
        challenge: registration.id,
        bootstrap_secret: bootstrapSecret,
        timeout_ms: TTL_MS,
      },
      server_time: { timestamp: Date.now(), timezone_offset: 0 },
      firmware: { version: process.env.VOICE_DEVICE_FIRMWARE_VERSION ?? null },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET(request: Request) {
  try {
    return await handle(request);
  } catch {
    return Response.json(
      { error: "Voice device registration is unavailable" },
      { status: 503 },
    );
  }
}

export async function POST(request: Request) {
  return GET(request);
}
