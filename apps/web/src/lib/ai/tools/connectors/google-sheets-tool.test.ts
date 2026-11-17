import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("lib/connectors/provider-api", () => ({
  callConnectorApi: mocks.api,
  ConnectorApiError: class ConnectorApiError extends Error {},
}));

import { createGoogleSheetsToolForUser } from "./google-sheets-tool";

const execute = (input: Record<string, unknown>) =>
  (createGoogleSheetsToolForUser("sheets-owner") as any).execute(input, {});

describe("Google Sheets read-only connector", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reads a URI-encoded range for the authenticated owner", async () => {
    mocks.api.mockResolvedValue({
      range: "Costs!A1:B2",
      values: [
        ["Item", "Cost"],
        ["Hosting", 20],
      ],
    });
    await expect(
      execute({ spreadsheetId: "sheet/1", range: "Costs!A1:B2" }),
    ).resolves.toMatchObject({
      spreadsheetId: "sheet/1",
      range: "Costs!A1:B2",
      values: [
        ["Item", "Cost"],
        ["Hosting", "20"],
      ],
      truncated: false,
    });
    expect(mocks.api).toHaveBeenCalledWith(
      "sheets-owner",
      "google-sheets",
      "/v4/spreadsheets/sheet%2F1/values/Costs!A1%3AB2",
      {
        query: {
          majorDimension: "ROWS",
          valueRenderOption: "FORMATTED_VALUE",
        },
        maxResponseBytes: 256 * 1024,
      },
    );
  });

  it("bounds the result to 100 rows, 30 columns, and 2,000 characters per cell", async () => {
    mocks.api.mockResolvedValue({
      values: Array.from({ length: 101 }, () => ["x".repeat(2_001)]),
    });
    const result = await execute({ spreadsheetId: "sheet-1", range: "A:Z" });
    expect(result.values).toHaveLength(100);
    expect(result.values[0][0]).toHaveLength(2_000);
    expect(result.truncated).toBe(true);
  });
});
