export type AgentGenerationApp = { slug: string; name: string };

export const MAX_AGENT_GENERATION_APPS = 50;

/** Return a small, safe catalog of apps the authenticated user has not connected. */
export function getUnconnectedAgentGenerationApps(
  catalogItems: unknown,
  connectedSlugs: Iterable<string>,
): AgentGenerationApp[] {
  if (!Array.isArray(catalogItems)) return [];
  const connected = new Set(
    Array.from(connectedSlugs, (slug) => slug.trim().toLowerCase()),
  );
  const seen = new Set<string>();
  const apps: AgentGenerationApp[] = [];

  for (const candidate of catalogItems) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate))
      continue;
    const item = candidate as Record<string, unknown>;
    if (
      typeof item.slug !== "string" ||
      !/^[a-zA-Z0-9_-]{1,80}$/.test(item.slug) ||
      typeof item.name !== "string" ||
      item.isNoAuth === true
    )
      continue;
    const slug = item.slug.toLowerCase();
    if (connected.has(slug) || seen.has(slug)) continue;
    const name = item.name
      .replace(/[\u0000-\u001f\u007f]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 100);
    if (!name) continue;
    seen.add(slug);
    apps.push({ slug, name });
    if (apps.length >= MAX_AGENT_GENERATION_APPS) break;
  }

  return apps;
}
