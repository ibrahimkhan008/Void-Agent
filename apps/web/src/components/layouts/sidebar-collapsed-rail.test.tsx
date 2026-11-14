// @vitest-environment jsdom

import { cleanup, fireEvent, render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import messages from "../../../messages/en.json";

vi.mock("next/image", () => ({
  default: ({ alt }: { alt: string }) => <img alt={alt} />,
}));

const startNewChat = vi.fn();
vi.mock("@/hooks/use-start-new-chat", () => ({
  useStartNewChat: () => startNewChat,
}));

// The real AppSidebarUser fetches the session with a suspense-mode SWR that
// always fires on mount — unmockable in jsdom (no origin). The rail test only
// cares that the avatar section is placed and labeled; the menu itself is
// verified live.
vi.mock("@/components/layouts/app-sidebar-user", () => ({
  AppSidebarUser: ({ user }: { user?: { name?: string } | null }) =>
    user ? (
      <button
        type="button"
        data-testid="rail-user-button"
        aria-label={user.name}
      />
    ) : null,
}));

// jsdom has no matchMedia; SidebarProvider's mobile check needs one.
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
const { SidebarCollapsedRail } = await import("./sidebar-collapsed-rail");

function renderRail(defaultOpen: boolean, user?: any) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <SidebarProvider defaultOpen={defaultOpen}>
        <SidebarCollapsedRail user={user} />
      </SidebarProvider>
    </NextIntlClientProvider>,
  );
}

describe("SidebarCollapsedRail", () => {
  afterEach(() => {
    cleanup();
    startNewChat.mockClear();
  });

  it("is hidden while the sidebar is open", () => {
    const { getByTestId } = renderRail(true);
    const rail = getByTestId("sidebar-collapsed-rail");
    expect(rail.getAttribute("aria-hidden")).toBe("true");
    expect(rail.className).toContain("w-0");
  });

  it("shows the logo when collapsed and reopens the sidebar on click", () => {
    const { getByTestId } = renderRail(false);
    const rail = getByTestId("sidebar-collapsed-rail");
    expect(rail.getAttribute("aria-hidden")).toBe("false");

    const logo = getByTestId("sidebar-rail-logo");
    expect(logo.getAttribute("aria-label")).toBe("Toggle Sidebar");

    // Clicking the logo flips the provider's open state, which the rail
    // reflects by hiding itself again (aria-hidden -> "true").
    fireEvent.click(logo);
    expect(rail.getAttribute("aria-hidden")).toBe("true");
  });

  it("starts a new chat from the plus button", () => {
    const { getByTestId } = renderRail(false);
    fireEvent.click(getByTestId("sidebar-rail-new-chat"));
    expect(startNewChat).toHaveBeenCalledOnce();
  });

  it("shows the profile avatar at the bottom when collapsed", () => {
    const { getByTestId } = renderRail(false, {
      id: "u1",
      name: "QA Smoke",
      email: "qa.smoke@void-agent.local",
    });
    const avatar = getByTestId("rail-user-button");
    // The avatar trigger carries the user's name as its accessible label —
    // the same account menu as the sidebar footer, ChatGPT-rail style.
    expect(avatar.getAttribute("aria-label")).toBe("QA Smoke");
  });
});
