import { describe, expect, it, vi } from "vitest";
import { updateSavedWorkflowMetadata } from "./saved-workflow-metadata";

describe("saved workflow metadata update", () => {
  it("sends PATCH to the saved workflow route and returns the updated record", async () => {
    const request = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "draft-1", name: "Updated" }) });
    await expect(updateSavedWorkflowMetadata("draft-1", { name: "Updated" }, request)).resolves.toEqual({ id: "draft-1", name: "Updated" });
    expect(request).toHaveBeenCalledWith("/api/saved-workflows/draft-1", expect.objectContaining({ method: "PATCH" }));
  });

  it("rejects non-success responses instead of reporting a false save", async () => {
    const request = vi.fn().mockResolvedValue({ ok: false, status: 403, json: vi.fn() });
    await expect(updateSavedWorkflowMetadata("draft-1", { name: "Updated" }, request)).rejects.toThrow("Unable to save workflow");
    expect(request).toHaveBeenCalledOnce();
  });
});
