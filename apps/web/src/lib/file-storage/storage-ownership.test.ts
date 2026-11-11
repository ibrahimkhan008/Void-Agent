import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isManagedStorageKey,
  isUserStorageKey,
  storageKeyFromUrl,
  userStoragePrefix,
  validateStorageOwnerId,
} from "./storage-utils";

describe("owner-scoped storage keys", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("uses the configured root and validates owner identifiers", () => {
    vi.stubEnv("FILE_STORAGE_PREFIX", "/tenant-files/");
    expect(userStoragePrefix("user_123-abc")).toBe(
      "tenant-files/user_123-abc/",
    );
    expect(validateStorageOwnerId("user_123-abc")).toBe("user_123-abc");
    expect(() => userStoragePrefix("../other-user")).toThrow(
      "Invalid storage owner identifier",
    );
  });

  it("rejects foreign, traversal, and unmanaged keys", () => {
    vi.stubEnv("FILE_STORAGE_PREFIX", "uploads");
    expect(isUserStorageKey("uploads/user-1/file.pdf", "user-1")).toBe(true);
    expect(isUserStorageKey("uploads/user-2/file.pdf", "user-1")).toBe(false);
    expect(
      isUserStorageKey("uploads/user-1/../user-2/file.pdf", "user-1"),
    ).toBe(false);
    expect(isUserStorageKey("uploads/user-1\\..\\user-2\\x", "user-1")).toBe(
      false,
    );
    expect(isManagedStorageKey("uploads/user-1/file.pdf")).toBe(true);
    expect(isManagedStorageKey("other/user-1/file.pdf")).toBe(false);
  });

  it("extracts app and Supabase object keys without accepting traversal", () => {
    expect(storageKeyFromUrl("/api/files/uploads/user-1/file%20one.pdf")).toBe(
      "uploads/user-1/file one.pdf",
    );
    expect(
      storageKeyFromUrl(
        "https://project.supabase.co/storage/v1/object/sign/attachments/uploads/user-1/file.pdf?token=secret",
      ),
    ).toBe("uploads/user-1/file.pdf");
    expect(storageKeyFromUrl("/api/files/uploads/user-1/%2e%2e/secret")).toBe(
      null,
    );
    expect(storageKeyFromUrl("javascript:alert(1)")).toBeNull();
    expect(storageKeyFromUrl("//evil.example/uploads/user-1/file")).toBeNull();
  });
});
