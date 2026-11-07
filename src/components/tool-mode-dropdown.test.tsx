/** @vitest-environment jsdom */
import { cleanup, fireEvent, render } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({
  state: { toolChoice: "auto" as string },
  mutate: vi.fn(),
}));

vi.mock("@/app/store", () => ({
  appStore: (selector: (state: { toolChoice: string; mutate: typeof store.mutate }) => unknown) =>
    selector({
      toolChoice: store.state.toolChoice,
      mutate: store.mutate,
    }),
}));
vi.mock("zustand/shallow", () => ({ useShallow: (selector: unknown) => selector }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("ui/button", () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) =>
    React.createElement("button", props, children),
}));
vi.mock("ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => children,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => children,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("ui/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => children,
  TooltipContent: ({ children }: { children: React.ReactNode }) => children,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("./tool-select-dropdown", () => ({
  ToolSetupMenuContent: () => null,
}));
vi.mock("lucide-react", () => ({
  Infinity: () => null,
  ClipboardCheck: () => null,
  Code2: () => null,
  PenOff: () => null,
  Settings2: () => null,
}));

import { ToolModeDropdown } from "./tool-mode-dropdown";

describe("ToolModeDropdown keyboard shortcut", () => {
  beforeEach(() => {
    store.state.toolChoice = "auto";
    store.mutate.mockReset();
    store.mutate.mockImplementation((update: unknown) => {
      const next =
        typeof update === "function"
          ? (update as (state: typeof store.state) => Partial<typeof store.state>)(store.state)
          : (update as Partial<typeof store.state>);
      store.state = { ...store.state, ...next };
    });
  });

  afterEach(() => cleanup());

  it("cycles Auto, Manual, None, and Code Mode on Cmd/Ctrl+P", () => {
    render(<ToolModeDropdown />);

    fireEvent.keyDown(window, { key: "p", metaKey: true });
    expect(store.state.toolChoice).toBe("manual");
    fireEvent.keyDown(window, { key: "p", ctrlKey: true });
    expect(store.state.toolChoice).toBe("none");
    for (const expected of ["codemode", "auto"]) {
      fireEvent.keyDown(window, { key: "p", metaKey: true });
      expect(store.state.toolChoice).toBe(expected);
    }
    expect(store.mutate).toHaveBeenCalledTimes(4);
  });

  it("leaves the platform shortcut untouched when the control is disabled", () => {
    render(<ToolModeDropdown disabled />);
    const event = new KeyboardEvent("keydown", {
      key: "p",
      metaKey: true,
      cancelable: true,
    });

    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(store.mutate).not.toHaveBeenCalled();
    expect(store.state.toolChoice).toBe("auto");
  });
});
