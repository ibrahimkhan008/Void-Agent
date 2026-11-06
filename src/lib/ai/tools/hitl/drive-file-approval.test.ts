import { describe, expect, it } from "vitest";
import { driveFileApprovalSchema, hashDriveFileApproval } from "./drive-file-approval";

describe("Drive file approval contract", () => {
  it("allows empty text content but rejects unsafe names and oversized content", () => {
    expect(driveFileApprovalSchema.safeParse({ name: "empty.txt", content: "" }).success).toBe(true);
    expect(driveFileApprovalSchema.safeParse({ name: "bad\nname.txt", content: "x" }).success).toBe(false);
    expect(driveFileApprovalSchema.safeParse({ name: "large.txt", content: "x".repeat(50_001) }).success).toBe(false);
  });

  it("binds the digest to file name and full content", () => {
    const payload = { name: "notes.txt", content: "reviewed" };
    expect(hashDriveFileApproval(payload)).not.toBe(hashDriveFileApproval({ ...payload, content: "changed" }));
    expect(hashDriveFileApproval(payload)).not.toBe(hashDriveFileApproval({ ...payload, name: "other.txt" }));
  });
});
