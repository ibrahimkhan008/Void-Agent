// @vitest-environment jsdom

import { cleanup, fireEvent, render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import messages from "../../../messages/en.json";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

vi.mock("@/hooks/use-mounted", () => ({ useMounted: () => true }));
vi.mock("@/hooks/queries/use-agents", () => ({
  useAgents: () => ({
    bookmarkedAgents: [],
    myAgents: [],
    sharedAgents: [],
    isLoading: false,
  }),
}));

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }),
});

const { SidebarProvider } = await import("ui/sidebar");
const { AppSidebarAgents } = await import("./app-sidebar-agents");

function renderAgents() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <SidebarProvider defaultOpen>
        <AppSidebarAgents userRole="admin" />
      </SidebarProvider>
    </NextIntlClientProvider>,
  );
}

describe("AppSidebarAgents", () => {
  afterEach(() => {
    cleanup();
    push.mockClear();
  });

  it("shows the collapsible section and agent shortcuts", () => {
    const { getByTestId } = renderAgents();
    expect(
      getByTestId("sidebar-agents-toggle").getAttribute("aria-expanded"),
    ).toBe("true");
    expect(getByTestId("sidebar-all-agents-link").getAttribute("href")).toBe(
      "/agents",
    );
    expect(
      getByTestId("sidebar-create-agent-button").getAttribute("href"),
    ).toBe("/agent/new");
    expect(getByTestId("sidebar-create-agent-link").textContent).toContain(
      "Create an agent",
    );
  });

  it("collapses and reopens the agent list", () => {
    const { getByTestId, queryByTestId } = renderAgents();
    const toggle = getByTestId("sidebar-agents-toggle");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(queryByTestId("sidebar-agent-list")).toBeNull();

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(getByTestId("sidebar-agent-list")).not.toBeNull();
  });
});
