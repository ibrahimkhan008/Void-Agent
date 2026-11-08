import { describe, expect, it } from "vitest";
import {
  MAX_SANDBOX_ARTIFACT_BYTES,
  resolveSandboxArtifactPath,
} from "./artifact-export";

describe("sandbox artifact export policy", () => {
  it("allows bounded previewable files only inside the workspace", () => {
    expect(
      resolveSandboxArtifactPath("reports/summary.xlsx", "/home/user/project"),
    ).toEqual({
      path: "/home/user/project/reports/summary.xlsx",
      filename: "summary.xlsx",
    });
    expect(MAX_SANDBOX_ARTIFACT_BYTES).toBe(15 * 1024 * 1024);
    expect(resolveSandboxArtifactPath("report.html", "/workspace")).toEqual({
      path: "/workspace/report.html",
      filename: "report.html",
    });
  });

  it.each([
    "",
    "/etc/passwd",
    "../secret.pdf",
    "reports/../../secret.pdf",
    "reports\\secret.pdf",
    "logo.svg",
    "script.js",
    "archive.zip",
    "bad\u0000name.pdf",
  ])("rejects unsafe or unsupported path %j", (value) => {
    expect(resolveSandboxArtifactPath(value, "/home/user/project")).toBeNull();
  });

  it("rejects paths that exceed the bounded input length", () => {
    expect(
      resolveSandboxArtifactPath(
        `${"a".repeat(501)}.pdf`,
        "/home/user/project",
      ),
    ).toBeNull();
  });
});
