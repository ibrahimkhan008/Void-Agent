// @vitest-environment jsdom
import { act } from "react";
import React from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("ui/button", async () => {
  const { createElement } = await import("react");
  return {
    Button: ({ variant: _variant, size: _size, asChild: _asChild, ...props }: Record<string, unknown>) =>
      createElement("button", props, props.children as React.ReactNode),
  };
});
vi.mock("ui/input", async () => {
  const { createElement } = await import("react");
  return { Input: (props: Record<string, unknown>) => createElement("input", props) };
});
vi.mock("ui/switch", async () => {
  const { createElement } = await import("react");
  return {
    Switch: ({ checked, onCheckedChange, ...props }: Record<string, any>) => createElement("button", {
      ...props,
      role: "switch",
      "aria-checked": checked,
      onClick: () => onCheckedChange(!checked),
    }),
  };
});

import { TeamModelRoutingSettings } from "./team-model-routing-settings";

const mockFetch = vi.fn();
let root: Root | undefined;
let container: HTMLDivElement;

const routingResponse = (canManage = true) => ({
  canManage,
  policy: {
    enabled: false,
    profiles: [{ provider: "flare", model: "Model A", priority: 3, taskScores: { coding: 5 } }],
  },
  models: [
    { provider: "flare", model: "Model A", toolCalling: true, vision: true },
    { provider: "google", model: "Model B", toolCalling: false, vision: true },
  ],
});

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

const mount = async () => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(<TeamModelRoutingSettings />);
    await Promise.resolve();
  });
};

const waitUntil = async (predicate: () => boolean) => {
  for (let attempt = 0; attempt < 40; attempt++) {
    if (predicate()) return;
    await act(async () => new Promise((resolve) => setTimeout(resolve, 5)));
  }
  throw new Error("Timed out waiting for team routing UI");
};

const setInputValue = async (node: HTMLInputElement, value: string) => {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(node, value);
    node.dispatchEvent(new Event("input", { bubbles: true }));
    node.dispatchEvent(new Event("change", { bubbles: true }));
  });
};

const click = async (node: HTMLElement) => act(async () => node.dispatchEvent(new MouseEvent("click", { bubbles: true })));

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

