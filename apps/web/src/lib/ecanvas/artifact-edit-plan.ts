export type ArtifactEditOperation =
  | { operation: "set-text"; selector: string; text: string }
  | {
      operation: "set-style";
      selector: string;
      property: "color" | "backgroundColor" | "fontSize";
      value: string;
    }
  | { operation: "remove"; selector: string }
  | {
      operation: "insert-after";
      selector: string;
      tag: "p" | "h2" | "li" | "div";
      text: string;
    }
  | {
      operation: "move-before";
      selector: string;
      targetSelector: string;
    };

const MAX_OPERATIONS = 20;
const MAX_TEXT_LENGTH = 4_000;
const BLOCKED_SELECTOR_TARGETS =
  /(?:^|[\s>+~,])(?:html|body|head|script|style|iframe)(?=$|[\s.#:[>+~,])/iu;

function isSafeSelector(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 160 &&
    !/[{};]/u.test(value) &&
    !BLOCKED_SELECTOR_TARGETS.test(value)
  );
}

function parseOperation(value: unknown): ArtifactEditOperation | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  if (!isSafeSelector(item.selector)) return null;

  if (item.operation === "set-text") {
    if (typeof item.text !== "string" || item.text.length > MAX_TEXT_LENGTH)
      return null;
    return {
      operation: item.operation,
      selector: item.selector,
      text: item.text,
    };
  }
  if (item.operation === "set-style") {
    if (item.property === "color" || item.property === "backgroundColor") {
      if (
        typeof item.value !== "string" ||
        item.value.length > 64 ||
        !/^#[0-9a-f]{6}$/iu.test(item.value)
      )
        return null;
      return {
        operation: item.operation,
        selector: item.selector,
        property: item.property,
        value: item.value,
      };
    }
    if (item.property === "fontSize") {
      const size = typeof item.value === "string" ? Number(item.value) : NaN;
      if (!Number.isFinite(size) || size < 8 || size > 96) return null;
      return {
        operation: item.operation,
        selector: item.selector,
        property: item.property,
        value: `${size}px`,
      };
    }
    return null;
  }
  if (item.operation === "remove") {
    return { operation: item.operation, selector: item.selector };
  }
  if (item.operation === "insert-after") {
    if (
      !["p", "h2", "li", "div"].includes(String(item.tag)) ||
      typeof item.text !== "string" ||
      item.text.length > MAX_TEXT_LENGTH
    )
      return null;
    return {
      operation: item.operation,
      selector: item.selector,
      tag: item.tag as "p" | "h2" | "li" | "div",
      text: item.text,
    };
  }
  if (item.operation === "move-before" && isSafeSelector(item.targetSelector)) {
    return {
      operation: item.operation,
      selector: item.selector,
      targetSelector: item.targetSelector,
    };
  }
  return null;
}

export function parseArtifactEditPlan(
  response: string,
): ArtifactEditOperation[] | null {
  const source = response
    .trim()
    .replace(/^```(?:json)?\s*/iu, "")
    .replace(/\s*```$/u, "");
  try {
    const parsed: unknown = JSON.parse(source);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return null;
    const operations = (parsed as { operations?: unknown }).operations;
    if (!Array.isArray(operations) || operations.length > MAX_OPERATIONS)
      return null;
    const validated = operations.map(parseOperation);
    return validated.every(Boolean)
      ? (validated as ArtifactEditOperation[])
      : null;
  } catch {
    return null;
  }
}
