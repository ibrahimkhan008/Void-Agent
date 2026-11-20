/**
 * Scope Matcher & Policy Evaluator
 * High-performance, pure TypeScript deterministic scope evaluation engine.
 * Validates targets against program assets (domains, wildcards, CIDRs, URLs)
 * and testing exclusions before any specialist agent or CLI tool executes.
 */

export type AssetType = "url" | "domain" | "wildcard" | "cidr" | "mobile_app";

export interface ProgramScopeAsset {
  id?: string;
  assetIdentifier: string;
  assetType: AssetType;
  isInScope: boolean;
  maxSeverityAllowed?: string | null;
  instructionNotes?: string | null;
}

export interface ScopeEvaluationResult {
  status: "allowed" | "conditional" | "disallowed";
  isInScope: boolean;
  isCategoryExcluded: boolean;
  reason: string;
  matchedAsset?: ProgramScopeAsset;
  matchedExclusion?: string;
  policyCitations: string[];
}

/**
 * Normalizes a target string (URL, hostname, or IP) to extract canonical hostname/IP
 */
export function normalizeTargetHost(target: string): string {
  const trimmed = target.trim();
  if (!trimmed) return "";

  // If provided as a URL, parse host
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    try {
      const parsed = new URL(trimmed);
      return parsed.hostname.toLowerCase();
    } catch {
      // Fallback: strip scheme manually
    }
  }

  // Strip leading protocols if malformed
  const stripped = trimmed
    .replace(/^https?:\/\//i, "")
    .split("/")[0]
    .split(":")[0];
  return stripped.toLowerCase();
}

/**
 * Checks if a hostname matches a wildcard pattern (e.g. *.example.com)
 */
export function isWildcardMatch(pattern: string, host: string): boolean {
  const normPattern = pattern.trim().toLowerCase();
  const normHost = host.trim().toLowerCase();

  if (normPattern === normHost) return true;

  if (normPattern.startsWith("*.")) {
    const rootDomain = normPattern.slice(2);
    // Matches sub.example.com or any.deep.sub.example.com
    return normHost.endsWith(`.${rootDomain}`) || normHost === rootDomain;
  }

  return false;
}

/**
 * Checks if an IPv4 address falls within a CIDR subnet (e.g. 192.168.1.0/24)
 */
export function isIpInCidr(ip: string, cidr: string): boolean {
  try {
    const parts = cidr.split("/");
    if (parts.length !== 2) return ip === cidr;

    const [subnet, prefixStr] = parts;
    const prefix = Number.parseInt(prefixStr, 10);
    if (Number.isNaN(prefix) || prefix < 0 || prefix > 32) return false;

    const ipNum = ipv4ToNumber(ip);
    const subnetNum = ipv4ToNumber(subnet);
    if (ipNum === null || subnetNum === null) return false;

    const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
    return (ipNum & mask) === (subnetNum & mask);
  } catch {
    return false;
  }
}

function ipv4ToNumber(ip: string): number | null {
  const octets = ip.split(".").map(Number);
  if (
    octets.length !== 4 ||
    octets.some((o) => Number.isNaN(o) || o < 0 || o > 255)
  ) {
    return null;
  }
  return (
    ((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>> 0
  );
}

/**
 * Evaluates whether an asset matches a specific scope definition
 */
export function matchesScopeAsset(
  target: string,
  asset: ProgramScopeAsset,
): boolean {
  const normTarget = normalizeTargetHost(target);
  const identifier = asset.assetIdentifier.trim().toLowerCase();

  switch (asset.assetType) {
    case "wildcard":
      return isWildcardMatch(identifier, normTarget);

    case "domain":
      return normTarget === identifier;

    case "cidr":
      return isIpInCidr(normTarget, identifier);

    case "url": {
      // Matches path prefix
      const cleanTarget = target.trim().toLowerCase();
      return (
        cleanTarget.startsWith(identifier) ||
        normTarget === normalizeTargetHost(identifier)
      );
    }

    case "mobile_app":
      return target.trim().toLowerCase() === identifier;

    default:
      return normTarget === identifier;
  }
}

/**
 * Evaluates an intended task and target against a complete program scope
 */
export function evaluateTargetScope({
  target,
  scopes,
  category,
  excludedCategories = [],
  isIntrusive = false,
}: {
  target: string;
  scopes: ProgramScopeAsset[];
  category?: string;
  excludedCategories?: string[];
  isIntrusive?: boolean;
}): ScopeEvaluationResult {
  const citations: string[] = [];

  // 1. Check if category is excluded
  if (category) {
    const normCategory = category.trim().toLowerCase();
    const isExcluded = excludedCategories.some(
      (ex) =>
        ex.trim().toLowerCase() === normCategory ||
        normCategory.includes(ex.trim().toLowerCase()),
    );

    if (isExcluded) {
      return {
        status: "disallowed",
        isInScope: false,
        isCategoryExcluded: true,
        reason: `Vulnerability category '${category}' is strictly excluded by program policy.`,
        matchedExclusion: category,
        policyCitations: [`Excluded Category: ${category}`],
      };
    }
  }

  // 2. Check explicit out-of-scope assets first (Hard Prohibitions)
  const outOfScopeAssets = scopes.filter((s) => !s.isInScope);
  for (const asset of outOfScopeAssets) {
    if (matchesScopeAsset(target, asset)) {
      citations.push(`Explicitly Out of Scope: ${asset.assetIdentifier}`);
      return {
        status: "disallowed",
        isInScope: false,
        isCategoryExcluded: false,
        reason: `Target '${target}' matches explicitly prohibited out-of-scope asset '${asset.assetIdentifier}'.`,
        matchedAsset: asset,
        policyCitations: citations,
      };
    }
  }

  // 3. Check in-scope assets
  const inScopeAssets = scopes.filter((s) => s.isInScope);
  let matchedInScope: ProgramScopeAsset | undefined;

  for (const asset of inScopeAssets) {
    if (matchesScopeAsset(target, asset)) {
      matchedInScope = asset;
      citations.push(`In-Scope Asset: ${asset.assetIdentifier}`);
      if (asset.instructionNotes) {
        citations.push(`Instruction Note: ${asset.instructionNotes}`);
      }
      break;
    }
  }

  if (!matchedInScope) {
    return {
      status: "disallowed",
      isInScope: false,
      isCategoryExcluded: false,
      reason: `Target '${target}' does not match any registered in-scope asset for this program.`,
      policyCitations: ["Target asset not found in program scope inventory."],
    };
  }

  // 4. If intrusive/destructive or requires rate-limiting confirmation, flag as conditional
  if (isIntrusive) {
    return {
      status: "conditional",
      isInScope: true,
      isCategoryExcluded: false,
      reason: `Target is in-scope (${matchedInScope.assetIdentifier}), but the requested action is classified as intrusive or resource-intensive. Human approval required.`,
      matchedAsset: matchedInScope,
      policyCitations: citations,
    };
  }

  return {
    status: "allowed",
    isInScope: true,
    isCategoryExcluded: false,
    reason: `Target is confirmed in-scope under '${matchedInScope.assetIdentifier}'.`,
    matchedAsset: matchedInScope,
    policyCitations: citations,
  };
}
