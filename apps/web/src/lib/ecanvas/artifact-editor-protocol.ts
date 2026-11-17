export interface ArtifactElementSelection {
  id: string;
  text: string;
  color: string;
  backgroundColor: string;
  fontSize: number;
  canEditText: boolean;
}

export function parseArtifactElementSelection(
  value: unknown,
): ArtifactElementSelection | null {
  if (!value || typeof value !== "object") return null;
  const selection = value as Partial<ArtifactElementSelection>;
  if (
    typeof selection.id !== "string" ||
    selection.id.length === 0 ||
    selection.id.length > 80 ||
    typeof selection.text !== "string" ||
    selection.text.length > 4000 ||
    typeof selection.color !== "string" ||
    !/^#[0-9a-f]{6}$/iu.test(selection.color) ||
    typeof selection.backgroundColor !== "string" ||
    !/^#[0-9a-f]{6}$/iu.test(selection.backgroundColor) ||
    typeof selection.fontSize !== "number" ||
    !Number.isFinite(selection.fontSize) ||
    typeof selection.canEditText !== "boolean"
  ) {
    return null;
  }
  return selection as ArtifactElementSelection;
}

export function parseEditedArtifact(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return new TextEncoder().encode(value).byteLength <= 512 * 1024
    ? value
    : null;
}
