import { voiceDeviceRepository } from "lib/db/repository";
import { isVoiceDeviceToken } from "./device-token";

export const authenticateVoiceDevice = async (request: Request) => {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice(7).trim();
  if (!isVoiceDeviceToken(token)) return null;
  try { return await voiceDeviceRepository.getActiveByToken(token); }
  catch { return null; }
};
