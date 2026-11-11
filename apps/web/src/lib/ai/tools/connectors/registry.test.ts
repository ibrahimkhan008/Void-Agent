import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("lib/connectors/provider-api", () => ({
  callConnectorApi: vi.fn(),
  ConnectorApiError: class ConnectorApiError extends Error {},
}));
vi.mock(
  "lib/db/pg/repositories/connector-action-approval-repository.pg",
  () => ({
    connectorActionApprovalRepository: { consume: vi.fn() },
  }),
);
vi.mock("lib/db/pg/db.pg", () => ({ pgDb: { select: vi.fn() } }));
vi.mock("lib/db/pg/schema.pg", () => ({
  UserConnectorTable: {
    provider: "provider",
    email: "email",
    isConnected: "isConnected",
    isPaused: "isPaused",
    userId: "userId",
  },
}));
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((column, value) => ({ column, value })),
}));

import { DefaultToolName } from "lib/ai/tools";
import { createConnectorToolsForUser } from "./registry";

describe("direct connector tool registry", () => {
  it("registers the source's core connector tools as user-bound executable tools", () => {
    const tools = createConnectorToolsForUser("owner-1");
    for (const name of [
      DefaultToolName.Gmail,
      DefaultToolName.GoogleDrive,
      DefaultToolName.GoogleCalendar,
      DefaultToolName.GitHub,
      DefaultToolName.Outlook,
      DefaultToolName.Slack,
      DefaultToolName.Notion,
      DefaultToolName.Teams,
      DefaultToolName.ConnectorsList,
      DefaultToolName.Jira,
      DefaultToolName.Zendesk,
      DefaultToolName.Freshdesk,
      DefaultToolName.Productboard,
      DefaultToolName.Zulip,
    ]) {
      expect(tools[name]).toBeDefined();
      expect((tools[name] as any).execute).toBeTypeOf("function");
    }
  });

  it("does not create provider tools without authenticated user context", () => {
    expect(createConnectorToolsForUser("")).toEqual({});
  });
});
