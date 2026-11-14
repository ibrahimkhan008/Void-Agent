/**
 * Project-aware skill recommendations (master prompt §3.12): detect what a
 * project is about from its name/goal/description, then recommend skills.sh
 * searches that match its domain — Cloudflare security for Cloudflare
 * projects, Next.js guidance, OWASP security practices, PostgreSQL, Docker,
 * performance, accessibility, SEO, Three.js/WebGL — the examples the product
 * definition names.
 */

export interface SkillRecommendation {
  domain: string;
  label: string;
  why: string;
  queries: string[];
}

const CATALOG: {
  domain: string;
  label: string;
  why: string;
  queries: string[];
  keywords: string[];
}[] = [
  {
    domain: "nextjs",
    label: "Next.js development",
    why: "The project mentions Next.js — App Router, caching, and deployment guidance skills fit it.",
    queries: ["nextjs", "next.js app router"],
    keywords: ["next", "nextjs", "app router", "react server"],
  },
  {
    domain: "cloudflare",
    label: "Cloudflare security & workers",
    why: "Cloudflare projects benefit from Workers, Pages, and WAF-oriented skills.",
    queries: ["cloudflare security", "cloudflare workers"],
    keywords: ["cloudflare", "workers", "pages", "waf", "tunnel"],
  },
  {
    domain: "security",
    label: "OWASP security practices",
    why: "Every project that handles input, auth, or APIs should get an OWASP pass.",
    queries: ["owasp", "security review", "threat modeling"],
    keywords: [
      "security",
      "auth",
      "login",
      "api",
      "vulnerability",
      "exploit",
      "owasp",
    ],
  },
  {
    domain: "postgresql",
    label: "PostgreSQL guidance",
    why: "Database-backed projects get schema, index, and query skills.",
    queries: ["postgresql", "postgres performance", "sql schema"],
    keywords: [
      "postgres",
      "postgresql",
      "database",
      "sql",
      "drizzle",
      "schema",
      "migration",
    ],
  },
  {
    domain: "docker",
    label: "Docker deployment practices",
    why: "Containerized deployment projects get Dockerfile and compose skills.",
    queries: ["docker deployment", "dockerfile", "docker compose"],
    keywords: ["docker", "container", "compose", "deploy", "vps"],
  },
  {
    domain: "performance",
    label: "Performance",
    why: "Latency, bundle size, and caching skills for anything user-facing.",
    queries: ["web performance", "performance optimization"],
    keywords: [
      "performance",
      "latency",
      "slow",
      "optimization",
      "caching",
      "bundle",
    ],
  },
  {
    domain: "accessibility",
    label: "Accessibility",
    why: "WCAG-oriented skills for anything with a UI.",
    queries: ["accessibility", "wcag", "a11y"],
    keywords: [
      "accessibility",
      "a11y",
      "wcag",
      "aria",
      "screen reader",
      "ui",
      "frontend",
    ],
  },
  {
    domain: "seo",
    label: "SEO",
    why: "Public pages benefit from metadata, sitemap, and structured-data skills.",
    queries: ["seo", "structured data", "sitemap"],
    keywords: [
      "seo",
      "meta",
      "sitemap",
      "search engine",
      "marketing site",
      "landing",
    ],
  },
  {
    domain: "threejs",
    label: "Three.js & WebGL",
    why: "3D and WebGL projects get scene, shader, and performance skills.",
    queries: ["three.js", "webgl", "3d web"],
    keywords: ["three", "three.js", "webgl", "3d", "shader", "game"],
  },
  {
    domain: "python",
    label: "Python tooling",
    why: "Python-heavy projects get packaging, testing, and typing skills.",
    queries: ["python packaging", "python testing"],
    keywords: ["python", "pytest", "pip", "django", "flask"],
  },
];

/**
 * Detects the domains a project touches, from its name, goal and
 * description. Keyword matching over lowercase text — deliberately simple
 * and explainable (every recommendation carries its matched evidence).
 */
export function detectSkillDomains(text: string): SkillRecommendation[] {
  const haystack = text.toLowerCase();
  const out: SkillRecommendation[] = [];
  for (const entry of CATALOG) {
    const matched = entry.keywords.filter((kw) => haystack.includes(kw));
    if (matched.length) {
      out.push({
        domain: entry.domain,
        label: entry.label,
        why: entry.why,
        queries: entry.queries,
      });
    }
  }
  return out;
}
