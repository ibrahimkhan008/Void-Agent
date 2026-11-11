import { chatExportRepository } from "lib/db/repository";
import {
  hashPublicShareToken,
  sanitizePublicChatMessages,
} from "./public-share";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Resolve current hashed links or preserve pre-migration UUID links until revoked. */
export async function loadPublicChatExport(linkToken: string) {
  const tokenHash = hashPublicShareToken(linkToken);
  const record = tokenHash
    ? await chatExportRepository.selectByShareTokenHash(tokenHash)
    : UUID.test(linkToken)
      ? await chatExportRepository.selectLegacyByIdWithUser(linkToken)
      : null;
  if (!record) return null;
  return {
    ...record,
    messages: sanitizePublicChatMessages(record.messages),
    allowComments: !tokenHash,
  };
}
