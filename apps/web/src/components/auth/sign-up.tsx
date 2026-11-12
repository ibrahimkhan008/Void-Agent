"use client";

import { BrandButtonLink } from "@/components/ui/brand-button";
import { useDesktopBrowserSignIn } from "@/hooks/use-desktop-browser-sign-in";
import { analytics } from "@/lib/analytics/posthog";
import { callbackUrlQuery } from "@/lib/auth/callback-url";
import { SocialAuthenticationProvider } from "app-types/authentication";
import { authClient } from "auth/client";
import { Mail } from "lucide-react";
import { useTranslations } from "next-intl";
import { startTransition } from "react";
import { toast } from "sonner";
import { DesktopSignInPending } from "./desktop-sign-in-pending";
import SocialProviders from "./social-providers";

export default function SignUpPage({
  emailAndPasswordEnabled,
  socialAuthenticationProviders,
  isFirstUser,
  callbackUrl,
}: {
  emailAndPasswordEnabled: boolean;
  socialAuthenticationProviders: SocialAuthenticationProvider[];
  isFirstUser: boolean;
  callbackUrl?: string;
}) {
  const t = useTranslations();
  // Inside the desktop app a provider sign-up has to run in the system
  // browser; providers refuse OAuth in embedded web views.
  const desktop = useDesktopBrowserSignIn({ page: "sign-up", callbackUrl });
  const handleSocialSignIn = (provider: SocialAuthenticationProvider) => {
    if (desktop.available) {
      void desktop.start(provider);
      return;
    }
    startTransition(async () => {
      try {
        const res = await authClient.signIn.social(
          { provider, callbackURL: callbackUrl || "/" },
          {
            onSuccess(ctx) {
              // Track successful social sign-up
              if (ctx.data?.user?.id) {
                analytics.identify(ctx.data.user.id, {
                  email: ctx.data.user.email,
                  name: ctx.data.user.name,
                });
                analytics.userSignedUp({
                  method: provider,
                  userId: ctx.data.user.id,
                  email: ctx.data.user.email,
                  isFirstUser,
                });
              }
            },
          },
        );
        // better-auth resolves with { data, error } instead of rejecting on
        // HTTP errors (e.g. 403 INVALID_ORIGIN) — surface it or the click
        // appears to do nothing.
        if (res?.error) {
          toast.error(res.error.message || "Sign-up failed. Please try again.");
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Unknown error");
      }
    });
  };
  if (desktop.pending) {
    return (
      <DesktopSignInPending
        onReopen={desktop.reopen}
        onCancel={desktop.cancel}
      />
    );
  }
  return (
    // Cognix §4.15: no card chrome — grouping by space, not boxes.
    // The (auth) layout already provides the brand-surface backdrop.
    <div className="w-full md:max-w-sm mx-auto flex flex-col items-start gap-1 text-left">
      <h1 className="text-2xl font-normal tracking-[-0.03em] text-balance">
        {isFirstUser ? t("Auth.SignUp.titleAdmin") : t("Auth.SignUp.title")}
      </h1>
      <p className="text-sm text-(--bs-paper)/60">
        {isFirstUser
          ? t("Auth.SignUp.signUpDescriptionAdmin")
          : t("Auth.SignUp.signUpDescription")}
      </p>
      <div className="mt-8 flex flex-col gap-4 w-full">
        {emailAndPasswordEnabled && (
          <BrandButtonLink
            variant="default"
            size="lg"
            href={`/sign-up/email${callbackUrlQuery(callbackUrl)}`}
            data-testid="email-signup-button"
            className="w-full"
          >
            <Mail className="size-4" />
            {t("Auth.SignUp.email")}
          </BrandButtonLink>
        )}
        {socialAuthenticationProviders.length > 0 && (
          <>
            {emailAndPasswordEnabled && (
              <div className="flex items-center">
                <div className="flex-1 h-px bg-(--bs-paper)/10"></div>
                <span className="px-4 text-[11px] font-mono uppercase tracking-[0.14em] text-(--bs-paper)/45">
                  {t("Auth.SignIn.orContinueWith")}
                </span>
                <div className="flex-1 h-px bg-(--bs-paper)/10"></div>
              </div>
            )}
            <SocialProviders
              socialAuthenticationProviders={socialAuthenticationProviders}
              onSocialProviderClick={handleSocialSignIn}
            />
          </>
        )}
      </div>
    </div>
  );
}
