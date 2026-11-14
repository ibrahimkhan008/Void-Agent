"use client";

import { BrandButton } from "@/components/ui/brand-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDesktopBrowserSignIn } from "@/hooks/use-desktop-browser-sign-in";
import { useObjectState } from "@/hooks/use-object-state";
import { motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import { useState } from "react";

import { analytics } from "@/lib/analytics/posthog";
import { callbackUrlQuery } from "@/lib/auth/callback-url";
import { SocialAuthenticationProvider } from "app-types/authentication";
import { authClient } from "auth/client";
import { Loader } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { safe } from "ts-safe";
import { GithubIcon } from "ui/github-icon";
import { GoogleIcon } from "ui/google-icon";
import { MicrosoftIcon } from "ui/microsoft-icon";
import { DesktopSignInPending } from "./desktop-sign-in-pending";
import { useCaptcha } from "./use-captcha";

// Strong ease-out: the start of the entrance is the moment the eye is
// tracking. Void Agent auth card §4.15: a white card on a soft tray frame,
// display-scale 400-weight heading, no card chrome.
const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];

const SOCIAL_ICONS: Record<
  SocialAuthenticationProvider,
  { icon: React.ComponentType<{ className?: string }>; label: string }
> = {
  google: { icon: GoogleIcon, label: "Google" },
  github: { icon: GithubIcon, label: "GitHub" },
  microsoft: { icon: MicrosoftIcon, label: "Microsoft" },
};

