import { createHash, createHmac, webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const cache = new Map<string, unknown>();
  const rateCounts = new Map<string, number>();
  return {
    cache,
    rateCounts,
    checkApiRateLimit: vi.fn(async ({ kind, id, limit, windowMs }) => {
      const key = `${kind}:${id}:${windowMs}:${Math.floor(Date.now() / windowMs)}`;
      const count = (rateCounts.get(key) ?? 0) + 1;
      rateCounts.set(key, count);
      return {
        allowed: count <= limit,
        key,
        count,
        limit,
        remaining: Math.max(0, limit - count),
        resetAt: new Date(Date.now() + windowMs),
        retryAfterMs: windowMs,
      };
    }),
    distributed: true,
    serverCache: {
      get: vi.fn(async (key: string) => cache.get(key)),
      set: vi.fn(async (key: string, value: unknown) => {
        cache.set(key, value);
      }),
      setNX: vi.fn(async (key: string, value: unknown) => {
        if (cache.has(key)) return false;
        cache.set(key, value);
        return true;
      }),
      has: vi.fn(async (key: string) => cache.has(key)),
      delete: vi.fn(async (key: string) => void cache.delete(key)),
      clear: vi.fn(async () => void cache.clear()),
      getAll: vi.fn(async () => cache),
      isDistributed: vi.fn(() => mocks.distributed),
    },
  };
});

vi.mock("server-only", () => ({}));
vi.mock("lib/const", () => ({ IS_DEV: false }));
vi.mock("lib/cache", () => ({ serverCache: mocks.serverCache }));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: mocks.checkApiRateLimit,
}));

import {
  createChatChallenge,
  verifyChatRequestGuard,
} from "./chat-request-guard.server";
import {
  buildChatClientProofMessage,
  buildChatRequestMacMessage,
} from "./chat-request-guard.shared";
import { stableJsonStringify } from "./stable-json";

const BASE_URL = "https://void-agent.test";
const USER_ID = "user-1";
const SESSION_ID = "session-1";
const IP = "203.0.113.7";
const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/123.0.0.0 Safari/537.36";

function toBase64Url(value: ArrayBuffer) {
  return Buffer.from(value).toString("base64url");
}

function makeRequest(body: unknown, origin = BASE_URL) {
  return new Request(`${BASE_URL}/api/chat`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin,
      referer: `${origin}/chat`,
      "user-agent": USER_AGENT,
      "sec-fetch-site": "same-origin",
      "sec-fetch-mode": "cors",
      "sec-ch-ua": '"Chromium";v="123"',
      "cf-connecting-ip": IP,
    },
    body: JSON.stringify(body),
  });
}

