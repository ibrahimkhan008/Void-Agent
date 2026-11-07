import {
  type ReviewColumn,
  TABULAR_REVIEW_MAX_COLUMNS,
} from "lib/tabular/review-schema";

export type CustomReviewColumnInput = Pick<
  ReviewColumn,
  "label" | "prompt" | "type"
>;

/** Build the exact, bounded column shape accepted by the review API. */
export function buildReviewColumns(
  presets: ReviewColumn[],
  customColumns: CustomReviewColumnInput[],
): ReviewColumn[] | null {
  if (presets.length + customColumns.length > TABULAR_REVIEW_MAX_COLUMNS) {
    return null;
  }

  const custom = customColumns.map((column, index) => ({
    id: `custom_${index + 1}`,
    label: column.label.trim(),
    type: column.type,
    prompt: column.prompt.trim(),
  }));
  const columns = [...presets, ...custom];
  if (
    columns.length === 0 ||
    custom.some((column) => !column.label || !column.prompt)
  ) {
    return null;
  }

  return columns;
}
