import { chatExportRepository, chatRepository } from "lib/db/repository";
import { createPublicShareToken } from "./public-share";

export async function createOwnerChatShare(
  threadId: string,
  ownerId: string,
  expiresAt?: Date,
) {
  const thread = await chatRepository.selectThread(threadId);
  if (!thread || thread.userId !== ownerId) {
    throw new Error("Thread not found");
  }

  const exportId = await chatExportRepository.exportChat({
    threadId,
    exporterId: ownerId,
    expiresAt,
  });
  const { token, tokenHash } = createPublicShareToken();
  const stored = await chatExportRepository.createShareToken(
    exportId,
    ownerId,
    tokenHash,
  );
  if (!stored) {
    await chatExportRepository.deleteById(exportId);
    throw new Error("Could not create share link");
  }
  return { exportId, token };
}

export async function rotateOwnerChatShare(exportId: string, ownerId: string) {
  const { token, tokenHash } = createPublicShareToken();
  const stored = await chatExportRepository.createShareToken(
    exportId,
    ownerId,
    tokenHash,
  );
  return stored ? token : null;
}

export async function revokeOwnerChatShare(exportId: string, ownerId: string) {
  return chatExportRepository.revokeShareToken(exportId, ownerId);
}
