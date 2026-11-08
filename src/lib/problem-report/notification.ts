const MAX_SUBJECT_LENGTH = 160;

export type ProblemReportNotificationInput = {
  reportId: string;
  description: string;
  pageUrl?: string;
  locale?: string;
  viewport?: string;
  screenshotCount: number;
};

/** A single configured mailbox is accepted; client input can never choose it. */
export function getProblemReportNotificationRecipient(
  configured = process.env.PROBLEM_REPORT_NOTIFY_TO,
): string | undefined {
  const recipient = configured?.trim();
  if (!recipient || recipient.length > 254 || /[\r\n,;]/.test(recipient)) {
    return undefined;
  }
  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(recipient)
    ? recipient
    : undefined;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

function summary(description: string, maxLength: number): string {
  const firstLine =
    description.trim().split(/\r?\n/, 1)[0]?.trim() || "New report";
  const safeLine = firstLine.replace(/[\r\n\u0000-\u001f]+/g, " ");
  return safeLine.length > maxLength
    ? `${safeLine.slice(0, maxLength - 3)}...`
    : safeLine;
}

export function problemReportNotificationSubject(
  input: Pick<ProblemReportNotificationInput, "reportId" | "description">,
): string {
  const prefix = "[Void-Agent] Problem report: ";
  const reportSuffix = ` (${input.reportId.slice(0, 8)})`;
  const descriptionLimit =
    MAX_SUBJECT_LENGTH - prefix.length - reportSuffix.length;
  return `${prefix}${summary(input.description, descriptionLimit)}${reportSuffix}`;
}

/** Build an actionable notification without identity or private storage keys. */
export function problemReportNotificationHtml(
  input: ProblemReportNotificationInput,
): string {
  const details = [
    input.pageUrl ? `<li>Page: ${escapeHtml(input.pageUrl)}</li>` : "",
    input.locale ? `<li>Locale: ${escapeHtml(input.locale)}</li>` : "",
    input.viewport ? `<li>Viewport: ${escapeHtml(input.viewport)}</li>` : "",
    `<li>Screenshots attached: ${input.screenshotCount}</li>`,
  ].filter(Boolean);

  return [
    "<h2>New Void-Agent problem report</h2>",
    `<p>Report ID: <code>${escapeHtml(input.reportId)}</code></p>`,
    `<ul>${details.join("")}</ul>`,
    `<h3>${escapeHtml(summary(input.description, 120))}</h3>`,
    `<pre style="white-space:pre-wrap">${escapeHtml(input.description)}</pre>`,
    "<p>Review this report in the Void-Agent admin problem reports page.</p>",
  ].join("\n");
}
