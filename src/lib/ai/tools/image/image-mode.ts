export type ImageToolMode = "create" | "edit" | "composite";

const EDIT_INTENT_REGEX =
  /\b(edit|change|replace|remove|background|stylize|style|restyle|retouch|enhance|bright(?:en|er)|darken|sharpen|convert|transform|ghibli|anime)\b/i;
const CREATE_INTENT_REGEX = /\b(generate|create|draw|render|design|make)\b/i;
const COMPOSITE_INTENT_REGEX =
  /\b(combine|composite|merge|blend|fuse|collage|use both|using both|from (?:these|both) images)\b/i;

export function inferImageToolMode(
  inputMode: ImageToolMode | undefined,
  prompt: string,
  hasImageInput: boolean,
): ImageToolMode {
  if (inputMode) return inputMode;
  if (!hasImageInput) return "create";
  if (COMPOSITE_INTENT_REGEX.test(prompt)) return "composite";

  const hasEditIntent = EDIT_INTENT_REGEX.test(prompt);
  const hasCreateIntent = CREATE_INTENT_REGEX.test(prompt);

  if (hasEditIntent) return "edit";
  if (hasCreateIntent && !hasEditIntent) return "create";
  return "edit";
}
