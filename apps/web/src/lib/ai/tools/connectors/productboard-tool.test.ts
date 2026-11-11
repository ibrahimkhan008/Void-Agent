import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ api: vi.fn(), consume: vi.fn() }));
vi.mock("lib/connectors/provider-api", () => ({
  callConnectorApi: mocks.api,
  ConnectorApiError: class ConnectorApiError extends Error {},
}));
vi.mock(
  "lib/db/pg/repositories/connector-action-approval-repository.pg",
  () => ({ connectorActionApprovalRepository: { consume: mocks.consume } }),
);
import { createProductboardToolForUser } from "./productboard-tool";

const execute = (input: Record<string, unknown>) =>
  (createProductboardToolForUser("productboard-owner") as any).execute(
    input,
    {},
  );
const COMPONENT_ID = "0b8f6d1e-1111-4ccc-8ddd-222233334444";
const FEATURE_ID = "aa1b2c3d-4444-4eee-8fff-555566667777";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.consume.mockResolvedValue(false);
  mocks.api.mockResolvedValue({ data: { id: FEATURE_ID, type: "feature" } });
});

describe("Productboard connector", () => {
  it("bounds list inputs, rejects non-UUID targets, and scopes reads to the user", async () => {
    const schema = (createProductboardToolForUser("productboard-owner") as any)
      .inputSchema;
    expect(
      schema.safeParse({ action: "list_components", limit: 101 }).success,
    ).toBe(false);
    expect(
      schema.safeParse({ action: "get_feature", featureId: "not-a-uuid" })
        .success,
    ).toBe(false);
    expect(
      schema.safeParse({
        action: "create_feature",
        componentId: "prod_42",
        name: "Roadmap",
        approvalToken: "h".repeat(43),
      }).success,
    ).toBe(false);
    await execute({
      action: "list_features",
      componentId: COMPONENT_ID,
      limit: 10,
    });
    expect(mocks.api).toHaveBeenCalledWith(
      "productboard-owner",
      "productboard",
      "/v2/entities",
      expect.objectContaining({
        query: { "type[]": "feature", "parent[id]": COMPONENT_ID },
      }),
    );
    await execute({ action: "list_components", limit: 5 });
    expect(mocks.api).toHaveBeenLastCalledWith(
      "productboard-owner",
      "productboard",
      "/v2/entities",
      expect.objectContaining({
        query: { "type[]": "component" },
      }),
    );
  });

  it("has no write path that bypasses approval and binds the exact component and fields", async () => {
    const result = await execute({
      action: "create_feature",
      componentId: COMPONENT_ID,
      name: "Roadmap",
      description: "Reviewed description",
      approvalToken: "h".repeat(43),
    });
    expect(result).toMatchObject({
      error: expect.stringContaining("not been approved"),
    });
    expect(mocks.consume).toHaveBeenCalledWith(
      "productboard-owner",
      "h".repeat(43),
      {
        provider: "productboard",
        action: "create_feature",
        payload: {
          componentId: COMPONENT_ID,
          name: "Roadmap",
          description: "Reviewed description",
        },
      },
    );
    expect(mocks.api).not.toHaveBeenCalled();
  });

  it("creates the feature only under the approved component via the v2 parent relationship", async () => {
    mocks.consume.mockResolvedValue(true);
    await execute({
      action: "create_feature",
      componentId: COMPONENT_ID,
      name: "Roadmap",
      description: "Reviewed description",
      approvalToken: "i".repeat(43),
    });
    expect(mocks.api).toHaveBeenCalledWith(
      "productboard-owner",
      "productboard",
      "/v2/entities",
      expect.objectContaining({
        method: "POST",
        body: {
          data: {
            type: "feature",
            fields: { name: "Roadmap", description: "Reviewed description" },
            relationships: [{ type: "parent", target: { id: COMPONENT_ID } }],
          },
        },
      }),
    );
  });

  it("omits the description field when none was approved", async () => {
    mocks.consume.mockResolvedValue(true);
    await execute({
      action: "create_feature",
      componentId: COMPONENT_ID,
      name: "Roadmap",
      approvalToken: "j".repeat(43),
    });
    expect(mocks.consume).toHaveBeenCalledWith(
      "productboard-owner",
      "j".repeat(43),
      {
        provider: "productboard",
        action: "create_feature",
        payload: { componentId: COMPONENT_ID, name: "Roadmap" },
      },
    );
    expect(mocks.api).toHaveBeenCalledWith(
      "productboard-owner",
      "productboard",
      "/v2/entities",
      expect.objectContaining({
        method: "POST",
        body: {
          data: {
            type: "feature",
            fields: { name: "Roadmap" },
            relationships: [{ type: "parent", target: { id: COMPONENT_ID } }],
          },
        },
      }),
    );
  });

  it("never mutates Productboard on a stale or replayed token and redacts provider failures", async () => {
    mocks.consume.mockResolvedValue(false);
    const blocked = await execute({
      action: "create_feature",
      componentId: COMPONENT_ID,
      name: "Roadmap",
      approvalToken: "k".repeat(43),
    });
    expect(blocked).toMatchObject({
      error: expect.stringContaining("not been approved"),
    });
    expect(mocks.api).not.toHaveBeenCalled();
    mocks.consume.mockResolvedValue(true);
    mocks.api.mockRejectedValueOnce(new Error("private response details"));
    expect(
      await execute({ action: "get_feature", featureId: FEATURE_ID }),
    ).toEqual({ error: "Productboard action failed" });
  });
});
