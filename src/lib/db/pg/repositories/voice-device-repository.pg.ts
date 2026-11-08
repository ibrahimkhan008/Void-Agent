import "server-only";

import { and, asc, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { decrypt, encrypt } from "lib/security/encryption";
import {
  generateVoiceDeviceToken,
  hashVoiceDeviceSecret,
} from "lib/voice/device-token";
import { pgDb as db } from "../db.pg";
import {
  ChatMessageTable,
  ChatThreadTable,
  VoiceDevicePairingCodeTable,
  VoiceDeviceRegistrationTable,
  VoiceDeviceSessionTable,
  VoiceDeviceTable,
  VoiceDeviceTranscriptSegmentTable,
} from "../schema.pg";

export const voiceDeviceRepository = {
  async createOtaRegistration(input: {
    code: string;
    bootstrapSecret: string;
    deviceType: string;
    firmwareVersion?: string | null;
    hardwareId?: string | null;
    expiresAt: Date;
  }) {
    const [row] = await db
      .insert(VoiceDeviceRegistrationTable)
      .values({
        codeHash: hashVoiceDeviceSecret("pair", input.code),
        bootstrapSecretHash: hashVoiceDeviceSecret(
          "bootstrap",
          input.bootstrapSecret,
        ),
        deviceType: input.deviceType,
        firmwareVersion: input.firmwareVersion ?? null,
        hardwareId: input.hardwareId ?? null,
        expiresAt: input.expiresAt,
      })
      .returning({ id: VoiceDeviceRegistrationTable.id });
    if (!row) throw new Error("Voice registration was not created");
    return row;
  },
  async claimOtaRegistration(input: {
    code: string;
    userId: string;
    displayName: string;
  }) {
    return db.transaction(async (tx) => {
      const now = new Date();
      const [registration] = await tx
        .select()
        .from(VoiceDeviceRegistrationTable)
        .where(
          and(
            eq(
              VoiceDeviceRegistrationTable.codeHash,
              hashVoiceDeviceSecret("pair", input.code),
            ),
            eq(VoiceDeviceRegistrationTable.status, "pending"),
            gt(VoiceDeviceRegistrationTable.expiresAt, now),
          ),
        )
        .limit(1)
        .for("update");
      if (!registration) return null;

      const token = generateVoiceDeviceToken();
      const [device] = await tx
        .insert(VoiceDeviceTable)
        .values({
          userId: input.userId,
          deviceType: registration.deviceType,
          displayName: input.displayName || "Void-Agent Voice Device",
          tokenHash: hashVoiceDeviceSecret("token", token),
          firmwareVersion: registration.firmwareVersion,
        })
        .returning({
          id: VoiceDeviceTable.id,
          displayName: VoiceDeviceTable.displayName,
        });
      if (!device) throw new Error("Voice device was not created");

      const [claimed] = await tx
        .update(VoiceDeviceRegistrationTable)
        .set({
          status: "claimed",
          userId: input.userId,
          deviceId: device.id,
          displayName: device.displayName,
          encryptedDeviceToken: encrypt(token),
          claimedAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(VoiceDeviceRegistrationTable.id, registration.id),
            eq(VoiceDeviceRegistrationTable.status, "pending"),
            gt(VoiceDeviceRegistrationTable.expiresAt, now),
          ),
        )
        .returning({
          id: VoiceDeviceRegistrationTable.id,
          displayName: VoiceDeviceRegistrationTable.displayName,
        });
      if (!claimed) throw new Error("Voice registration could not be claimed");
      return claimed;
    });
  },
  async completeOtaRegistration(input: {
    registrationId: string;
    code: string;
    bootstrapSecret: string;
  }) {
    return db.transaction(async (tx) => {
      const now = new Date();
      const [registration] = await tx
        .select()
        .from(VoiceDeviceRegistrationTable)
        .where(eq(VoiceDeviceRegistrationTable.id, input.registrationId))
        .limit(1)
        .for("update");
      if (
        !registration ||
        registration.status !== "claimed" ||
        registration.expiresAt <= now ||
        registration.codeHash !== hashVoiceDeviceSecret("pair", input.code) ||
        registration.bootstrapSecretHash !==
          hashVoiceDeviceSecret("bootstrap", input.bootstrapSecret) ||
        !registration.encryptedDeviceToken ||
        !registration.deviceId ||
        !registration.userId
      )
        return null;

      // Verify the active encryption key before consuming the one-time delivery.
      const token = decrypt(registration.encryptedDeviceToken);
      const [completed] = await tx
        .update(VoiceDeviceRegistrationTable)
        .set({
          status: "completed",
          encryptedDeviceToken: null,
          completedAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(VoiceDeviceRegistrationTable.id, registration.id),
            eq(VoiceDeviceRegistrationTable.status, "claimed"),
          ),
        )
        .returning({ deviceId: VoiceDeviceRegistrationTable.deviceId });
      if (!completed?.deviceId) return null;
      await tx
        .update(VoiceDeviceTable)
        .set({ lastSeenAt: now, updatedAt: now })
        .where(
          and(
            eq(VoiceDeviceTable.id, completed.deviceId),
            eq(VoiceDeviceTable.userId, registration.userId!),
          ),
        );

      // Mark complete and clear the staged ciphertext before returning the token.
      return { deviceId: completed.deviceId, token };
    });
  },
  async getOtaRegistrationForUser(registrationId: string, userId: string) {
    return db.transaction(async (tx) => {
      const [row] = await tx
        .select({
          id: VoiceDeviceRegistrationTable.id,
          status: VoiceDeviceRegistrationTable.status,
          deviceId: VoiceDeviceRegistrationTable.deviceId,
          displayName: VoiceDeviceRegistrationTable.displayName,
          userId: VoiceDeviceRegistrationTable.userId,
          expiresAt: VoiceDeviceRegistrationTable.expiresAt,
        })
        .from(VoiceDeviceRegistrationTable)
        .where(
          and(
            eq(VoiceDeviceRegistrationTable.id, registrationId),
            eq(VoiceDeviceRegistrationTable.userId, userId),
          ),
        )
        .limit(1)
        .for("update");
      if (!row) return null;
      if (
        row.expiresAt <= new Date() &&
        (row.status === "pending" || row.status === "claimed")
      ) {
        const now = new Date();
        await tx
          .update(VoiceDeviceRegistrationTable)
          .set({
            status: "expired",
            encryptedDeviceToken: null,
            updatedAt: now,
          })
          .where(eq(VoiceDeviceRegistrationTable.id, row.id));
        if (row.deviceId && row.userId) {
          await tx
            .update(VoiceDeviceTable)
            .set({ status: "revoked", updatedAt: now })
            .where(
              and(
                eq(VoiceDeviceTable.id, row.deviceId),
                eq(VoiceDeviceTable.userId, row.userId),
                eq(VoiceDeviceTable.status, "active"),
              ),
            );
        }
        return { ...row, status: "expired" };
      }
      return row;
    });
  },
  async startTranscriptSession(
    device: { id: string; userId: string },
    sessionId: string,
  ) {
    await db
      .insert(VoiceDeviceSessionTable)
      .values({ deviceId: device.id, userId: device.userId, sessionId })
      .onConflictDoNothing();
    const [session] = await db
      .select({
        id: VoiceDeviceSessionTable.id,
        status: VoiceDeviceSessionTable.status,
        segmentCount: VoiceDeviceSessionTable.segmentCount,
      })
      .from(VoiceDeviceSessionTable)
      .where(
        and(
          eq(VoiceDeviceSessionTable.deviceId, device.id),
          eq(VoiceDeviceSessionTable.userId, device.userId),
          eq(VoiceDeviceSessionTable.sessionId, sessionId),
        ),
      )
      .limit(1);
    return session ?? null;
  },
  async appendTranscriptSegment(
    device: { id: string; userId: string },
    sessionId: string,
    input: {
      eventId: string;
      sequenceNumber: number;
      text: string;
      language?: string;
    },
  ) {
    return db.transaction(async (tx) => {
      const [session] = await tx
        .select({
          id: VoiceDeviceSessionTable.id,
          status: VoiceDeviceSessionTable.status,
          segmentCount: VoiceDeviceSessionTable.segmentCount,
        })
        .from(VoiceDeviceSessionTable)
        .where(
          and(
            eq(VoiceDeviceSessionTable.deviceId, device.id),
            eq(VoiceDeviceSessionTable.userId, device.userId),
            eq(VoiceDeviceSessionTable.sessionId, sessionId),
          ),
        )
        .limit(1)
        .for("update");
      if (!session) return { missing: true as const };
      if (session.status !== "active") return { closed: true as const };
      if (session.segmentCount >= 500) return { full: true as const };
      const [inserted] = await tx
        .insert(VoiceDeviceTranscriptSegmentTable)
        .values({
          sessionPk: session.id,
          eventId: input.eventId,
          sequenceNumber: input.sequenceNumber,
          text: input.text,
          language: input.language ?? null,
        })
        .onConflictDoNothing()
        .returning({ id: VoiceDeviceTranscriptSegmentTable.id });
      if (!inserted) {
        const [existing] = await tx
          .select({
            eventId: VoiceDeviceTranscriptSegmentTable.eventId,
            sequenceNumber: VoiceDeviceTranscriptSegmentTable.sequenceNumber,
            text: VoiceDeviceTranscriptSegmentTable.text,
            language: VoiceDeviceTranscriptSegmentTable.language,
          })
          .from(VoiceDeviceTranscriptSegmentTable)
          .where(
            and(
              eq(VoiceDeviceTranscriptSegmentTable.sessionPk, session.id),
              sql`(${VoiceDeviceTranscriptSegmentTable.eventId} = ${input.eventId} OR ${VoiceDeviceTranscriptSegmentTable.sequenceNumber} = ${input.sequenceNumber})`,
            ),
          )
          .limit(1);
        if (
          existing &&
          existing.eventId === input.eventId &&
          existing.sequenceNumber === input.sequenceNumber &&
          existing.text === input.text &&
          existing.language === (input.language ?? null)
        )
          return {
            accepted: true as const,
            replay: true as const,
            segmentCount: session.segmentCount,
          };
        return { conflict: true as const };
      }
      const now = new Date();
      await tx
        .update(VoiceDeviceSessionTable)
        .set({
          segmentCount: session.segmentCount + 1,
          lastSegmentAt: now,
          updatedAt: now,
        })
        .where(eq(VoiceDeviceSessionTable.id, session.id));
      return {
        accepted: true as const,
        replay: false as const,
        segmentCount: session.segmentCount + 1,
      };
    });
  },
  async finalizeTranscriptSession(
    device: { id: string; userId: string },
    sessionId: string,
  ) {
    return db.transaction(async (tx) => {
      const [session] = await tx
        .select({
          id: VoiceDeviceSessionTable.id,
          status: VoiceDeviceSessionTable.status,
          segmentCount: VoiceDeviceSessionTable.segmentCount,
        })
        .from(VoiceDeviceSessionTable)
        .where(
          and(
            eq(VoiceDeviceSessionTable.deviceId, device.id),
            eq(VoiceDeviceSessionTable.userId, device.userId),
            eq(VoiceDeviceSessionTable.sessionId, sessionId),
          ),
        )
        .limit(1)
        .for("update");
      if (!session) return { missing: true as const };
      if (session.status !== "active" && session.status !== "completed")
        return { closed: true as const };
      const segments = await tx
        .select({ text: VoiceDeviceTranscriptSegmentTable.text })
        .from(VoiceDeviceTranscriptSegmentTable)
        .where(eq(VoiceDeviceTranscriptSegmentTable.sessionPk, session.id))
        .orderBy(asc(VoiceDeviceTranscriptSegmentTable.sequenceNumber))
        .limit(500);
      if (session.status === "active") {
        const now = new Date();
        await tx
          .update(VoiceDeviceSessionTable)
          .set({ status: "completed", finalizedAt: now, updatedAt: now })
          .where(eq(VoiceDeviceSessionTable.id, session.id));
      }
      return {
        missing: false as const,
        status: "completed" as const,
        transcript: segments
          .map((segment) => segment.text)
          .join("\n")
          .slice(0, 24_000),
        segmentCount: segments.length,
      };
    });
  },
  async createPairingCode(input: {
    userId: string;
    organizationId?: string | null;
    deviceType: string;
    displayName?: string | null;
    code: string;
    expiresAt: Date;
  }) {
    await db.insert(VoiceDevicePairingCodeTable).values({
      userId: input.userId,
      organizationId: input.organizationId ?? null,
      deviceType: input.deviceType,
      displayName: input.displayName ?? null,
      codeHash: hashVoiceDeviceSecret("pair", input.code),
      expiresAt: input.expiresAt,
    });
  },
  async consumePairingCodeAndCreateDevice(input: {
    code: string;
    deviceType: string;
    displayName: string;
    firmwareVersion?: string | null;
  }) {
    return db.transaction(async (tx) => {
      const now = new Date();
      const [pairing] = await tx
        .update(VoiceDevicePairingCodeTable)
        .set({ consumedAt: now })
        .where(
          and(
            eq(
              VoiceDevicePairingCodeTable.codeHash,
              hashVoiceDeviceSecret("pair", input.code),
            ),
            eq(VoiceDevicePairingCodeTable.deviceType, input.deviceType),
            isNull(VoiceDevicePairingCodeTable.consumedAt),
            gt(VoiceDevicePairingCodeTable.expiresAt, now),
          ),
        )
        .returning({
          userId: VoiceDevicePairingCodeTable.userId,
          organizationId: VoiceDevicePairingCodeTable.organizationId,
        });
      if (!pairing) return null;
      const token = generateVoiceDeviceToken();
      const [device] = await tx
        .insert(VoiceDeviceTable)
        .values({
          userId: pairing.userId,
          organizationId: pairing.organizationId,
          deviceType: input.deviceType,
          displayName: input.displayName,
          tokenHash: hashVoiceDeviceSecret("token", token),
          firmwareVersion: input.firmwareVersion ?? null,
        })
        .returning({
          id: VoiceDeviceTable.id,
          userId: VoiceDeviceTable.userId,
          displayName: VoiceDeviceTable.displayName,
          deviceType: VoiceDeviceTable.deviceType,
          createdAt: VoiceDeviceTable.createdAt,
        });
      return { device, token };
    });
  },
  async listByUserId(userId: string) {
    return db
      .select({
        id: VoiceDeviceTable.id,
        deviceType: VoiceDeviceTable.deviceType,
        displayName: VoiceDeviceTable.displayName,
        status: VoiceDeviceTable.status,
        firmwareVersion: VoiceDeviceTable.firmwareVersion,
        lastSeenAt: VoiceDeviceTable.lastSeenAt,
        createdAt: VoiceDeviceTable.createdAt,
      })
      .from(VoiceDeviceTable)
      .where(eq(VoiceDeviceTable.userId, userId))
      .orderBy(desc(VoiceDeviceTable.createdAt));
  },
  async listRecentTranscriptsByDevice(input: {
    deviceId: string;
    userId: string;
    limit?: number;
  }) {
    const limit = Math.max(1, Math.min(Math.floor(input.limit ?? 20), 50));
    return db
      .select({
        id: ChatMessageTable.id,
        threadId: ChatMessageTable.threadId,
        parts: ChatMessageTable.parts,
        metadata: ChatMessageTable.metadata,
        createdAt: ChatMessageTable.createdAt,
      })
      .from(ChatMessageTable)
      .innerJoin(
        ChatThreadTable,
        eq(ChatThreadTable.id, ChatMessageTable.threadId),
      )
      .innerJoin(
        VoiceDeviceTable,
        and(
          eq(VoiceDeviceTable.id, input.deviceId),
          eq(VoiceDeviceTable.userId, input.userId),
        ),
      )
      .where(
        and(
          eq(ChatThreadTable.userId, input.userId),
          eq(ChatMessageTable.role, "user"),
          sql`${ChatMessageTable.metadata}->>'source' = 'voice_device'`,
          sql`${ChatMessageTable.metadata}->>'deviceId' = ${input.deviceId}`,
        ),
      )
      .orderBy(desc(ChatMessageTable.createdAt), desc(ChatMessageTable.id))
      .limit(limit);
  },
  async listRecentSessionsByDevice(input: {
    deviceId: string;
    userId: string;
    limit?: number;
    cursor?: { id: string; startedAt: string };
  }) {
    const limit = Math.max(1, Math.min(Math.floor(input.limit ?? 20), 51));
    return db
      .select({
        id: VoiceDeviceSessionTable.id,
        sessionId: VoiceDeviceSessionTable.sessionId,
        status: VoiceDeviceSessionTable.status,
        segmentCount: VoiceDeviceSessionTable.segmentCount,
        startedAt: VoiceDeviceSessionTable.startedAt,
        lastSegmentAt: VoiceDeviceSessionTable.lastSegmentAt,
        finalizedAt: VoiceDeviceSessionTable.finalizedAt,
        cursorStartedAt: sql<string>`to_char(${VoiceDeviceSessionTable.startedAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
        transcript: sql<string>`coalesce((select left(string_agg(${VoiceDeviceTranscriptSegmentTable.text}, E'\\n' order by ${VoiceDeviceTranscriptSegmentTable.sequenceNumber}), 24000) from ${VoiceDeviceTranscriptSegmentTable} where ${VoiceDeviceTranscriptSegmentTable.sessionPk} = ${VoiceDeviceSessionTable.id}), '')`,
      })
      .from(VoiceDeviceSessionTable)
      .innerJoin(
        VoiceDeviceTable,
        and(
          eq(VoiceDeviceTable.id, input.deviceId),
          eq(VoiceDeviceTable.userId, input.userId),
          eq(VoiceDeviceSessionTable.deviceId, VoiceDeviceTable.id),
          eq(VoiceDeviceSessionTable.userId, VoiceDeviceTable.userId),
        ),
      )
      .where(
        and(
          eq(VoiceDeviceSessionTable.deviceId, input.deviceId),
          eq(VoiceDeviceSessionTable.userId, input.userId),
          input.cursor
            ? sql`(${VoiceDeviceSessionTable.startedAt} < (${input.cursor.startedAt}::timestamptz AT TIME ZONE 'UTC') OR (${VoiceDeviceSessionTable.startedAt} = (${input.cursor.startedAt}::timestamptz AT TIME ZONE 'UTC') AND ${VoiceDeviceSessionTable.id} < ${input.cursor.id}::uuid))`
            : undefined,
        ),
      )
      .orderBy(
        desc(VoiceDeviceSessionTable.startedAt),
        desc(VoiceDeviceSessionTable.id),
      )
      .limit(limit);
  },
  /** Return bounded transcript segments only when the caller owns the device/session. */
  async listTranscriptSegmentsByDeviceSession(input: {
    deviceId: string;
    userId: string;
    sessionId: string;
  }) {
    const [session] = await db
      .select({ id: VoiceDeviceSessionTable.id })
      .from(VoiceDeviceSessionTable)
      .innerJoin(
        VoiceDeviceTable,
        and(
          eq(VoiceDeviceTable.id, input.deviceId),
          eq(VoiceDeviceTable.userId, input.userId),
          eq(VoiceDeviceSessionTable.deviceId, VoiceDeviceTable.id),
          eq(VoiceDeviceSessionTable.userId, VoiceDeviceTable.userId),
        ),
      )
      .where(
        and(
          eq(VoiceDeviceSessionTable.deviceId, input.deviceId),
          eq(VoiceDeviceSessionTable.userId, input.userId),
          eq(VoiceDeviceSessionTable.sessionId, input.sessionId),
        ),
      )
      .limit(1);
    if (!session) return null;
    return db
      .select({
        eventId: VoiceDeviceTranscriptSegmentTable.eventId,
        sequenceNumber: VoiceDeviceTranscriptSegmentTable.sequenceNumber,
        text: VoiceDeviceTranscriptSegmentTable.text,
        language: VoiceDeviceTranscriptSegmentTable.language,
        createdAt: VoiceDeviceTranscriptSegmentTable.createdAt,
      })
      .from(VoiceDeviceTranscriptSegmentTable)
      .where(eq(VoiceDeviceTranscriptSegmentTable.sessionPk, session.id))
      .orderBy(asc(VoiceDeviceTranscriptSegmentTable.sequenceNumber))
      .limit(500);
  },
  /** Return text for summarization only after the owner finalized the capture. */
  async getFinalizedSessionTranscript(input: {
    deviceId: string;
    userId: string;
    sessionId: string;
  }) {
    const [session] = await db
      .select({
        id: VoiceDeviceSessionTable.id,
        status: VoiceDeviceSessionTable.status,
        finalizedAt: VoiceDeviceSessionTable.finalizedAt,
      })
      .from(VoiceDeviceSessionTable)
      .innerJoin(
        VoiceDeviceTable,
        and(
          eq(VoiceDeviceTable.id, input.deviceId),
          eq(VoiceDeviceTable.userId, input.userId),
          eq(VoiceDeviceSessionTable.deviceId, VoiceDeviceTable.id),
          eq(VoiceDeviceSessionTable.userId, VoiceDeviceTable.userId),
        ),
      )
      .where(
        and(
          eq(VoiceDeviceSessionTable.deviceId, input.deviceId),
          eq(VoiceDeviceSessionTable.userId, input.userId),
          eq(VoiceDeviceSessionTable.sessionId, input.sessionId),
        ),
      )
      .limit(1);
    if (!session) return null;
    if (session.status !== "completed" || !session.finalizedAt) {
      return { status: "not_finalized" as const };
    }

    const [transcriptRow] = await db
      .select({
        transcript: sql<string>`coalesce((select left(string_agg(${VoiceDeviceTranscriptSegmentTable.text}, E'\\n' order by ${VoiceDeviceTranscriptSegmentTable.sequenceNumber}), 24000) from ${VoiceDeviceTranscriptSegmentTable} where ${VoiceDeviceTranscriptSegmentTable.sessionPk} = ${session.id}), '')`,
      })
      .from(VoiceDeviceSessionTable)
      .where(eq(VoiceDeviceSessionTable.id, session.id))
      .limit(1);

    return {
      status: "completed" as const,
      transcript: transcriptRow?.transcript ?? "",
    };
  },
  async revoke(deviceId: string, userId: string) {
    const rows = await db
      .update(VoiceDeviceTable)
      .set({ status: "revoked", updatedAt: new Date() })
      .where(
        and(
          eq(VoiceDeviceTable.id, deviceId),
          eq(VoiceDeviceTable.userId, userId),
          eq(VoiceDeviceTable.status, "active"),
        ),
      )
      .returning({ id: VoiceDeviceTable.id });
    return rows.length > 0;
  },
  /** Rotate a credential only for the owning user's currently active device. */
  async rotateCredential(deviceId: string, userId: string) {
    const token = generateVoiceDeviceToken();
    const rows = await db
      .update(VoiceDeviceTable)
      .set({
        tokenHash: hashVoiceDeviceSecret("token", token),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(VoiceDeviceTable.id, deviceId),
          eq(VoiceDeviceTable.userId, userId),
          eq(VoiceDeviceTable.status, "active"),
        ),
      )
      .returning({
        id: VoiceDeviceTable.id,
        displayName: VoiceDeviceTable.displayName,
      });
    const [device] = rows;
    return device ? { device, token } : null;
  },
  async getActiveByToken(token: string) {
    const tokenHash = hashVoiceDeviceSecret("token", token);
    const [device] = await db
      .select({
        id: VoiceDeviceTable.id,
        userId: VoiceDeviceTable.userId,
        organizationId: VoiceDeviceTable.organizationId,
        deviceType: VoiceDeviceTable.deviceType,
        displayName: VoiceDeviceTable.displayName,
      })
      .from(VoiceDeviceTable)
      .where(
        and(
          eq(VoiceDeviceTable.tokenHash, tokenHash),
          eq(VoiceDeviceTable.status, "active"),
        ),
      )
      .limit(1);
    if (device)
      await db
        .update(VoiceDeviceTable)
        .set({ lastSeenAt: new Date(), updatedAt: new Date() })
        .where(eq(VoiceDeviceTable.id, device.id));
    return device ?? null;
  },
};
