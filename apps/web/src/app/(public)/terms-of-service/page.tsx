import path from "node:path";
import { legalMetadata } from "@/components/legal/legal-page";
import { MarkdownLegalPage } from "@/components/legal/markdown-legal-page";

export const metadata = legalMetadata(
  "Terms of Service",
  "The agreement between you and Void-Agent for using our platform and services.",
  "/terms-of-service",
);

const POLICY_PATH = path.join(
  process.cwd(),
  "legal-consent",
  "cognix-terms-of-service.md",
);

export default function TermsOfServicePage() {
  return (
    <MarkdownLegalPage
      filePath={POLICY_PATH}
      title="Terms of Service"
      description="The agreement between you and Void-Agent for using our platform, products, and services."
      version="v3.0"
      effective="2026-11-12"
    />
  );
}
