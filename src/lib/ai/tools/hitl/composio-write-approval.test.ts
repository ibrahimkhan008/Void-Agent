import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  type ComposioWriteApprovalPersistence,
  bindComposioWriteApprovalPayload,
  composioWriteApprovalRequestSchema,
  createComposioAccountReference,
  createComposioWriteApprovalRepository,
  fingerprintComposioActionSchema,
  getComposioAccountLabel,
  hashComposioWriteApproval,
  hashComposioWriteApprovalToken,
  resolveComposioAccountReference,
} from "./composio-write-approval";

afterEach(() => vi.unstubAllEnvs());

describe("Composio write approval contract", () => {
  it("strictly rejects raw provider account IDs, extra fields, and oversized arguments", () => {
    const valid = {
      accountRef: "a".repeat(40),
      accountLabel: "Ops workspace",
      toolkitSlug: "slack",
      actionSlug: "SLACK_SEND_MESSAGE",
      actionVersion: "v1",
      schemaFingerprint: "a".repeat(64),
      arguments: { channel_id: "C123", text: "hello" },
    };
    expect(composioWriteApprovalRequestSchema.safeParse(valid).success).toBe(
      true,
    );
    expect(
      composioWriteApprovalRequestSchema.safeParse({
        ...valid,
        connectedAccountId: "conn-123",
      }).success,
    ).toBe(false);
    expect(
      composioWriteApprovalRequestSchema.safeParse({
        ...valid,
        approvalToken: "forged",
      }).success,
    ).toBe(false);
    expect(
      composioWriteApprovalRequestSchema.safeParse({
        ...valid,
        arguments: { text: "x".repeat(16_001) },
      }).success,
    ).toBe(false);
    let nested: unknown = "value";
    for (let depth = 0; depth < 10; depth++) nested = { nested };
    expect(
      composioWriteApprovalRequestSchema.safeParse({
        ...valid,
        arguments: { nested },
      }).success,
    ).toBe(false);
  });

  it("encrypts account references and binds them to the user, toolkit, and expiry", () => {
    vi.stubEnv("BETTER_AUTH_SECRET", "test-composio-reference-encryption-key");
    const now = 1_800_000_000_000;
    const input = {
      userId: "user-1",
      connectedAccountId: "provider-account-42",
      toolkitSlug: "slack",
      accountLabel: "Ops workspace",
    };
    const reference = createComposioAccountReference(input, now);
    expect(reference).not.toContain(input.connectedAccountId);
    expect(
      resolveComposioAccountReference(reference, "user-1", now + 1),
    ).toEqual(input);
    expect(
      resolveComposioAccountReference(reference, "user-2", now + 1),
    ).toBeNull();
    expect(
      resolveComposioAccountReference(
        `${reference.slice(0, -2)}ab`,
        "user-1",
        now + 1,
      ),
    ).toBeNull();
    expect(
      resolveComposioAccountReference(reference, "user-1", now + 5 * 60_000),
    ).toBeNull();
  });

  it("canonicalizes schema and payload digests while binding every effect field", () => {
    const schema = {
      type: "object",
      properties: { a: { type: "string" }, b: { type: "number" } },
    };
    expect(fingerprintComposioActionSchema(schema)).toBe(
      fingerprintComposioActionSchema({
        properties: { b: { type: "number" }, a: { type: "string" } },
        type: "object",
      }),
    );
    expect(fingerprintComposioActionSchema(schema)).not.toBe(
      fingerprintComposioActionSchema({
        ...schema,
        additionalProperties: false,
      }),
    );
    const request = {
      accountRef: "opaque-reference",
      toolkitSlug: "slack",
      actionSlug: "SLACK_SEND_MESSAGE",
      actionVersion: "v1",
      schemaFingerprint: fingerprintComposioActionSchema(schema),
      arguments: { channel_id: "C123", text: "hello" },
      accountLabel: "Ops workspace",
    };
    const payload = bindComposioWriteApprovalPayload(
      "user-1",
      "conn-1",
      request,
    );
    expect(payload).not.toHaveProperty("accountRef");
    expect(hashComposioWriteApproval(payload)).not.toBe(
      hashComposioWriteApproval({ ...payload, connectedAccountId: "conn-2" }),
    );
    expect(hashComposioWriteApproval(payload)).not.toBe(
      hashComposioWriteApproval({
        ...payload,
        arguments: { ...payload.arguments, text: "changed" },
      }),
    );
    expect(hashComposioWriteApproval(payload)).not.toBe(
      hashComposioWriteApproval({
        ...payload,
        schemaFingerprint: "f".repeat(64),
      }),
    );
  });

  it("stores only hashes and consumes an exact, unexpired approval once", async () => {
    const entries = new Map<string, { value: string; expiresAt: Date }>();
    const persistence: ComposioWriteApprovalPersistence = {
      async deleteExpired(prefix, now) {
        for (const [identifier, item] of entries) {
          if (identifier.startsWith(prefix) && item.expiresAt < now)
            entries.delete(identifier);
        }
      },
      async insert({ identifier, value, expiresAt }) {
        entries.set(identifier, { value, expiresAt });
      },
      async consume({ identifier, value, now }) {
        const entry = entries.get(identifier);
        if (!entry || entry.value !== value || entry.expiresAt <= now)
          return false;
        entries.delete(identifier);
        return true;
      },
    };
    let currentTime = new Date("2026-11-08T12:00:00.000Z");
    const repository = createComposioWriteApprovalRepository(
      persistence,
      () => currentTime,
    );
    const payload = {
      userId: "user-1",
      connectedAccountId: "conn-1",
      toolkitSlug: "slack",
      accountLabel: "Ops workspace",
      actionSlug: "SLACK_SEND_MESSAGE",
      actionVersion: "v1",
      schemaFingerprint: "a".repeat(64),
      arguments: { channel_id: "C123", text: "approved" },
    };
    const token = await repository.issue("user-1", payload);
    expect(token.length).toBeGreaterThanOrEqual(40);
    expect(entries.size).toBe(1);
    const [identifier, entry] = [...entries][0]!;
    expect(identifier).toContain(hashComposioWriteApprovalToken(token));
    expect(entry.value).toBe(hashComposioWriteApproval(payload));
    expect(entry.value).not.toContain("approved");
    expect(await repository.consume("user-2", token, payload)).toBe(false);
    expect(
      await repository.consume("user-1", token, {
        ...payload,
        connectedAccountId: "other",
      }),
    ).toBe(false);
    expect(await repository.consume("user-1", token, payload)).toBe(true);
    expect(await repository.consume("user-1", token, payload)).toBe(false);

    const expiringToken = await repository.issue("user-1", payload);
    currentTime = new Date(currentTime.getTime() + 10 * 60_000 + 1);
    expect(await repository.consume("user-1", expiringToken, payload)).toBe(
      false,
    );
  });

  it("creates stable, bounded labels without control characters", () => {
    expect(
      getComposioAccountLabel({
        id: "conn-abcdef123456",
        alias: "\u0000 Ops\n Workspace \u007f",
        toolkitSlug: "slack",
      }),
    ).toBe("Ops Workspace");
    expect(
      getComposioAccountLabel({
        id: "conn-abcdef123456",
        toolkitSlug: "slack",
      }),
    ).toBe("slack connection ·123456");
    expect(
      getComposioAccountLabel({
        id: "conn-1",
        alias: "\u0001",
        toolkitSlug: "slack",
      }),
    ).toBe("slack connection ·conn1");
  });
});
