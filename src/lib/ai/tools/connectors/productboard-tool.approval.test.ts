import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ select: vi.fn(), refreshConnectorToken: vi.fn(), consume: vi.fn() }));
vi.mock("lib/db/pg/db.pg", () => ({ pgDb: { select: mocks.select } }));
vi.mock("lib/connectors/refresh", () => ({ refreshConnectorToken: mocks.refreshConnectorToken }));
vi.mock("lib/db/pg/repositories/task-creation-approval-repository.pg", () => ({ taskCreationApprovalRepository: { consume: mocks.consume } }));

import { createProductboardToolForUser } from "./productboard-tool";

async function execute(input: unknown) {
  const tool = createProductboardToolForUser("user-1") as unknown as { execute: (input: unknown, options: unknown) => Promise<unknown> };
  return tool.execute(input, { toolCallId: "call-1", messages: [] });
}

beforeEach(() => {
  vi.clearAllMocks();
  const query = { from: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue([{ isConnected: true }]) };
  mocks.select.mockReturnValue(query);
  mocks.refreshConnectorToken.mockResolvedValue("productboard-token");
  mocks.consume.mockResolvedValue(true);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { id: "feature-1" } }), { status: 201 })));
});

describe("Productboard feature creation approval", () => {
  it("fails closed without review and sends only the exact approved feature fields", async () => {
    const blocked = await execute({ action: "create_feature", productId: "prod_42", name: "Roadmap" }) as { error?: string };
    expect(blocked.error).toContain("approvalToken");
    expect(fetch).not.toHaveBeenCalled();

    const payload = { provider: "productboard", targetId: "prod_42", name: "Roadmap", details: "Reviewed description" } as const;
    await execute({ action: "create_feature", productId: "prod_42", name: "Roadmap", description: "Reviewed description", approvalToken: "p".repeat(48) });
    expect(mocks.consume).toHaveBeenCalledWith("user-1", "p".repeat(48), payload);
    expect(fetch).toHaveBeenCalledWith("https://api.productboard.com/features", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ data: { name: "Roadmap", description: "Reviewed description", product: { id: "prod_42" } } }),
    }));
  });

  it("does not mutate Productboard when a token is stale or replayed", async () => {
    mocks.consume.mockResolvedValue(false);
    const result = await execute({ action: "create_feature", productId: "prod_42", name: "Roadmap", description: "Reviewed description", approvalToken: "p".repeat(48) }) as { error?: string };
    expect(result.error).toContain("fresh approval");
    expect(fetch).not.toHaveBeenCalled();
  });
});
