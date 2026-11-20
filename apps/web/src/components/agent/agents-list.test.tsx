// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import messages from "../../../messages/en.json";

vi.mock("@/components/agent/agent-library-drawer", () => ({
  AgentLibraryDrawer: () => null,
}));
// AgentsList navigates to the fresh copy after a fork; jsdom has no app
// router mounted, so supply the minimum it calls.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/components/scheduled-tasks/schedule-status-badge", () => ({
  ScheduleStatusBadge: () => null,
}));
vi.mock("@/components/shareable-card", () => ({
  ShareableCard: ({ item }: { item: { name: string } }) => (
    <article>{item.name}</article>
  ),
}));
vi.mock("@/hooks/queries/use-agents", () => ({
  useMutateAgents: () => vi.fn(),
}));
vi.mock("@/hooks/queries/use-bookmark", () => ({
  useBookmark: () => ({
    toggleBookmark: vi.fn(),
    isLoading: () => false,
  }),
}));
vi.mock("@/hooks/queries/use-scheduled-tasks", () => ({
  useScheduledTasks: () => ({ byAgentId: new Map() }),
}));
vi.mock("swr", () => ({
  default: (
    _key: string,
    _fetcher: unknown,
    options: { fallbackData: unknown },
  ) => ({ data: options.fallbackData }),
}));

const { AgentsList } = await import("./agents-list");

describe("AgentsList", () => {
  afterEach(() => cleanup());

  it("shows owned agents to users who cannot create new agents", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <AgentsList
          initialMyAgents={[
            {
              id: "agent-1",
              userId: "user-1",
              name: "Research Agent",
            } as any,
          ]}
          userId="user-1"
          userRole="user"
        />
      </NextIntlClientProvider>,
    );

    expect(screen.getByText("Research Agent")).toBeTruthy();
    expect(screen.queryByTestId("create-agent-button")).toBeNull();
  });

  it("does not render a shared-agents section — discovery moved to the gallery", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <AgentsList
          initialMyAgents={[
            {
              id: "agent-1",
              userId: "user-1",
              name: "Research Agent",
            } as any,
          ]}
          userId="user-1"
          userRole="user"
        />
      </NextIntlClientProvider>,
    );

    expect(screen.queryByText("Shared Agents")).toBeNull();
    expect(screen.queryByText("No available agents")).toBeNull();
    expect(screen.queryByText("No shared agents")).toBeNull();
  });
});
