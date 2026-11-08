// @vitest-environment jsdom
import React from "react";
import { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isMobile: false,
  providers: [
    {
      provider: "flare",
      hasAPIKey: true,
      models: [
        {
          name: "Model A",
          isToolCallUnsupported: false,
          isImageInputUnsupported: false,
          isBlackboxModel: false,
          supportedFileMimeTypes: [],
          displayMetadata: {
            hiddenGem: true,
            speed: true,
            developer: "Example",
            country: "US",
            inputPriceUsd: 0.2,
            outputPriceUsd: 0.6,
          },
        },
        {
          name: "Model B",
          isToolCallUnsupported: false,
          isImageInputUnsupported: false,
          isBlackboxModel: false,
          supportedFileMimeTypes: [],
          displayMetadata: { thinking: true },
        },
      ],
    },
  ],
}));

vi.mock("@/hooks/queries/use-chat-models", () => ({
  useChatModels: () => ({ data: mocks.providers }),
}));
vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => mocks.isMobile,
}));
vi.mock("@/app/store", () => ({
  appStore: {
    getState: () => ({ chatModel: { provider: "flare", model: "Model A" } }),
  },
}));
vi.mock("ui/button", async () => {
  const { createElement } = await import("react");
  return {
    Button: (props: Record<string, unknown>) =>
      createElement("button", props, props.children as React.ReactNode),
  };
});
vi.mock("ui/command", async () => {
  const { createElement } = await import("react");
  const Wrapper = (tag: string) => (props: Record<string, any>) =>
    createElement(tag, props, props.children);
  return {
    Command: Wrapper("div"),
    CommandEmpty: Wrapper("div"),
    CommandGroup: ({ heading, ...props }: Record<string, any>) =>
      createElement(
        "section",
        props,
        createElement("h3", {}, heading),
        props.children,
      ),
    CommandInput: Wrapper("input"),
    CommandItem: ({ onSelect, ...props }: Record<string, any>) =>
      createElement("button", { ...props, onClick: onSelect }, props.children),
    CommandList: Wrapper("div"),
    CommandSeparator: () => createElement("hr"),
  };
});
vi.mock("ui/model-provider-icon", async () => {
  const { createElement } = await import("react");
  return {
    ModelProviderIcon: (props: Record<string, unknown>) =>
      createElement("span", props),
  };
});
vi.mock("ui/popover", async () => {
  const { createElement } = await import("react");
  return {
    Popover: ({ children }: { children: React.ReactNode }) =>
      createElement("div", {}, children),
    PopoverContent: ({ children, ...props }: Record<string, any>) =>
      createElement("div", props, children),
    PopoverTrigger: ({ children }: { children: React.ReactNode }) => children,
  };
});
vi.mock("ui/drawer", async () => {
  const { createElement } = await import("react");
  const Wrapper = (tag: string) => (props: Record<string, any>) =>
    createElement(tag, props, props.children);
  return {
    Drawer: Wrapper("div"),
    DrawerContent: Wrapper("div"),
    DrawerTitle: Wrapper("h2"),
    DrawerTrigger: ({ children }: { children: React.ReactNode }) => children,
  };
});
vi.mock("ui/switch", async () => {
  const { createElement } = await import("react");
  return {
    Switch: (props: Record<string, unknown>) => createElement("button", props),
  };
});
vi.mock("next/link", async () => {
  const { createElement } = await import("react");
  return {
    default: ({ href, children, ...props }: Record<string, any>) =>
      createElement("a", { href, ...props }, children),
  };
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

const click = async (node: HTMLElement) =>
  act(async () =>
    node.dispatchEvent(new MouseEvent("click", { bubbles: true })),
  );

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.isMobile = false;
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
    const option = container.querySelector<HTMLElement>(
      '[data-testid="team-auto-model-option"]',
    );
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
      expect(
        container.querySelector('[data-testid="team-auto-model-option"]'),
      ).toBeNull();
      expect(
        container.querySelector('[data-testid="team-auto-model-unavailable"]'),
      ).not.toBeNull();
      expect(
        container.querySelector('a[href="/team-model-routing"]'),
      ).not.toBeNull();
      expect(onSelect).not.toHaveBeenCalled();
    },
  );

  it("does not change personal/non-team model selectors", async () => {
    const onSelect = vi.fn();
    await mount({ onSelect });
    expect(
      container.querySelector('[data-testid="team-auto-model-option"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="team-auto-model-unavailable"]'),
    ).toBeNull();
  });

  it("submits personal Automatic only when its admin catalog is enabled", async () => {
    const onSelect = vi.fn();
    await mount({ onSelect, personalAutoRoutingStatus: "enabled" });
    const option = container.querySelector<HTMLElement>(
      '[data-testid="personal-auto-model-option"]',
    );
    expect(option?.textContent).toContain("Automatic");
    if (!option) throw new Error("Missing Personal Auto option");
    await click(option);
    expect(onSelect).toHaveBeenCalledWith({ provider: "auto", model: "auto" });
  });

  it.each(["disabled", "loading", "error"] as const)(
    "does not allow personal Automatic while catalog is %s",
    async (personalAutoRoutingStatus) => {
      const onSelect = vi.fn();
      await mount({ onSelect, personalAutoRoutingStatus });
      expect(
        container.querySelector('[data-testid="personal-auto-model-option"]'),
      ).toBeNull();
      expect(
        container.querySelector(
          '[data-testid="personal-auto-model-unavailable"]',
        ),
      ).not.toBeNull();
      expect(onSelect).not.toHaveBeenCalled();
    },
  );

  it("shows curated catalog metadata and filters by its badges", async () => {
    await mount({ onSelect: vi.fn() });
    expect(container.textContent).toContain("Example");
    expect(container.textContent).toContain("US");
    expect(container.textContent).toContain("In $0.2");
    expect(container.textContent).toContain("Out $0.6");

    const hiddenGemFilter = [...container.querySelectorAll("button")].find(
      (button) =>
        button.textContent === "Hidden gem" &&
        button.closest("[aria-label='Filter models by catalog metadata']"),
    );
    expect(hiddenGemFilter).toBeTruthy();
    if (!hiddenGemFilter) throw new Error("Missing hidden gem filter");
    await click(hiddenGemFilter);

    expect(
      container.querySelector('[data-testid="model-option-flare-Model A"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="model-option-flare-Model B"]'),
    ).toBeNull();
  });

  it("uses a full-height accessible drawer on mobile and keeps model selection", async () => {
    mocks.isMobile = true;
    const onSelect = vi.fn();
    await mount({ onSelect });

    expect(
      container.querySelector('[data-testid="model-selector-drawer"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="model-selector-popover"]'),
    ).toBeNull();
    expect(container.querySelector("h2")?.textContent).toBe("Select model");

    const option = container.querySelector<HTMLElement>(
      '[data-testid="model-option-flare-Model B"]',
    );
    expect(option).not.toBeNull();
    if (!option) throw new Error("Missing model option in mobile drawer");
    await click(option);
    expect(onSelect).toHaveBeenCalledWith({
      provider: "flare",
      model: "Model B",
    });
  });
});
