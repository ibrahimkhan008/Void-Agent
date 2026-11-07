// @vitest-environment jsdom
import React from "react";
import { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  providers: [{
    provider: "flare",
    hasAPIKey: true,
    models: [{ name: "Model A", isToolCallUnsupported: false, isImageInputUnsupported: false, isBlackboxModel: false, supportedFileMimeTypes: [] }],
  }],
}));

vi.mock("@/hooks/queries/use-chat-models", () => ({
  useChatModels: () => ({ data: mocks.providers }),
}));
vi.mock("@/app/store", () => ({
  appStore: { getState: () => ({ chatModel: { provider: "flare", model: "Model A" } }) },
}));
vi.mock("ui/button", async () => {
  const { createElement } = await import("react");
  return { Button: (props: Record<string, unknown>) => createElement("button", props, props.children as React.ReactNode) };
});
vi.mock("ui/command", async () => {
  const { createElement } = await import("react");
  const Wrapper = (tag: string) => (props: Record<string, any>) => createElement(tag, props, props.children);
  return {
    Command: Wrapper("div"),
    CommandEmpty: Wrapper("div"),
    CommandGroup: ({ heading, ...props }: Record<string, any>) => createElement("section", props, createElement("h3", {}, heading), props.children),
    CommandInput: Wrapper("input"),
    CommandItem: ({ onSelect, ...props }: Record<string, any>) => createElement("button", { ...props, onClick: onSelect }, props.children),
    CommandList: Wrapper("div"),
    CommandSeparator: () => createElement("hr"),
  };
});
vi.mock("ui/model-provider-icon", async () => {
  const { createElement } = await import("react");
  return { ModelProviderIcon: (props: Record<string, unknown>) => createElement("span", props) };
});
vi.mock("ui/popover", async () => {
  const { createElement } = await import("react");
  return {
    Popover: ({ children }: { children: React.ReactNode }) => createElement("div", {}, children),
    PopoverContent: ({ children, ...props }: Record<string, any>) => createElement("div", props, children),
    PopoverTrigger: ({ children }: { children: React.ReactNode }) => children,
  };
});
vi.mock("ui/switch", async () => {
  const { createElement } = await import("react");
  return { Switch: (props: Record<string, unknown>) => createElement("button", props) };
});
vi.mock("next/link", async () => {
  const { createElement } = await import("react");
  return { default: ({ href, children, ...props }: Record<string, any>) => createElement("a", { href, ...props }, children) };
});

import { SelectModel } from "./select-model";

let root: Root | undefined;
let container: HTMLDivElement;

const mount = async (props: React.ComponentProps<typeof SelectModel>) => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(<SelectModel {...props} />);
    await Promise.resolve();
  });
};

const click = async (node: HTMLElement) => act(async () => node.dispatchEvent(new MouseEvent("click", { bubbles: true })));

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = undefined;
  container?.remove();
  vi.unstubAllGlobals();
});

describe("SelectModel team auto routing option", () => {
  it("submits the API auto sentinel only when team routing is enabled", async () => {
    const onSelect = vi.fn();
    await mount({ onSelect, teamAutoRoutingStatus: "enabled" });
    const option = container.querySelector<HTMLElement>('[data-testid="team-auto-model-option"]');
    expect(option?.textContent).toContain("Team Auto");
    if (!option) throw new Error("Missing Team Auto option");
    await click(option);
    expect(onSelect).toHaveBeenCalledWith({ provider: "auto", model: "auto" });
  });

  it.each(["disabled", "loading", "error"] as const)(
    "does not allow selection and explains %s routing status",
    async (teamAutoRoutingStatus) => {
      const onSelect = vi.fn();
      await mount({ onSelect, teamAutoRoutingStatus });
      expect(container.querySelector('[data-testid="team-auto-model-option"]')).toBeNull();
      expect(container.querySelector('[data-testid="team-auto-model-unavailable"]')).not.toBeNull();
      expect(container.querySelector('a[href="/team-model-routing"]')).not.toBeNull();
      expect(onSelect).not.toHaveBeenCalled();
    },
  );

  it("does not change personal/non-team model selectors", async () => {
    const onSelect = vi.fn();
    await mount({ onSelect });
    expect(container.querySelector('[data-testid="team-auto-model-option"]')).toBeNull();
    expect(container.querySelector('[data-testid="team-auto-model-unavailable"]')).toBeNull();
  });
});
