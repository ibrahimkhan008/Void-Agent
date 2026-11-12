import path from "node:path";
import { legalMetadata } from "@/components/legal/legal-page";
import { MarkdownLegalPage } from "@/components/legal/markdown-legal-page";

export const metadata = legalMetadata(
  "Privacy Policy",
  "How Void-Agent collects, uses, stores, protects, and shares your information.",
  "/privacy-policy",
);

const POLICY_PATH = path.join(
  process.cwd(),
  "legal-consent",
  "cognix-privacy-policy.md",
);

export default function PrivacyPolicyPage() {
  return (
    <MarkdownLegalPage
      filePath={POLICY_PATH}
      eyebrow="Legal"
      title="Privacy"
      accentTitle="Policy"
      description="How Void-Agent collects, uses, stores, protects, and shares your information across our platform, products, and services."
      version="v2.0"
      effective="2026-03-05"
      siblings={[
        { label: "Terms", href: "/terms-of-service" },
        { label: "Privacy", href: "/privacy-policy" },
        { label: "Cookies", href: "/cookies-policy" },
        { label: "Refunds", href: "/refund-policy" },
        { label: "Grievance", href: "/grievance-redressal" },
      ]}
      activeSibling={1}
    />
  );
}