describe("TeamModelRoutingSettings", () => {
  it("loads a team's model allowlist and saves enablement with task profiles", async () => {
    mockFetch
      .mockResolvedValueOnce(ok({ teams: [{ id: "team-1", name: "Research", role: "owner" }] }))
      .mockResolvedValueOnce(ok(routingResponse()))
      .mockResolvedValueOnce(ok({ items: [{ id: "audit-1", taskKey: "coding", selectedProvider: "flare", selectedModel: "Model A", reasonCode: "task_ranked", createdAt: "2026-11-07T10:00:00.000Z" }], nextCursor: null }))
      .mockResolvedValueOnce(ok({ policy: { enabled: true, profiles: [] } }));
    await mount();
    await waitUntil(() => container.querySelector('[aria-label="Enable team model routing"]') !== null);

    expect(container.textContent).toContain("Research");
    expect(container.textContent).toContain("Task scores");
    expect(container.textContent).toContain("Recent routing decisions");
    expect(container.textContent).toContain("flare / Model A");
    expect(container.textContent).not.toContain("apiKey");

    const score = container.querySelector<HTMLInputElement>(
      '[aria-label="Coding score for flare Model A"]',
    );
    if (!score) throw new Error("Missing coding score control");
    await setInputValue(score, "12");
    const toggle = container.querySelector<HTMLElement>('[aria-label="Enable team model routing"]');
    const save = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("Save routing policy"));
    if (!toggle || !save) throw new Error("Missing routing save controls");
    await click(toggle);
    await click(save);

    await waitUntil(() => mockFetch.mock.calls.length === 4);
    const [url, options] = mockFetch.mock.calls[3] as [string, RequestInit];
    expect(url).toContain("/api/teams/team-1/model-routing");
    expect(options.method).toBe("PUT");
    expect(JSON.parse(String(options.body))).toEqual({
      enabled: true,
      profiles: [{ provider: "flare", model: "Model A", priority: 3, taskScores: { coding: 12 } }],
    });
    await waitUntil(() => container.textContent?.includes("Saved") === true);
  });

  it("keeps the controls read-only for non-admin team members", async () => {
    mockFetch
      .mockResolvedValueOnce(ok({ teams: [{ id: "team-1", name: "Research", role: "editor" }] }))
      .mockResolvedValueOnce(ok(routingResponse(false)));
    await mount();
    await waitUntil(() => container.textContent?.includes("Only team owners and admins") === true);
    expect((container.querySelector('[aria-label="Enable team model routing"]') as HTMLButtonElement | null)?.disabled).toBe(true);
    expect(container.textContent).not.toContain("Save routing policy");
  });

  it("renders load failures and offers retry", async () => {
    mockFetch
      .mockResolvedValueOnce(ok({ teams: [{ id: "team-1", name: "Research", role: "owner" }] }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "Could not load policy" }), { status: 503 }));
    await mount();
    await waitUntil(() => container.querySelector('[role="alert"]') !== null);
    expect(container.textContent).toContain("Could not load policy");
    expect(container.textContent).toContain("Retry");
  });

  it("shows server validation errors without discarding the edited policy", async () => {
    mockFetch
      .mockResolvedValueOnce(ok({ teams: [{ id: "team-1", name: "Research", role: "owner" }] }))
      .mockResolvedValueOnce(ok(routingResponse()))
      .mockResolvedValueOnce(ok({ items: [], nextCursor: null }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "A model was disabled by an administrator." }), { status: 400 }));
    await mount();
    await waitUntil(() => container.querySelector('[aria-label="Enable team model routing"]') !== null);
    await waitUntil(() => container.textContent?.includes("No routing decisions have been recorded yet.") === true);
    const save = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("Save routing policy"));
    if (!save) throw new Error("Missing save button");
    await click(save);
    await waitUntil(() => container.querySelector('[role="alert"]') !== null);
    expect(container.textContent).toContain("A model was disabled by an administrator.");
    expect(container.querySelector('[data-testid="routing-profile"]')).not.toBeNull();
  });

  it("loads another bounded audit page without losing earlier decisions", async () => {
    mockFetch
      .mockResolvedValueOnce(ok({ teams: [{ id: "team-1", name: "Research", role: "owner" }] }))
      .mockResolvedValueOnce(ok(routingResponse()))
      .mockResolvedValueOnce(ok({
        items: [{ id: "audit-1", taskKey: "coding", selectedProvider: "flare", selectedModel: "Model A", reasonCode: "task_ranked", createdAt: "2026-11-07T10:00:00.000Z" }],
        nextCursor: "opaque-next-page",
      }))
      .mockResolvedValueOnce(ok({
        items: [{ id: "audit-2", taskKey: "writing", selectedProvider: "google", selectedModel: "Model B", reasonCode: "task_ranked", createdAt: "2026-11-07T09:00:00.000Z" }],
        nextCursor: null,
      }));
    await mount();
    await waitUntil(() => container.textContent?.includes("Load more decisions") === true);
    const loadMore = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("Load more decisions"));
    if (!loadMore) throw new Error("Missing audit pagination button");
    await click(loadMore);
    await waitUntil(() => container.textContent?.includes("google / Model B") === true);
    expect(container.textContent).toContain("flare / Model A");
    expect(String(mockFetch.mock.calls[3][0])).toContain("cursor=opaque-next-page");
  });

  it("shows audit loading errors and can retry into an empty state", async () => {
    mockFetch
      .mockResolvedValueOnce(ok({ teams: [{ id: "team-1", name: "Research", role: "owner" }] }))
      .mockResolvedValueOnce(ok(routingResponse()))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "Audit temporarily unavailable" }), { status: 503 }))
      .mockResolvedValueOnce(ok({ items: [], nextCursor: null }));
    await mount();
    await waitUntil(() => container.textContent?.includes("Audit temporarily unavailable") === true);
    const retry = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("Retry audit"));
    if (!retry) throw new Error("Missing audit retry button");
    await click(retry);
    await waitUntil(() => container.textContent?.includes("No routing decisions have been recorded yet.") === true);
    expect(container.textContent).toContain("Recent routing decisions");
  });
});
