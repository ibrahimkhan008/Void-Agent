import { Metadata } from "next";

// No hardcoded domain fallback: og:url is only emitted when the deployment
// sets NEXT_PUBLIC_SITE_URL, so no stale brand domain leaks into the head.
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;

export const metadata: Metadata = {
  title: "Terms of Service - Void Agent",
  description:
    "Read the Terms of Service for Void Agent. Understand your rights and responsibilities when using our AI chat platform.",
  alternates: {
    canonical: "/terms-of-service",
  },
  openGraph: {
    title: "Terms of Service - Void Agent",
    description: "Read the Terms of Service for Void Agent.",
    ...(siteUrl ? { url: `${siteUrl}/terms-of-service` } : {}),
    type: "website",
  },
};

export default function TermsOfServiceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
