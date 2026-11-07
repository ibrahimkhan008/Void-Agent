// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import TabularReviewsDashboard from "./tabular-reviews-dashboard";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("@/hooks/queries/use-collections", () => ({
  useCollections: () => ({
    data: { collections: [{ id: "collection-1", name: "Contracts" }] },
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

vi.mock("ui/button", async () => {
  const React = await import("react");
  return {
    Button: ({ children, ...props }: React.ComponentProps<"button">) =>
      React.createElement("button", props, children),
  };
});

vi.mock("ui/input", async () => {
  const React = await import("react");
  return {
    Input: (props: React.ComponentProps<"input">) =>
      React.createElement("input", props),
  };
});

vi.mock("ui/label", async () => {
  const React = await import("react");
  return {
    Label: ({ children, ...props }: React.ComponentProps<"label">) =>
      React.createElement("label", props, children),
  };
});

const sourceId = "a34d1904-13fd-4d74-9a51-d1db53ca35d5";

beforeEach(() => {
  push.mockReset();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/collections/collection-1") {
        return Response.json({
          items: [{ id: sourceId, status: "ready", filename: "lease.pdf" }],
        });
      }
      if (url === "/api/tabular-reviews" && init?.method === "POST") {
        return Response.json({ review: { id: "review-1" } }, { status: 201 });
      }
      return Response.json({ reviews: [] });
    }),
  );
});

afterEach(cleanup);

describe("TabularReviewsDashboard custom fields", () => {
  test("creates a review with the reference penalty and remedies preset", async () => {
    render(<TabularReviewsDashboard />);

    fireEvent.click(await screen.findByLabelText(/lease\.pdf/));
    fireEvent.click(screen.getByLabelText("Penalties & remedies"));
    fireEvent.click(screen.getByRole("button", { name: "Create comparison" }));

    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/tabular-reviews/review-1"),
    );
    const post = vi
      .mocked(fetch)
      .mock.calls.find(([, init]) => init?.method === "POST");
    const payload = JSON.parse(String(post?.[1]?.body)) as {
      columns: Array<{
        id: string;
        label: string;
        type: string;
        prompt: string;
      }>;
    };
    expect(payload.columns).toContainEqual({
      id: "penalty",
      label: "Penalties & remedies",
      type: "text",
      prompt:
        "Describe any penalty clauses, liquidated damages, indemnification provisions, or breach remedies stated in this document.",
    });
  });

  test("creates a review with a user-selected custom column type", async () => {
    render(<TabularReviewsDashboard />);

    fireEvent.click(await screen.findByLabelText(/lease\.pdf/));
    fireEvent.click(screen.getByRole("button", { name: "Add custom field" }));
    fireEvent.change(screen.getByLabelText("Custom field 1 label"), {
      target: { value: "Supporting evidence" },
    });
    fireEvent.change(screen.getByLabelText("Custom field 1 type"), {
      target: { value: "citation" },
    });
    fireEvent.change(screen.getByLabelText("Custom field 1 question"), {
      target: { value: "Quote the clause supporting this answer." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create comparison" }));

    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/tabular-reviews/review-1"),
    );
    const post = vi
      .mocked(fetch)
      .mock.calls.find(([, init]) => init?.method === "POST");
    expect(post).toBeDefined();
    const payload = JSON.parse(String(post?.[1]?.body)) as {
      itemIds: string[];
      columns: Array<{
        id: string;
        label: string;
        type: string;
        prompt: string;
      }>;
    };
    expect(payload.itemIds).toEqual([sourceId]);
    expect(payload.columns).toContainEqual({
      id: "custom_1",
      label: "Supporting evidence",
      type: "citation",
      prompt: "Quote the clause supporting this answer.",
    });
  });
});
