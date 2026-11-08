import { beforeEach, describe, expect, it, vi } from "vitest";

const { authApi, getUserAccountsMock } = vi.hoisted(() => ({
  authApi: {
    changePassword: vi.fn(),
    setUserPassword: vi.fn(),
    revokeUserSessions: vi.fn(),
  },
  getUserAccountsMock: vi.fn(),
}));

vi.mock("lib/action-utils", () => ({
  validatedActionWithAdminPermission: (_schema: unknown, action: unknown) =>
    action,
  validatedActionWithUserManagePermission: (
    _schema: unknown,
    action: unknown,
  ) => action,
}));
vi.mock("auth/server", () => ({ auth: { api: authApi } }));
vi.mock("lib/user/server", () => ({
  getUser: vi.fn(),
  getUserAccounts: (...args: unknown[]) => getUserAccountsMock(...args),
  updateUserDetails: vi.fn(),
}));
vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn().mockResolvedValue((key: string) => key),
}));
vi.mock("better-auth", () => ({ logger: { error: vi.fn() } }));
vi.mock("lib/ai/image/generate-image", () => ({
  generateImageWithOpenAI: vi.fn(),
  generateImageWithXAI: vi.fn(),
}));

import { updateUserPasswordAction } from "./actions";

type PasswordAction = (
  data: {
    userId: string;
    newPassword: string;
    confirmPassword: string;
    currentPassword?: string;
    isCurrentUser?: boolean;
  },
  userId: string,
  session: unknown,
  isOwnResource: boolean,
  formData: FormData,
) => Promise<{ success: boolean; message: string }>;

const runPasswordAction = updateUserPasswordAction as unknown as PasswordAction;

describe("password update action authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUserAccountsMock.mockResolvedValue({ hasPassword: true });
    authApi.changePassword.mockResolvedValue({});
    authApi.setUserPassword.mockResolvedValue({});
    authApi.revokeUserSessions.mockResolvedValue({});
  });

  it("requires the current password for the authenticated user's account even if the client claims otherwise", async () => {
    const result = await runPasswordAction(
      {
        userId: "user-1",
        newPassword: "SecurePass123!",
        confirmPassword: "SecurePass123!",
        isCurrentUser: false,
      },
      "user-1",
      {},
      true,
      new FormData(),
    );

    expect(result.success).toBe(false);
    expect(authApi.changePassword).not.toHaveBeenCalled();
    expect(authApi.setUserPassword).not.toHaveBeenCalled();
  });

  it("uses current-password verification for self regardless of forged client state", async () => {
    await runPasswordAction(
      {
        userId: "user-1",
        newPassword: "SecurePass123!",
        confirmPassword: "SecurePass123!",
        currentPassword: "OldPass123!",
        isCurrentUser: false,
      },
      "user-1",
      {},
      true,
      new FormData(),
    );

    expect(authApi.changePassword).toHaveBeenCalledWith({
      body: {
        currentPassword: "OldPass123!",
        newPassword: "SecurePass123!",
        revokeOtherSessions: true,
      },
      headers: expect.any(Headers),
    });
    expect(authApi.setUserPassword).not.toHaveBeenCalled();
  });

  it("uses the administrator reset path for another user regardless of forged client state", async () => {
    await runPasswordAction(
      {
        userId: "managed-user",
        newPassword: "SecurePass123!",
        confirmPassword: "SecurePass123!",
        isCurrentUser: true,
      },
      "managed-user",
      {},
      false,
      new FormData(),
    );

    expect(authApi.setUserPassword).toHaveBeenCalledWith({
      body: { userId: "managed-user", newPassword: "SecurePass123!" },
      headers: expect.any(Headers),
    });
    expect(authApi.revokeUserSessions).toHaveBeenCalledWith({
      body: { userId: "managed-user" },
      headers: expect.any(Headers),
    });
    expect(authApi.changePassword).not.toHaveBeenCalled();
  });
});