export default function SignIn({
  emailAndPasswordEnabled,
  signUpEnabled,
  socialAuthenticationProviders,
  isFirstUser,
  callbackUrl,
}: {
  emailAndPasswordEnabled: boolean;
  signUpEnabled: boolean;
  socialAuthenticationProviders: SocialAuthenticationProvider[];
  isFirstUser: boolean;
  callbackUrl?: string;
}) {
  const t = useTranslations("Auth.SignIn");
  const reduceMotion = useReducedMotion();

  const [loading, setLoading] = useState(false);
  const captcha = useCaptcha();
  const redirectTo = callbackUrl || "/";
  // Inside the desktop app a provider sign-in has to run in the system
  // browser; providers refuse OAuth in embedded web views.
  const desktop = useDesktopBrowserSignIn({ page: "sign-in", callbackUrl });

  const [formData, setFormData] = useObjectState({
    email: "",
    password: "",
  });

  const emailAndPasswordSignIn = () => {
    setLoading(true);
    safe(() =>
      authClient.signIn.email(
        {
          email: formData.email,
          password: formData.password,
          callbackURL: redirectTo,
        },
        {
          headers: captcha.headers,
          onSuccess(ctx) {
            // Track successful sign-in
            if (ctx.data?.user?.id) {
              analytics.identify(ctx.data.user.id, {
                email: ctx.data.user.email,
                name: ctx.data.user.name,
              });
              analytics.userSignedIn({
                method: "email",
                userId: ctx.data.user.id,
                email: ctx.data.user.email,
              });
            }
            // Absolute callbacks (the marketing site's post-sign-in return to
            // the pricing page) need a hard navigation — better-auth's email
            // sign-in doesn't auto-navigate to cross-origin callbackURLs.
            if (/^https?:\/\//i.test(redirectTo)) {
              window.location.href = redirectTo;
            }
          },
          onError(ctx) {
            toast.error(ctx.error.message || ctx.error.statusText);
          },
        },
      ),
    )
      .watch(() => {
        setLoading(false);
        // Single-use token: the next attempt needs a fresh one.
        captcha.reset();
      })
      .unwrap();
  };

  const handleSocialSignIn = (provider: SocialAuthenticationProvider) => {
    if (desktop.available) {
      void desktop.start(provider);
      return;
    }
    authClient.signIn
      .social(
        { provider, callbackURL: redirectTo },
        {
          onSuccess(ctx) {
            // Track successful social sign-in
            if (ctx.data?.user?.id) {
              analytics.identify(ctx.data.user.id, {
                email: ctx.data.user.email,
                name: ctx.data.user.name,
              });
              analytics.userSignedIn({
                method: provider,
                userId: ctx.data.user.id,
                email: ctx.data.user.email,
              });
            }
          },
        },
      )
      .then((res) => {
        // better-auth resolves with { data, error } instead of rejecting on
        // HTTP errors (e.g. 403 INVALID_ORIGIN) — surface it or the click
        // appears to do nothing.
        if (res?.error) {
          toast.error(res.error.message || "Sign-in failed. Please try again.");
        }
      })
      .catch((e) => {
        toast.error(e instanceof Error ? e.message : "Sign-in failed");
      });
  };
  if (desktop.pending) {
    return (
      <div className="w-full h-full flex flex-col p-4 md:p-8 justify-center">
        <DesktopSignInPending
          onReopen={desktop.reopen}
          onCancel={desktop.cancel}
        />
      </div>
    );
  }
  return (
    <motion.div
      className="w-full h-full flex flex-col justify-center"
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 12 }}
      animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: EASE_OUT }}
    >
      {/* Design system §4.15 auth card: a single white card on a soft tray frame,
          no card chrome — grouping by space, not by boxes. */}
      <div className="w-full md:max-w-sm mx-auto flex flex-col">
        <motion.div
          className="flex flex-col items-start gap-1 text-left"
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
          animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
          transition={{ delay: 0.05, duration: 0.22, ease: EASE_OUT }}
        >
          <h1 className="text-2xl font-normal tracking-[-0.03em] text-balance">
            {t("title")}
          </h1>
          <p className="text-sm text-(--bs-paper)/60">{t("description")}</p>
        </motion.div>
        {emailAndPasswordEnabled && !isFirstUser && (
          <motion.div
            className="mt-8 flex flex-col gap-5"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1, duration: 0.22, ease: EASE_OUT }}
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="email" className="text-(--bs-paper)/70">
                Email
              </Label>
              <Input
                id="email"
                autoFocus
                disabled={loading}
                value={formData.email}
                onChange={(e) => setFormData({ email: e.target.value })}
                type="email"
                placeholder="user@example.com"
                required
                className="rounded-lg border-(--bs-paper)/10 bg-white text-(--bs-paper) placeholder:text-(--bs-paper)/40"
              />
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex items-center">
                <Label htmlFor="password" className="text-(--bs-paper)/70">
                  Password
                </Label>
                <Link
                  href="/forgot-password"
                  className="ml-auto text-sm underline-offset-4 text-(--bs-paper)/50 hover:text-(--bs-brand) hover:underline"
                >
                  {t("forgotPassword")}
                </Link>
              </div>
              <Input
                id="password"
                disabled={loading}
                value={formData.password}
                placeholder="********"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    emailAndPasswordSignIn();
                  }
                }}
                onChange={(e) => setFormData({ password: e.target.value })}
                type="password"
                required
                className="rounded-lg border-(--bs-paper)/10 bg-white text-(--bs-paper) placeholder:text-(--bs-paper)/40"
              />
            </div>
            {captcha.widget}
            <BrandButton
              variant="default"
              size="lg"
              onClick={emailAndPasswordSignIn}
              disabled={loading || !captcha.ready}
              data-testid="signin-submit-button"
              className="w-full"
            >
              {loading ? (
                <Loader className="size-4 animate-spin ml-1" />
              ) : (
                t("signIn")
              )}
            </BrandButton>
          </motion.div>
        )}
        {socialAuthenticationProviders.length > 0 && (
          <motion.div
            className="mt-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.16, duration: 0.22, ease: EASE_OUT }}
          >
            {emailAndPasswordEnabled && (
              <div className="flex items-center mb-4">
                <div className="flex-1 h-px bg-(--bs-paper)/10"></div>
                <span className="px-4 text-[11px] font-mono uppercase tracking-[0.14em] text-(--bs-paper)/45">
                  {t("orContinueWith")}
                </span>
                <div className="flex-1 h-px bg-(--bs-paper)/10"></div>
              </div>
            )}
            <div className="grid gap-2 w-full sm:grid-cols-3">
              {socialAuthenticationProviders.map((provider) => {
                const { icon: Icon, label } = SOCIAL_ICONS[provider];
                return (
                  <BrandButton
                    key={provider}
                    variant="outline"
                    size="md"
                    onClick={() => handleSocialSignIn(provider)}
                    aria-label={`Sign in with ${label}`}
                    data-testid={`${provider}-signin-button`}
                    className="h-9 text-[13px]"
                  >
                    <Icon className="size-4 fill-current" />
                    {label}
                  </BrandButton>
                );
              })}
            </div>
          </motion.div>
        )}
        {signUpEnabled && (
          <motion.p
            className="mt-8 text-center text-sm text-(--bs-paper)/60"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.22, duration: 0.22, ease: EASE_OUT }}
          >
            {t("noAccount")}
            <Link
              href={`/sign-up${callbackUrlQuery(callbackUrl)}`}
              className="underline-offset-4 text-(--bs-brand) hover:underline"
            >
              {t("signUp")}
            </Link>
          </motion.p>
        )}
      </div>
    </motion.div>
  );
}
