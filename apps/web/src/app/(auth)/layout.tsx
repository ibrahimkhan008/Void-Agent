import { AuthIntroDecoration } from "@/components/auth/auth-intro-decoration";
import { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Image from "next/image";
import { FlipWords } from "ui/flip-words";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export default async function AuthLayout({
  children,
}: { children: React.ReactNode }) {
  const t = await getTranslations("Auth.Intro");
  return (
    <main className="relative w-full flex flex-col h-screen">
      <div className="flex-1">
        <div className="flex min-h-screen w-full">
          <div className="hidden lg:flex lg:w-1/2 bg-muted border-r flex-col p-18 relative">
            <h1 className="text-xl font-semibold flex items-center gap-3 animate-in fade-in duration-300 motion-reduce:animate-none">
              <Image
                src="/flare-logo-192.webp"
                alt="Void-Agent logo"
                width={24}
                height={24}
                className="object-contain"
              />

              <span>Void-Agent</span>
            </h1>
            <AuthIntroDecoration />
            {/* The intro phrase is the panel's headline: full-contrast,
                display-scale, anchored to the bottom edge under the
                centered decoration. */}
            <div className="mb-6 pr-8">
              <FlipWords
                words={[t("description")]}
                className="text-2xl xl:text-3xl font-medium tracking-tight leading-[1.2] text-foreground"
              />
            </div>
          </div>

          <div className="w-full lg:w-1/2 p-6">{children}</div>
        </div>
      </div>
    </main>
  );
}
