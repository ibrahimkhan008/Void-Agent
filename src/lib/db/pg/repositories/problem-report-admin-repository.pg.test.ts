import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("lib/db/pg/db.pg", () => ({ pgDb: {} }));
vi.mock("lib/db/pg/schema.pg", () => ({ ProblemReportTable: {} }));
import {
  publicAdminContext,
  publicAdminScreenshotMetadata,
} from "./problem-report-admin-repository.pg";

describe("problem report admin projection", () => {
  it("never returns private screenshot storage keys", () => {
    const metadata = publicAdminScreenshotMetadata([
      {
        key: "users/private-user-id/problem-report/private-object-key.png",
        name: "screen.png",
        contentType: "image/png",
        size: 512,
      },
    ]);
    expect(metadata).toEqual([
      { name: "screen.png", contentType: "image/png", size: 512 },
    ]);
    expect(JSON.stringify(metadata)).not.toContain("private-object-key");
    expect(JSON.stringify(metadata)).not.toContain("private-user-id");
  });

  it("treats malformed legacy screenshot values as empty metadata", () => {
    expect(publicAdminScreenshotMetadata(null)).toEqual([]);
  });

  it("removes query and fragment secrets from stored diagnostic URLs", () => {
    const context = publicAdminContext({
      pageUrl: "https://app.test/chat?token=secret#session",
      injected: "private",
    });
    expect(context).toEqual({ pageUrl: "https://app.test/chat" });
    expect(JSON.stringify(context)).not.toContain("secret");
    expect(JSON.stringify(context)).not.toContain("injected");
  });
});
