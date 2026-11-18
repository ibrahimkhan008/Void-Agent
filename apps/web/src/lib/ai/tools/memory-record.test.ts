import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

const { proposeRecordChangeMock } = vi.hoisted(() => ({
  proposeRecordChangeMock: vi.fn(),
}));

vi.mock("lib/db/pg/db.pg", () => ({ pgDb: {} }));
vi.mock("@/lib/db/pg/repositories/user-records-repository.pg", () => ({
  proposeRecordChange: (...args: unknown[]) => proposeRecordChangeMock(...args),
}));

const { PROJECT_RECORDS } = await import(
  "@/lib/db/pg/repositories/project-records-repository.pg"
);
const { createMemoryRecordTool } = await import("./memory-record");

describe("BOUNDARIES project memory record", () => {
  beforeEach(() => {
    proposeRecordChangeMock.mockReset();
    proposeRecordChangeMock.mockResolvedValue({ id: "proposal-boundaries" });
  });

  it("is part of the project record set and receives a starter template", () => {
    expect(PROJECT_RECORDS).toContainEqual(
      expect.objectContaining({
        slug: "records/boundaries",
        title: "BOUNDARIES.md",
        purpose: expect.stringContaining("out-of-bounds"),
        template: expect.stringContaining("# Boundaries"),
      }),
    );
  });

  it("accepts the canonical slug and creates an approval-gated proposal", async () => {
    const tool = createMemoryRecordTool("user-1", "project-1");
    const result = await tool.execute!(
      {
        scope: "project",
        slug: "records/boundaries",
        title: "BOUNDARIES.md",
        content: "# Boundaries\n\n- Do not access production systems.\n",
        changeNote: "Document explicit project limits",
      },
      { messages: [], toolCallId: "call-1", context: {} },
    );

    expect(result).toMatchObject({
      proposed: true,
      proposalId: "proposal-boundaries",
    });
    expect(proposeRecordChangeMock).toHaveBeenCalledWith({
      userId: "user-1",
      scope: "project",
      projectId: "project-1",
      slug: "records/boundaries",
      title: "BOUNDARIES.md",
      content: "# Boundaries\n\n- Do not access production systems.\n",
      changeNote: "Document explicit project limits",
      proposedBy: "agent",
    });
  });
});
