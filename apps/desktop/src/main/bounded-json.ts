const OUTPUT_CHUNK_CHARS = 8_192;
const MAX_JSON_DEPTH = 64;

/** Serialize JSON data without first allocating an unbounded string. */
export function stringifyBoundedJson(value: unknown, maxChars: number): string {
  if (!Number.isSafeInteger(maxChars) || maxChars <= 0) {
    throw new RangeError("JSON output limit must be a positive integer");
  }

  const chunks: string[] = [];
  let pending = "";
  let written = 0;

  const append = (part: string) => {
    if (written + part.length > maxChars) {
      throw new Error("JSON output exceeded the size limit");
    }
    written += part.length;
    let offset = 0;
    while (offset < part.length) {
      const available = OUTPUT_CHUNK_CHARS - pending.length;
      const end = Math.min(part.length, offset + available);
      pending += part.slice(offset, end);
      offset = end;
      if (pending.length === OUTPUT_CHUNK_CHARS) {
        chunks.push(pending);
        pending = "";
      }
    }
  };

  const writeString = (value: string) => {
    append('"');
    for (let index = 0; index < value.length; index += 1) {
      const character = value[index]!;
      const code = value.charCodeAt(index);
      switch (character) {
        case '"':
          append('\\"');
          break;
        case "\\":
          append("\\\\");
          break;
        case "\b":
          append("\\b");
          break;
        case "\f":
          append("\\f");
          break;
        case "\n":
          append("\\n");
          break;
        case "\r":
          append("\\r");
          break;
        case "\t":
          append("\\t");
          break;
        default:
          if (code < 0x20) {
            append(`\\u${code.toString(16).padStart(4, "0")}`);
          } else {
            append(character);
          }
      }
    }
    append('"');
  };

  const writeValue = (current: unknown, depth: number): void => {
    if (depth > MAX_JSON_DEPTH) {
      throw new Error("JSON output exceeded the nesting limit");
    }
    if (current === null) {
      append("null");
      return;
    }
    if (typeof current === "string") {
      writeString(current);
      return;
    }
    if (typeof current === "boolean") {
      append(current ? "true" : "false");
      return;
    }
    if (typeof current === "number") {
      append(Number.isFinite(current) ? String(current) : "null");
      return;
    }
    if (Array.isArray(current)) {
      if (current.length > maxChars) {
        throw new Error("JSON output exceeded the size limit");
      }
      append("[");
      for (let index = 0; index < current.length; index += 1) {
        if (index > 0) append(",");
        const item = current[index];
        if (
          item === undefined ||
          typeof item === "function" ||
          typeof item === "symbol"
        ) {
          append("null");
        } else {
          writeValue(item, depth + 1);
        }
      }
      append("]");
      return;
    }
    if (typeof current === "object") {
      const prototype = Object.getPrototypeOf(current);
      if (prototype !== Object.prototype && prototype !== null) {
        throw new Error("JSON output contains a non-plain object");
      }
      append("{");
      let first = true;
      for (const key in current) {
        if (!Object.prototype.hasOwnProperty.call(current, key)) continue;
        const descriptor = Object.getOwnPropertyDescriptor(current, key);
        if (!descriptor || descriptor.get || descriptor.set) {
          throw new Error("JSON output contains an accessor property");
        }
        const nested = descriptor.value as unknown;
        if (
          nested === undefined ||
          typeof nested === "function" ||
          typeof nested === "symbol"
        ) {
          continue;
        }
        if (!first) append(",");
        first = false;
        writeString(key);
        append(":");
        writeValue(nested, depth + 1);
      }
      append("}");
      return;
    }
    throw new Error("JSON output contains an unsupported value");
  };

  writeValue(value, 0);
  if (pending) chunks.push(pending);
  return chunks.join("");
}
