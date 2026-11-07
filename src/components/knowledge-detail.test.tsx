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
import KnowledgeDetail from "./knowledge-detail";

const { useCollectionMock, mutateMock, pushMock, toastSuccess, toastError } =
  vi.hoisted(() => ({
    useCollectionMock: vi.fn(),
    mutateMock: vi.fn(),
    pushMock: vi.fn(),
    toastSuccess: vi.fn(),
    toastError: vi.fn(),
  }));

vi.mock("@/hooks/queries/use-collections", () => ({
  useCollection: useCollectionMock,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock }) }));
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: React.ComponentProps<"a">) =>
    React.createElement("a", { href, ...props }, children),
}));
vi.mock("sonner", () => ({
  toast: { success: toastSuccess, error: toastError },
}));
vi.mock("ui/button", async () => {
  const ReactModule = await import("react");
  return {
    Button: ({
      children,
      variant,
      size,
      ...props
    }: React.ComponentProps<"button"> & {
      variant?: string;
      size?: string;
    }) => {
      void variant;
      void size;
      return ReactModule.createElement("button", props, children);
    },
  };
});
vi.mock("ui/alert-dialog", async () => {
  const ReactModule = await import("react");
  const box =
    (tag: "div" | "h2" | "p" | "button") =>
    ({ children, ...props }: React.ComponentProps<"div">) =>
      ReactModule.createElement(tag, props, children);
  return {
    AlertDialog: ({
      open,
      children,
    }: React.PropsWithChildren<{
      open: boolean;
      onOpenChange?: (open: boolean) => void;
    }>) => (open ? children : null),
    AlertDialogAction: box("button"),
    AlertDialogCancel: box("button"),
    AlertDialogContent: box("div"),
    AlertDialogDescription: box("p"),
    AlertDialogFooter: box("div"),
    AlertDialogHeader: box("div"),
    AlertDialogTitle: box("h2"),
  };
});
vi.mock("ui/badge", async () => {
  const ReactModule = await import("react");
  return {
    Badge: ({ children }: React.PropsWithChildren<{ variant?: string }>) =>
      ReactModule.createElement("span", null, children),
  };
});
vi.mock("ui/input", async () => {
  const ReactModule = await import("react");
  return {
    Input: (props: React.ComponentProps<"input">) =>
      ReactModule.createElement("input", props),
  };
});
vi.mock("ui/label", async () => {
  const ReactModule = await import("react");
  return {
    Label: ({ children, ...props }: React.ComponentProps<"label">) =>
      ReactModule.createElement("label", props, children),
  };
});
vi.mock("ui/skeleton", async () => {
  const ReactModule = await import("react");
  return {
    Skeleton: (props: React.ComponentProps<"div">) =>
      ReactModule.createElement("div", props),
  };
});
vi.mock("ui/tabs", async () => {
  const ReactModule = await import("react");
  const box =
    (tag: "div" | "button") =>
    ({ children, ...props }: React.ComponentProps<"div">) =>
      ReactModule.createElement(tag, props, children);
  return {
    Tabs: box("div"),
    TabsContent: box("div"),
    TabsList: box("div"),
    TabsTrigger: box("button"),
  };
});
vi.mock("ui/textarea", async () => {
  const ReactModule = await import("react");
  return {
    Textarea: (props: React.ComponentProps<"textarea">) =>
      ReactModule.createElement("textarea", props),
  };
});

const collectionItem = {
  id: "item-1",
  collectionId: "collection-1",
  sourceType: "file",
  sourceUrl: null,
  filename: "contract.pdf",
  mediaType: "application/pdf",
  status: "ready",
  error: null,
  chunkCount: 4,
  createdAt: "2026-11-07T00:00:00Z",
  updatedAt: "2026-11-07T00:00:00Z",
};

beforeEach(() => {
  mutateMock.mockReset();
  pushMock.mockReset();
  toastSuccess.mockReset();
  toastError.mockReset();
  useCollectionMock.mockReturnValue({
    data: {
      collection: {
        id: "collection-1",
        name: "Private files",
        description: null,
        orgId: null,
      },
      items: [collectionItem],
      access: { canWrite: true, canDelete: true },
    },
    isLoading: false,
    mutate: mutateMock,
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ deleted: true }, { status: 202 })),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("KnowledgeDetail source deletion", () => {
  test("confirms private file removal and refreshes after queued cleanup", async () => {
    render(<KnowledgeDetail id="collection-1" />);

    fireEvent.click(
      screen.getByRole("button", { name: "Remove contract.pdf" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Remove source" }));

    await waitFor(() => expect(mutateMock).toHaveBeenCalledOnce());
    expect(fetch).toHaveBeenCalledWith(
      "/api/collections/collection-1/items/item-1",
      { method: "DELETE" },
    );
    expect(toastSuccess).toHaveBeenCalledWith(
      "Source removed; file cleanup is queued for retry",
    );
  });

  test("does not offer per-source deletion for a team collection", () => {
    useCollectionMock.mockReturnValueOnce({
      data: {
        collection: { id: "team-collection", name: "Team", orgId: "org-1" },
        items: [collectionItem],
        access: { canWrite: true, canDelete: false },
      },
      isLoading: false,
      mutate: mutateMock,
    });
    render(<KnowledgeDetail id="team-collection" />);

    expect(
      screen.queryByRole("button", { name: "Remove contract.pdf" }),
    ).toBeNull();
  });
});
