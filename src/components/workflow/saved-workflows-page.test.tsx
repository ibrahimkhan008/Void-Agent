// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { push, mutateMock, workflowRows } = vi.hoisted(() => ({ push: vi.fn(), mutateMock: vi.fn(), workflowRows: { value: [] as Array<{ id: string; name: string; updatedAt: string }> } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("next/link", () => ({ default: (props: React.AnchorHTMLAttributes<HTMLAnchorElement>) => React.createElement("a", props) }));
vi.mock("swr", () => ({ default: () => ({ data: workflowRows.value, isLoading: false }), mutate: mutateMock }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("lib/notify", () => ({ notify: { confirm: vi.fn().mockResolvedValue(true) } }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("ui/button", () => ({ Button: (props: React.ButtonHTMLAttributes<HTMLButtonElement>) => React.createElement("button", props) }));
vi.mock("ui/card", () => ({ Card: (props: React.HTMLAttributes<HTMLDivElement>) => React.createElement("div", props), CardDescription: (props: React.HTMLAttributes<HTMLParagraphElement>) => React.createElement("p", props), CardHeader: (props: React.HTMLAttributes<HTMLDivElement>) => React.createElement("div", props), CardTitle: (props: React.HTMLAttributes<HTMLHeadingElement>) => React.createElement("h2", props) }));
vi.mock("ui/skeleton", () => ({ Skeleton: () => React.createElement("div") }));
vi.mock("lucide-react", () => ({ Workflow: () => React.createElement("span"), Trash2: () => React.createElement("span") }));

import SavedWorkflowsPage from "./saved-workflows-page";

describe("saved workflow drafts dashboard", () => {
  beforeEach(() => { push.mockReset(); mutateMock.mockReset(); workflowRows.value = []; });
  it("creates via the saved-workflows namespace and navigates to the draft editor", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "draft-123" }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<SavedWorkflowsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Create draft" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/saved-workflows/draft-123"));
    expect(fetchMock).toHaveBeenCalledWith("/api/saved-workflows", expect.objectContaining({ method: "POST" }));
  });

  it("opens and deletes listed drafts using the saved-workflows routes", async () => {
    workflowRows.value = [{ id: "draft-456", name: "Approved draft", updatedAt: new Date().toISOString() }];
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    render(<SavedWorkflowsPage />);
    expect(screen.getByRole("link", { name: "Approved draft" }).getAttribute("href")).toBe("/saved-workflows/draft-456");
    fireEvent.click(screen.getByRole("button", { name: "Delete Approved draft" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/saved-workflows/draft-456", { method: "DELETE" }));
    expect(mutateMock).toHaveBeenCalledWith("/api/saved-workflows");
  });
});
