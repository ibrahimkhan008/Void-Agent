/**
 * User-facing chat failure copy. Only exact, server-produced safe messages are
 * expanded; arbitrary provider messages and nested error details stay hidden.
 */
const SAFE_CHAT_ERROR_MESSAGES = new Map<string, string>([
  [
    "The selected model is rate limited right now. Please retry shortly or pick another model.",
    "The selected model is temporarily rate-limited. Wait briefly and try again, or choose another enabled model.",
  ],
  [
    "The model provider returned an error. Please try another model.",
    "The selected model provider couldn't complete this request. Try another enabled model. If this keeps happening, ask your administrator to check the provider configuration.",
  ],
  [
    "An error occurred while processing your request.",
    "The response couldn't be completed. Retry your message. If it happens again, try another enabled model or ask your administrator to check provider configuration.",
  ],
  [
    "This team member's monthly AI allowance has been reached.",
    "Your team's monthly AI allowance has been reached. Ask your team administrator about the allowance or try again next month.",
  ],
  [
    "This model has no administrator-configured usage pricing and cannot be used with team budgets.",
    "This model doesn't have team-budget pricing configured. Ask your team administrator to configure its pricing or choose another enabled model.",
  ],
  [
    "This model's configured pricing currency does not match the team budget currency.",
    "This model's pricing currency doesn't match your team's budget. Ask your team administrator to correct the model pricing configuration or choose another model.",
  ],
  [
    "Failed to fetch",
    "The connection was interrupted before the response completed. Check your connection and retry the message.",
  ],
  [
    "Load failed",
    "The connection was interrupted before the response completed. Check your connection and retry the message.",
  ],
]);

const DEFAULT_CHAT_ERROR_MESSAGE =
  "The response couldn't be completed. Retry your message. If it happens again, try another enabled model or ask your administrator to check provider configuration.";

export function getActionableChatErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return DEFAULT_CHAT_ERROR_MESSAGE;
  return (
    SAFE_CHAT_ERROR_MESSAGES.get(error.message.trim()) ??
    DEFAULT_CHAT_ERROR_MESSAGE
  );
}
