import { AgentInstructionsSchema } from "app-types/agent";
import { DefaultToolName } from "lib/ai/tools";
import { describe, expect, it } from "vitest";
import {
  MAX_AGENT_DEFAULT_TOOLS,
  defaultToolMentionsFromNames,
  normalizeDefaultToolNames,
} from "./default-tool-mentions";

describe("CreateAgent built-in tool normalization", () => {
  it("keeps only known built-in names and removes duplicates", () => {
    expect(
      normalizeDefaultToolNames([
        DefaultToolName.PythonExecution,
        "unknown-tool",
        DefaultToolName.PythonExecution,
        DefaultToolName.WebSearch,
      ]),
    ).toEqual([DefaultToolName.PythonExecution, DefaultToolName.WebSearch]);
  });

  it("caps a proposal to the supported maximum", () => {
    const names = Object.values(DefaultToolName);
    expect(normalizeDefaultToolNames(names)).toHaveLength(
      Math.min(names.length, MAX_AGENT_DEFAULT_TOOLS),
    );
  });

  it("maps names only to the persisted defaultTool mention variant", () => {
    expect(
      defaultToolMentionsFromNames([
        DefaultToolName.PythonExecution,
        { type: "mcpServer", serverId: "attacker-controlled" },
      ]),
    ).toEqual([
      {
        type: "defaultTool",
        name: DefaultToolName.PythonExecution,
        label: DefaultToolName.PythonExecution,
      },
    ]);
  });

  it("produces mentions accepted by the persisted agent instruction schema", () => {
    const mentions = defaultToolMentionsFromNames([
      DefaultToolName.WebSearch,
      DefaultToolName.PythonExecution,
    ]);

    expect(
      AgentInstructionsSchema.parse({
        systemPrompt: "Use the selected capabilities.",
        mentions,
      }).mentions,
    ).toEqual(mentions);
  });
});
