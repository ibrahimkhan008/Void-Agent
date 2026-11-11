import { tool } from "ai";
import { connectorActionApprovalSchema } from "./connector-action-approval";

/**
 * Proposal-only tool. It has no server execute function; the review UI mints
 * an owner-bound, one-use exact-payload token only after the user approves.
 */
export const proposeConnectorActionTool = tool({
  description:
    "Present an external connector write for explicit user review. Use this before Gmail send/reply, Google Drive file creation, Teams chat messages, Asana or ClickUp task creation, Linear issue creation, Freshdesk ticket creation/replies, Jira/Zendesk comments, Productboard feature creation (child of an existing component), or Zulip stream messages. The user must approve the exact provider, action, and payload before the corresponding connector tool can execute. If rejected, do not call the write action.",
  inputSchema: connectorActionApprovalSchema,
});
