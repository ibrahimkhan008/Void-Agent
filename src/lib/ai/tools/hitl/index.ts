import { tool } from "ai";
import { DefaultToolName } from "lib/ai/tools";
import { z } from "zod";
import { calendarApprovalPayloadSchema } from "./calendar-approval";
import { driveFileApprovalSchema } from "./drive-file-approval";
import { freshdeskProposalInputSchema } from "./freshdesk-approval";
import { httpRequestApprovalSchema } from "./http-request-approval";
import { jiraCommentApprovalSchema } from "./jira-approval";
import { linearIssueApprovalSchema } from "./linear-approval";
import { mcpToolApprovalSchema } from "./mcp-tool-approval";
import { messagingApprovalSchema } from "./messaging-approval";
import { slackMessageApprovalSchema } from "./slack-approval";
import { taskCreationApprovalSchema } from "./task-creation-approval";
import { workflowRunApprovalSchema } from "./workflow-run-approval";
import { zendeskCommentApprovalSchema } from "./zendesk-approval";

const planTodoSchema = z.object({
  text: z.string().trim().min(1).max(500),
  status: z.enum(["pending", "in_progress", "completed"]),
});

export const askForPlanApprovalInputSchema = z.object({
  explainer: z.string().trim().min(1).max(2000),
  todos: z.array(planTodoSchema).min(1).max(12),
});

export const askForPlanApprovalTool = tool({
  description:
    "Before a complex multi-step task, present a concise proposed plan and wait for the user's approval, rejection, or requested changes. Do not begin the plan's actions before approval.",
  inputSchema: askForPlanApprovalInputSchema,
});

const requestInputQuestionSchema = z.object({
  header: z.string().trim().min(1).max(40),
  question: z.string().trim().min(1).max(1000),
  options: z.array(z.string().trim().min(1).max(160)).max(8).optional(),
});

export const requestInputInputSchema = z.object({
  questions: z.array(requestInputQuestionSchema).min(1).max(4),
});

export const requestInputTool = tool({
  description:
    "When important information is missing and only the user can provide it, ask up to four concise questions in one call and wait for their answers. Do not ask users to provide passwords, API keys, or other secrets in chat.",
  inputSchema: requestInputInputSchema,
});

export const proposeEmailInputSchema = z.object({
  action: z.enum(["send", "reply"]).default("send"),
  messageId: z.string().trim().regex(/^[A-Za-z0-9_-]{1,256}$/).optional(),
  to: z.string().trim().email().max(320),
  subject: z.string().trim().min(1).max(500).refine((value) => !/[\r\n]/.test(value)),
  body: z.string().trim().min(1).max(12000),
}).superRefine((input, ctx) => {
  if (input.action === "reply" && !input.messageId) {
    ctx.addIssue({ code: "custom", path: ["messageId"], message: "A reply must identify the message being replied to." });
  }
});

export const proposeEmailTool = tool({
  description:
    "Before sending or replying to an email, draft it and ask the user to review the recipient, subject, full message, and (for replies) exact messageId. Wait for explicit approval. The review card issues a short-lived, single-use authorization bound to these exact fields. Pass its approvalToken and the exact approved values to the Gmail tool; never substitute fields. Missing authorization means do not send.",
  inputSchema: proposeEmailInputSchema,
});

export const proposeCalendarChangeTool = tool({
  description:
    "Before creating, updating, or deleting a Google Calendar event, present the exact event change for user review. Wait for explicit approval. The review card returns a short-lived single-use approvalToken bound to the exact action and fields. Pass that token and the identical fields to the Google Calendar tool; never alter or reuse it.",
  inputSchema: calendarApprovalPayloadSchema,
});

export const proposeLinearIssueTool = tool({
  description:
    "Before creating a Linear issue, show the user the exact team, title, and description for review. Wait for explicit approval; then pass the review card's exact fields and single-use approvalToken to the Linear tool. Never create an issue without that token.",
  inputSchema: linearIssueApprovalSchema,
});

export const proposeJiraCommentTool = tool({
  description:
    "Before adding a comment to Jira, show the exact issue key and full comment for user review. Wait for explicit approval; then perform only the reviewed comment with its short-lived single-use token.",
  inputSchema: jiraCommentApprovalSchema,
});

export const proposeZendeskCommentTool = tool({
  description:
    "Before adding a Zendesk ticket comment, show the exact ticket ID and full comment for user review. Wait for explicit approval; then perform only the reviewed comment with its short-lived single-use token.",
  inputSchema: zendeskCommentApprovalSchema,
});

export const proposeFreshdeskActionTool = tool({
  description:
    "Before creating a Freshdesk ticket or replying to one, show the complete exact action and fields for user review. Wait for explicit approval and pass the short-lived one-use approvalToken with those exact fields to the Freshdesk tool.",
  inputSchema: freshdeskProposalInputSchema,
});

export const proposeExternalMessageTool = tool({
  description:
    "Before sending an external message through Teams, Discord, or Zulip, ask for explicit user review of the provider, destination, topic (Zulip), and exact text. Pass the returned one-use approvalToken with those exact values to the corresponding connector tool. Never change a field after approval.",
  inputSchema: messagingApprovalSchema,
});

export const proposeTaskCreationTool = tool({
  description:
    "Before creating an Asana or ClickUp task or a Productboard feature, ask the user to review the exact provider, target ID, name, and details. Only after approval pass those unchanged fields and the returned one-use approvalToken to the matching connector.",
  inputSchema: taskCreationApprovalSchema,
});

export const proposeDriveFileTool = tool({
  description:
    "Before creating a Google Drive text file, show the exact file name and complete content for the user to review and edit. Wait for explicit approval, then pass the exact fields and returned one-use approvalToken to the Drive connector.",
  inputSchema: driveFileApprovalSchema,
});

