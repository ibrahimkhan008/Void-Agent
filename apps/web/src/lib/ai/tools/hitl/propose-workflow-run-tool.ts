import { tool } from "ai";
import { savedWorkflowRunProposalSchema } from "./workflow-run-approval";

/**
 * Pauses chat and asks the user to review a saved workflow's exact effects and
 * input before an execution token is issued. The browser card, not the model,
 * performs the authenticated review and approval request.
 */
export const proposeWorkflowRunTool = tool({
  description:
    "Present a saved workflow run for explicit user review. Use this before calling any saved workflow tool. Provide its exact UUID, exact published workflow name, approval token field supplied by that workflow tool, and the exact input payload. The user sees the workflow's current reviewed effects and this payload. No execution token is issued until the user approves. After approval, use the returned one-use approvalToken and the exact unchanged payload in the matching workflow tool call. If rejected or review fails, do not execute.",
  inputSchema: savedWorkflowRunProposalSchema,
  // No execute: only the review card can obtain a server-bound one-use token.
});
