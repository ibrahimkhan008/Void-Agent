import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("lib/connectors/provider-api", () => ({
  callConnectorApi: mocks.api,
  ConnectorApiError: class ConnectorApiError extends Error {},
}));

import { createGoogleDocsToolForUser } from "./google-docs-tool";

const execute = (input: Record<string, unknown>) =>
  (createGoogleDocsToolForUser("docs-owner") as any).execute(input, {});

describe("Google Docs read-only connector", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reads only the requested owner document and extracts text runs", async () => {
    mocks.api.mockResolvedValue({
      title: "Planning",
      body: {
        content: [
          { paragraph: { elements: [{ textRun: { content: "Hello" } }] } },
          { table: { tableRows: [{ textRun: { content: " world" } }] } },
        ],
      },
    });
    await expect(execute({ documentId: "doc/1" })).resolves.toMatchObject({
      documentId: "doc/1",
      title: "Planning",
      text: "Hello world",
      truncated: false,
    });
    expect(mocks.api).toHaveBeenCalledWith(
      "docs-owner",
      "google-docs",
      "/v1/documents/doc%2F1",
      { maxResponseBytes: 256 * 1024 },
    );
  });

  it("bounds returned document text", async () => {
    mocks.api.mockResolvedValue({
      body: { content: [{ textRun: { content: "x".repeat(60_001) } }] },
    });
    await expect(execute({ documentId: "doc-1" })).resolves.toMatchObject({
      text: "x".repeat(60_000),
      truncated: true,
    });
  });
});
