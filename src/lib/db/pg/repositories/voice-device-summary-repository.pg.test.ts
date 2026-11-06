import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ select: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("../db.pg", () => ({ pgDb: { select: mocks.select } }));
vi.mock("lib/security/encryption", () => ({
  decrypt: vi.fn(),
  encrypt: vi.fn(),
}));
vi.mock("lib/voice/device-token", () => ({
  generateVoiceDeviceToken: vi.fn(),
  hashVoiceDeviceSecret: vi.fn(),
}));

import { voiceDeviceRepository } from "./voice-device-repository.pg";

function queryReturning(value: unknown) {
  const query = {
    from: vi.fn(),
    innerJoin: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
  };
  query.from.mockReturnValue(query);
  query.innerJoin.mockReturnValue(query);
  query.where.mockReturnValue(query);
  query.limit.mockResolvedValue(value);
  return query;
}

describe("getFinalizedSessionTranscript", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reads a bounded transcript only for a completed owner-bound session", async () => {
    const sessionQuery = queryReturning([
      { id: "session-pk", status: "completed", finalizedAt: new Date() },
    ]);
    const transcriptQuery = queryReturning([
      { transcript: "bounded transcript" },
    ]);
    mocks.select
      .mockReturnValueOnce(sessionQuery)
      .mockReturnValueOnce(transcriptQuery);

    await expect(
      voiceDeviceRepository.getFinalizedSessionTranscript({
        deviceId: "device-1",
        userId: "owner-1",
        sessionId: "capture-1",
      }),
    ).resolves.toEqual({
      status: "completed",
      transcript: "bounded transcript",
    });
    expect(sessionQuery.innerJoin).toHaveBeenCalledOnce();
    expect(sessionQuery.where).toHaveBeenCalledOnce();
    expect(transcriptQuery.where).toHaveBeenCalledOnce();
  });

  it("does not read transcript segments for an active session", async () => {
    const activeQuery = queryReturning([
      { id: "session-pk", status: "active", finalizedAt: null },
    ]);
    mocks.select.mockReturnValueOnce(activeQuery);

    await expect(
      voiceDeviceRepository.getFinalizedSessionTranscript({
        deviceId: "device-1",
        userId: "owner-1",
        sessionId: "capture-1",
      }),
    ).resolves.toEqual({ status: "not_finalized" });
    expect(mocks.select).toHaveBeenCalledOnce();
  });

  it("does not expose a missing or other-user session", async () => {
    const query = queryReturning([]);
    mocks.select.mockReturnValueOnce(query);

    await expect(
      voiceDeviceRepository.getFinalizedSessionTranscript({
        deviceId: "device-1",
        userId: "owner-1",
        sessionId: "capture-1",
      }),
    ).resolves.toBeNull();
    expect(query.innerJoin).toHaveBeenCalledOnce();
    expect(mocks.select).toHaveBeenCalledOnce();
  });
});
