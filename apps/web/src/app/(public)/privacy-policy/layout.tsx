import { Metadata } from "next";

// No hardcoded domain fallback: og:url is only emitted when the deployment
// sets NEXT_PUBLIC_SITE_URL, so no stale brand domain leaks into the head.
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;

export const metadata: Metadata = {
  title: "Privacy Policy - Void-Agent",
  description:
    "Learn how Void-Agent protects your privacy and handles your data. Our privacy policy explains what information we collect and how we use it.",
  alternates: {
    canonical: "/privacy-policy",
  },
  openGraph: {
    title: "Privacy Policy - Void-Agent",
    description:
      "Learn how Void-Agent protects your privacy and handles your data.",
    ...(siteUrl ? { url: `${siteUrl}/privacy-policy` } : {}),
    type: "website",
  },
};

export default function PrivacyPolicyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
