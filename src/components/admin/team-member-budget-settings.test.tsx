// @vitest-environment jsdom
import { act } from "react";
import React from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("ui/button", async () => {
  const { createElement } = await import("react");
  return {
    Button: ({
      variant: _variant,
      size: _size,
      asChild: _asChild,
      ...props
    }: Record<string, unknown>) =>
      createElement("button", props, props.children as React.ReactNode),
  };
});
vi.mock("ui/input", async () => {
  const { createElement } = await import("react");
  return {
    Input: (props: Record<string, unknown>) => createElement("input", props),
  };
});
vi.mock("ui/switch", async () => {
  const { createElement } = await import("react");
  return {
    Switch: ({ checked, onCheckedChange, ...props }: Record<string, any>) =>
      createElement("button", {
        ...props,
        role: "switch",
        "aria-checked": checked,
        onClick: () => onCheckedChange(!checked),
      }),
  };
});

import { TeamMemberBudgetSettings } from "./team-member-budget-settings";

const configResponse = (modelPricing: Record<string, unknown> = {}) => ({
  success: true,
  config: {
    models: {
      providers: { openai: { enabled: true } },
      defaultModel: "openai/gpt-4o",
      teamMemberBudgetsEnabled: false,
      modelPricing,
    },
  },
});

const mockFetch = vi.fn();
let root: Root | undefined;
let container: HTMLDivElement;

const mount = async () => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(<TeamMemberBudgetSettings />);
    await Promise.resolve();
  });
};

const waitUntil = async (predicate: () => boolean) => {
  for (let attempt = 0; attempt < 30; attempt++) {
    if (predicate()) return;
    await act(async () => new Promise((resolve) => setTimeout(resolve, 5)));
  }
  throw new Error("Timed out waiting for UI state");
};

const input = (ariaLabel: string) => {
  const node = container.querySelector<HTMLInputElement>(
    `[aria-label="${ariaLabel}"]`,
  );
  if (!node) throw new Error(`Missing input ${ariaLabel}`);
  return node;
};

const button = (name: string) => {
  const node = Array.from(container.querySelectorAll("button")).find(
    (item) =>
      item.textContent?.includes(name) ||
      item.getAttribute("aria-label") === name,
  );
  if (!node) throw new Error(`Missing button ${name}`);
  return node;
};

const setInputValue = async (node: HTMLInputElement, value: string) => {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    setter?.call(node, value);
    node.dispatchEvent(new Event("input", { bubbles: true }));
    node.dispatchEvent(new Event("change", { bubbles: true }));
  });
};

const click = async (node: HTMLElement) =>
  act(async () =>
    node.dispatchEvent(new MouseEvent("click", { bubbles: true })),
  );

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal("fetch", mockFetch);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = undefined;
  container?.remove();
  vi.unstubAllGlobals();
});

describe("TeamMemberBudgetSettings", () => {
  it("loads disabled by default, converts decimal EUR rates, and saves only budget fields", async () => {
    mockFetch
      .mockResolvedValueOnce(
        new Response(JSON.stringify(configResponse()), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true }), { status: 200 }),
      );
    await mount();
    await waitUntil(() => container.querySelector('[role="switch"]') !== null);

    const toggle = container.querySelector('[role="switch"]');
    expect(toggle?.getAttribute("aria-checked")).toBe("false");

    const modelKey = container.querySelector<HTMLInputElement>(
      "#team-budget-model-key",
    );
    if (!modelKey) throw new Error("Missing model key input");
    await setInputValue(modelKey, "openai/gpt-4o");
    await click(button("Add model"));
    await setInputValue(
      input("openai/gpt-4o input EUR per million tokens"),
      "0.25",
    );
    await setInputValue(
      input("openai/gpt-4o output EUR per million tokens"),
      "1.5",
    );
    await click(button("Save budget settings"));

    await waitUntil(() => mockFetch.mock.calls.length === 2);
    const request = JSON.parse(mockFetch.mock.calls[1][1].body);
    expect(request).toEqual({
      key: "models",
      settings: {
        modelPricing: {
          "openai/gpt-4o": {
            inputMicrosPerMillion: 250_000,
            outputMicrosPerMillion: 1_500_000,
            currency: "EUR",
          },
        },
        teamMemberBudgetsEnabled: false,
      },
    });
    // The POST is intentionally a partial model-config update. The existing
    // admin config route merges these fields with providers and other settings.
    expect(request.settings.providers).toBeUndefined();
    await waitUntil(() => container.textContent?.includes("Saved") === true);
  });

  it("removes the final price and blocks enabling while no prices are configured", async () => {
    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify(
            configResponse({
              "openai/gpt-4o": {
                inputMicrosPerMillion: 250_000,
                outputMicrosPerMillion: 1_500_000,
                currency: "EUR",
              },
            }),
          ),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true }), { status: 200 }),
      );
    await mount();
    await waitUntil(() => container.querySelector('[role="switch"]') !== null);

    await click(button("Remove openai/gpt-4o model price"));
    const toggle = container.querySelector('[role="switch"]');
    if (!toggle) throw new Error("Missing rollout switch");
    await click(toggle as HTMLElement);
    expect(container.textContent).toContain(
      "Add at least one model price before enabling team budgets.",
    );
    expect(button("Save budget settings").hasAttribute("disabled")).toBe(true);

    await click(toggle as HTMLElement);
    await click(button("Save budget settings"));
    await waitUntil(() => mockFetch.mock.calls.length === 2);
    const request = JSON.parse(mockFetch.mock.calls[1][1].body);
    expect(request.settings.modelPricing).toEqual({});
    expect(request.settings.teamMemberBudgetsEnabled).toBe(false);
  });

  it("shows server save errors without reporting success", async () => {
    mockFetch
      .mockResolvedValueOnce(
        new Response(JSON.stringify(configResponse()), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: false, error: "Admin only" }), {
          status: 403,
        }),
      );
    await mount();
    await waitUntil(() => container.querySelector('[role="switch"]') !== null);
    await click(button("Save budget settings"));
    await waitUntil(
      () => container.textContent?.includes("Admin only") === true,
    );
    expect(container.textContent).not.toContain("Saved");
  });
});
