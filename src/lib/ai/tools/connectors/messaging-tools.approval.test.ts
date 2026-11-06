import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ select: vi.fn(), refreshConnectorToken: vi.fn(), consume: vi.fn(), getTokenProviderToken: vi.fn() }));
vi.mock("lib/db/pg/db.pg", () => ({ pgDb: { select: mocks.select } }));
vi.mock("lib/connectors/refresh", () => ({ refreshConnectorToken: mocks.refreshConnectorToken }));
vi.mock("lib/connectors/credentials", () => ({ getTokenProviderToken: mocks.getTokenProviderToken }));
vi.mock("lib/db/pg/repositories/messaging-approval-repository.pg", () => ({ messagingApprovalRepository: { consume: mocks.consume } }));

import { createDiscordToolForUser } from "./discord-tool";
import { createTeamsToolForUser } from "./teams-tool";
import { createZulipToolForUser } from "./zulip-tool";

async function execute(tool: unknown, input: unknown) {
  const created = tool as { execute: (input: unknown, options: unknown) => Promise<unknown> };
  return created.execute(input, { toolCallId: "call-1", messages: [] });
}

beforeEach(() => {
  vi.clearAllMocks();
  const query = { from: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue([{ isConnected: true }]) };
  mocks.select.mockReturnValue(query);
  mocks.refreshConnectorToken.mockResolvedValue("access-token");
  mocks.getTokenProviderToken.mockReturnValue("zulip-token");
  mocks.consume.mockResolvedValue(true);
  process.env.ZULIP_BASE_URL = "https://zulip.example";
  process.env.ZULIP_USER_EMAIL = "bot@example.com";
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "sent" }), { status: 200 })));
});

describe("outbound messaging approvals", () => {
  it("blocks Teams and Discord writes without review and consumes exact payload before sending", async () => {
    const teams = createTeamsToolForUser("user-1");
    const blocked = await execute(teams, { action: "send_chat_message", chatId: "chat-1", body: "Hello" }) as { error?: string };
    expect(blocked.error).toContain("approvalToken");
    expect(fetch).not.toHaveBeenCalled();
    await execute(teams, { action: "send_chat_message", chatId: "chat/1", body: "Hello", approvalToken: "m".repeat(48) });
    expect(mocks.consume).toHaveBeenCalledWith("user-1", "m".repeat(48), { provider: "teams", destination: "chat/1", content: "Hello" });
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("chat%2F1"), expect.objectContaining({ method: "POST" }));

    mocks.consume.mockResolvedValue(false);
    vi.mocked(fetch).mockClear();
    const discord = await execute(createDiscordToolForUser("user-1"), { action: "send_message", channelId: "123456789", text: "Hello", approvalToken: "m".repeat(48) }) as { error?: string };
    expect(discord.error).toContain("fresh approval");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("binds Zulip stream, topic and content before posting", async () => {
    await execute(createZulipToolForUser("user-1"), { action: "send_message", stream: "general", topic: "updates", content: "Hello", approvalToken: "z".repeat(48) });
    expect(mocks.consume).toHaveBeenCalledWith("user-1", "z".repeat(48), { provider: "zulip", destination: "general", topic: "updates", content: "Hello" });
    expect(fetch).toHaveBeenCalledWith("https://zulip.example/api/v1/messages", expect.objectContaining({ method: "POST", body: expect.stringContaining("updates") }));
  });
});
