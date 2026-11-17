import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  githubOutboxId,
  normalizeGitHubEvent,
  verifyGitHubWebhook,
} from "./github";

const secret = "private-secret";
const sign = (raw: string, withSecret: string = secret) =>
  `sha256=${createHmac("sha256", withSecret).update(raw, "utf8").digest("hex")}`;

describe("GitHub inbound events", () => {
  it("verifies raw-body HMAC and rejects changed payloads", () => {
    const raw = '{"zen":"good"}';
    expect(verifyGitHubWebhook(raw, sign(raw), secret)).toBe(true);
    expect(verifyGitHubWebhook(`${raw} `, sign(raw), secret)).toBe(false);
    expect(verifyGitHubWebhook(raw, "sha256=bad", secret)).toBe(false);
    expect(verifyGitHubWebhook(raw, undefined, secret)).toBe(false);
  });

  it("rejects signatures produced by a different secret", () => {
    const raw = '{"action":"opened"}';
    expect(verifyGitHubWebhook(raw, sign(raw, "another-secret"), secret)).toBe(
      false,
    );
  });

  it("rejects malformed signature headers", () => {
    const raw = '{"action":"opened"}';
    expect(verifyGitHubWebhook(raw, "garbage", secret)).toBe(false);
    expect(verifyGitHubWebhook(raw, "", secret)).toBe(false);
    expect(verifyGitHubWebhook(raw, "sha256=zzzz", secret)).toBe(false);
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

  it("normalizes a push event with the branch ref as the subject", () => {
    const normalized = normalizeGitHubEvent("push", "delivery-2", {
      repository: { full_name: "owner/repo" },
      sender: { login: "bob" },
      ref: "refs/heads/main",
      after: "abc123",
      commits: [{ message: "Fix the inventory query" }],
    });
    expect(normalized).not.toBeNull();
    expect(normalized?.source).toBe("github");
    expect(normalized?.externalId).toBe("delivery-2");
    expect(normalized?.from).toBe("bob");
    expect(normalized?.text).toContain("owner/repo");
    expect(normalized?.text).toContain("Fix the inventory query");
    expect(normalized?.meta?.event).toBe("push");
    expect(normalized?.meta?.subject).toContain("main");
  });

  it("normalizes an issue event with title and body", () => {
    const normalized = normalizeGitHubEvent("issues", "delivery-3", {
      action: "opened",
      repository: { full_name: "owner/repo" },
      sender: { login: "carol" },
      issue: {
        title: "Pagination breaks on page 40",
        body: "The list crashes past 40 pages.",
      },
    });
    expect(normalized).not.toBeNull();
    expect(normalized?.source).toBe("github");
    expect(normalized?.from).toBe("carol");
    expect(normalized?.text).toContain("Pagination breaks on page 40");
    expect(normalized?.text).toContain("The list crashes past 40 pages.");
    expect(normalized?.meta?.event).toBe("issues");
    expect(normalized?.meta?.action).toBe("opened");
    expect(normalized?.meta?.subject).toBe("Pagination breaks on page 40");
  });

  it("ignores unsupported events and refuses missing repositories", () => {
    expect(normalizeGitHubEvent("star", "delivery-1", {})).toBeNull();
    expect(
      normalizeGitHubEvent("fork", "delivery-1", {
        repository: { full_name: "o/r" },
      }),
    ).toBeNull();
    expect(() => normalizeGitHubEvent("push", "delivery-1", {})).toThrow(
      "repository",
    );
  });
});

// ---------------------------------------------------------------------------
// Realistic GitHub webhook payloads (mirrors the shapes GitHub actually
// delivers for the push / pull_request / issues events this trigger handles).
// ---------------------------------------------------------------------------

const PULL_REQUEST_PAYLOAD = {
  action: "opened",
  number: 42,
  pull_request: {
    number: 42,
    title: "Add the widget inventory page",
    body: "Implements the inventory table + filters.",
    head: { ref: "feature/inventory" },
    user: { login: "octodev" },
  },
  repository: {
    full_name: "acme/widgets",
    name: "widgets",
    owner: { login: "acme" },
    default_branch: "main",
  },
  sender: { login: "octodev" },
};

const PUSH_PAYLOAD = {
  ref: "refs/heads/main",
  before: "0000000000000000000000000000000000000000",
  after: "d3adb33fc0ffee00000000000000000000000001",
  forced: false,
  commits: [
    {
      id: "d3adb33fc0ffee00000000000000000000000001",
      message: "Fix the inventory query",
      author: { name: "Bob", email: "bob@acme.dev" },
      modified: ["src/inventory.sql"],
    },
    {
      id: "d3adb33fc0ffee00000000000000000000000002",
      message: "Add the inventory table",
      author: { name: "Bob", email: "bob@acme.dev" },
      modified: ["src/schema.sql"],
    },
  ],
  repository: {
    full_name: "acme/widgets",
    name: "widgets",
    owner: { login: "acme" },
    default_branch: "main",
  },
  pusher: { name: "bob", email: "bob@acme.dev" },
  sender: { login: "bob" },
};

const ISSUES_PAYLOAD = {
  action: "opened",
  issue: {
    number: 7,
    title: "Pagination breaks on page 40",
    body: "The list crashes past 40 pages.",
    state: "open",
    user: { login: "tester" },
  },
  repository: {
    full_name: "acme/widgets",
    name: "widgets",
    owner: { login: "acme" },
    default_branch: "main",
  },
  sender: { login: "tester" },
};

describe("GitHub webhook payload shapes (GitHub-realistic fixtures)", () => {
  it("verifies a signature over the exact raw body GitHub sends", () => {
    const raw = JSON.stringify(PULL_REQUEST_PAYLOAD);
    expect(verifyGitHubWebhook(raw, sign(raw), secret)).toBe(true);
    const tampered = raw.replace("acme/widgets", "acme/widgetz");
    expect(verifyGitHubWebhook(raw, sign(tampered), secret)).toBe(false);
  });

  it("normalizes the pull_request payload GitHub delivers", () => {
    const normalized = normalizeGitHubEvent(
      "pull_request",
      "delivery-1",
      PULL_REQUEST_PAYLOAD,
    );
    expect(normalized?.source).toBe("github");
    expect(normalized?.externalId).toBe("delivery-1");
    expect(normalized?.from).toBe("octodev");
    expect(normalized?.text).toContain("acme/widgets");
    expect(normalized?.text).toContain("Add the widget inventory page");
    expect(normalized?.meta).toMatchObject({
      repository: "acme/widgets",
      event: "pull_request",
      action: "opened",
      subject: "Add the widget inventory page",
    });
  });

  it("normalizes the push payload with branch and commit messages", () => {
    const normalized = normalizeGitHubEvent("push", "delivery-2", PUSH_PAYLOAD);
    expect(normalized?.source).toBe("github");
    expect(normalized?.from).toBe("bob");
    expect(normalized?.text).toContain("refs/heads/main");
    expect(normalized?.text).toContain("Fix the inventory query");
    expect(normalized?.text).toContain("Add the inventory table");
    expect(normalized?.meta?.subject).toContain("main");
    expect(normalized?.meta?.repository).toBe("acme/widgets");
  });

  it("normalizes the issue payload with title and body", () => {
    const normalized = normalizeGitHubEvent(
      "issues",
      "delivery-3",
      ISSUES_PAYLOAD,
    );
    expect(normalized?.source).toBe("github");
    expect(normalized?.from).toBe("tester");
    expect(normalized?.text).toContain("Pagination breaks on page 40");
    expect(normalized?.text).toContain("The list crashes past 40 pages.");
    expect(normalized?.meta).toMatchObject({
      repository: "acme/widgets",
      event: "issues",
      action: "opened",
      subject: "Pagination breaks on page 40",
    });
  });
});
