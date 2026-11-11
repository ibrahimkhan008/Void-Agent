import { createHash } from "node:crypto";
import { z } from "zod";

const PlainText = z.string().min(1).max(20_000);

// Action names intentionally repeat across providers (for example
// create_task), so the top-level schema must discriminate by the full union
// value rather than the action field alone.
export const connectorActionApprovalSchema = z.union([
  z
    .object({
      provider: z.literal("gmail"),
      action: z.literal("send"),
      payload: z
        .object({
          to: z.string().email().max(320),
          subject: z.string().min(1).max(500),
          message: PlainText,
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      provider: z.literal("gmail"),
      action: z.literal("reply"),
      payload: z
        .object({
          messageId: z.string().min(1).max(256),
          message: PlainText,
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      provider: z.literal("google-drive"),
      action: z.literal("create"),
      payload: z
        .object({
          name: z.string().min(1).max(256),
          mimeType: z.string().max(128).optional(),
          content: z.string().max(100_000),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      provider: z.literal("teams"),
      action: z.literal("send_chat_message"),
      payload: z
        .object({
          chatId: z.string().min(1).max(256),
          message: PlainText,
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      provider: z.literal("asana"),
      action: z.literal("create_task"),
      payload: z
        .object({
          projectGid: z.string().min(1).max(128),
          name: z.string().min(1).max(500),
          notes: z.string().max(20_000).optional(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      provider: z.literal("clickup"),
      action: z.literal("create_task"),
      payload: z
        .object({
          listId: z.string().min(1).max(128),
          name: z.string().min(1).max(500),
          description: z.string().max(20_000).optional(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      provider: z.literal("linear"),
      action: z.literal("create_issue"),
      payload: z
        .object({
          teamId: z.string().min(1).max(128),
          title: z.string().min(1).max(500),
          description: z.string().max(20_000).optional(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      provider: z.literal("jira"),
      action: z.literal("add_comment"),
      payload: z
        .object({
          cloudId: z.string().uuid(),
          issueKey: z.string().regex(/^[A-Z][A-Z0-9_]{0,29}-[1-9][0-9]{0,9}$/),
          comment: PlainText,
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      provider: z.literal("zendesk"),
      action: z.literal("add_comment"),
      payload: z
        .object({
          ticketId: z.string().regex(/^[1-9][0-9]{0,18}$/),
          comment: PlainText,
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      provider: z.literal("freshdesk"),
      action: z.literal("create_ticket"),
      payload: z
        .object({
          name: z.string().min(1).max(256),
          email: z.string().email().max(320),
          subject: z.string().min(1).max(500),
          description: PlainText,
          status: z.union([
            z.literal(2),
            z.literal(3),
            z.literal(4),
            z.literal(5),
          ]),
          priority: z.union([
            z.literal(1),
            z.literal(2),
            z.literal(3),
            z.literal(4),
          ]),
          source: z.literal(2),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      provider: z.literal("freshdesk"),
      action: z.literal("add_reply"),
      payload: z
        .object({
          ticketId: z.string().regex(/^[1-9][0-9]{0,18}$/),
          body: PlainText,
        })
        .strict(),
    })
    .strict(),
  // Productboard API v2 requires a feature to be created under an existing
  // parent, so the approval binds the target component (never a product or
  // another feature) plus the exact allowed fields.
  z
    .object({
      provider: z.literal("productboard"),
      action: z.literal("create_feature"),
      payload: z
        .object({
          componentId: z.string().uuid(),
          name: z.string().min(1).max(255),
          description: z.string().min(1).max(20_000).optional(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      provider: z.literal("zulip"),
      action: z.literal("send_message"),
      payload: z
        .object({
          stream: z.string().min(1).max(256),
          topic: z.string().min(1).max(256),
          content: PlainText,
        })
        .strict(),
    })
    .strict(),
]);

export type ConnectorActionApproval = z.infer<
  typeof connectorActionApprovalSchema
>;

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalize(nested)]),
    );
  }
  return value;
}

export function hashConnectorActionApproval(
  payload: ConnectorActionApproval,
): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(payload)))
    .digest("hex");
}

export function hashConnectorActionApprovalToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
