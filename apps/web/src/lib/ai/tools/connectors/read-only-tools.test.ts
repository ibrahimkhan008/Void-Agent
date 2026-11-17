import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ api: vi.fn() }));

vi.mock(
  "lib/db/pg/repositories/connector-action-approval-repository.pg",
  () => ({
    connectorActionApprovalRepository: { consume: vi.fn(async () => false) },
  }),
);
vi.mock("lib/connectors/provider-api", () => ({
  callConnectorApi: mocks.api,
  ConnectorApiError: class ConnectorApiError extends Error {},
}));

import { createCalendarToolForUser } from "./calendar-tool";
import { createGitHubToolForUser } from "./github-tool";
import { createNotionToolForUser } from "./notion-tool";
import { createOutlookToolForUser } from "./outlook-tool";
import { createSlackToolForUser } from "./slack-tool";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.api.mockImplementation(
    async (_user: string, _provider: string, path: string) => {
      if (path === "/calendar/v3/calendars/primary/events")
        return { items: [{ id: "event-1" }] };
      if (path === "/user/repos")
        return { items: [{ id: "repo-1", full_name: "owner/project" }] };
      if (path === "/v1.0/me/messages") return { value: [{ id: "mail-1" }] };
      if (path === "/api/conversations.list")
        return { ok: true, channels: [{ id: "channel-1" }] };
      if (path === "/v1/search")
        return { results: [{ id: "page-1", url: "https://notion.test/page" }] };
      return {};
    },
  );
});

describe("read-only connector tools", () => {
  it("limits Google Calendar listing and scopes calls to the owner", async () => {
    const tool = createCalendarToolForUser("calendar-owner") as any;
    const parsed = tool.inputSchema.safeParse({
      action: "list",
      maxResults: 21,
    });
    expect(parsed.success).toBe(false);
    const result = await tool.execute({ action: "list", maxResults: 20 }, {});
    expect(result.events).toHaveLength(1);
    expect(mocks.api).toHaveBeenCalledWith(
      "calendar-owner",
      "google-calendar",
      "/calendar/v3/calendars/primary/events",
      expect.objectContaining({
        query: expect.objectContaining({ maxResults: 20 }),
      }),
    );
  });

  it("keeps GitHub actions read-only and lists repositories for the owner", async () => {
    const tool = createGitHubToolForUser("github-owner") as any;
    expect(
      tool.inputSchema.safeParse({
        action: "create_issue",
        repository: "owner/project",
        title: "no",
      }).success,
    ).toBe(false);
    const result = await tool.execute(
      { action: "list_repos", maxResults: 5 },
      {},
    );
    expect(result.repositories).toHaveLength(1);
    expect(mocks.api).toHaveBeenCalledWith(
      "github-owner",
      "github",
      "/user/repos",
      expect.objectContaining({
        query: expect.objectContaining({ per_page: 5 }),
      }),
    );
  });

  it("limits Outlook inbox results and has no write action", async () => {
    const tool = createOutlookToolForUser("outlook-owner") as any;
    expect(
      tool.inputSchema.safeParse({
        action: "send",
        to: "person@example.test",
        body: "no",
      }).success,
    ).toBe(false);
    const result = await tool.execute({ action: "inbox", maxResults: 20 }, {});
    expect(result.messages).toHaveLength(1);
    expect(mocks.api).toHaveBeenCalledWith(
      "outlook-owner",
      "outlook",
      "/v1.0/me/messages",
      expect.objectContaining({
        query: expect.objectContaining({ $top: 20 }),
      }),
    );
  });

  it("limits Slack history and exposes no message-post action", async () => {
    const tool = createSlackToolForUser("slack-owner") as any;
    expect(
      tool.inputSchema.safeParse({
        action: "send_message",
        channelId: "channel-1",
        message: "no",
      }).success,
    ).toBe(false);
    const result = await tool.execute(
      { action: "list_channels", maxResults: 100 },
      {},
    );
    expect(result.channels).toHaveLength(1);
    expect(mocks.api).toHaveBeenCalledWith(
      "slack-owner",
      "slack",
      "/api/conversations.list",
      expect.objectContaining({
        query: expect.objectContaining({ limit: 100 }),
      }),
    );
  });

  it("searches Notion as a read-only provider operation with a bounded result set", async () => {
    const tool = createNotionToolForUser("notion-owner") as any;
    expect(
      tool.inputSchema.safeParse({ action: "create_page", title: "no" })
        .success,
    ).toBe(false);
    const result = await tool.execute(
      { action: "search", query: "launch", maxResults: 20 },
      {},
    );
    expect(result.pages).toHaveLength(1);
    expect(mocks.api).toHaveBeenCalledWith(
      "notion-owner",
      "notion",
      "/v1/search",
      expect.objectContaining({
        method: "POST",
        body: expect.objectContaining({ page_size: 20 }),
      }),
    );
  });
});
