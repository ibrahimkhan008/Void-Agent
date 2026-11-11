import "server-only";

import { desc, eq } from "drizzle-orm";
import { pgDb } from "lib/db/pg/db.pg";
import { SecurityEventTable } from "lib/db/pg/schema.pg";
import { siteConfigRepository } from "lib/db/repository";
import logger from "logger";
import { sanitizeRequestMetadata } from "./request-metadata";
import type {
  RequestMetadata,
  SecurityEvent,
  SecurityEventType,
  SecurityFlags,
} from "./types";

const DEFAULT_LOOKBACK = 50;
const MAX_LOOKBACK = 500;
const MAX_ACTIVITY_PAGE_SIZE = 100;
const SIGNUP_SESSION_GRACE_MS = 60_000;

type FingerprintEvent = Pick<
  SecurityEvent,
  "device" | "os" | "browser" | "country"
>;

export const normalizeSecurityLookback = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isFinite(value))
    return DEFAULT_LOOKBACK;
  return Math.max(1, Math.min(MAX_LOOKBACK, Math.trunc(value)));
};

export const isEstablishedAccountSignIn = (
  sessionCreatedAt: number,
  userCreatedAt: number,
): boolean =>
  Number.isFinite(sessionCreatedAt) &&
  Number.isFinite(userCreatedAt) &&
  sessionCreatedAt - userCreatedAt > SIGNUP_SESSION_GRACE_MS;

export const computeSecurityFlagsFromEvents = (
  recentEvents: readonly FingerprintEvent[],
  metadata: RequestMetadata,
): SecurityFlags => {
  if (recentEvents.length === 0) {
    return { isNewDevice: false, isNewLocation: false };
  }

  const isNewDevice = !recentEvents.some(
    (event) =>
      event.device === metadata.device &&
      event.os === metadata.os &&
      event.browser === metadata.browser,
  );
  const lastCountry = recentEvents[0]?.country ?? null;
  const isNewLocation =
    metadata.country !== null &&
    lastCountry !== null &&
    metadata.country !== lastCountry;

  return { isNewDevice, isNewLocation };
};

export const computeSecurityFlags = async (
  userId: string,
  metadata: RequestMetadata,
): Promise<SecurityFlags> => {
  try {
    const security = await siteConfigRepository
      .getConfig("security")
      .catch(() => null);
    const lookback = normalizeSecurityLookback(
      security?.securityEventsLookback,
    );
    const recentEvents = await pgDb
      .select({
        device: SecurityEventTable.device,
        os: SecurityEventTable.os,
        browser: SecurityEventTable.browser,
        country: SecurityEventTable.country,
      })
      .from(SecurityEventTable)
      .where(eq(SecurityEventTable.userId, userId))
      .orderBy(desc(SecurityEventTable.createdAt))
      .limit(lookback);

    return computeSecurityFlagsFromEvents(recentEvents, metadata);
  } catch {
    // Logging must not block sign-in. Avoid logging request metadata or SQL
    // errors here because both can contain personal data.
    logger.error("Could not compare prior security events");
    return { isNewDevice: false, isNewLocation: false };
  }
};

export const recordSecurityEvent = async (
  userId: string,
  eventType: SecurityEventType,
  metadata: RequestMetadata,
): Promise<SecurityFlags> => {
  const safeMetadata = sanitizeRequestMetadata(metadata);
  const flags = await computeSecurityFlags(userId, safeMetadata);

  try {
    await pgDb.insert(SecurityEventTable).values({
      userId,
      eventType,
      ip: safeMetadata.ip,
      country: safeMetadata.country,
      city: safeMetadata.city,
      device: safeMetadata.device,
      os: safeMetadata.os,
      browser: safeMetadata.browser,
      userAgent: safeMetadata.userAgent,
      referer: safeMetadata.referer,
      isNewDevice: flags.isNewDevice,
      isNewLocation: flags.isNewLocation,
    });

    if (flags.isNewDevice || flags.isNewLocation) {
      logger.warn("Unfamiliar sign-in metadata detected", {
        userId,
        isNewDevice: flags.isNewDevice,
        isNewLocation: flags.isNewLocation,
      });
    }
  } catch {
    // Security telemetry is best-effort and must never block authentication.
    logger.error("Could not record a security event", { userId, eventType });
  }

  return flags;
};

export const getRecentSecurityEvents = async (
  userId: string,
  requestedLimit = 20,
): Promise<SecurityEvent[]> => {
  const limit = Number.isFinite(requestedLimit)
    ? Math.max(1, Math.min(MAX_ACTIVITY_PAGE_SIZE, Math.trunc(requestedLimit)))
    : 20;
  return pgDb
    .select()
    .from(SecurityEventTable)
    .where(eq(SecurityEventTable.userId, userId))
    .orderBy(desc(SecurityEventTable.createdAt))
    .limit(limit);
};
