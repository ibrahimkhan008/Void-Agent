// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import messages from "../../messages/en.json";

const nav = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }));
vi.mock("next/link", () => ({
  default: ({ href, prefetch: _prefetch, ...props }: any) => (
    <a href={href} {...props} />
  ),
}));

const { isWorkspaceLandingPath, WorkspaceModeToggle } = await import(
  "./workspace-mode-toggle"
);

function renderAt(pathname: string) {
  nav.pathname = pathname;
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <WorkspaceModeToggle />
    </NextIntlClientProvider>,
  );
}

describe("WorkspaceModeToggle", () => {
  afterEach(cleanup);

  it("shows Chat and Agent beside each other with Chat active at home", () => {
    renderAt("/");

    const chat = screen.getByRole("tab", { name: "Chat" });
    const agent = screen.getByRole("tab", { name: "Agent" });

    expect(chat.getAttribute("href")).toBe("/");
    expect(chat.getAttribute("aria-current")).toBe("page");
    expect(chat.getAttribute("aria-selected")).toBe("true");
    expect(agent.getAttribute("href")).toBe("/cloud-agent");
    expect(agent.getAttribute("aria-selected")).toBe("false");
    expect(screen.queryByText("Cockpit")).toBeNull();
  });

  it.each(["/cloud-agent", "/cloud-agent/run-1", "/agent/agent-1"])(
    "marks Agent active on %s",
    (pathname) => {
      renderAt(pathname);
      expect(
        screen.getByRole("tab", { name: "Agent" }).getAttribute("aria-current"),
      ).toBe("page");
      expect(
        screen
          .getByRole("tab", { name: "Agent" })
          .getAttribute("aria-selected"),
      ).toBe("true");
      expect(
        screen.getByRole("tab", { name: "Chat" }).getAttribute("aria-selected"),
      ).toBe("false");
    },
  );

  it("renders the workspace switcher only on the two landing routes", () => {
    expect(isWorkspaceLandingPath("/")).toBe(true);
    expect(isWorkspaceLandingPath("/cloud-agent")).toBe(true);
    expect(isWorkspaceLandingPath("/chat/thread-1")).toBe(false);
    expect(isWorkspaceLandingPath(null)).toBe(false);
  });
});
