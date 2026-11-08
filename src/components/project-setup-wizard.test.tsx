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
  useCollections: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("@/hooks/queries/use-collections", () => ({
  useCollections: mocks.useCollections,
}));
vi.mock("sonner", () => ({ toast: mocks.toast }));
vi.mock("@/components/project-assigned-agents", () => ({
  ProjectAssignedAgents: () => <div>Agents setup</div>,
}));
vi.mock("@/components/project-assigned-workflows", () => ({
  ProjectAssignedWorkflows: () => <div>Workflows setup</div>,
}));
vi.mock("@/components/project-brain-panel", () => ({
  ProjectBrainPanel: () => <div>Tools setup</div>,
}));
vi.mock("@/components/project-collaborators-panel", () => ({
  ProjectCollaboratorsPanel: () => <div>People setup</div>,
}));
vi.mock("@/components/project-documents-panel", () => ({
  ProjectDocumentsPanel: () => <div>Documents setup</div>,
}));
vi.mock("ui/button", () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));
vi.mock("ui/textarea", () => ({
  Textarea: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => (
    <textarea {...props} />
  ),
}));

import { ProjectSetupWizard } from "./project-setup-wizard";

const project = {
  id: "project-1",
  userId: "owner-1",
  teamId: null,
  name: "Migration",
  description: null,
  goal: "Initial goal",
  systemPrompt: null,
  collectionIds: [],
  onboardingStep: "goal" as const,
  onboardingCompletedAt: null,
  role: "owner" as const,
  createdAt: "2026-11-01T00:00:00.000Z",
  updatedAt: "2026-11-01T00:00:00.000Z",
};

describe("ProjectSetupWizard", () => {
  afterEach(() => cleanup());
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useCollections.mockReturnValue({ data: { collections: [] } });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ ok: true })),
    );
  });

  it("saves goal data and next-step progress before moving forward", async () => {
    const onProjectChanged = vi.fn();
    render(
      <ProjectSetupWizard
        project={project}
        onClose={vi.fn()}
        onProjectChanged={onProjectChanged}
      />,
    );
    fireEvent.change(screen.getByLabelText("Project goal"), {
      target: { value: "Ship a usable project setup" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Choose knowledge collections" }),
      ).toBeTruthy(),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      1,
      "/api/projects/project-1",
      expect.objectContaining({ method: "PATCH" }),
    );
    expect(
      JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body),
    ).toEqual({ goal: "Ship a usable project setup" });
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "/api/projects/project-1/onboard",
      expect.objectContaining({ method: "POST" }),
    );
    expect(
      JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[1][1].body),
    ).toEqual({ step: "knowledge" });
  });

  it("can skip a step without saving its data and can close to resume later", async () => {
    const onClose = vi.fn();
    render(
      <ProjectSetupWizard
        project={project}
        onClose={onClose}
        onProjectChanged={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Skip this step" }));
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Choose knowledge collections" }),
      ).toBeTruthy(),
    );
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(
      JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body),
    ).toEqual({ step: "knowledge" });
    fireEvent.click(screen.getByRole("button", { name: "Skip for now" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("keeps the current step and shows an error when a project save fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("Forbidden", { status: 403 })),
    );
    render(
      <ProjectSetupWizard
        project={project}
        onClose={vi.fn()}
        onProjectChanged={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("Forbidden"),
    );
    expect(
      screen.getByRole("heading", { name: "Set a project goal" }),
    ).toBeTruthy();
  });

  it("resumes from the saved project step", () => {
    render(
      <ProjectSetupWizard
        project={{ ...project, onboardingStep: "tools" }}
        onClose={vi.fn()}
        onProjectChanged={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "Connect project tools" }),
    ).toBeTruthy();
    expect(screen.getByText("Tools setup")).toBeTruthy();
  });

  it("marks setup complete and closes only after Finish succeeds", async () => {
    const onClose = vi.fn();
    render(
      <ProjectSetupWizard
        project={{ ...project, onboardingStep: "agents" }}
        onClose={onClose}
        onProjectChanged={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Finish setup" }));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(
      JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body),
    ).toEqual({ step: "complete" });
  });
});
