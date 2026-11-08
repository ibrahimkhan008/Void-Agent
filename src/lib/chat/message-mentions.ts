export type MessageMention = {
  type: "agent" | "tool" | "workflow" | "mcp";
  name: string;
  text: string;
  start: number;
  quote: "'" | '"';
};

export type MessageTextSegment = {
  type: "text";
  text: string;
  start: number;
};

/** Parse only the explicit mention syntax emitted by the chat composer. */
export function parseMessageMentions(
  text: string,
): Array<MessageTextSegment | MessageMention> {
  const parts: Array<MessageTextSegment | MessageMention> = [];
  const pattern = /@(agent|tool|workflow|mcp)\((['"])([^\r\n]+?)\2\)/g;
  let offset = 0;

  for (const match of text.matchAll(pattern)) {
    const start = match.index ?? 0;
    if (start > offset) {
      parts.push({
        type: "text",
        text: text.slice(offset, start),
        start: offset,
      });
    }
    parts.push({
      type: match[1] as MessageMention["type"],
      name: match[3],
      text: match[0],
      start,
      quote: match[2] as MessageMention["quote"],
    });
    offset = start + match[0].length;
  }

  if (offset < text.length) {
    parts.push({ type: "text", text: text.slice(offset), start: offset });
  }
  return parts.length ? parts : [{ type: "text", text, start: 0 }];
}

/** Keep a mention whole when a collapsed message preview cuts through it. */
export function truncateMessageMentions(text: string, maxLength: number) {
  if (text.length <= maxLength) return text;
  const mention = parseMessageMentions(text).find(
    (part) =>
      part.type !== "text" &&
      part.start < maxLength &&
      part.start + part.text.length > maxLength,
  );
  const end = mention ? mention.start + mention.text.length : maxLength;
  return `${text.slice(0, end)}...`;
}
