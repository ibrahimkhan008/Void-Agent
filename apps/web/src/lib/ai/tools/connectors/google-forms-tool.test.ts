import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("ai", () => ({ tool: (definition: unknown) => definition }));
const { callConnectorApi } = vi.hoisted(() => ({ callConnectorApi: vi.fn() }));
vi.mock("lib/connectors/provider-api", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("lib/connectors/provider-api")>();
  return { ...actual, callConnectorApi };
});

import { createGoogleFormsToolForUser } from "./google-forms-tool";

describe("Google Forms connector tool", () => {
  it("returns bounded form structure without reading responses", async () => {
    callConnectorApi.mockResolvedValueOnce({
      info: { title: "Intake", description: "New customer intake" },
      items: [
        {
          title: "Plan",
          questionItem: {
            question: {
              questionId: "q1",
              required: true,
              choiceQuestion: {
                options: [{ value: "Basic" }, { value: "Pro" }],
              },
            },
          },
        },
      ],
    });
    const connector = createGoogleFormsToolForUser("user-1") as unknown as {
      execute: (input: { formId: string }) => Promise<unknown>;
    };

    await expect(connector.execute({ formId: "form/id" })).resolves.toEqual({
      formId: "form/id",
      title: "Intake",
      description: "New customer intake",
      items: [
        {
          title: "Plan",
          question: {
            questionId: "q1",
            required: true,
            options: ["Basic", "Pro"],
          },
        },
      ],
      truncated: false,
    });
    expect(callConnectorApi).toHaveBeenCalledWith(
      "user-1",
      "google-forms",
      "/v1/forms/form%2Fid",
      { maxResponseBytes: 256 * 1024 },
    );
  });

  it("returns a safe provider error", async () => {
    callConnectorApi.mockRejectedValueOnce(new Error("secret token"));
    const connector = createGoogleFormsToolForUser("user-1") as unknown as {
      execute: (input: { formId: string }) => Promise<unknown>;
    };
    await expect(connector.execute({ formId: "form-1" })).resolves.toEqual({
      error: "Google Forms could not be read",
    });
  });
});
