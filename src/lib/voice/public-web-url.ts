import { isIP } from "node:net";

/** Accept citation URLs without letting search results point to local networks. */
export function isSafePublicResultUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2_048) return false;
  try {
    const url = new URL(value);
    const hostname = url.hostname
      .toLowerCase()
      .replace(/^\[|\]$/g, "")
      .replace(/\.$/, "");
    if (
      (url.protocol !== "https:" && url.protocol !== "http:") ||
      url.username ||
      url.password ||
      !hostname ||
      isIP(hostname) !== 0 ||
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname.endsWith(".local") ||
      hostname.endsWith(".internal") ||
      hostname.endsWith(".test") ||
      hostname.endsWith(".example") ||
      hostname.endsWith(".invalid")
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}
