import { tool } from "ai";
import {
  ConnectorApiError,
  callConnectorApi,
} from "lib/connectors/provider-api";
import { z } from "zod";

const inputSchema = z.object({
  formId: z.string().trim().min(1).max(256),
});

function getQuestion(item: unknown) {
  if (!item || typeof item !== "object") return null;
  const questionItem = (item as Record<string, unknown>).questionItem;
  if (!questionItem || typeof questionItem !== "object") return null;
  const question = (questionItem as Record<string, unknown>).question;
  if (!question || typeof question !== "object") return null;
  const record = question as Record<string, unknown>;
  const choiceQuestion = record.choiceQuestion;
  const options =
    choiceQuestion && typeof choiceQuestion === "object"
      ? (choiceQuestion as Record<string, unknown>).options
      : undefined;
  return {
    questionId:
      typeof record.questionId === "string" ? record.questionId : undefined,
    required: record.required === true,
    ...(Array.isArray(options)
      ? {
          options: options
            .slice(0, 50)
            .map((option) =>
              option &&
              typeof option === "object" &&
              typeof (option as Record<string, unknown>).value === "string"
                ? (option as Record<string, string>).value.slice(0, 500)
                : "",
            ),
        }
      : {}),
  };
}

export function createGoogleFormsToolForUser(userId: string) {
  return tool({
    description:
      "Read the title and question structure of a Google Form the signed-in user can access. This tool is read-only and does not fetch responses or edit the form.",
    inputSchema,
    execute: async ({ formId }) => {
      try {
        const form = await callConnectorApi(
          userId,
          "google-forms",
          `/v1/forms/${encodeURIComponent(formId)}`,
          { maxResponseBytes: 256 * 1024 },
        );
        const info =
          form.info && typeof form.info === "object"
            ? (form.info as Record<string, unknown>)
            : {};
        const sourceItems = Array.isArray(form.items) ? form.items : [];
        const truncated = sourceItems.length > 100;
        const items = sourceItems.slice(0, 100).map((item) => {
          const record =
            item && typeof item === "object"
              ? (item as Record<string, unknown>)
              : {};
          return {
            title:
              typeof record.title === "string"
                ? record.title.slice(0, 500)
                : "",
            ...(typeof record.description === "string"
              ? { description: record.description.slice(0, 2_000) }
              : {}),
            question: getQuestion(item),
          };
        });
        return {
          formId,
          title: typeof info.title === "string" ? info.title : "",
          description:
            typeof info.description === "string"
              ? info.description.slice(0, 4_000)
              : "",
          items,
          truncated,
        };
      } catch (error) {
        return {
          error:
            error instanceof ConnectorApiError
              ? error.message
              : "Google Forms could not be read",
        };
      }
    },
  });
}
