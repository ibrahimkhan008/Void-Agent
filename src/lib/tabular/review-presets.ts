type ReviewPresetColumn = {
  id: string;
  label: string;
  type: "text" | "date" | "boolean" | "list" | "score" | "citation";
  prompt: string;
};

/** Stable, shared column definitions used by the dashboard and chat tool. */
export const REVIEW_COLUMN_PRESETS = {
  summary: {
    id: "summary",
    label: "Summary",
    type: "text",
    prompt:
      "Write a concise 2–4 sentence summary of this document's main purpose and content.",
  },
  key_dates: {
    id: "key_dates",
    label: "Key dates",
    type: "list",
    prompt:
      "List all important dates mentioned in this document (effective date, expiry, deadlines, etc.). Format each as 'YYYY-MM-DD: description'.",
  },
  parties: {
    id: "parties",
    label: "Parties",
    type: "list",
    prompt:
      "List all parties named in this document (full legal names and their roles).",
  },
  obligations: {
    id: "obligations",
    label: "Obligations",
    type: "list",
    prompt:
      "List the primary obligations and commitments for each party in this document.",
  },
  risks: {
    id: "risks",
    label: "Risks",
    type: "list",
    prompt:
      "Identify any unusual, risky, or one-sided clauses, missing standard protections, or liability concerns.",
  },
  penalty: {
    id: "penalty",
    label: "Penalties & remedies",
    type: "text",
    prompt:
      "Describe any penalty clauses, liquidated damages, indemnification provisions, or breach remedies.",
  },
  jurisdiction: {
    id: "jurisdiction",
    label: "Jurisdiction",
    type: "text",
    prompt:
      "State the governing law and dispute resolution mechanism (court, arbitration, etc.).",
  },
} as const satisfies Record<string, ReviewPresetColumn>;

export type ReviewColumnPresetId =
  | "summary"
  | "key_dates"
  | "parties"
  | "obligations"
  | "risks"
  | "penalty"
  | "jurisdiction";

export type PersistedReviewColumn = ReviewPresetColumn;

export function isReviewColumnPresetId(
  value: string,
): value is ReviewColumnPresetId {
  return Object.hasOwn(REVIEW_COLUMN_PRESETS, value);
}

/** A known preset always uses its reviewed prompt; custom columns use their prompt. */
export function resolveReviewColumnPrompt(column: {
  preset?: string;
  label: string;
  prompt?: string;
}): string {
  if (column.preset && isReviewColumnPresetId(column.preset)) {
    return REVIEW_COLUMN_PRESETS[column.preset].prompt;
  }
  return (
    column.prompt?.trim() || `Extract the "${column.label}" from this document.`
  );
}

/** Resolve validated API/tool input to the legacy required-prompt DB shape. */
export function normalizeReviewColumn(column: {
  id: string;
  label: string;
  type: ReviewPresetColumn["type"];
  preset?: string;
  prompt?: string;
}): PersistedReviewColumn {
  return {
    id: column.id,
    label: column.label,
    type: column.type,
    prompt: resolveReviewColumnPrompt(column),
  };
}

export function buildReviewPresetColumn(presetId: ReviewColumnPresetId) {
  const preset = REVIEW_COLUMN_PRESETS[presetId];
  return { ...preset, preset: presetId };
}
