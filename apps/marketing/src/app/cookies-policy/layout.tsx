import { Metadata } from "next";

// No hardcoded domain fallback: og:url is only emitted when the deployment
// sets NEXT_PUBLIC_SITE_URL, so no stale brand domain leaks into the head.
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;

export const metadata: Metadata = {
  title: "Cookies Policy - Void-Agent",
  description:
    "Learn about cookies used by Void-Agent. Our cookies policy explains what cookies we use and how they improve your experience.",
  alternates: {
    canonical: "/cookies-policy",
  },
  openGraph: {
    title: "Cookies Policy - Void-Agent",
    description: "Learn about cookies used by Void-Agent.",
    ...(siteUrl ? { url: `${siteUrl}/cookies-policy` } : {}),
    type: "website",
  },
};

export default function CookiesPolicyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
