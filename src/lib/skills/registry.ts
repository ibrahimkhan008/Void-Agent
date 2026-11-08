import "server-only";

const MAX_REGISTRY_BYTES = 512_000;
const MAX_SKILL_BYTES = 16_384;
const TIMEOUT_MS = 8_000;
const ALLOWED_LICENSES = new Set([
  "MIT",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "ISC",
  "0BSD",
  "CC0-1.0",
  "Unlicense",
]);

export type RegistrySkill = {
  id: string;
  name: string;
  source: string;
  installs: number;
};

export type ImportedSkill = {
  name: string;
  description?: string;
  markdown: string;
  source: string;
  slug: string;
  license: string;
  licenseNotice: string;
  sourceUrl: string;
};

export class SkillsRegistryError extends Error {
  constructor(
    message: string,
    readonly status = 502,
  ) {
    super(message);
    this.name = "SkillsRegistryError";
  }
}

const validSource = (source: string) =>
  /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9](?:[A-Za-z0-9._-]{0,99})$/.test(
    source,
  ) && !source.split("/").some((part) => part.includes(".."));

const validSlug = (slug: string) =>
  /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(slug) && !slug.includes("..");

async function readBounded(response: Response, maxBytes: number) {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await response.body?.cancel().catch(() => undefined);
    throw new SkillsRegistryError("Registry response is too large.", 502);
  }
  if (!response.body) return "";

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new SkillsRegistryError("Registry response is too large.", 502);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(joined);
}

async function fetchFixed(url: string, accept: string, maxBytes: number) {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Accept: accept, "User-Agent": "Void-Agent" },
      redirect: "error",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new SkillsRegistryError("Skills library is temporarily unavailable.");
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw new SkillsRegistryError(
      response.status === 404
        ? "Skill content was not found."
        : "Skills library is temporarily unavailable.",
      response.status === 404 ? 404 : 502,
    );
  }
  return readBounded(response, maxBytes);
}

export async function searchSkillsRegistry(
  query: string,
): Promise<RegistrySkill[]> {
  const normalized = query.trim().slice(0, 100);
  const search = normalized.length ? normalized : "vercel";
  const params = new URLSearchParams({
    q: search,
    limit: normalized ? "12" : "20",
  });
  const raw = await fetchFixed(
    `https://skills.sh/api/search?${params}`,
    "application/json",
    MAX_REGISTRY_BYTES,
  );
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    throw new SkillsRegistryError("Skills library returned invalid data.");
  }
  const entries = (payload as { skills?: unknown } | null)?.skills;
  if (!Array.isArray(entries)) return [];
  return entries
    .map((entry): RegistrySkill | null => {
      if (!entry || typeof entry !== "object") return null;
      const item = entry as Record<string, unknown>;
      const source = typeof item.source === "string" ? item.source.trim() : "";
      const id =
        typeof item.skillId === "string"
          ? item.skillId.trim()
          : typeof item.id === "string"
            ? (item.id.split("/").at(-1)?.trim() ?? "")
            : "";
      const name = typeof item.name === "string" ? item.name.trim() : "";
      const installs = Number(item.installs);
      if (
        !validSource(source) ||
        !validSlug(id) ||
        !name ||
        name.length > 100
      ) {
        return null;
      }
      return {
        id,
        source,
        name,
        installs: Number.isFinite(installs) ? Math.max(0, installs) : 0,
      };
    })
    .filter((item): item is RegistrySkill => item !== null)
    .sort((a, b) => b.installs - a.installs)
    .slice(0, 20);
}

function frontmatter(raw: string) {
  const match = raw.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  const metadata = match?.[1] ?? "";
  const field = (name: string) => {
    const value = metadata.match(new RegExp(`^${name}:\\s*(.+)$`, "m"))?.[1];
    return value?.trim().replace(/^['"]|['"]$/g, "");
  };
  return {
    description: field("description"),
    name: field("name"),
    body: (match ? raw.slice(match[0].length) : raw).trim(),
  };
}

export async function fetchRegistrySkill(
  source: string,
  slug: string,
): Promise<ImportedSkill> {
  const normalizedSource = source.trim();
  const normalizedSlug = slug.trim();
  if (!validSource(normalizedSource) || !validSlug(normalizedSlug)) {
    throw new SkillsRegistryError("Invalid skill source.", 400);
  }
  const [owner, repo] = normalizedSource.split("/");
  const encodedSource = `${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const licenseText = await fetchFixed(
    `https://api.github.com/repos/${encodedSource}/license`,
    "application/vnd.github+json",
    32_000,
  );
  let license: string;
  let licenseNotice = "";
  try {
    const licenseData = JSON.parse(licenseText) as {
      license?: { spdx_id?: unknown };
      content?: unknown;
      encoding?: unknown;
    };
    license =
      typeof licenseData.license?.spdx_id === "string"
        ? licenseData.license.spdx_id
        : "NOASSERTION";
    if (
      licenseData.encoding === "base64" &&
      typeof licenseData.content === "string"
    ) {
      const encoded = licenseData.content.replace(/\s/g, "");
      if (encoded.length <= 22_000 && /^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) {
        licenseNotice = Buffer.from(encoded, "base64").toString("utf8").trim();
      }
    }
  } catch {
    license = "NOASSERTION";
  }
  if (
    !ALLOWED_LICENSES.has(license) ||
    !licenseNotice ||
    licenseNotice.length > 16_384
  ) {
    throw new SkillsRegistryError(
      "This repository does not provide a supported permissive license and its notice, so its instructions cannot be imported. Open the source repository to review it instead.",
      422,
    );
  }

  const encodedSlug = encodeURIComponent(normalizedSlug);
  const paths = [
    `skills/${encodedSlug}/SKILL.md`,
    `${encodedSlug}/SKILL.md`,
    `.claude/skills/${encodedSlug}/SKILL.md`,
    `.agents/skills/${encodedSlug}/SKILL.md`,
    "SKILL.md",
  ];
  let raw: string | null = null;
  for (const path of paths) {
    try {
      raw = await fetchFixed(
        `https://raw.githubusercontent.com/${encodedSource}/HEAD/${path}`,
        "text/plain",
        MAX_SKILL_BYTES,
      );
      if (raw.trim()) break;
    } catch (error) {
      if (error instanceof SkillsRegistryError && error.status === 404)
        continue;
      throw error;
    }
  }
  if (!raw?.trim()) {
    throw new SkillsRegistryError(
      "No SKILL.md was found in that repository.",
      404,
    );
  }
  const parsed = frontmatter(raw);
  if (!parsed.body)
    throw new SkillsRegistryError("The skill instructions are empty.", 422);
  return {
    name: parsed.name?.slice(0, 100) || normalizedSlug,
    description: parsed.description?.slice(0, 240),
    markdown: parsed.body.slice(0, MAX_SKILL_BYTES),
    source: normalizedSource,
    slug: normalizedSlug,
    license,
    licenseNotice,
    sourceUrl: `https://github.com/${owner}/${repo}`,
  };
}

export const isSupportedSkillLicense = (license: string) =>
  ALLOWED_LICENSES.has(license);
