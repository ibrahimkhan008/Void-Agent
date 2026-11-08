/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/queries/use-collections", () => ({
  useCollections: () => ({
    data: { collections: [{ id: "collection-1", name: "Team docs" }] },
  }),
}));
vi.mock("ui/button", () => ({
  Button: ({
    asChild: _asChild,
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    asChild?: boolean;
  }) => <button {...props}>{children}</button>,
}));
vi.mock("ui/textarea", () => ({
  Textarea: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => (
    <textarea {...props} />
  ),
}));
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

import { ProjectDocumentsPanel } from "./project-documents-panel";

function response(payload: unknown, ok = true) {
  return { ok, json: async () => payload };
}

describe("ProjectDocumentsPanel tracked DOCX review", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("asks before unlinking and explains that collection files are retained", async () => {
    const document = {
      id: "item-1",
      collectionId: "collection-1",
      filename: "brief.pdf",
      mediaType: "application/pdf",
      status: "ready",
      createdAt: "2026-11-07T12:00:00.000Z",
    };
    fetchMock.mockResolvedValueOnce(
      response({
        documents: [document],
        writableCollectionIds: ["collection-1"],
      }),
    );
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);

    render(
      <ProjectDocumentsPanel
        projectId="project-1"
        collectionIds={["collection-1"]}
        canEdit
      />,
    );
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Remove brief.pdf from project",
      }),
    );

    expect(confirm).toHaveBeenCalledWith(
      'Remove "brief.pdf" from this project? The source will remain in its Knowledge collection and any other projects that use it.',
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("unlinks only after confirmation and refreshes the project list", async () => {
    const document = {
      id: "item-1",
      collectionId: "collection-1",
      filename: "brief.pdf",
      mediaType: "application/pdf",
      status: "ready",
      createdAt: "2026-11-07T12:00:00.000Z",
    };
    fetchMock
      .mockResolvedValueOnce(
        response({
          documents: [document],
          writableCollectionIds: ["collection-1"],
        }),
      )
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce(
        response({ documents: [], writableCollectionIds: ["collection-1"] }),
      );
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(
      <ProjectDocumentsPanel
        projectId="project-1"
        collectionIds={["collection-1"]}
        canEdit
      />,
    );
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Remove brief.pdf from project",
      }),
    );

    expect(await screen.findByText("No project documents yet.")).toBeTruthy();
    expect(fetchMock.mock.calls[1]).toEqual([
      "/api/projects/project-1/documents/item-1",
      { method: "DELETE" },
    ]);
  });

  it("loads and appends older project documents on demand", async () => {
    const first = {
      id: "item-new",
      collectionId: "collection-1",
      filename: "new.pdf",
      mediaType: "application/pdf",
      status: "ready",
      createdAt: "2026-11-07T12:00:00.000Z",
    };
    const older = { ...first, id: "item-old", filename: "older.pdf" };
    fetchMock
      .mockResolvedValueOnce(
        response({
          documents: [first],
          nextCursor: "cursor/value",
          writableCollectionIds: ["collection-1"],
        }),
      )
      .mockResolvedValueOnce(
        response({
          documents: [older],
          nextCursor: null,
          writableCollectionIds: ["collection-1"],
        }),
      );

    render(
      <ProjectDocumentsPanel
        projectId="project-1"
        collectionIds={["collection-1"]}
        canEdit
      />,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Load older documents" }),
    );

    expect(await screen.findByText("older.pdf")).toBeTruthy();
    expect(screen.getByText("new.pdf")).toBeTruthy();
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      "/api/projects/project-1/documents?cursor=cursor%2Fvalue",
    );
    expect(
      screen.queryByRole("button", { name: "Load older documents" }),
    ).toBeNull();
  });

  it("generates a tracked edit and exposes accept/reject plus an accepted download", async () => {
    const pending = {
      id: "edit-1",
      status: "pending",
      canResolve: true,
      changes: [
        {
          originalText: "Old wording",
          suggestedText: "New wording",
          rationale: "Improve clarity",
        },
      ],
      createdAt: "2026-11-07T12:00:00.000Z",
    };
    fetchMock
      .mockResolvedValueOnce(
        response({
          documents: [
            {
              id: "item-1",
              collectionId: "collection-1",
              filename: "brief.docx",
              mediaType:
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
              status: "ready",
              createdAt: "2026-11-07T12:00:00.000Z",
            },
          ],
          writableCollectionIds: ["collection-1"],
        }),
      )
      .mockResolvedValueOnce(response({ edits: [] }))
      .mockResolvedValueOnce(response({ edit: pending }))
      .mockResolvedValueOnce(response({ status: "accepted" }))
      .mockResolvedValueOnce(
        response({ edits: [{ ...pending, status: "accepted" }] }),
      );

    render(
      <ProjectDocumentsPanel
        projectId="project-1"
        collectionIds={["collection-1"]}
        canEdit
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    const instructions = await screen.findByRole("textbox", {
      name: "Edit instructions for brief.docx",
    });
    fireEvent.change(instructions, {
      target: { value: "Improve the introduction" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Suggest tracked changes" }),
    );
    expect(await screen.findByText("Old wording")).toBeTruthy();
    expect(screen.getByText("New wording")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Accept all" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reject all" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Accept all" }));
    expect(await screen.findByText("accepted · 1 change")).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "Download accepted DOCX" })
        .getAttribute("href"),
    ).toBe("/api/projects/project-1/documents/item-1/edits/edit-1/download");
    expect(fetchMock.mock.calls[2]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        action: "propose",
        instruction: "Improve the introduction",
      }),
    });
    expect(fetchMock.mock.calls[3]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        action: "resolve",
        editId: "edit-1",
        decision: "accepted",
      }),
    });
  });

  it("offers XLSX and PPTX project knowledge uploads", async () => {
    fetchMock.mockResolvedValueOnce(
      response({ documents: [], writableCollectionIds: ["collection-1"] }),
    );

    const view = render(
      <ProjectDocumentsPanel
        projectId="project-1"
        collectionIds={["collection-1"]}
        canEdit
      />,
    );
    await screen.findByText("No project documents yet.");
    const fileInput =
      view.container.querySelector<HTMLInputElement>('input[type="file"]');

    expect(fileInput?.accept).toContain(".xlsx");
    expect(fileInput?.accept).toContain(".pptx");
  });
});
