import { describe, expect, it } from "vitest";
import { isUserStorageKey, storageKeyFromUrl } from "./storage-utils";

describe("storageKeyFromUrl", () => {
  it("extracts key from absolute URL", () => {
    expect(storageKeyFromUrl("https://example.com/uploads/sample.csv")).toBe(
      "uploads/sample.csv",
    );
  });

  it("decodes encoded path segments", () => {
    expect(
      storageKeyFromUrl(
        "https://example.com/uploads/My%20File%20(1).csv?token=123",
      ),
    ).toBe("uploads/My File (1).csv");
  });

  it("returns null for invalid URLs", () => {
    expect(storageKeyFromUrl("not-a-url")).toBeNull();
  });

  it("extracts keys from root-relative local file URLs", () => {
    expect(storageKeyFromUrl("/api/files/uploads/notes.md")).toBe(
      "uploads/notes.md",
    );
    expect(
      storageKeyFromUrl("https://app.example/api/files/uploads/a%20b.txt"),
    ).toBe("uploads/a b.txt");
  });

  it("rejects path traversal and protocol-relative inputs", () => {
    expect(
      storageKeyFromUrl("/api/files/uploads/%2e%2e/private.pdf"),
    ).toBeNull();
    expect(storageKeyFromUrl("//other.example/uploads/file.pdf")).toBeNull();
  });

  it("scopes stored object keys to the authenticated owner", () => {
    expect(isUserStorageKey("uploads/user-1/notes.pdf", "user-1")).toBe(true);
    expect(isUserStorageKey("uploads/user-2/notes.pdf", "user-1")).toBe(false);
    expect(isUserStorageKey("uploads/notes.pdf", "user-1")).toBe(false);
    expect(
      isUserStorageKey("uploads/user-1/../user-2/secret.pdf", "user-1"),
    ).toBe(false);
  });
});