export const proposeSlackMessageTool = tool({
  description:
    "Before posting to Slack, show the exact channel ID and full message to the user. Wait for explicit approval; then send only the reviewed payload with its single-use approvalToken.",
  inputSchema: slackMessageApprovalSchema,
});

export const proposeWorkflowRunTool = tool({
  description:
    "Before running a configured Windmill or Activepieces automation or a saved workflow, show the user its platform, exact target, and complete JSON input for review. For saved-workflow also include the exact workflowName and approvalTokenField from that workflow tool's description. Wait for approval, then pass unchanged fields and the returned token under that exact field. Do not run rejected or changed values.",
  inputSchema: workflowRunApprovalSchema,
});

export const proposeMcpToolCallTool = tool({
  description:
    "Before calling any remote MCP tool, show the user the exact server, tool name, and complete JSON arguments for review. Wait for explicit approval. Pass the one-use approvalToken and identical arguments to the MCP tool. Read-only tools also require approval because MCP servers declare their own effects.",
  inputSchema: mcpToolApprovalSchema,
});

export const proposeHttpRequestTool = tool({
  description: "Before making any outbound HTTP request, show the user the exact HTTPS URL, method, headers, body, and timeout. Wait for explicit approval. The review card returns a short-lived one-use token bound to those exact values; pass the token and identical request fields to httpFetch. Never send an unreviewed or modified request.",
  inputSchema: httpRequestApprovalSchema,
});

export const createAgentInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(8000).optional(),
  role: z.string().trim().max(200).optional(),
  systemPrompt: z.string().trim().min(1).max(12000),
  tools: z.array(z.nativeEnum(DefaultToolName)).max(20).optional(),
});

export const createAgentTool = tool({
  description:
    "Propose saving the current work as a reusable agent when the user asks for one. Include only relevant built-in tools from the available tool list. The user reviews and edits the name, description, role, instructions, and tools before an authenticated API creates it. Never claim it is saved until the user confirms.",
  inputSchema: createAgentInputSchema,
});

export const loadHitlTools = () => ({
  askForPlanApproval: askForPlanApprovalTool,
  requestInput: requestInputTool,
  proposeEmail: proposeEmailTool,
  proposeCalendarChange: proposeCalendarChangeTool,
  proposeLinearIssue: proposeLinearIssueTool,
  proposeJiraComment: proposeJiraCommentTool,
  proposeZendeskComment: proposeZendeskCommentTool,
  proposeFreshdeskAction: proposeFreshdeskActionTool,
  proposeExternalMessage: proposeExternalMessageTool,
  proposeTaskCreation: proposeTaskCreationTool,
  proposeDriveFile: proposeDriveFileTool,
  proposeSlackMessage: proposeSlackMessageTool,
  proposeWorkflowRun: proposeWorkflowRunTool,
  proposeMcpToolCall: proposeMcpToolCallTool,
  proposeHttpRequest: proposeHttpRequestTool,
  createAgent: createAgentTool,
});

export const HITL_TOOL_GUIDANCE = `Human-in-the-loop tools:
- Before any outbound HTTP request, use proposeHttpRequest to show the exact URL, method, headers, body, and timeout. Make only the exact HTTPS request explicitly approved by the user with its one-use token.
- Before running a Windmill/Activepieces automation or saved workflow, use proposeWorkflowRun to show the exact target and complete JSON input. For saved workflows include workflowName and approvalTokenField exactly as exposed by the workflow tool. Run only reviewed values with the one-use token; discovery is read-only.
- Before calling a remote MCP tool, use proposeMcpToolCall to show the server, tool and complete arguments. Execute only the exact reviewed call with its one-use token.
- For a complex multi-step task with consequential actions, use askForPlanApproval to show the user the proposed steps and wait for the response before acting on the plan.
- When essential details are missing and only the user can supply them, use requestInput to ask the related questions together, then wait for the answers.
- Before sending an email, use proposeEmail. Send only the user-approved recipient, subject, and body returned by the tool; never send a rejected draft.
- Before creating, changing, or deleting a Google Calendar event, use proposeCalendarChange. Perform only the exact user-approved action and values with the returned single-use token; deletes require an explicit review card.
- Before creating a Linear issue, use proposeLinearIssue and create only the exact user-approved team, title, and description with its single-use token.
- Before adding a Jira issue comment, use proposeJiraComment and add only the exact user-approved issue key and comment with its single-use token.
- Before adding a Zendesk ticket comment, use proposeZendeskComment and add only the exact user-approved ticket ID and comment with its single-use token.
- Before creating a Freshdesk ticket or replying to one, use proposeFreshdeskAction and perform only the exact user-approved action and fields with its one-use token.
- Before sending a Teams, Discord, or Zulip message, use proposeExternalMessage and pass only the exact user-approved provider, destination, topic, and content with its one-use token.
- Before creating an Asana/ClickUp task or Productboard feature, use proposeTaskCreation and pass only the exact user-approved target and content with its one-use token.
- Before creating a Google Drive file, use proposeDriveFile and pass only the exact user-approved name and content with its one-use token.
- Before posting a Slack message, use proposeSlackMessage and send only the exact reviewed channel and text with its single-use token.
- When the user asks to save reusable instructions as an agent, use createAgent and wait for the user to review and confirm the editable draft.
- When the user asks to compare multiple available Knowledge documents or extract the same fields from them, use createTabularReview with the exact available item IDs and concise columns. The tool creates a review; the user can open it to run cell extraction and export the result.
- Never request passwords, API keys, recovery codes, or other secrets through requestInput. These tools collect decisions and context; they do not authorize bypassing any tool's own permission checks.`;
