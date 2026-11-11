import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { Pool } from "pg";
import { TEST_USERS } from "../constants/test-users";

const promptText = "A01 browser lifecycle prompt";
const answerText = "A01 controlled assistant response";

const assistantSse = [
  { type: "start", messageId: "a01-assistant-message" },
  { type: "start-step" },
  { type: "text-start", id: "a01-text" },
  { type: "text-delta", id: "a01-text", delta: answerText },
  { type: "text-end", id: "a01-text" },
  { type: "finish-step" },
  {
    type: "finish",
    finishReason: "stop",
    messageMetadata: {
      usage: { inputTokens: 1, outputTokens: 5, totalTokens: 6 },
      modelId: "a01-test-model",
    },
  },
].map((part) => `data: ${JSON.stringify(part)}\n\n`);

test("sends a first chat prompt and renders the streamed assistant response", async ({
  page,
}) => {
  const postedPayloads: Record<string, unknown>[] = [];
  const diagnostics: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error")
      diagnostics.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) =>
    diagnostics.push(`pageerror: ${error.message}`),
  );
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/chat")) {
      diagnostics.push(`request: ${request.method()} ${request.url()}`);
    }
  });
  page.on("response", async (response) => {
    const pathname = new URL(response.url()).pathname;
    if (pathname.startsWith("/api/chat")) {
      let body = "<body unavailable>";
      if (pathname === "/api/chat") {
        try {
          body = (await response.text()).slice(0, 2000);
        } catch {
          // Response bodies may already have been consumed by the chat client.
        }
      }
      diagnostics.push(
        `response: ${response.status()} ${response.url()} ${body}`,
      );
    }
  });
  let interceptedRequest = false;
  await page.route("**/api/chat**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === "/api/chat/challenge") {
      // UI-only test: mock the model response; the real challenge route's
      // proof-of-work/signature enforcement is tested separately.
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ enabled: false }),
      });
      return;
    }
    if (pathname !== "/api/chat") {
      await route.continue();
      return;
    }
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }

    interceptedRequest = true;
    diagnostics.push(`intercepted: ${route.request().url()}`);
    postedPayloads.push(
      route.request().postDataJSON() as Record<string, unknown>,
    );
    if (postedPayloads.length === 1) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Controlled transient A01 failure" }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache",
        "x-vercel-ai-ui-message-stream": "v1",
      },
      body: `${assistantSse.join("")}data: [DONE]\n\n`,
    });
  });

  await page.goto("/dashboard");
  const skipOnboarding = page.getByRole("button", { name: /Skip setup/i });
  if (await skipOnboarding.isVisible().catch(() => false)) {
    await skipOnboarding.click();
  }

  const editor = page.locator('[contenteditable="true"]').first();
  await expect(editor).toBeVisible();
  await editor.fill(promptText);
  await editor.press("Enter");

  await expect(page.getByText(promptText, { exact: true })).toBeVisible();
  try {
    await expect.poll(() => interceptedRequest).toBe(true);
  } catch (error) {
    await test.info().attach("chat-network-diagnostics", {
      body: Buffer.from(diagnostics.join("\n")),
      contentType: "text/plain",
    });
    throw error;
  }
  expect(postedPayloads).toHaveLength(1);
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
  await page.getByRole("button", { name: "Retry" }).click();
  await expect.poll(() => postedPayloads.length).toBe(2);
  try {
    await expect(page.getByText(answerText, { exact: true })).toBeVisible();
  } catch (error) {
    await test.info().attach("chat-network-diagnostics", {
      body: Buffer.from(diagnostics.join("\n")),
      contentType: "text/plain",
    });
    throw error;
  }
  expect(postedPayloads[0]?.message).toMatchObject({
    role: "user",
    parts: [expect.objectContaining({ type: "text", text: promptText })],
  });
  expect(postedPayloads[1]?.message).toMatchObject({
    role: "user",
    parts: [expect.objectContaining({ type: "text", text: promptText })],
  });
});

test("hydrates an owned persisted conversation after browser reload", async ({
  page,
}) => {
  const databaseUrl = process.env.A01_TEST_DATABASE_URL;
  if (!databaseUrl) throw new Error("A01_TEST_DATABASE_URL is required");

  const parsedDatabaseUrl = new URL(databaseUrl);
  const databaseName = decodeURIComponent(parsedDatabaseUrl.pathname.slice(1));
  if (
    !["localhost", "127.0.0.1", "::1", "[::1]"].includes(
      parsedDatabaseUrl.hostname.toLowerCase(),
    ) ||
    !databaseName.toLowerCase().includes("a01") ||
    !databaseName.toLowerCase().includes("test")
  ) {
    throw new Error(
      "Conversation hydration test requires the isolated loopback A01 test database",
    );
  }

  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  const threadId = randomUUID();
  const userMessageId = `a01-hydration-user-${randomUUID()}`;
  const assistantMessageId = `a01-hydration-assistant-${randomUUID()}`;
  const persistedPrompt = `A01 persisted prompt ${threadId}`;
  const persistedAnswer = `A01 persisted answer ${threadId}`;

  try {
    const userResult = await pool.query<{ id: string }>(
      'SELECT id FROM "user" WHERE email = $1 LIMIT 1',
      [TEST_USERS.regular.email],
    );
    const userId = userResult.rows[0]?.id;
    if (!userId) {
      throw new Error("The isolated A01 regular test user has not been seeded");
    }

    await pool.query(
      'INSERT INTO "chat_thread" (id, title, user_id) VALUES ($1, $2, $3)',
      [threadId, persistedPrompt, userId],
    );
    await pool.query(
      `INSERT INTO "chat_message" (id, thread_id, role, parts, created_at)
       VALUES
         ($1, $2, 'user', ARRAY[$3::json], NOW() - INTERVAL '1 second'),
         ($4, $2, 'assistant', ARRAY[$5::json], NOW())`,
      [
        userMessageId,
        threadId,
        JSON.stringify({ type: "text", text: persistedPrompt }),
        assistantMessageId,
        JSON.stringify({ type: "text", text: persistedAnswer }),
      ],
    );

    await page.goto(`/chat/${threadId}`);
    await expect(page).toHaveURL(new RegExp(`/chat/${threadId}$`));
    const transcript = page.locator(".chat-thread-scroll");
    await expect(
      transcript.getByText(persistedPrompt, { exact: true }),
    ).toBeVisible();
    await expect(
      transcript.getByText(persistedAnswer, { exact: true }),
    ).toBeVisible();

    await page.reload();
    await expect(page).toHaveURL(new RegExp(`/chat/${threadId}$`));
    await expect(
      transcript.getByText(persistedPrompt, { exact: true }),
    ).toBeVisible();
    await expect(
      transcript.getByText(persistedAnswer, { exact: true }),
    ).toBeVisible();
    expect(
      await transcript.getByText(persistedPrompt, { exact: true }).count(),
    ).toBe(1);
    expect(
      await transcript.getByText(persistedAnswer, { exact: true }).count(),
    ).toBe(1);
  } finally {
    await pool.query('DELETE FROM "chat_thread" WHERE id = $1', [threadId]);
    await pool.end();
  }
});
