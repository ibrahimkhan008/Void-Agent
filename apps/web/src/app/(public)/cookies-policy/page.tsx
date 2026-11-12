import path from "node:path";
import { legalMetadata } from "@/components/legal/legal-page";
import { MarkdownLegalPage } from "@/components/legal/markdown-legal-page";

export const metadata = legalMetadata(
  "Cookies Policy",
  "How Void-Agent uses cookies and similar technologies.",
  "/cookies-policy",
);

const POLICY_PATH = path.join(
  process.cwd(),
  "legal-consent",
  "cognix-cookies-policy.md",
);

export default function CookiesPolicyPage() {
  return (
    <MarkdownLegalPage
      filePath={POLICY_PATH}
      title="Cookies Policy"
      description="How Void-Agent uses cookies, local storage, and similar technologies to run and improve our services."
      version="v2.0"
      effective="2026-03-05"
    />
  );
}
