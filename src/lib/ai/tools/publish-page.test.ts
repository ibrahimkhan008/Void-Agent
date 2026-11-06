import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  selectOwnerIdBySlug: vi.fn(),
  publish: vi.fn(),
}));
vi.mock("lib/db/repository", () => ({
  publishedPageRepository: {
    selectOwnerIdBySlug: mocks.selectOwnerIdBySlug,
    publish: mocks.publish,
  },
}));
vi.mock("server-only", () => ({}));

import { PublishedPageQuotaError } from "lib/published-page/quota";
import { createPublishPageTool } from "./publish-page";

describe("publish page tool", () => {
  beforeEach(() => vi.clearAllMocks());

  it("binds publication to the creating user and returns the public URL", async () => {
    mocks.publish.mockResolvedValue({
      slug: `launch-${"b".repeat(24)}`,
      version: 1,
    });
    const publish = createPublishPageTool({
      userId: "owner-1",
      threadId: "thread-1",
    });
    const result = await (publish as any).execute(
      { title: "Launch", html: "<h1>Launch</h1>" },
      { toolCallId: "c1", messages: [] },
    );
    expect(result).toMatchObject({
      url: `/p/launch-${"b".repeat(24)}`,
      version: 1,
    });
    expect(mocks.publish).toHaveBeenCalledWith(
      expect.objectContaining({ ownerId: "owner-1", threadId: "thread-1" }),
    );
  });

  it("does not let the caller republish another user's slug", async () => {
    mocks.selectOwnerIdBySlug.mockResolvedValue("owner-2");
    const publish = createPublishPageTool({ userId: "owner-1" });
    const result = await (publish as any).execute(
      { title: "Update", html: "<h1>x</h1>", slug: `page-${"a".repeat(24)}` },
      { toolCallId: "c2", messages: [] },
    );
    expect(result.error).toMatch(/cannot be updated/);
    expect(mocks.publish).not.toHaveBeenCalled();
  });

  it("returns a clear snapshot quota error when a new page cannot be stored", async () => {
    mocks.publish.mockRejectedValue(new PublishedPageQuotaError());
    const publish = createPublishPageTool({ userId: "owner-1" });
    const result = await (publish as any).execute(
      { title: "Launch", html: "<h1>Launch</h1>" },
      { toolCallId: "c3", messages: [] },
    );
    expect(result.error).toContain("snapshot quota");
  });
});
