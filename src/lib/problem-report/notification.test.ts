import { describe, expect, it } from "vitest";
import {
  getProblemReportNotificationRecipient,
  problemReportNotificationHtml,
  problemReportNotificationSubject,
} from "./notification";

describe("problem report notification", () => {
  it("accepts only one configured mailbox and rejects header injection", () => {
    expect(getProblemReportNotificationRecipient(" team@example.com ")).toBe(
      "team@example.com",
    );
    expect(getProblemReportNotificationRecipient(undefined)).toBeUndefined();
    expect(
      getProblemReportNotificationRecipient(
        "team@example.com\r\nBcc:bad@x.test",
      ),
    ).toBeUndefined();
    expect(
      getProblemReportNotificationRecipient("one@example.com,two@example.com"),
    ).toBeUndefined();
    expect(
      getProblemReportNotificationRecipient("not-an-email"),
    ).toBeUndefined();
  });

  it("keeps the subject bounded and strips line breaks from its summary", () => {
    const subject = problemReportNotificationSubject({
      reportId: "12345678-private-rest",
      description: `Broken\r\nBcc: attacker@example.com ${"x".repeat(300)}`,
    });
    expect(subject.length).toBeLessThanOrEqual(160);
    expect(subject).not.toContain("\r");
    expect(subject).not.toContain("\n");
    expect(subject).toContain("(12345678)");
  });

  it("keeps the report id in subjects with very long first lines", () => {
    const subject = problemReportNotificationSubject({
      reportId: "12345678-private-rest",
      description: "x".repeat(500),
    });
    expect(subject).toHaveLength(160);
    expect(subject).toContain("(12345678)");
  });

  it("escapes user content and never includes private screenshot keys or identity", () => {
    const html = problemReportNotificationHtml({
      reportId: "report-123",
      description: "<img src=x onerror=alert(1)> & broken",
      pageUrl: "https://app.example/chat/thread",
      screenshotCount: 1,
    });
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt; &amp; broken");
    expect(html).toContain("https://app.example/chat/thread");
    expect(html).toContain("Screenshots attached: 1");
    expect(html).not.toContain("uploads/");
    expect(html).not.toContain("@example.com");
  });
});
