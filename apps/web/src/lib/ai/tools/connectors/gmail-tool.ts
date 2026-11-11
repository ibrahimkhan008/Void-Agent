import { tool } from "ai";
import { z } from "zod";
import { connectorActionApprovalRepository } from "lib/db/pg/repositories/connector-action-approval-repository.pg";
import {
  callConnectorApi,
  ConnectorApiError,
} from "lib/connectors/provider-api";

const approvalToken = z.string().min(43).max(43);
const inboxInput = z
  .object({
    action: z.literal("inbox"),
    maxResults: z.number().int().min(1).max(10).optional().default(5),
    query: z.string().max(500).optional(),
  })
  .strict();
const readInput = z
  .object({
    action: z.literal("read"),
    messageId: z.string().min(1).max(256),
  })
  .strict();
const sendInput = z
  .object({
    action: z.literal("send"),
    to: z.string().email().max(320),
    subject: z
      .string()
      .min(1)
      .max(500)
      .refine((value) => !/[\r\n]/u.test(value), "Subject must be one line"),
    message: z.string().min(1).max(20_000),
    approvalToken,
  })
  .strict();
const replyInput = z
  .object({
    action: z.literal("reply"),
    messageId: z.string().min(1).max(256),
    message: z.string().min(1).max(20_000),
    approvalToken,
  })
  .strict();
const gmailInput = z.discriminatedUnion("action", [
  inboxInput,
  readInput,
  sendInput,
  replyInput,
]);

export function createGmailToolForUser(userId: string) {
  return tool({
    description:
      "Gmail for this signed-in user. Safe actions: inbox (1-10 messages, optionally filtered by Gmail query), read (messageId). For send or reply, first call proposeConnectorAction with provider gmail, the exact action and exact payload; wait for the user-approved token, then call this tool with that same payload and approvalToken. Writes without the matching one-use token are rejected.",
    inputSchema: gmailInput,
    execute: async (input) => {
      try {
        if (input.action === "inbox")
          return await listInbox(userId, input.maxResults, input.query);
        if (input.action === "read")
          return await readMessage(userId, input.messageId);
        if (input.action === "send") {
          const payload = {
            to: input.to,
            subject: input.subject,
            message: input.message,
          };
          const approved = await connectorActionApprovalRepository.consume(
            userId,
            input.approvalToken,
            {
              provider: "gmail",
              action: "send",
              payload,
            },
          );
          if (!approved)
            throw new ConnectorApiError(
              "This exact Gmail action has not been approved or its approval expired",
            );
          return await sendMessage(
            userId,
            input.to,
            input.subject,
            input.message,
          );
        }
        const payload = { messageId: input.messageId, message: input.message };
        const approved = await connectorActionApprovalRepository.consume(
          userId,
          input.approvalToken,
          {
            provider: "gmail",
            action: "reply",
            payload,
          },
        );
        if (!approved)
          throw new ConnectorApiError(
            "This exact Gmail action has not been approved or its approval expired",
          );
        return await replyMessage(userId, input.messageId, input.message);
      } catch (error) {
        return {
          error:
            error instanceof ConnectorApiError
              ? error.message
              : "Gmail action failed",
        };
      }
    },
  });
}

async function listInbox(userId: string, maxResults: number, query?: string) {
  const list = await callConnectorApi(
    userId,
    "gmail",
    "/gmail/v1/users/me/messages",
    {
      query: { maxResults, q: query?.trim() || undefined },
    },
  );
  const rows = Array.isArray(list.messages)
    ? list.messages.slice(0, maxResults)
    : [];
  const messages = await Promise.all(
    rows.map(async (row) => {
      if (
        !row ||
        typeof row !== "object" ||
        typeof (row as any).id !== "string"
      )
        return null;
      const id = (row as { id: string }).id;
      const summary = await callConnectorApi(
        userId,
        "gmail",
        `/gmail/v1/users/me/messages/${encodeURIComponent(id)}`,
        {
          query: { format: "metadata", metadataHeaders: "From,Subject,Date" },
          maxResponseBytes: 64 * 1024,
        },
      );
      return {
        id,
        threadId: safeString(summary.threadId, 256),
        snippet: safeString(summary.snippet, 500),
        from: header(summary, "From"),
        subject: header(summary, "Subject"),
        date: header(summary, "Date"),
      };
    }),
  );
  return { messages: messages.filter(Boolean) };
}

async function readMessage(userId: string, messageId: string) {
  const result = await callConnectorApi(
    userId,
    "gmail",
    `/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}`,
    {
      query: { format: "full" },
    },
  );
  const payload =
    result.payload && typeof result.payload === "object"
      ? (result.payload as Record<string, any>)
      : {};
  const body = extractBody(payload);
  return {
    id: safeString(result.id, 256),
    threadId: safeString(result.threadId, 256),
    snippet: safeString(result.snippet, 500),
    from: header(result, "From"),
    to: header(result, "To"),
    subject: header(result, "Subject"),
    date: header(result, "Date"),
    body: plainText(body.text || body.html).slice(0, 20_000),
  };
}

