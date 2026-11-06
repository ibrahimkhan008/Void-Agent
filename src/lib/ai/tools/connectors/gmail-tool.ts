import { Tool, tool as createTool } from "ai";
import { and, eq } from "drizzle-orm";
import { JSONSchema7 } from "json-schema";
import { emailApprovalPayloadSchema } from "lib/ai/tools/hitl/email-approval";
import { refreshConnectorToken } from "lib/connectors/refresh";
import { pgDb as db } from "lib/db/pg/db.pg";
import { emailApprovalRepository } from "lib/db/pg/repositories/email-approval-repository.pg";
import { UserConnectorTable } from "lib/db/pg/schema.pg";
import { z } from "zod";

export const gmailToolSchema: JSONSchema7 = {
  type: "object",
  properties: {
    action: {
      type: "string",
      enum: ["inbox", "read", "send", "reply"],
      description: "The Gmail action to perform",
    },
    maxResults: {
      type: "number",
      description:
        "Maximum number of emails to return (for inbox action). Defaults to 5.",
      minimum: 1,
      maximum: 10,
    },
    query: {
      type: "string",
      description:
        "Search query to filter emails (e.g., 'from:example@gmail.com' or 'subject:meeting')",
    },
    messageId: {
      type: "string",
      description: "The ID of the email message to read or reply to",
    },
    to: {
      type: "string",
      description: "Recipient email address (for send action)",
    },
    subject: {
      type: "string",
      description: "Email subject line (for send action)",
    },
    message: {
      type: "string",
      description: "Email body content (supports plain text or HTML)",
    },
    approvalToken: {
      type: "string",
      description: "One-time approval token returned by the user-reviewed email card",
    },
  },
  required: ["action"],
};

// Zod schema to be more permissive (allow missing optional fields with defaults)
const gmailToolZodSchema = z.object({
  action: z.enum(["inbox", "read", "send", "reply"]),
  maxResults: z
    .number()
    .min(1)
    .max(10)
    .optional()
    .describe("Maximum number of emails to return (1-10, default: 5)"),
  query: z.string().optional().describe("Search query to filter emails"),
  messageId: z
    .string()
    .optional()
    .describe("The ID of the email message to read or reply to"),
  to: z
    .string()
    .optional()
    .describe("Recipient email address (for send action)"),
  subject: z
    .string()
    .optional()
    .describe("Email subject line (for send action)"),
  message: z
    .string()
    .optional()
    .describe("Email body content (supports plain text or HTML)"),
  approvalToken: z.string().min(32).max(128).optional(),
});

interface GmailToolInput {
  action: "inbox" | "read" | "send" | "reply";
  maxResults?: number;
  query?: string;
  messageId?: string;
  to?: string;
  subject?: string;
  message?: string;
  approvalToken?: string;
}

function getHeader(
  headers: { name: string; value: string }[],
  name: string,
): string {
  return (
    headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ||
    ""
  );
}

// Helper to decode Gmail's URL-safe base64 strings
function decodeGmailBody(data: string): string {
  if (!data) return "";
  const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(base64, "base64").toString("utf-8");
}

// Extract email body from MIME parts (handles nested multi-part emails)
function extractEmailBody(payload: any): { text: string; html: string } {
  let text = "";
  let html = "";

  // Direct body content
  if (payload.body?.data) {
    const content = decodeGmailBody(payload.body.data);
    if (payload.mimeType === "text/plain") {
      text = content;
    } else if (payload.mimeType === "text/html") {
      html = content;
    }
  }

  // Check parts recursively
  if (payload.parts && Array.isArray(payload.parts)) {
    for (const part of payload.parts) {
      if (part.mimeType === "text/plain" && part.body?.data && !text) {
        text = decodeGmailBody(part.body.data);
      } else if (part.mimeType === "text/html" && part.body?.data && !html) {
        html = decodeGmailBody(part.body.data);
      } else if (part.mimeType?.startsWith("multipart/") && part.parts) {
        // Recursive extraction for nested multipart
        const nested = extractEmailBody(part);
        if (!text && nested.text) text = nested.text;
        if (!html && nested.html) html = nested.html;
      }
    }
  }

  return { text, html };
}

