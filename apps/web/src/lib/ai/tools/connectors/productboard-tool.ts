import { tool } from "ai";
import {
  ConnectorApiError,
  callConnectorApi,
} from "lib/connectors/provider-api";
import { connectorActionApprovalRepository } from "lib/db/pg/repositories/connector-action-approval-repository.pg";
import { z } from "zod";

const approvalToken = z.string().min(43).max(43);
// Productboard API v2 identifies entities by UUID.
const entityId = z.string().uuid();
const inputSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("list_components"),
      limit: z.number().int().min(1).max(100).optional().default(25),
    })
    .strict(),
  z
    .object({
      action: z.literal("list_features"),
      componentId: entityId.optional(),
      limit: z.number().int().min(1).max(100).optional().default(25),
    })
    .strict(),
  z.object({ action: z.literal("get_feature"), featureId: entityId }).strict(),
  z
    .object({
      action: z.literal("create_feature"),
      componentId: entityId,
      name: z.string().min(1).max(255),
      description: z.string().min(1).max(20_000).optional(),
      approvalToken,
    })
    .strict(),
]);

export function createProductboardToolForUser(userId: string) {
  return tool({
    description:
      "Productboard for this signed-in user. List components/features or read a feature. Creating a feature requires first proposing the exact componentId/name/description with proposeConnectorAction and then the user approving it; execute only with the matching one-use approvalToken. Features are always created as children of the approved component.",
    inputSchema,
    execute: async (input) => {
      try {
        if (input.action === "list_components") {
          const result = await callConnectorApi(
            userId,
            "productboard",
            "/v2/entities",
            {
              query: { "type[]": "component" },
            },
          );
          return { components: boundedArray(result, input.limit) };
        }
        if (input.action === "list_features") {
          const result = await callConnectorApi(
            userId,
            "productboard",
            "/v2/entities",
            {
              query: {
                "type[]": "feature",
                ...(input.componentId
                  ? { "parent[id]": input.componentId }
                  : {}),
              },
            },
          );
          return { features: boundedArray(result, input.limit) };
        }
        if (input.action === "get_feature") {
          return await callConnectorApi(
            userId,
            "productboard",
            `/v2/entities/${encodeURIComponent(input.featureId)}`,
          );
        }
        const payload = {
          componentId: input.componentId,
          name: input.name,
          ...(input.description !== undefined
            ? { description: input.description }
            : {}),
        };
        const approved = await connectorActionApprovalRepository.consume(
          userId,
          input.approvalToken,
          {
            provider: "productboard",
            action: "create_feature",
            payload,
          },
        );
        if (!approved)
          throw new ConnectorApiError(
            "This exact Productboard feature has not been approved or its approval expired",
          );
        const result = await callConnectorApi(
          userId,
          "productboard",
          "/v2/entities",
          {
            method: "POST",
            body: {
              data: {
                type: "feature",
                fields: {
                  name: input.name,
                  ...(input.description !== undefined
                    ? { description: input.description }
                    : {}),
                },
                relationships: [
                  { type: "parent", target: { id: input.componentId } },
                ],
              },
            },
          },
        );
        return { success: true, feature: result.data ?? result };
      } catch (error) {
        return {
          error:
            error instanceof ConnectorApiError
              ? error.message
              : "Productboard action failed",
        };
      }
    },
  });
}

function boundedArray(
  value: Record<string, unknown>,
  limit: number,
): unknown[] {
  return Array.isArray(value.data) ? value.data.slice(0, limit) : [];
}