async function sendMessage(
  userId: string,
  to: string,
  subject: string,
  message: string,
) {
  const raw = toBase64Url(
    `To: ${to}\r\nSubject: ${subject}\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n${message}`,
  );
  const result = await callConnectorApi(
    userId,
    "gmail",
    "/gmail/v1/users/me/messages/send",
    {
      method: "POST",
      body: { raw },
    },
  );
  return { success: true, messageId: safeString(result.id, 256) };
}

async function replyMessage(
  userId: string,
  messageId: string,
  message: string,
) {
  const original = await callConnectorApi(
    userId,
    "gmail",
    `/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}`,
    {
      query: {
        format: "metadata",
        metadataHeaders: "From,Subject,Message-ID,References",
      },
      maxResponseBytes: 64 * 1024,
    },
  );
  const recipientHeader = header(original, "From");
  const recipient = (
    recipientHeader.match(/<([^<>]+)>/u)?.[1] ?? recipientHeader
  ).trim();
  if (!z.string().email().max(320).safeParse(recipient).success) {
    throw new ConnectorApiError(
      "Could not verify the original message recipient",
    );
  }
  const subject = header(original, "Subject")
    .replace(/[\r\n]/gu, " ")
    .slice(0, 500);
  const messageIdHeader = header(original, "Message-ID")
    .replace(/[\r\n]/gu, "")
    .slice(0, 500);
  const references = header(original, "References")
    .replace(/[\r\n]/gu, " ")
    .slice(0, 1000);
  const replySubject = /^re:/iu.test(subject) ? subject : `Re: ${subject}`;
  const raw = toBase64Url(
    `To: ${recipient}\r\nSubject: ${replySubject}\r\n${messageIdHeader ? `In-Reply-To: ${messageIdHeader}\r\n` : ""}${references ? `References: ${references} ${messageIdHeader}\r\n` : messageIdHeader ? `References: ${messageIdHeader}\r\n` : ""}MIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n${message}`,
  );
  const result = await callConnectorApi(
    userId,
    "gmail",
    "/gmail/v1/users/me/messages/send",
    {
      method: "POST",
      body: { raw, threadId: safeString(original.threadId, 256) },
    },
  );
  return { success: true, messageId: safeString(result.id, 256) };
}

function header(message: Record<string, any>, name: string): string {
  const headers = message.payload?.headers;
  if (!Array.isArray(headers)) return "";
  const item = headers.find(
    (candidate) =>
      candidate &&
      typeof candidate.name === "string" &&
      candidate.name.toLowerCase() === name.toLowerCase(),
  );
  return typeof item?.value === "string" ? item.value.slice(0, 2000) : "";
}

function safeString(value: unknown, max: number): string | undefined {
  return typeof value === "string" ? value.slice(0, max) : undefined;
}

function decodeGmailBase64(value: unknown): string {
  if (typeof value !== "string" || value.length > 350_000) return "";
  return Buffer.from(
    value.replace(/-/gu, "+").replace(/_/gu, "/"),
    "base64",
  ).toString("utf8");
}

function extractBody(payload: Record<string, any>): {
  text: string;
  html: string;
} {
  let text = "";
  let html = "";
  if (payload.body?.data) {
    const decoded = decodeGmailBase64(payload.body.data);
    if (payload.mimeType === "text/plain") text = decoded;
    else if (payload.mimeType === "text/html") html = decoded;
  }
  if (Array.isArray(payload.parts)) {
    for (const part of payload.parts.slice(0, 40)) {
      if (part?.mimeType === "text/plain" && part.body?.data && !text)
        text = decodeGmailBase64(part.body.data);
      else if (part?.mimeType === "text/html" && part.body?.data && !html)
        html = decodeGmailBase64(part.body.data);
      else if (
        typeof part?.mimeType === "string" &&
        part.mimeType.startsWith("multipart/")
      ) {
        const nested = extractBody(part);
        text ||= nested.text;
        html ||= nested.html;
      }
    }
  }
  return { text, html };
}

function plainText(value: string): string {
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/giu, "")
    .replace(/<[^>]+>/gu, " ")
    .replace(/&nbsp;/giu, " ")
    .replace(/&amp;/giu, "&")
    .replace(/&lt;/giu, "<")
    .replace(/&gt;/giu, ">")
    .replace(/&quot;/giu, '"')
    .replace(/&#39;/giu, "'")
    .replace(/\s+/gu, " ")
    .trim();
}

function toBase64Url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}
