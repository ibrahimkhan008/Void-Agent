import "server-only";
import Redis from "ioredis";
import globalLogger from "logger";
import { after } from "next/server";
import {
  type ResumableStreamContext,
  createResumableStreamContext,
} from "resumable-stream/ioredis";

const REDIS_URL = process.env.REDIS_URL || process.env.KV_URL;
const KEY_TTL_SECONDS = 360;
const logger = globalLogger.withDefaults({ message: "[Chat Stream]: " });
let streamContext: ResumableStreamContext | null | undefined;
let keyClient: Redis | null | undefined;

export function getStreamContext(): ResumableStreamContext | null {
  if (streamContext !== undefined) return streamContext;
  if (!REDIS_URL) {
    logger.warn(
      "resumable chat streams disabled: REDIS_URL/KV_URL is not configured",
    );
    streamContext = null;
    return streamContext;
  }
  try {
    streamContext = createResumableStreamContext({ waitUntil: after });
    logger.info("Redis-backed resumable chat streams enabled");
  } catch (error) {
    logger.error("Failed to create resumable chat stream context", error);
    streamContext = null;
  }
  return streamContext;
}

function getKeyClient(): Redis | null {
  if (keyClient !== undefined) return keyClient;
  if (!REDIS_URL) return (keyClient = null);
  const client = new Redis(REDIS_URL, { maxRetriesPerRequest: null });
  client.on("error", (error) => logger.warn("chat stream Redis error", error));
  keyClient = client;
  return client;
}

const activeKey = (threadId: string) => `chat:stream:${threadId}`;
const stopKey = (threadId: string) => `chat:stop:${threadId}`;

export async function setActiveStream(threadId: string, streamId: string) {
  await getKeyClient()?.set(
    activeKey(threadId),
    streamId,
    "EX",
    KEY_TTL_SECONDS,
  );
}

export async function getActiveStream(threadId: string) {
  return (await getKeyClient()?.get(activeKey(threadId))) ?? null;
}

export async function clearActiveStream(
  threadId: string,
  expectedStreamId?: string,
) {
  const client = getKeyClient();
  if (!client) return;
  if (!expectedStreamId) {
    await client.del(activeKey(threadId));
    return;
  }
  await client.eval(
    "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
    1,
    activeKey(threadId),
    expectedStreamId,
  );
}

export async function requestStop(threadId: string) {
  await getKeyClient()?.set(stopKey(threadId), "1", "EX", KEY_TTL_SECONDS);
}

export async function isStopRequested(threadId: string) {
  return (await getKeyClient()?.get(stopKey(threadId))) === "1";
}

export async function clearStop(threadId: string) {
  await getKeyClient()?.del(stopKey(threadId));
}
