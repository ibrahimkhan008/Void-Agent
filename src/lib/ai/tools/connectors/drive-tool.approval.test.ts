import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ select: vi.fn(), refreshConnectorToken: vi.fn(), consume: vi.fn() }));
vi.mock("lib/db/pg/db.pg", () => ({ pgDb: { select: mocks.select } }));
vi.mock("lib/connectors/refresh", () => ({ refreshConnectorToken: mocks.refreshConnectorToken }));
vi.mock("lib/db/pg/repositories/drive-approval-repository.pg", () => ({ driveApprovalRepository: { consume: mocks.consume } }));

import { createDriveToolForUser } from "./drive-tool";

async function execute(input: unknown) {
  const created = createDriveToolForUser("user-1") as unknown as { execute: (input: unknown, options: unknown) => Promise<unknown> };
  return created.execute(input, { toolCallId: "call-1", messages: [] });
}

beforeEach(() => {
  vi.clearAllMocks();
  const query = { from: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue([{ isConnected: true }]) };
  mocks.select.mockReturnValue(query);
  mocks.refreshConnectorToken.mockResolvedValue("drive-access-token");
  mocks.consume.mockResolvedValue(true);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "file-1", name: "notes.txt", webViewLink: "https://drive.test/file-1" }), { status: 200 })));
});

describe("Google Drive create approval", () => {
  it("requires exact approval and uses a per-request multipart boundary", async () => {
    const blocked = await execute({ action: "create", name: "notes.txt", content: "Hello" }) as { error?: string };
    expect(blocked.error).toContain("approvalToken");
    expect(fetch).not.toHaveBeenCalled();
    const payload = { name: "notes.txt", content: "Hello" };
    const result = await execute({ action: "create", ...payload, approvalToken: "d".repeat(48) });
    expect(mocks.consume).toHaveBeenCalledWith("user-1", "d".repeat(48), payload);
    const [, request] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(request.method).toBe("POST");
    expect(request.body).toContain("notes.txt");
    expect(request.body).toContain("Hello");
    expect(request.headers).toMatchObject({ "Content-Type": expect.stringMatching(/^multipart\/related; boundary=void-agent-/) });
    expect(result).toMatchObject({ success: true, file: { id: "file-1" } });
  });

  it("does not create a file when approval is stale or content changed", async () => {
    mocks.consume.mockResolvedValue(false);
    const result = await execute({ action: "create", name: "notes.txt", content: "Changed", approvalToken: "d".repeat(48) }) as { error?: string };
    expect(result.error).toContain("fresh approval");
    expect(fetch).not.toHaveBeenCalled();
  });
});
