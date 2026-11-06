/** Slugs are bearer capabilities: require a 96-bit lowercase hex suffix. */
export function isValidPageSlug(slug: string) {
  return /^[a-z0-9-]{1,48}-[0-9a-f]{24}$/.test(slug);
}
