import { randomBytes } from "node:crypto";
import { tool } from "ai";
import { z } from "zod";
import { connectorActionApprovalRepository } from "lib/db/pg/repositories/connector-action-approval-repository.pg";
import {
  callConnectorApi,
  callConnectorTextApi,
  ConnectorApiError,
} from "lib/connectors/provider-api";

const approvalToken = z.string().min(43).max(43);
const inputSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("list"),
      query: z.string().max(500).optional(),
      maxResults: z.number().int().min(1).max(20).optional().default(10),
    })
    .strict(),
  z
    .object({ action: z.literal("read"), fileId: z.string().min(1).max(256) })
    .strict(),
  z
    .object({
      action: z.literal("create"),
      name: z.string().min(1).max(256),
      mimeType: z.string().max(128).optional(),
      content: z.string().max(100_000),
      approvalToken,
    })
    .strict(),
]);

export function createDriveToolForUser(userId: string) {
  return tool({
    description:
      "Google Drive for this signed-in user. Safe actions: list files and read a file. Creating a file is a write: first call proposeConnectorAction with provider google-drive, action create, and exact name/mimeType/content; after explicit approval call create with the identical payload and one-use approvalToken.",
    inputSchema,
    execute: async (input) => {
      try {
        if (input.action === "list") {
          const result = await callConnectorApi(
            userId,
            "google-drive",
            "/drive/v3/files",
            {
              query: {
                q: input.query?.trim() || undefined,
                pageSize: input.maxResults,
                orderBy: "modifiedTime desc",
                fields: "files(id,name,mimeType,modifiedTime,size,webViewLink)",
              },
            },
          );
          return {
            files: Array.isArray(result.files)
              ? result.files.slice(0, input.maxResults)
              : [],
          };
        }
        if (input.action === "read")
          return await readDriveFile(userId, input.fileId);

        const payload = {
          name: input.name,
          ...(input.mimeType ? { mimeType: input.mimeType } : {}),
          content: input.content,
        };
        const approved = await connectorActionApprovalRepository.consume(
          userId,
          input.approvalToken,
          {
            provider: "google-drive",
            action: "create",
            payload,
          },
        );
        if (!approved)
          throw new ConnectorApiError(
            "This exact Drive action has not been approved or its approval expired",
          );
        return await createDriveFile(
          userId,
          input.name,
          input.mimeType,
          input.content,
        );
      } catch (error) {
        return {
          error:
            error instanceof ConnectorApiError
              ? error.message
              : "Google Drive action failed",
        };
      }
    },
  });
}

async function readDriveFile(userId: string, fileId: string) {
  const id = encodeURIComponent(fileId);
  const metadata = await callConnectorApi(
    userId,
    "google-drive",
    `/drive/v3/files/${id}`,
    {
      query: { fields: "id,name,mimeType,modifiedTime,size,webViewLink" },
      maxResponseBytes: 64 * 1024,
    },
  );
  const mimeType =
    typeof metadata.mimeType === "string" ? metadata.mimeType : "";
  let content: string | undefined;
  if (mimeType === "application/vnd.google-apps.document") {
    content = await callConnectorTextApi(
      userId,
      "google-drive",
      `/drive/v3/files/${id}/export`,
      {
        query: { mimeType: "text/plain" },
        maxResponseBytes: 100_000,
      },
    );
  } else if (!mimeType.startsWith("application/vnd.google-apps.")) {
    content = await callConnectorTextApi(
      userId,
      "google-drive",
      `/drive/v3/files/${id}`,
      {
        query: { alt: "media" },
        maxResponseBytes: 100_000,
      },
    );
  }
  return { ...metadata, ...(content !== undefined ? { content } : {}) };
}

async function createDriveFile(
  userId: string,
  name: string,
  mimeType: string | undefined,
  content: string,
) {
  const validatedMimeType =
    mimeType && /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/iu.test(mimeType)
      ? mimeType
      : "text/plain";
  const boundary = `void-agent-${randomBytes(18).toString("hex")}`;
  const rawBody = [
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    JSON.stringify({ name, mimeType: validatedMimeType }),
    `--${boundary}`,
    `Content-Type: ${validatedMimeType}`,
    "",
    content,
    `--${boundary}--`,
    "",
  ].join("\r\n");
  const result = await callConnectorApi(
    userId,
    "google-drive",
    "/upload/drive/v3/files",
    {
      method: "POST",
      query: {
        uploadType: "multipart",
        fields: "id,name,mimeType,webViewLink",
      },
      rawBody,
      contentType: `multipart/related; boundary=${boundary}`,
    },
  );
  return { success: true, file: result };
}
