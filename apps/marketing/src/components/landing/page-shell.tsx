import { Footer } from "@/components/landing/footer";
import { SiteHeader } from "@/components/landing/site-header";

/**
 * Shared dark page shell for the marketing site (the landing keeps its own
 * in-hero composition). Wraps content in the .kestrel token scope so every
 * token class resolves to the dark system, with the fixed site header on top
 * and the landing footer below.
 */
export function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="kestrel min-h-dvh w-full overflow-x-clip">
      <SiteHeader />
      <main>{children}</main>
      <Footer />
    </div>
  );
}
