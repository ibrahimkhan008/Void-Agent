import { tool } from "ai";
import {
  ConnectorApiError,
  callConnectorApi,
} from "lib/connectors/provider-api";
import { z } from "zod";

const inputSchema = z.object({
  spreadsheetId: z.string().trim().min(1).max(256),
  range: z.string().trim().min(1).max(200),
});

export function createGoogleSheetsToolForUser(userId: string) {
  return tool({
    description:
      "Read a bounded range of cells from a Google Sheet the signed-in user can access. This tool is read-only; it cannot change spreadsheet data.",
    inputSchema,
    execute: async ({ spreadsheetId, range }) => {
      try {
        const result = await callConnectorApi(
          userId,
          "google-sheets",
          `/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`,
          {
            query: {
              majorDimension: "ROWS",
              valueRenderOption: "FORMATTED_VALUE",
            },
            maxResponseBytes: 256 * 1024,
          },
        );
        const sourceValues = Array.isArray(result.values) ? result.values : [];
        let truncated = sourceValues.length > 100;
        const values = sourceValues.slice(0, 100).map((row) => {
          if (!Array.isArray(row)) return [];
          if (row.length > 30) truncated = true;
          return row.slice(0, 30).map((cell) => {
            if (typeof cell !== "string" && typeof cell !== "number") return "";
            if (String(cell).length > 2000) truncated = true;
            return String(cell).slice(0, 2000);
          });
        });
        return {
          spreadsheetId,
          range: typeof result.range === "string" ? result.range : range,
          values,
          truncated,
        };
      } catch (error) {
        return {
          error:
            error instanceof ConnectorApiError
              ? error.message
              : "Google Sheets could not be read",
        };
      }
    },
  });
}
