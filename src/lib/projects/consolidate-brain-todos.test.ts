import { describe, expect, it } from "vitest";
import {
  consolidateProjectBrainTodos,
  hasSameProjectBrainTaskIdentity,
} from "./consolidate-brain-todos";

const task = (
  overrides: Partial<
    Parameters<typeof consolidateProjectBrainTodos>[0][number]
  > = {},
) => ({
  id: "todo-1",
  sourceItemId: "source-1",
  title: "Review release notes",
  details: "Check dates and links",
  evidence: "The team must review the release notes.",
  dueDate: null,
  status: "accepted" as const,
  createdAt: "2026-11-01T00:00:00.000Z",
  ...overrides,
});

describe("project-brain task consolidation", () => {
  it("groups only exact normalized title/detail matches and retains evidence", () => {
    const groups = consolidateProjectBrainTodos([
      task(),
      task({
        id: "todo-2",
        sourceItemId: "source-2",
        title: "REVIEW: release notes!",
        dueDate: "2026-11-09",
        createdAt: "2026-11-02T00:00:00.000Z",
      }),
      task({ id: "todo-3", title: "Review project notes" }),
      task({ id: "todo-4", details: "Check dates" }),
      task({ id: "todo-5", status: "rejected" as never }),
    ]);

    expect(groups).toHaveLength(3);
    const duplicate = groups.find((group) => group.taskIds.length === 2);
    expect(duplicate).toMatchObject({
      title: "REVIEW: release notes!",
      sourceCount: 2,
      status: "accepted",
      dueDate: "2026-11-09",
      taskIds: ["todo-2", "todo-1"],
    });
    expect(duplicate?.evidence).toHaveLength(2);
  });

  it("marks a merged group complete only after all accepted proposals are complete", () => {
    const groups = consolidateProjectBrainTodos([
      task({ status: "completed" }),
      task({ id: "todo-2", sourceItemId: "source-2", status: "accepted" }),
      task({
        id: "todo-3",
        sourceItemId: "source-3",
        status: "completed",
      }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.status).toBe("accepted");
  });

  it("validates a proposed group against all exact task identities", () => {
    expect(
      hasSameProjectBrainTaskIdentity([
        { title: "Review release notes", details: "Check dates" },
        { title: "REVIEW: release notes!", details: "Check dates" },
      ]),
    ).toBe(true);
    expect(
      hasSameProjectBrainTaskIdentity([
        { title: "Review release notes", details: "Check dates" },
        { title: "Review project notes", details: "Check dates" },
      ]),
    ).toBe(false);
  });
});
