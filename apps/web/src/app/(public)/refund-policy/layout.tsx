import { Metadata } from "next";

// No hardcoded domain fallback: og:url is only emitted when the deployment
// sets NEXT_PUBLIC_SITE_URL, so no stale brand domain leaks into the head.
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;

export const metadata: Metadata = {
  title: "Refund Policy - Void-Agent",
  description:
    "Read the Refund Policy for Void-Agent. Understand our refund process and eligibility criteria for subscription plans.",
  alternates: {
    canonical: "/refund-policy",
  },
  openGraph: {
    title: "Refund Policy - Void-Agent",
    description: "Read the Refund Policy for Void-Agent.",
    ...(siteUrl ? { url: `${siteUrl}/refund-policy` } : {}),
    type: "website",
  },
};

export default function RefundPolicyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
