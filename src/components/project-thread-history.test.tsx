import { render, screen } from "@testing-library/react";
// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const useSWRMock = vi.hoisted(() => vi.fn());
vi.mock("swr", () => ({ default: useSWRMock }));
vi.mock("ui/card", () => ({
  Card: "section",
  CardContent: "div",
  CardHeader: "header",
  CardTitle: "h2",
}));
vi.mock("lucide-react", () => ({ MessageSquareText: "span" }));

import { ProjectThreadHistory } from "./project-thread-history";

describe("ProjectThreadHistory", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows this project's chats and links to the conversation", () => {
    useSWRMock.mockReturnValue({
      data: {
        threads: [
          {
            id: "thread-1",
            title: "Launch planning",
            createdAt: "2026-11-01T10:00:00.000Z",
            lastMessageAt: "2026-11-05T10:00:00.000Z",
          },
        ],
      },
    });

    render(<ProjectThreadHistory projectId="project-1" />);
    expect(
      screen.getByText("Launch planning").closest("a")?.getAttribute("href"),
    ).toBe("/chat/thread-1");
    expect(useSWRMock).toHaveBeenCalledWith(
      "/api/projects/project-1/threads",
      expect.any(Function),
      expect.objectContaining({ revalidateOnFocus: false }),
    );
  });

  it("provides an empty state when no chats exist", () => {
    useSWRMock.mockReturnValue({ data: { threads: [] } });
    render(<ProjectThreadHistory projectId="project-1" />);
    expect(
      screen.getByText("Chats you start in this project will appear here."),
    ).toBeTruthy();
  });

  it("shows a safe error message", () => {
    useSWRMock.mockReturnValue({ error: new Error("private detail") });
    render(<ProjectThreadHistory projectId="project-1" />);
    expect(screen.getByRole("alert").textContent).toContain(
      "Could not load project chats.",
    );
    expect(screen.getByRole("alert").textContent).not.toContain(
      "private detail",
    );
  });
});
