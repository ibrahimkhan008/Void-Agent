import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ call: vi.fn() }));

vi.mock("lib/connectors/provider-api", () => ({
  callConnectorApi: mocks.call,
  ConnectorApiError: class ConnectorApiError extends Error {},
}));

import { createGitLabToolForUser } from "./gitlab-tool";

beforeEach(() => mocks.call.mockReset());

describe("GitLab connector tool", () => {
  it("lists bounded project fields for the authenticated owner", async () => {
    mocks.call.mockResolvedValue({
      items: [
        {
          id: 42,
          name: "Void Agent",
          path_with_namespace: "owner/void-agent",
          web_url: "https://gitlab.com/owner/void-agent",
          description: "private description",
          last_activity_at: "2026-11-17T10:00:00Z",
          runners_token: "must-not-leak",
        },
      ],
    });
    const tool = createGitLabToolForUser("user-1");

    await expect(
      tool.execute?.(
        { action: "list_projects", limit: 10 } as never,
        {} as never,
      ),
    ).resolves.toEqual({
      projects: [
        {
          id: 42,
          name: "Void Agent",
          pathWithNamespace: "owner/void-agent",
          webUrl: "https://gitlab.com/owner/void-agent",
          description: "private description",
          lastActivityAt: "2026-11-17T10:00:00Z",
        },
      ],
    });
    expect(mocks.call).toHaveBeenCalledWith(
      "user-1",
      "gitlab",
      "/api/v4/projects",
      expect.objectContaining({
        query: expect.objectContaining({ membership: "true", per_page: 10 }),
      }),
    );
  });

  it("bounds issue and merge request lists and only accepts numeric project IDs", async () => {
    mocks.call.mockResolvedValue({
      items: [
        {
          iid: 3,
          title: "Fix login",
          state: "opened",
          web_url: "https://gitlab.com/owner/project/-/issues/3",
          labels: ["auth", "bug"],
          confidential: true,
        },
      ],
    });
    const tool = createGitLabToolForUser("user-1");
    await expect(
      tool.execute?.(
        {
          action: "list_issues",
          projectId: "42",
          state: "opened",
          limit: 5,
        } as never,
        {} as never,
      ),
    ).resolves.toEqual({
      issues: [
        {
          iid: 3,
          title: "Fix login",
          state: "opened",
          webUrl: "https://gitlab.com/owner/project/-/issues/3",
          updatedAt: undefined,
          labels: ["auth", "bug"],
        },
      ],
    });
    expect(mocks.call).toHaveBeenCalledWith(
      "user-1",
      "gitlab",
      "/api/v4/projects/42/issues",
      expect.any(Object),
    );

    await tool.execute?.(
      {
        action: "list_merge_requests",
        projectId: "42",
        state: "merged",
        limit: 5,
      } as never,
      {} as never,
    );
    expect(mocks.call).toHaveBeenLastCalledWith(
      "user-1",
      "gitlab",
      "/api/v4/projects/42/merge_requests",
      expect.objectContaining({
        query: expect.objectContaining({ state: "merged" }),
      }),
    );
  });

  it("does not pass through untrusted external URLs or raw provider fields", async () => {
    mocks.call.mockResolvedValue({
      items: [
        {
          id: 1,
          name: "Project",
          web_url: "https://attacker.invalid/project",
          access_tokens: [{ token: "secret" }],
        },
      ],
    });
    const tool = createGitLabToolForUser("user-1");
    const result = await tool.execute?.(
      { action: "list_projects", limit: 1 } as never,
      {} as never,
    );
    expect(result).toEqual({
      projects: [
        {
          id: 1,
          name: "Project",
          pathWithNamespace: undefined,
          webUrl: undefined,
          description: undefined,
          lastActivityAt: undefined,
        },
      ],
    });
  });
});
