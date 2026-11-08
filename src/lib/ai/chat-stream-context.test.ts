import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  store: new Map<string, string>(),
  mgetError: false,
  logs: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
  createContext: vi.fn(() => ({ mock: true })),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after: () => {} }));
vi.mock("logger", () => ({ default: { withDefaults: () => mocks.logs } }));
vi.mock("resumable-stream/ioredis", () => ({
  createResumableStreamContext: mocks.createContext,
}));
vi.mock("ioredis", () => ({
  default: class {
    on() {
      return this;
    }
    async set(key: string, value: string) {
      mocks.store.set(key, value);
      return "OK";
    }
    async get(key: string) {
      return mocks.store.get(key) ?? null;
    }
    async mget(...keys: string[]) {
      if (mocks.mgetError) throw new Error("redis unavailable");
      return keys.map((key) => mocks.store.get(key) ?? null);
    }
    async del(key: string) {
      return mocks.store.delete(key) ? 1 : 0;
    }
    async eval(_script: string, _keys: number, key: string, expected: string) {
      if (mocks.store.get(key) !== expected) return 0;
      mocks.store.delete(key);
      return 1;
    }
  },
}));

const originalRedis = process.env.REDIS_URL;
const originalKv = process.env.KV_URL;

async function loadWithEnv(env: { REDIS_URL?: string; KV_URL?: string }) {
  vi.resetModules();
  delete process.env.REDIS_URL;
  delete process.env.KV_URL;
  Object.assign(process.env, env);
  return import("./chat-stream-context");
}

beforeEach(() => {
  mocks.store.clear();
  mocks.mgetError = false;
  vi.clearAllMocks();
});
afterEach(() => {
  delete process.env.REDIS_URL;
  delete process.env.KV_URL;
  if (originalRedis) process.env.REDIS_URL = originalRedis;
  if (originalKv) process.env.KV_URL = originalKv;
});

describe("chat stream context", () => {
  it("disables resume when Redis is not configured", async () => {
    const context = await loadWithEnv({});
    expect(context.getStreamContext()).toBeNull();
    expect(context.getStreamContext()).toBeNull();
    expect(mocks.createContext).not.toHaveBeenCalled();
    expect(mocks.logs.warn).toHaveBeenCalledOnce();
  });

  it("enables buffering with either supported Redis URL", async () => {
    const context = await loadWithEnv({ KV_URL: "rediss://cache.test" });
    expect(context.getStreamContext()).not.toBeNull();
    expect(mocks.createContext).toHaveBeenCalledOnce();
  });

  it("scopes active-stream pointers and stop signals by thread", async () => {
    const context = await loadWithEnv({ REDIS_URL: "redis://cache.test" });
    await context.setActiveStream("thread-a", "stream-1");
    expect(await context.getActiveStream("thread-a")).toBe("stream-1");
    expect(await context.getActiveStream("thread-b")).toBeNull();
    await context.requestStop("thread-a");
    expect(await context.isStopRequested("thread-a")).toBe(true);
    expect(await context.isStopRequested("thread-b")).toBe(false);
    await context.clearStop("thread-a");
    await context.clearActiveStream("thread-a");
    expect(await context.isStopRequested("thread-a")).toBe(false);
    expect(await context.getActiveStream("thread-a")).toBeNull();
  });

  it("does not clear a newer stream pointer when an older run finishes", async () => {
    const context = await loadWithEnv({ REDIS_URL: "redis://cache.test" });
    await context.setActiveStream("thread-a", "stream-new");
    await context.clearActiveStream("thread-a", "stream-old");
    expect(await context.getActiveStream("thread-a")).toBe("stream-new");
  });

  it("publishes a reconnect pointer only after the resumable buffer is ready", async () => {
    const streamContextModule = await loadWithEnv({
      REDIS_URL: "redis://cache.test",
    });
    let bufferReady = false;
    const resumableContext = {
      createNewResumableStream: vi.fn(async () => {
        bufferReady = true;
        return new ReadableStream<string>();
      }),
      hasExistingStream: vi.fn(async () => {
        expect(bufferReady).toBe(true);
        expect(mocks.store.get("chat:stream:thread-a")).toBe("stream-1");
        return true as const;
      }),
    };

    await expect(
      streamContextModule.bufferAndPublishActiveStream(
        resumableContext as never,
        "thread-a",
        "stream-1",
        new ReadableStream<string>(),
      ),
    ).resolves.toBe(true);

    expect(resumableContext.createNewResumableStream).toHaveBeenCalledOnce();
    expect(await streamContextModule.getActiveStream("thread-a")).toBe(
      "stream-1",
    );
  });

  it("does not publish a pointer when the resumable buffer is already terminal", async () => {
    const streamContextModule = await loadWithEnv({
      REDIS_URL: "redis://cache.test",
    });
    const resumableContext = {
      createNewResumableStream: vi
        .fn()
        .mockResolvedValue(new ReadableStream<string>()),
      hasExistingStream: vi.fn().mockResolvedValue("DONE" as const),
    };

    await expect(
      streamContextModule.bufferAndPublishActiveStream(
        resumableContext as never,
        "thread-a",
        "stream-1",
        new ReadableStream<string>(),
      ),
    ).resolves.toBe(true);

    expect(await streamContextModule.getActiveStream("thread-a")).toBeNull();
    expect(mocks.store.has("chat:stream:thread-a")).toBe(false);
  });

  it("does not publish an active pointer if buffer creation reports an existing terminal stream", async () => {
    const streamContextModule = await loadWithEnv({
      REDIS_URL: "redis://cache.test",
    });
    const resumableContext = {
      createNewResumableStream: vi.fn().mockResolvedValue(null),
      hasExistingStream: vi.fn(),
    };

    await expect(
      streamContextModule.bufferAndPublishActiveStream(
        resumableContext as never,
        "thread-a",
        "stream-1",
        new ReadableStream<string>(),
      ),
    ).resolves.toBe(false);

    expect(await streamContextModule.getActiveStream("thread-a")).toBeNull();
    expect(resumableContext.hasExistingStream).not.toHaveBeenCalled();
  });

  it("lists active stream pointers for a bounded set of threads", async () => {
    const context = await loadWithEnv({ REDIS_URL: "redis://cache.test" });
    await context.setActiveStream("thread-a", "stream-1");
    await context.setActiveStream("thread-c", "stream-2");
    expect(
      await context.getActiveStreamThreadIds([
        "thread-a",
        "thread-b",
        "thread-c",
      ]),
    ).toEqual(new Set(["thread-a", "thread-c"]));
    expect(await context.getActiveStreamThreadIds([])).toEqual(new Set());
  });

  it("fails closed to an empty set when active-pointer lookup fails", async () => {
    const context = await loadWithEnv({ REDIS_URL: "redis://cache.test" });
    mocks.mgetError = true;
    expect(await context.getActiveStreamThreadIds(["thread-a"])).toEqual(
      new Set(),
    );
    expect(mocks.logs.warn).toHaveBeenCalledWith(
      "active-stream lookup failed",
      expect.any(Error),
    );
  });
});
