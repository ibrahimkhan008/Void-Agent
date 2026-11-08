// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useSWR: vi.fn(),
  userDetail: vi.fn(),
  skeleton: vi.fn(),
}));

vi.mock("swr", () => ({ default: mocks.useSWR }));
vi.mock("./user-detail", () => ({
  UserDetail: (props: unknown) => {
    mocks.userDetail(props);
    return null;
  },
}));
vi.mock("./user-detail-content-skeleton", () => ({
  UserDetailContentSkeleton: () => {
    mocks.skeleton();
    return null;
  },
}));

import { UserSettingsContent } from "./user-settings-content";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("UserSettingsContent", () => {
  it("loads the self-service context endpoint only when mounted", () => {
    const context = {
      currentUserId: "owner-1",
      user: { id: "owner-1", name: "Ada" },
      userAccountInfo: { hasPassword: true, oauthProviders: ["google"] },
    };
    mocks.useSWR.mockReturnValue({ data: context });

    render(<UserSettingsContent />);

    expect(mocks.useSWR).toHaveBeenCalledWith(
      "/api/user/settings-context",
      expect.any(Function),
    );
    expect(mocks.userDetail).toHaveBeenCalledWith({
      view: "user",
      user: context.user,
      currentUserId: context.currentUserId,
      userAccountInfo: context.userAccountInfo,
    });
    expect(mocks.skeleton).not.toHaveBeenCalled();
  });

  it("shows the settings skeleton while profile data is loading", () => {
    mocks.useSWR.mockReturnValue({ data: undefined });
    render(<UserSettingsContent />);
    expect(mocks.skeleton).toHaveBeenCalledOnce();
    expect(mocks.userDetail).not.toHaveBeenCalled();
  });
});
