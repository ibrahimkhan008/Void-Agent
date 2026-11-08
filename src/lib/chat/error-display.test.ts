import { describe, expect, it } from "vitest";
import { getActionableChatErrorMessage } from "./error-display";

describe("getActionableChatErrorMessage", () => {
  it("shows retry guidance for rate limits and provider configuration failures", () => {
    expect(
      getActionableChatErrorMessage(
        new Error(
          "The selected model is rate limited right now. Please retry shortly or pick another model.",
        ),
      ),
    ).toMatch(/wait briefly.*choose another enabled model/i);

    expect(
      getActionableChatErrorMessage(
        new Error(
          "The model provider returned an error. Please try another model.",
        ),
      ),
    ).toMatch(/another enabled model.*administrator.*provider configuration/i);
  });

  it("keeps generic server errors actionable without exposing arbitrary details", () => {
    expect(
      getActionableChatErrorMessage(
        new Error("An error occurred while processing your request."),
      ),
    ).toMatch(/retry your message.*another enabled model/i);

    const rawProviderError = new Error(
      "OPENAI_API_KEY=secret-value; upstream returned invalid authorization header",
    );
    const displayed = getActionableChatErrorMessage(rawProviderError);
    expect(displayed).toMatch(/retry your message/i);
    expect(displayed).not.toContain("OPENAI_API_KEY");
    expect(displayed).not.toContain("secret-value");
    expect(displayed).not.toContain("invalid authorization");
  });

  it("gives network failures connection and retry guidance", () => {
    expect(getActionableChatErrorMessage(new Error("Failed to fetch"))).toMatch(
      /check your connection and retry/i,
    );
  });

  it("preserves the primary product's monthly team-budget guidance", () => {
    expect(
      getActionableChatErrorMessage(
        new Error("This team member's monthly AI allowance has been reached."),
      ),
    ).toMatch(/monthly AI allowance.*administrator/i);
    expect(
      getActionableChatErrorMessage(
        new Error(
          "This model has no administrator-configured usage pricing and cannot be used with team budgets.",
        ),
      ),
    ).toMatch(/team-budget pricing.*team administrator/i);
  });

  it("fails closed for non-Error input", () => {
    expect(getActionableChatErrorMessage("provider details")).toMatch(
      /ask your administrator to check provider configuration/i,
    );
  });
});
