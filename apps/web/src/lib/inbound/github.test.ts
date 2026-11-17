import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  githubOutboxId,
  normalizeGitHubEvent,
  verifyGitHubWebhook,
} from "./github";

describe("GitHub inbound events", () => {
  it("verifies raw-body HMAC and rejects changed payloads", () => {
    const raw = '{"zen":"good"}';
    const secret = "private-secret";
    const signature = `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`;
    expect(verifyGitHubWebhook(raw, signature, secret)).toBe(true);
    expect(verifyGitHubWebhook(`${raw} `, signature, secret)).toBe(false);
    expect(verifyGitHubWebhook(raw, "sha256=bad", secret)).toBe(false);
    expect(verifyGitHubWebhook(raw, undefined, secret)).toBe(false);
  });

  it("assigns a stable per-endpoint outbox id for redelivery", () => {
    const first = githubOutboxId("endpoint-1", "delivery-1");
    expect(first).toMatch(
      /^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/,
    );
    expect(githubOutboxId("endpoint-1", "delivery-1")).toBe(first);
    expect(githubOutboxId("endpoint-2", "delivery-1")).not.toBe(first);
    expect(githubOutboxId("endpoint-1", "delivery-2")).not.toBe(first);
  });

  it("normalizes a pull request with source and subject for rules", () => {
    const normalized = normalizeGitHubEvent("pull_request", "delivery-1", {
      action: "opened",
      repository: { full_name: "owner/repo" },
      sender: { login: "alice" },
      pull_request: { title: "Fix login", body: "Updates callback" },
    });
    expect(normalized).toMatchObject({
      source: "github",
      externalId: "delivery-1",
      from: "alice",
      meta: { subject: "Fix login", repository: "owner/repo" },
    });
    expect(normalized?.text).toContain("Updates callback");
  });

  it("ignores unsupported events and refuses missing repositories", () => {
    expect(normalizeGitHubEvent("star", "delivery-1", {})).toBeNull();
    expect(() => normalizeGitHubEvent("push", "delivery-1", {})).toThrow(
      "repository",
    );
  });
});
