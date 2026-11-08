import { AppHeader } from "@/components/layouts/app-header";
import { AppSidebar } from "@/components/layouts/app-sidebar";
import { cookies } from "next/headers";
import { SidebarProvider } from "ui/sidebar";

import { CanvasPanelWrapper } from "@/components/canvas/canvas-panel-wrapper";
import { AppPopupProvider } from "@/components/layouts/app-popup-provider";
import { OnboardingCookieSync } from "@/components/onboarding/onboarding-cookie-sync";
import { WarningBanner } from "@/components/warning-banner";
import { getSession } from "lib/auth/server";
import { COOKIE_KEY_SIDEBAR_STATE } from "lib/const";
import { userRepository } from "lib/db/repository";
import { resolveOnboardingGate } from "lib/onboarding/gate";
import { SWRConfigProvider } from "./swr-config";

import { redirect } from "next/navigation";
export const experimental_ppr = true;

export default async function ChatLayout({
  children,
}: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const session = await getSession();
  if (!session) {
    redirect("/sign-in");
  }

  let syncOnboardingCookie = false;
  if (cookieStore.get("onboarding_complete")?.value !== "1") {
    const preferences = await userRepository.getPreferences(session.user.id);
    const gate = resolveOnboardingGate({
      hasCompletionCookie: false,
      step: preferences?.onboarding?.step,
    });
    if (gate === "redirect") redirect("/onboarding");
    syncOnboardingCookie = gate === "sync-cookie";
  }

  const dbUser = await userRepository.getUserById(session.user.id);
  const effectiveUser = dbUser ?? session.user;

  const isCollapsed =
    cookieStore.get(COOKIE_KEY_SIDEBAR_STATE)?.value !== "true";
  return (
    <SidebarProvider defaultOpen={!isCollapsed}>
      <SWRConfigProvider user={session.user}>
        <OnboardingCookieSync enabled={syncOnboardingCookie} />
        <AppPopupProvider />
        <AppSidebar user={effectiveUser} />
        <main className="relative bg-background w-full flex flex-col h-screen overflow-hidden">
          <WarningBanner />
          <AppHeader user={effectiveUser} />
          <div className="flex flex-1 min-h-0 overflow-hidden">
            <div className="scrollbar-slim flex-1 min-h-0 overflow-y-auto">
              {children}
            </div>
            <CanvasPanelWrapper />
          </div>
        </main>
      </SWRConfigProvider>
    </SidebarProvider>
  );
}
