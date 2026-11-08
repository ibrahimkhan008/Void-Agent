import type { ReviewColumnPresetId } from "lib/tabular/review-presets";
import {
  type ReviewColumn,
  TABULAR_REVIEW_MAX_COLUMNS,
} from "lib/tabular/review-schema";

export type CustomReviewColumnInput = {
  label: string;
  prompt: string;
  type: ReviewColumn["type"];
};

type SelectedPresetColumn = {
  id: string;
  label: string;
  prompt: string;
  preset?: ReviewColumnPresetId;
  type: ReviewColumn["type"];
};

/** Build the exact, bounded column shape accepted by the review API. */
export function buildReviewColumns(
  presets: SelectedPresetColumn[],
  customColumns: CustomReviewColumnInput[],
): Array<
  SelectedPresetColumn | (CustomReviewColumnInput & { id: string })
> | null {
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
