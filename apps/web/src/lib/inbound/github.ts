import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { NormalizedInbound } from "./normalize";

const EVENTS = new Set(["push", "pull_request", "issues"]);

/** Verify GitHub's raw-body HMAC before reading any payload fields. */
export function verifyGitHubWebhook(
  rawBody: string,
  signature: string | undefined,
  secret: string,
): boolean {
  if (!signature || !/^sha256=[a-f0-9]{64}$/i.test(signature)) return false;
  const received = Buffer.from(signature.slice(7), "hex");
  const expected = createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest();
  return timingSafeEqual(received, expected);
}

/** Stable UUID for the outbox's primary key, unique per hook and delivery. */
export function githubOutboxId(endpointId: string, deliveryId: string): string {
  const hash = createHash("sha256")
    .update(`github:${endpointId}:${deliveryId}`)
    .digest("hex")
    .slice(0, 32);
  const variant = ((Number.parseInt(hash[16], 16) & 0x3) | 0x8).toString(16);
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-${variant}${hash.slice(17, 20)}-${hash.slice(20)}`;
}

export function normalizeGitHubEvent(
  event: string,
  deliveryId: string,
  payload: unknown,
): NormalizedInbound | null {
  if (!EVENTS.has(event)) return null;
  if (!payload || typeof payload !== "object" || Array.isArray(payload))
    throw new Error("Invalid GitHub payload");
  const body = payload as Record<string, unknown>;
  const repository = object(body.repository);
  const repositoryName = string(repository?.full_name);
  if (!repositoryName) throw new Error("GitHub payload has no repository");
  const sender = object(body.sender);
  const action = string(body.action);
  const item = object(
    event === "pull_request" ? body.pull_request : body.issue,
  );
  // AI Code Review: the pull/issue number drives the unattended review flow
  // (executor posts the review back to this exact PR).
  const itemNumber =
    event === "push"
      ? null
      : typeof item?.number === "number" && Number.isInteger(item.number)
        ? item.number
        : null;
  const subject =
    event === "push"
      ? string(body.ref) || "push"
      : string(item?.title) || `${event} ${action || "event"}`;
  const commitMessages = Array.isArray(body.commits)
    ? body.commits
        .map((commit) => string(object(commit)?.message))
        .filter((message): message is string => Boolean(message))
    : [];
  const description =
    event === "push"
      ? `Pushed ${string(body.after) || "new commits"} to ${subject}${
          commitMessages.length ? `\n${commitMessages.join("\n")}` : ""
        }`
      : string(item?.body) || "";
  const text = `${repositoryName}: ${event}${action ? ` ${action}` : ""} — ${subject}${description ? `\n${description}` : ""}`;
  return {
    source: "github",
    externalId: deliveryId,
    from: string(sender?.login) || undefined,
    text: text.slice(0, 20_000),
    threadTitle: `GitHub ${event}: ${subject.slice(0, 100)}`,
    raw: payload,
    meta: {
      repository: repositoryName,
      event,
      action: action || null,
      subject,
      ...(itemNumber !== null ? { pullNumber: itemNumber } : {}),
    },
  };
}

const object = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
const string = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value : null;
