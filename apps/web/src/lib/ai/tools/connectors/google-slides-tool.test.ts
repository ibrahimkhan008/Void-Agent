import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("ai", () => ({ tool: (definition: unknown) => definition }));
const { callConnectorApi } = vi.hoisted(() => ({ callConnectorApi: vi.fn() }));
vi.mock("lib/connectors/provider-api", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("lib/connectors/provider-api")>();
  return { ...actual, callConnectorApi };
});

import { createGoogleSlidesToolForUser } from "./google-slides-tool";

describe("Google Slides connector tool", () => {
  it("reads only the user's presentation and bounds extracted content", async () => {
    callConnectorApi.mockResolvedValueOnce({
      title: "Quarterly update",
      slides: [{ pageElements: [{ textRun: { content: "Revenue\\n" } }] }],
    });
    const connector = createGoogleSlidesToolForUser("user-1") as unknown as {
      execute: (input: { presentationId: string }) => Promise<unknown>;
    };

    await expect(
      connector.execute({ presentationId: "slide/id" }),
    ).resolves.toEqual({
      presentationId: "slide/id",
      title: "Quarterly update",
      slideCount: 1,
      text: "Revenue\\n",
      truncated: false,
    });
    expect(callConnectorApi).toHaveBeenCalledWith(
      "user-1",
      "google-slides",
      "/v1/presentations/slide%2Fid",
      { maxResponseBytes: 256 * 1024 },
    );
  });

  it("returns a safe provider error", async () => {
    callConnectorApi.mockRejectedValueOnce(new Error("secret token"));
    const connector = createGoogleSlidesToolForUser("user-1") as unknown as {
      execute: (input: { presentationId: string }) => Promise<unknown>;
    };
    await expect(
      connector.execute({ presentationId: "slide-1" }),
    ).resolves.toEqual({
      error: "Google Slides could not be read",
    });
  });
});
