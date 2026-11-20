import type { Metadata } from "next";
import { Geist, Geist_Mono, Instrument_Serif, Inter } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});
// The landing page's UI is built around Inter as its sans face. Published as
// --font-inter; only the landing tokens reference it, other pages unchanged.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});
// Display serif for the brand-surface accent words ("Rights" in "Grievance
// Redressal & Data *Rights*", etc.). Exposed as `--font-accent`.
const instrumentSerif = Instrument_Serif({
  variable: "--font-accent",
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
  display: "swap",
});

// Canonical origin of this site. Defaults to the production domain so a build
// without the env var still emits correct canonical/OG URLs; dev overrides it
// via NEXT_PUBLIC_MARKETING_URL (see .env.example).
const MARKETING_URL = (
  process.env.NEXT_PUBLIC_MARKETING_URL ?? "https://voidagent.space"
).replace(/\/+$/, "");

export const metadata: Metadata = {
  metadataBase: new URL(MARKETING_URL),
  title: "Void Agent",
  description:
    "Void Agent is your AI workspace for conversations, agents, tools, and knowledge.",
  manifest: "/manifest.json",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: "document.documentElement.classList.add('js')",
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${instrumentSerif.variable} ${inter.variable} antialiased`}
      >
        {children}
        <Toaster richColors />
      </body>
    </html>
  );
}
