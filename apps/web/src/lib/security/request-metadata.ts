import "server-only";

import { isIP } from "node:net";
import { siteConfigRepository } from "lib/db/repository";
import { headers } from "next/headers";
import { parseUserAgent } from "./device-parser";
import type { RequestMetadata } from "./types";

const DEFAULT_IP_HEADERS = [
  "cf-connecting-ip",
  "x-real-ip",
  "x-forwarded-for",
] as const;
const DEFAULT_GEO_HEADERS = [
  "cf-ipcountry",
  "cf-ipcity",
  "x-vercel-ip-country",
  "x-vercel-ip-city",
] as const;
const ALLOWED_PROXY_HEADERS: ReadonlySet<string> = new Set([
  ...DEFAULT_IP_HEADERS,
  ...DEFAULT_GEO_HEADERS,
]);

type SecurityMetadataConfig = {
  ipHeaderPriority?: unknown;
  geoHeaderPriority?: unknown;
};

const configuredHeaderPriority = (
  value: unknown,
  fallback: readonly string[],
): string[] => {
  if (!Array.isArray(value)) return [...fallback];
  const selected = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().toLowerCase())
    .filter(
      (item, index, list) =>
        ALLOWED_PROXY_HEADERS.has(item) && list.indexOf(item) === index,
    );
  return selected.length > 0 ? selected : [...fallback];
};

const cleanShortText = (
  value: string | null,
  maxLength: number,
): string | null => {
  if (!value) return null;
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  return cleaned ? cleaned.slice(0, maxLength) : null;
};

const extractIp = (requestHeaders: Headers, priority: string[]): string => {
  for (const name of priority) {
    const raw = requestHeaders.get(name)?.trim();
    if (!raw) continue;
    const candidate =
      name === "x-forwarded-for" ? raw.split(",", 1)[0]?.trim() : raw;
    if (candidate && isIP(candidate) !== 0) return candidate;
  }
  return "unknown";
};

const extractGeo = (
  requestHeaders: Headers,
  priority: string[],
): { country: string | null; city: string | null } => {
  let country: string | null = null;
  let city: string | null = null;
  for (const name of priority) {
    const value = cleanShortText(
      requestHeaders.get(name),
      name.includes("city") ? 100 : 8,
    );
    if (!value) continue;
    if (
      name.includes("country") &&
      country === null &&
      /^[A-Za-z-]+$/.test(value)
    ) {
      country = value.toUpperCase();
    } else if (name.includes("city") && city === null) {
      city = value;
    }
  }
  return { country, city };
};

const safeRefererOrigin = (value: string | null): string | null => {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.username || url.password || url.origin === "null") return null;
    return url.origin.slice(0, 255);
  } catch {
    return null;
  }
};

export const buildRequestMetadata = (
  requestHeaders: Headers,
  config?: SecurityMetadataConfig | null,
  now = new Date(),
): RequestMetadata => {
  const ipPriority = configuredHeaderPriority(
    config?.ipHeaderPriority,
    DEFAULT_IP_HEADERS,
  );
  const geoPriority = configuredHeaderPriority(
    config?.geoHeaderPriority,
    DEFAULT_GEO_HEADERS,
  );
  const userAgent = cleanShortText(requestHeaders.get("user-agent"), 512) ?? "";
  const { device, os, browser } = parseUserAgent(userAgent);
  const { country, city } = extractGeo(requestHeaders, geoPriority);

  return {
    ip: extractIp(requestHeaders, ipPriority),
    country,
    city,
    device,
    os,
    browser,
    userAgent,
    referer: safeRefererOrigin(requestHeaders.get("referer")),
    timestamp: now.toISOString(),
  };
};

export const sanitizeRequestMetadata = (
  metadata: RequestMetadata,
): RequestMetadata => {
  const ip = isIP(metadata.ip) === 0 ? "unknown" : metadata.ip;
  const country = cleanShortText(metadata.country, 8);
  const city = cleanShortText(metadata.city, 100);
  const userAgent = cleanShortText(metadata.userAgent, 512) ?? "";
  const fingerprint = parseUserAgent(userAgent);
  const timestamp = Number.isFinite(Date.parse(metadata.timestamp))
    ? new Date(metadata.timestamp).toISOString()
    : new Date().toISOString();

  return {
    ip,
    country:
      country && /^[A-Za-z-]+$/.test(country) ? country.toUpperCase() : null,
    city,
    device: fingerprint.device,
    os: fingerprint.os,
    browser: fingerprint.browser,
    userAgent,
    referer: safeRefererOrigin(metadata.referer),
    timestamp,
  };
};

export const getRequestMetadata = async (): Promise<RequestMetadata> => {
  const [requestHeaders, securityConfig] = await Promise.all([
    headers(),
    siteConfigRepository.getConfig("security").catch(() => null),
  ]);
  return buildRequestMetadata(requestHeaders, {
    ipHeaderPriority: securityConfig?.ipHeaderPriority,
    geoHeaderPriority: securityConfig?.geoHeaderPriority,
  });
};
