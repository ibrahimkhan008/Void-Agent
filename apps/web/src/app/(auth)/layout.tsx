import { AuthIntroDecoration } from "@/components/auth/auth-intro-decoration";
import { AccentSpan } from "@/components/ui/accent-span";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Reveal } from "@/components/ui/reveal";
import { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Image from "next/image";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

// Auth shell in the Cognix design language (per the cognix spec §4.15):
// full-screen brand surface (warm light ground, deep green accents),
// left intro panel with logo + decoration + display-scale headline,
// right panel carries the auth card.
export default async function AuthLayout({
  children,
}: { children: React.ReactNode }) {
  const t = await getTranslations("Auth.Intro");
  return (
    <div className="brand-surface min-h-dvh w-full">
      <div className="flex min-h-dvh w-full">
        <div className="hidden lg:flex lg:w-1/2 flex-col p-18 relative">
          <Reveal delay={0} rise={0} duration={0.3} className="landing-drop">
            <div className="flex items-center gap-3">
              <Image
                src="/logo-192.webp"
                alt="Void-Agent logo"
                width={24}
                height={24}
                className="object-contain"
              />
              <span className="text-xl font-semibold">Void-Agent</span>
            </div>
          </Reveal>
          <AuthIntroDecoration />
          {/* Display-scale headline with the serif accent word, bottom
              anchored under the decoration (Cognix §3.4 typography). */}
          <Reveal delay={0.05} rise={12} className="mb-6 pr-8 max-w-[480px]">
            <Eyebrow className="mb-4">{t("title")}</Eyebrow>
            <h1 className="text-3xl xl:text-4xl font-normal tracking-[-0.03em] leading-[1.15] text-balance">
              {t("line1")} <AccentSpan>{t("line2")}</AccentSpan>
            </h1>
          </Reveal>
        </div>

        <div className="w-full lg:w-1/2 flex items-center justify-center p-6">
          {children}
        </div>
      </div>
    </div>
  );
}
