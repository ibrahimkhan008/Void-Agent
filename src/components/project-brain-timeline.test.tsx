/** @vitest-environment jsdom */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useSWR: vi.fn(),
  mutate: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("swr", () => ({ default: mocks.useSWR }));
vi.mock("sonner", () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError },
}));
vi.mock("ui/button", () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));

import { ProjectBrainTimeline } from "./project-brain-timeline";

const event = {
  id: "event-1",
  summary: "Launch review",
  detail: "The team reviewed the release plan.",
  evidence: "The team reviewed the release plan on 2026-10-20.",
  eventDate: "2026-10-20",
  status: "proposed" as const,
  createdAt: "2026-10-21T00:00:00.000Z",
  sourceItemId: "source-1",
  sourceVersionId: "version-1",
  filename: "plan.md",
  collectionId: "collection-1",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.mutate.mockResolvedValue(undefined);
  mocks.useSWR.mockReturnValue({
    data: { events: [event] },
    error: undefined,
    isLoading: false,
    mutate: mocks.mutate,
  });
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ event: { id: "event-1", status: "accepted" } }),
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ProjectBrainTimeline", () => {
  it("shows exact evidence, source link, and an explicit editor review workflow", async () => {
    render(<ProjectBrainTimeline projectId="project-1" canReview />);
    expect(
      screen.getByText("The team reviewed the release plan on 2026-10-20."),
    ).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Open source" }).getAttribute("href"),
    ).toBe("/knowledge/collection-1");
    fireEvent.click(
      screen.getByRole("button", { name: "Accept event: Launch review" }),
    );
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    expect(fetch).toHaveBeenCalledWith(
      "/api/projects/project-1/brain/timeline/event-1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ status: "accepted" }),
      }),
    );
    expect(mocks.mutate).toHaveBeenCalledOnce();
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Timeline event accepted");
  });

  it("does not expose review actions to viewers", () => {
    render(<ProjectBrainTimeline projectId="project-1" canReview={false} />);
    expect(
      screen.queryByRole("button", { name: "Accept event: Launch review" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Dismiss event: Launch review" }),
    ).toBeNull();
  });

  it("lets a reviewer inspect and hide the exact captured source revision", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: "Captured source text for the launch decision.",
      }),
    } as Response);
    render(<ProjectBrainTimeline projectId="project-1" canReview={false} />);
    fireEvent.click(
      screen.getByRole("button", {
        name: "View exact source revision: Launch review",
      }),
    );
    expect(
      await screen.findByText("Captured source text for the launch decision."),
    ).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/projects/project-1/brain/versions/version-1",
      { cache: "no-store" },
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "View exact source revision: Launch review",
      }),
    );
    expect(
      screen.queryByText("Captured source text for the launch decision."),
    ).toBeNull();
  });
});
