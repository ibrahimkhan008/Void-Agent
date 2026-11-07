import { DefaultToolName } from "lib/ai/tools";
import { describe, expect, it } from "vitest";
import {
  HITL_TOOL_GUIDANCE,
  askForPlanApprovalInputSchema,
  createAgentInputSchema,
  proposeEmailInputSchema,
  requestInputInputSchema,
} from ".";
import { calendarApprovalPayloadSchema } from "./calendar-approval";
import { jiraCommentApprovalSchema } from "./jira-approval";
import { linearIssueApprovalSchema } from "./linear-approval";
import { slackMessageApprovalSchema } from "./slack-approval";

describe("human-in-the-loop tool schemas", () => {
  it("keeps plan approval proportional and preserves effect-specific server gates", () => {
    expect(HITL_TOOL_GUIDANCE).toMatch(
      /read-only.*does not need plan approval/i,
    );
    expect(HITL_TOOL_GUIDANCE).toMatch(
      /single action.*own action-specific review/i,
    );
    expect(HITL_TOOL_GUIDANCE).toMatch(
      /plan approval is not an execution credential/i,
    );
    expect(HITL_TOOL_GUIDANCE).toMatch(
      /exact-payload, single-use approval token/i,
    );
  });

  it("asks for related missing details together without requesting secrets", () => {
    expect(HITL_TOOL_GUIDANCE).toMatch(/one requestInput call/i);
    expect(HITL_TOOL_GUIDANCE).toMatch(/never ask for secrets/i);
    expect(
      requestInputInputSchema.safeParse({
        questions: Array.from({ length: 4 }, (_, index) => ({
          header: `Q${index + 1}`,
          question: "Which option should I use?",
          options: ["A", "B"],
        })),
      }).success,
    ).toBe(true);
  });

  it("offers plan approval with bounded, non-empty steps", () => {
    expect(
      askForPlanApprovalInputSchema.safeParse({
        explainer: "Update the report",
        todos: [{ text: "Review sources", status: "pending" }],
      }).success,
    ).toBe(true);
    expect(
      askForPlanApprovalInputSchema.safeParse({
        explainer: "",
        todos: [],
      }).success,
    ).toBe(false);
  });

  it("collects at most four non-secret-context questions", () => {
    expect(
      requestInputInputSchema.safeParse({
        questions: [
          { header: "Format", question: "Which format should I use?" },
        ],
      }).success,
    ).toBe(true);
    expect(
      requestInputInputSchema.safeParse({
        questions: Array.from({ length: 5 }, (_, index) => ({
          header: `Q${index}`,
          question: "Please clarify",
        })),
      }).success,
    ).toBe(false);
  });

  it("requires a valid and bounded email draft", () => {
    expect(
      proposeEmailInputSchema.safeParse({
        to: "person@example.com",
        subject: "Project update",
        body: "The review is complete.",
      }).success,
    ).toBe(true);
    expect(
      proposeEmailInputSchema.safeParse({
        to: "not-an-address",
        subject: "",
        body: "",
      }).success,
    ).toBe(false);
  });

  it("requires editable reusable agent instructions", () => {
    expect(
      createAgentInputSchema.safeParse({
        name: "Research helper",
        systemPrompt: "Find primary sources and summarize them.",
      }).success,
    ).toBe(true);
    expect(
      createAgentInputSchema.safeParse({ name: "", systemPrompt: "" }).success,
    ).toBe(false);
  });

  it("accepts only a complete bounded recurring schedule in an agent proposal", () => {
    const base = {
      name: "Daily analyst",
      systemPrompt: "Summarize the report.",
    };
    expect(
      createAgentInputSchema.safeParse({
        ...base,
        schedule: {
          cronExpression: "0 9 * * 1-5",
          timezone: "America/New_York",
          inputPrompt: "Review the latest report and summarize changes.",
        },
      }).success,
    ).toBe(true);
    expect(
      createAgentInputSchema.safeParse({
        ...base,
        schedule: {
          cronExpression: "0 9 * * *",
          timezone: "",
          inputPrompt: "run",
        },
      }).success,
    ).toBe(false);
  });

  it("accepts an optional bounded provider/model pin", () => {
    expect(
      createAgentInputSchema.safeParse({
        name: "Pinned analyst",
        systemPrompt: "Use the selected model.",
        model: "flare/openai/gpt-oss-120b",
      }).success,
    ).toBe(true);
    expect(
      createAgentInputSchema.safeParse({
        name: "Bad pin",
        systemPrompt: "Use the selected model.",
        model: "no-provider-separator",
      }).success,
    ).toBe(false);
  });

  it("accepts only a bounded list of built-in tools for agent proposals", () => {
    expect(
      createAgentInputSchema.safeParse({
        name: "Research helper",
        systemPrompt: "Use primary sources.",
        tools: [DefaultToolName.PythonExecution, DefaultToolName.WebSearch],
      }).success,
    ).toBe(true);
    expect(
      createAgentInputSchema.safeParse({
        name: "Research helper",
        systemPrompt: "Use primary sources.",
        tools: ["mcpServer:attacker"],
      }).success,
    ).toBe(false);
    expect(
      createAgentInputSchema.safeParse({
        name: "Research helper",
        systemPrompt: "Use primary sources.",
        tools: Array.from({ length: 21 }, () => "python-execution"),
      }).success,
    ).toBe(false);
  });

  it("requires a complete bounded event proposal before calendar approval", () => {
    expect(
      calendarApprovalPayloadSchema.safeParse({
        action: "delete_event",
        eventId: "event-1",
        summary: "Planning meeting",
        start: "2026-06-03T10:00:00Z",
        end: "2026-06-03T11:00:00Z",
      }).success,
    ).toBe(true);
    expect(
      calendarApprovalPayloadSchema.safeParse({
        action: "delete_event",
        eventId: "event-1",
      }).success,
    ).toBe(false);
  });

  it("requires an exact bounded team and issue draft for Linear approval", () => {
    const issue = {
      teamId: "00000000-0000-4000-8000-000000000001",
      title: "Fix launch blocker",
      description: "Investigate the failing workflow.",
    };
    expect(linearIssueApprovalSchema.safeParse(issue).success).toBe(true);
    expect(
      linearIssueApprovalSchema.safeParse({ ...issue, unexpected: true })
        .success,
    ).toBe(false);
    expect(
      linearIssueApprovalSchema.safeParse({ ...issue, title: "" }).success,
    ).toBe(false);
  });

  it("requires a bounded channel and exact message for Slack approval", () => {
    expect(
      slackMessageApprovalSchema.safeParse({
        channelId: "C123",
        text: "Reviewed update.",
      }).success,
    ).toBe(true);
    expect(
      slackMessageApprovalSchema.safeParse({
        channelId: "C123",
        text: " ",
        extra: true,
      }).success,
    ).toBe(false);
  });

  it("requires an issue key and bounded exact Jira comment", () => {
    expect(
      jiraCommentApprovalSchema.safeParse({
        issueKey: "PROJ-123",
        comment: "Reviewed finding.",
      }).success,
    ).toBe(true);
    expect(
      jiraCommentApprovalSchema.safeParse({
        issueKey: "../123",
        comment: "Reviewed finding.",
      }).success,
    ).toBe(false);
    expect(
      jiraCommentApprovalSchema.safeParse({
        issueKey: "PROJ-123",
        comment: " ",
        extra: true,
      }).success,
    ).toBe(false);
  });
});