// Clean HTML to plain text for better readability
function htmlToPlainText(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

// Factory function to create Gmail tool with user context
export function createGmailToolForUser(userId: string): Tool {
  return createTool({
    description: `Gmail integration tool - Read inbox, view full emails, compose new emails, and reply to emails.

Actions:
- inbox: List recent emails from inbox (optional: maxResults 1-10, query for filtering)
- read: Read a specific email's full content (requires: messageId from inbox results)
- send: Send a user-reviewed email (requires: to, subject, message, approvalToken)
- reply: Send a user-reviewed reply (requires: messageId, to, subject, message, approvalToken)

IMPORTANT: 
- User must connect Gmail first via Connectors menu.
  - After receiving results, ALWAYS summarize the email information in a friendly, readable format.
  - For inbox: Present each email with sender, subject, and date in a clear list.
  - For read: Present the full email content clearly.
  - For send/reply: Confirm the action was successful.`,
    inputSchema: gmailToolZodSchema,
    execute: async (input: GmailToolInput) => {
      try {
        const {
          action,
          maxResults = 5,
          query,
          messageId,
          to,
          subject,
          message,
          approvalToken,
        } = input;

        // Get user's Gmail connector
        const connectors = await db
          .select()
          .from(UserConnectorTable)
          .where(
            and(
              eq(UserConnectorTable.userId, userId),
              eq(UserConnectorTable.provider, "gmail"),
            ),
          )
          .limit(1);

        if (connectors.length === 0) {
          return {
            error:
              "Gmail is not connected. Please connect your Gmail account through the Connectors menu first.",
          };
        }

        const connector = connectors[0];

        if (!connector.isConnected) {
          return {
            error:
              "Gmail connection is paused. Please reconnect through the Connectors menu.",
          };
        }

        const accessToken = await refreshConnectorToken("gmail", connector);

        if (!accessToken) {
          return {
            error:
              "Gmail authentication expired. Please reconnect your Gmail account through the Connectors menu.",
          };
        }

        // ============ INBOX ACTION ============
        if (action === "inbox") {
          let url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxResults}`;
          if (query) {
            url += `&q=${encodeURIComponent(query)}`;
          } else {
            url += "&q=in:inbox";
          }

          const listResponse = await fetch(url, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });

          if (!listResponse.ok) {
            const errorData = await listResponse.json().catch(() => ({}));
            console.error("Gmail inbox error:", listResponse.status, errorData);
            return {
              error:
                errorData?.error?.message ||
                "Failed to fetch inbox. Please try again.",
            };
          }

          const listData = await listResponse.json();

          if (!listData.messages || listData.messages.length === 0) {
            return {
              messages: [],
              info: "No emails found matching your criteria.",
            };
          }

          // Fetch details for each message
          const messageResults = await Promise.allSettled(
            listData.messages
              .slice(0, maxResults)
              .map(async (msg: { id: string }) => {
                const msgResponse = await fetch(
                  `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
                  { headers: { Authorization: `Bearer ${accessToken}` } },
                );

                if (!msgResponse.ok) {
                  throw new Error(`Failed to fetch message ${msg.id}`);
                }

                const msgData = await msgResponse.json();

                return {
                  id: msgData.id,
                  threadId: msgData.threadId,
                  snippet: msgData.snippet?.substring(0, 150),
                  subject:
                    getHeader(msgData.payload?.headers || [], "Subject") ||
                    "(No subject)",
                  from: getHeader(msgData.payload?.headers || [], "From"),
                  date: getHeader(msgData.payload?.headers || [], "Date"),
                  isUnread: msgData.labelIds?.includes("UNREAD") || false,
                };
              }),
          );

          const messages = messageResults
            .filter(
              (r): r is PromiseFulfilledResult<any> => r.status === "fulfilled",
            )
            .map((r) => r.value);

          return {
            messages,
            count: messages.length,
            info: `Found ${messages.length} email(s). Use the 'read' action with a messageId to view the full content.`,
          };
        }

        // ============ READ ACTION ============
        if (action === "read") {
          if (!messageId) {
            return {
              error:
                "Missing messageId. Please provide the ID of the email to read.",
            };
          }

          const msgResponse = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}?format=full`,
            { headers: { Authorization: `Bearer ${accessToken}` } },
          );

          if (!msgResponse.ok) {
            const errorData = await msgResponse.json().catch(() => ({}));
            console.error("Gmail read error:", msgResponse.status, errorData);
            return {
              error:
                errorData?.error?.message ||
                "Failed to fetch message. The message ID might be invalid.",
            };
          }

          const msgData = await msgResponse.json();
          const headers = msgData.payload?.headers || [];

          // Extract body from potentially nested MIME structure
          const { text, html } = extractEmailBody(msgData.payload);

          // Prefer plain text, fall back to converted HTML
          let body =
            text || (html ? htmlToPlainText(html) : "(No body content)");

          // Limit body size for AI context
          if (body.length > 8000) {
            body =
              body.substring(0, 8000) +
              "\n\n... (content truncated due to length)";
          }

          return {
            email: {
              id: msgData.id,
              threadId: msgData.threadId,
              subject: getHeader(headers, "Subject") || "(No subject)",
              from: getHeader(headers, "From"),
              to: getHeader(headers, "To"),
              cc: getHeader(headers, "Cc") || undefined,
              date: getHeader(headers, "Date"),
              body: body,
              isUnread: msgData.labelIds?.includes("UNREAD") || false,
            },
          };
        }

        // ============ SEND ACTION ============
        if (action === "send") {
          if (!to) {
            return {
              error:
                "Missing 'to' field. Please provide the recipient email address.",
            };
          }
          if (!subject) {
            return {
              error:
                "Missing 'subject' field. Please provide an email subject.",
            };
          }
          if (!message) {
            return {
              error:
                "Missing 'message' field. Please provide the email body content.",
            };
          }

          const approvedPayload = emailApprovalPayloadSchema.safeParse({
            action: "send",
            to: to.trim(),
            subject: subject.trim(),
            body: message.trim(),
          });
          if (
            !approvalToken ||
            !approvedPayload.success ||
            !(await emailApprovalRepository.consume(
              userId,
              approvalToken,
              approvedPayload.data,
            ))
          ) {
            return {
              error:
                "This email was not approved, its approval expired, or reviewed fields changed. Ask the user to review it again.",
            };
          }

          const approvedTo = to.trim();
          const approvedSubject = subject.trim();
          const approvedMessage = message.trim();

          // Build RFC 2822 email
          const emailLines = [
            `From: ${connector.email}`,
            `To: ${approvedTo}`,
            `Subject: ${approvedSubject}`,
            "MIME-Version: 1.0",
            "Content-Type: text/html; charset=utf-8",
            "",
            approvedMessage.includes("<")
              ? approvedMessage
              : `<p>${approvedMessage.replace(/\n/g, "<br>")}</p>`,
          ];

          const rawEmail = Buffer.from(emailLines.join("\r\n"))
            .toString("base64")
            .replace(/\+/g, "-")
            .replace(/\//g, "_")
            .replace(/=+$/, "");

          const sendResponse = await fetch(
            "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ raw: rawEmail }),
            },
          );

          if (!sendResponse.ok) {
            const errorData = await sendResponse.json().catch(() => ({}));
            console.error("Gmail send error:", sendResponse.status, errorData);
            return {
              error:
                errorData?.error?.message ||
                "Failed to send email. Please check the recipient address and try again.",
            };
          }

          const sendData = await sendResponse.json();
          return {
            success: true,
            messageId: sendData.id,
            info: `Email sent successfully to ${to}`,
          };
        }

        // ============ REPLY ACTION ============
        if (action === "reply") {
          if (!messageId) {
            return {
              error:
                "Missing 'messageId'. Please provide the ID of the email to reply to.",
            };
          }
          if (!message) {
            return {
              error: "Missing 'message'. Please provide your reply content.",
            };
          }
          if (!approvalToken || !to || !subject) {
            return {
              error:
                "Reply sending requires the user-approved recipient, subject, and approval token from proposeEmail.",
            };
          }

          // Get original message details
          const origResponse = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Message-ID&metadataHeaders=Reply-To`,
            { headers: { Authorization: `Bearer ${accessToken}` } },
          );

          if (!origResponse.ok) {
            const errorData = await origResponse.json().catch(() => ({}));
            console.error(
              "Gmail reply fetch error:",
              origResponse.status,
              errorData,
            );
            return {
              error:
                errorData?.error?.message ||
                "Failed to fetch original message. The message ID might be invalid.",
            };
          }

          const origData = await origResponse.json();
          const origHeaders = origData.payload?.headers || [];

          const origSubject = getHeader(origHeaders, "Subject")
            .replace(/[\r\n]+/g, " ")
            .trim();
          const origMessageId = getHeader(origHeaders, "Message-ID");
          const origThreadId = origData.threadId;

          // Determine reply recipient
          const replyTo = to.trim();

          if (!replyTo) {
            return {
              error:
                "Could not determine reply recipient. Please provide the 'to' field.",
            };
          }

          const replySubject = origSubject.startsWith("Re:")
            ? origSubject
            : `Re: ${origSubject}`;
          if (subject.trim() !== replySubject) {
            return {
              error:
                "The approved reply subject no longer matches the original email. Ask the user to review it again.",
            };
          }
          const approvedPayload = emailApprovalPayloadSchema.safeParse({
            action: "reply",
            messageId,
            to: replyTo,
            subject: replySubject,
            body: message.trim(),
          });
          if (
            !approvedPayload.success ||
            !(await emailApprovalRepository.consume(
              userId,
              approvalToken,
              approvedPayload.data,
            ))
          ) {
            return {
              error:
                "This reply was not approved, its approval expired, or reviewed fields changed. Ask the user to review it again.",
            };
          }

          // Build RFC 2822 reply email
          const emailLines = [
            `From: ${connector.email}`,
            `To: ${replyTo}`,
            `Subject: ${replySubject}`,
            origMessageId ? `In-Reply-To: ${origMessageId}` : "",
            origMessageId ? `References: ${origMessageId}` : "",
            "MIME-Version: 1.0",
            "Content-Type: text/html; charset=utf-8",
            "",
            message.includes("<")
              ? message
              : `<p>${message.replace(/\n/g, "<br>")}</p>`,
          ].filter(Boolean);

          const rawEmail = Buffer.from(emailLines.join("\r\n"))
            .toString("base64")
            .replace(/\+/g, "-")
            .replace(/\//g, "_")
            .replace(/=+$/, "");

          const sendResponse = await fetch(
            "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                raw: rawEmail,
                threadId: origThreadId,
              }),
            },
          );

          if (!sendResponse.ok) {
            const errorData = await sendResponse.json().catch(() => ({}));
            console.error(
              "Gmail reply send error:",
              sendResponse.status,
              errorData,
            );
            return {
              error:
                errorData?.error?.message ||
                "Failed to send reply. Please try again.",
            };
          }

          const sendData = await sendResponse.json();
          return {
            success: true,
            messageId: sendData.id,
            threadId: origThreadId,
            info: `Reply sent successfully to ${replyTo}`,
          };
        }

        return {
          error: `Unknown action: ${action}. Valid actions are: inbox, read, send, reply`,
        };
      } catch (error) {
        console.error("Gmail tool error:", error);
        return {
          error:
            error instanceof Error
              ? error.message
              : "Gmail operation failed. Please try again.",
        };
      }
    },
  });
}

// Default tool (without user context - will return error)
export const gmailTool = createTool({
  description: `Gmail integration tool - Read inbox, view emails, compose new emails, and reply to emails.

Actions:
- inbox: List recent emails from inbox (optional: maxResults, query for filtering)
- read: Read a specific email (requires: messageId)
- send: Compose and send a new email (requires: to, subject, message)
- reply: Reply to an existing email (requires: messageId, message)

  IMPORTANT: 
  - User must connect Gmail first via Connectors menu.
  - After receiving results, ALWAYS summarize the email information in a friendly, readable format for the user.`,
  inputSchema: gmailToolZodSchema,
  execute: async () => {
    return {
      error:
        "Gmail tool requires user context. This should not happen in normal operation.",
    };
  },
});
