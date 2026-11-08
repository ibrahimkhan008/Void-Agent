import { describe, expect, it } from "vitest";
import { agentMentionsMcpTool } from "./voice-agent-mcp-access";

const serverId = "server-1";

describe("agentMentionsMcpTool", () => {
  it("accepts only an exact configured tool or an explicitly attached server", () => {
    expect(
      agentMentionsMcpTool(
        [{ type: "mcpTool", serverId, name: "update_record" }],
        serverId,
        "update_record",
      ),
    ).toBe(true);
    expect(
      agentMentionsMcpTool(
        [{ type: "mcpServer", serverId, name: "CRM" }],
        serverId,
        "update_record",
      ),
    ).toBe(true);
  });

  it("rejects tools absent from the selected agent and non-MCP mentions", () => {
    expect(
      agentMentionsMcpTool(
        [{ type: "mcpTool", serverId, name: "read_record" }],
        serverId,
        "update_record",
      ),
    ).toBe(false);
    expect(
      agentMentionsMcpTool(
        [
          {
            type: "defaultTool",
            name: "searchWeb",
            label: "Web search",
          },
        ],
        serverId,
        "update_record",
      ),
    ).toBe(false);
    expect(agentMentionsMcpTool(undefined, serverId, "update_record")).toBe(
      false,
    );
  });
});