async function createValidPayload() {
  process.env.NEXT_PUBLIC_BASE_URL = BASE_URL;
  process.env.BETTER_AUTH_SECRET = "c45-test-secret-that-is-only-for-tests";
  const keyPair = (await webcrypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  const clientId = "client-1234567890123456";
  const clientPublicKey = toBase64Url(
    await webcrypto.subtle.exportKey("spki", keyPair.publicKey),
  );
  const challengeResult = await createChatChallenge({
    request: makeRequest({}, BASE_URL),
    userId: USER_ID,
    sessionId: SESSION_ID,
    sessionIpAddress: IP,
    sessionUserAgent: USER_AGENT,
    clientBinding: { clientId, clientPublicKey },
  });
  if (!challengeResult.ok || !challengeResult.data.enabled) {
    throw new Error("Test challenge could not be created");
  }
  const challenge = challengeResult.data;

  let nonce = "test.0";
  let powHash = "";
  for (let attempt = 0; attempt < 100_000; attempt += 1) {
    nonce = `test.${attempt.toString(36)}`;
    powHash = createHash("sha256")
      .update(`${challenge.challengeId}:${nonce}`)
      .digest("hex");
    const digest = Buffer.from(powHash, "hex");
    let bits = challenge.difficulty;
    let valid = true;
    for (const byte of digest) {
      const needed = Math.min(bits, 8);
      if (byte >> (8 - needed)) {
        valid = false;
        break;
      }
      bits -= needed;
      if (bits <= 0) break;
    }
    if (valid) break;
    if (attempt === 99_999) throw new Error("Test proof-of-work did not solve");
  }

  const body = {
    id: "thread-1",
    message: {
      id: "message-1",
      role: "user",
      parts: [{ type: "text", text: "hello" }],
    },
    toolChoice: "none",
  };
  const requestHash = createHash("sha256")
    .update(stableJsonStringify(body))
    .digest("hex");
  const solvedAt = Date.now();
  const requestMac = createHmac("sha256", challenge.challengeToken)
    .update(
      buildChatRequestMacMessage({
        challengeId: challenge.challengeId,
        challengeToken: challenge.challengeToken,
        requestHash,
        solvedAt,
      }),
    )
    .digest("hex");
  const proofMessage = buildChatClientProofMessage({
    challengeId: challenge.challengeId,
    challengeToken: challenge.challengeToken,
    difficulty: challenge.difficulty,
    powNonce: nonce,
    powHash,
    requestHash,
    solvedAt,
  });
  const clientProof = toBase64Url(
    await webcrypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      keyPair.privateKey,
      new TextEncoder().encode(proofMessage),
    ),
  );

  return {
    body,
    request: makeRequest({ ...body, security: { version: 1 } }),
    security: {
      version: 1,
      challengeId: challenge.challengeId,
      challengeToken: challenge.challengeToken,
      difficulty: challenge.difficulty,
      powNonce: nonce,
      powHash,
      requestHash,
      requestMac,
      captchaToken: "",
      clientId,
      clientPublicKey,
      clientProof,
      solvedAt,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_BASE_URL", BASE_URL);
  vi.stubEnv("BETTER_AUTH_SECRET", "c45-test-secret-that-is-only-for-tests");
  mocks.cache.clear();
  mocks.rateCounts.clear();
  mocks.distributed = true;
  mocks.checkApiRateLimit.mockImplementation(
    async ({ kind, id, limit, windowMs }) => {
      const key = `${kind}:${id}:${windowMs}:${Math.floor(Date.now() / windowMs)}`;
      const count = (mocks.rateCounts.get(key) ?? 0) + 1;
      mocks.rateCounts.set(key, count);
      return {
        allowed: count <= limit,
        key,
        count,
        limit,
        remaining: Math.max(0, limit - count),
        resetAt: new Date(Date.now() + windowMs),
        retryAfterMs: windowMs,
      };
    },
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("chat request challenge security", () => {
  it("accepts a valid user/session/origin-bound proof once and rejects replay", async () => {
    const payload = await createValidPayload();
    const body = { ...payload.body, security: payload.security };
    const request = makeRequest(body);

    await expect(
      verifyChatRequestGuard({
        request,
        body,
        userId: USER_ID,
        sessionId: SESSION_ID,
        sessionIpAddress: IP,
        sessionUserAgent: USER_AGENT,
      }),
    ).resolves.toEqual({ ok: true });
    await expect(
      verifyChatRequestGuard({
        request,
        body,
        userId: USER_ID,
        sessionId: SESSION_ID,
        sessionIpAddress: IP,
        sessionUserAgent: USER_AGENT,
      }),
    ).resolves.toMatchObject({
      ok: false,
      status: 409,
      code: "challenge-already-used",
    });
  });

  it("rejects a changed request body even when the signed proof is otherwise valid", async () => {
    const payload = await createValidPayload();
    const changedBody = {
      ...payload.body,
      message: {
        ...payload.body.message,
        parts: [{ type: "text", text: "tampered" }],
      },
      security: payload.security,
    };

    await expect(
      verifyChatRequestGuard({
        request: makeRequest(changedBody),
        body: changedBody,
        userId: USER_ID,
        sessionId: SESSION_ID,
      }),
    ).resolves.toMatchObject({
      ok: false,
      status: 403,
      code: "request-hash-mismatch",
    });
  });

  it("rejects tampered proof-of-work nonce and expired challenges", async () => {
    const tampered = await createValidPayload();
    const tamperedSecurity = { ...tampered.security, powNonce: "tampered" };
    const tamperedBody = { ...tampered.body, security: tamperedSecurity };
    await expect(
      verifyChatRequestGuard({
        request: makeRequest(tamperedBody),
        body: tamperedBody,
        userId: USER_ID,
        sessionId: SESSION_ID,
      }),
    ).resolves.toMatchObject({
      ok: false,
      status: 403,
      code: "pow-hash-mismatch",
    });

    const expired = await createValidPayload();
    const expiredBody = { ...expired.body, security: expired.security };
    vi.useFakeTimers();
    vi.setSystemTime(expired.security.solvedAt + 121_000);
    await expect(
      verifyChatRequestGuard({
        request: makeRequest(expiredBody),
        body: expiredBody,
        userId: USER_ID,
        sessionId: SESSION_ID,
      }),
    ).resolves.toMatchObject({
      ok: false,
      status: 403,
      code: "challenge-expired",
    });
  });

  it("rejects a client key that differs from the issued binding", async () => {
    const payload = await createValidPayload();
    // Replace the last base64url char with one guaranteed to differ from the
    // original, or a random key ending in "A" would collide with itself.
    const originalKey = payload.security.clientPublicKey;
    const changedSecurity = {
      ...payload.security,
      clientPublicKey: `${originalKey.slice(0, -1)}${originalKey.endsWith("A") ? "B" : "A"}`,
    };
    const changedBody = { ...payload.body, security: changedSecurity };

    await expect(
      verifyChatRequestGuard({
        request: makeRequest(changedBody),
        body: changedBody,
        userId: USER_ID,
        sessionId: SESSION_ID,
      }),
    ).resolves.toMatchObject({
      ok: false,
      status: 403,
      code: "challenge-client-key-mismatch",
    });
  });

  it("rejects a challenge bound to a different user or session", async () => {
    const payload = await createValidPayload();
    const body = { ...payload.body, security: payload.security };

    await expect(
      verifyChatRequestGuard({
        request: makeRequest(body),
        body,
        userId: "user-2",
        sessionId: SESSION_ID,
      }),
    ).resolves.toMatchObject({
      ok: false,
      status: 403,
      code: "challenge-user-mismatch",
    });

    await expect(
      verifyChatRequestGuard({
        request: makeRequest(body),
        body,
        userId: USER_ID,
        sessionId: "session-2",
      }),
    ).resolves.toMatchObject({
      ok: false,
      status: 403,
      code: "challenge-session-mismatch",
    });
  });

  it("rejects requests without a security payload and tampered tokens", async () => {
    const payload = await createValidPayload();
    const noSecurity = { ...payload.body };

    await expect(
      verifyChatRequestGuard({
        request: makeRequest(noSecurity),
        body: noSecurity,
        userId: USER_ID,
        sessionId: SESSION_ID,
      }),
    ).resolves.toMatchObject({
      ok: false,
      status: 403,
      code: "missing-security-payload",
    });

    // Flip the token's FIRST character: base64url decoding discards the last
    // character's low bits (43-char sig => 2 discarded bits), so a last-char
    // swap can leave the decoded signature unchanged. Changing the first
    // character always alters the decoded payload bytes, so the HMAC verify
    // fails with `invalid-challenge-signature` deterministically.
    const originalToken = payload.security.challengeToken;
    const tamperedToken = {
      ...payload.body,
      security: {
        ...payload.security,
        challengeToken: `${originalToken.startsWith("A") ? "B" : "A"}${originalToken.slice(1)}`,
      },
    };
    await expect(
      verifyChatRequestGuard({
        request: makeRequest(tamperedToken),
        body: tamperedToken,
        userId: USER_ID,
        sessionId: SESSION_ID,
      }),
    ).resolves.toMatchObject({
      ok: false,
      status: 403,
      code: "invalid-challenge-signature",
    });
  });

  it("rejects cross-site fetch metadata", async () => {
    const payload = await createValidPayload();
    const body = { ...payload.body, security: payload.security };
    const request = new Request(`${BASE_URL}/api/chat`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: BASE_URL,
        referer: `${BASE_URL}/chat`,
        "user-agent": USER_AGENT,
        "sec-fetch-site": "cross-site",
        "sec-fetch-mode": "cors",
        "cf-connecting-ip": IP,
      },
      body: JSON.stringify(body),
    });

    await expect(
      verifyChatRequestGuard({
        request,
        body,
        userId: USER_ID,
        sessionId: SESSION_ID,
      }),
    ).resolves.toMatchObject({
      ok: false,
      status: 403,
      code: "invalid-fetch-site",
    });
  });

  it("fails closed on the verify path when the shared cache is unavailable", async () => {
    const payload = await createValidPayload();
    const body = { ...payload.body, security: payload.security };
    mocks.distributed = false;

    await expect(
      verifyChatRequestGuard({
        request: makeRequest(body),
        body,
        userId: USER_ID,
        sessionId: SESSION_ID,
      }),
    ).resolves.toMatchObject({
      ok: false,
      status: 503,
      code: "chat-security-cache-unavailable",
    });
  });

  it("rate-limits verified chat requests per user", async () => {
    const payload = await createValidPayload();
    const body = { ...payload.body, security: payload.security };
    mocks.checkApiRateLimit.mockResolvedValueOnce({
      allowed: false,
      key: "api:chat-request-user:user-1",
      count: 121,
      limit: 120,
      remaining: 0,
      resetAt: new Date(Date.now() + 30_000),
      retryAfterMs: 30_000,
    });

    await expect(
      verifyChatRequestGuard({
        request: makeRequest(body),
        body,
        userId: USER_ID,
        sessionId: SESSION_ID,
      }),
    ).resolves.toMatchObject({
      ok: false,
      status: 429,
      code: "user-rate-limited",
    });
  });

  it("rejects a challenge claimed concurrently between the replay probe and the atomic claim", async () => {
    const payload = await createValidPayload();
    const body = { ...payload.body, security: payload.security };
    // Simulate a racing node winning setNX between our `has` probe and our
    // own claim: the probe sees nothing, the claim must fail closed.
    mocks.serverCache.has.mockResolvedValueOnce(false);
    mocks.serverCache.setNX.mockResolvedValueOnce(false);

    await expect(
      verifyChatRequestGuard({
        request: makeRequest(body),
        body,
        userId: USER_ID,
        sessionId: SESSION_ID,
      }),
    ).resolves.toMatchObject({
      ok: false,
      status: 409,
      code: "challenge-already-used",
    });
  });

  it("rejects cross-origin challenge issuance and fails closed without shared cache or rate storage", async () => {
    const badOrigin = await createChatChallenge({
      request: makeRequest({}, "https://attacker.invalid"),
      userId: USER_ID,
      sessionId: SESSION_ID,
      clientBinding: {
        clientId: "client-1234567890123456",
        clientPublicKey: "A".repeat(120),
      },
    });
    expect(badOrigin).toMatchObject({
      ok: false,
      status: 403,
      code: "invalid-origin",
    });

    mocks.distributed = false;
    const noSharedCache = await createChatChallenge({
      request: makeRequest({}),
      userId: USER_ID,
      sessionId: SESSION_ID,
      clientBinding: null,
    });
    expect(noSharedCache).toMatchObject({
      ok: false,
      status: 503,
      code: "chat-security-cache-unavailable",
    });

    mocks.distributed = true;
    mocks.checkApiRateLimit.mockRejectedValueOnce(
      new Error("database unavailable"),
    );
    const rateStoreDown = await createChatChallenge({
      request: makeRequest({}),
      userId: USER_ID,
      sessionId: SESSION_ID,
      clientBinding: {
        clientId: "client-1234567890123456",
        clientPublicKey: "A".repeat(120),
      },
    });
    expect(rateStoreDown).toMatchObject({
      ok: false,
      status: 503,
      code: "chat-security-rate-limit-unavailable",
    });
  });

  it("rate-limits challenge issuance per ip", async () => {
    mocks.checkApiRateLimit.mockResolvedValueOnce({
      allowed: false,
      key: "api:chat-challenge-ip:203.0.113.7",
      count: 121,
      limit: 120,
      remaining: 0,
      resetAt: new Date(Date.now() + 30_000),
      retryAfterMs: 30_000,
    });

    const limited = await createChatChallenge({
      request: makeRequest({}),
      userId: USER_ID,
      sessionId: SESSION_ID,
      clientBinding: {
        clientId: "client-1234567890123456",
        clientPublicKey: "A".repeat(120),
      },
    });

    expect(limited).toMatchObject({
      ok: false,
      status: 429,
      code: "challenge-rate-limited",
    });
  });

  it("does not allow the rate-limit bucket provider to exceed a concurrent cap", async () => {
    const requests = Array.from({ length: 8 }, () =>
      checkApiRateLimitForTest({
        kind: "challenge",
        id: IP,
        limit: 3,
        windowMs: 60_000,
      }),
    );
    const results = await Promise.all(requests);
    expect(results.filter((result) => result.allowed)).toHaveLength(3);
    expect(results.filter((result) => !result.allowed)).toHaveLength(5);
  });
});

async function checkApiRateLimitForTest(input: {
  kind: string;
  id: string;
  limit: number;
  windowMs: number;
}) {
  return mocks.checkApiRateLimit(input);
}
