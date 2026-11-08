import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ list: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@composio/core", () => ({
  Composio: class {
    connectedAccounts = { list: mocks.list };
  },
}));

import {
  isReadOnlyComposioAction,
  isWriteComposioAction,
  listComposioAccountsForUser,
} from "./composio";

describe("listComposioAccountsForUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("COMPOSIO_API_KEY", "test-key");
    mocks.list.mockResolvedValue({ items: [], nextCursor: null });
  });

  it("includes accessible shared accounts only when explicitly requested", async () => {
    await listComposioAccountsForUser("user-1", { includeShared: true });
    expect(mocks.list).toHaveBeenCalledWith(
      expect.objectContaining({
        userIds: ["user-1"],
        statuses: ["ACTIVE"],
        accountType: "ALL",
      }),
      expect.anything(),
    );

    mocks.list.mockClear();
    await listComposioAccountsForUser("user-1");
    expect(mocks.list).toHaveBeenCalledWith(
      expect.not.objectContaining({ accountType: "ALL" }),
      expect.anything(),
    );
  });

  it("caps account enumeration when a bounded caller requests it", async () => {
    await listComposioAccountsForUser("user-1", { maxAccounts: 20 });
    expect(mocks.list).toHaveBeenCalledWith(
      expect.objectContaining({ userIds: ["user-1"], limit: 20 }),
      expect.anything(),
    );
  });
});

describe("Composio action effect classification", () => {
  it.each(["GMAIL_SEND_EMAIL", "GITHUB_CREATE_ISSUE", "SLACK_DELETE_MESSAGE"])(
    "recognizes explicit write action %s",
    (slug) => {
      expect(isWriteComposioAction(slug)).toBe(true);
      expect(isReadOnlyComposioAction(slug)).toBe(false);
    },
  );

  it.each([
    "GITHUB_LIST_REPOSITORIES",
    "GMAIL_GET_MESSAGE",
    "CUSTOM_UNKNOWN_ACTION",
    "GITHUB_FETCH_AND_DELETE_CACHE",
  ])(
    "does not classify read, unknown, or ambiguous action %s as writable",
    (slug) => {
      expect(isWriteComposioAction(slug)).toBe(false);
    },
  );
});
