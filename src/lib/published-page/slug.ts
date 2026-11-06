import { randomBytes } from "node:crypto";
export { isValidPageSlug } from "./slug-validation";

const RANDOM_SUFFIX_BYTES = 12;

function readablePrefix(title: string) {
  const cleaned = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
  return cleaned || "page";
}

/** The slug acts as a bearer link, so its suffix must have at least 96 bits. */
export function buildPageSlug(title: string) {
  return `${readablePrefix(title)}-${randomBytes(RANDOM_SUFFIX_BYTES).toString("hex")}`;
}
