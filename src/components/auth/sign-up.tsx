"use client";
import { authDestination, authLink } from "@/lib/auth/callback-url";

import { TurnstileWidget } from "@/components/auth/turnstile-widget";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SocialAuthenticationProvider } from "app-types/authentication";
import { authClient } from "auth/client";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { startTransition } from "react";
import { toast } from "sonner";
import SocialProviders from "./social-providers";

export default function SignUpPage({
  socialAuthenticationProviders,
  callbackUrl,
  isFirstUser,
}: {
  socialAuthenticationProviders: SocialAuthenticationProvider[];
  callbackUrl?: string;
  isFirstUser: boolean;
}) {
  const t = useTranslations();
  const router = useRouter();
  const redirectTo = authDestination(callbackUrl);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileExpired, setTurnstileExpired] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const provider = params.get("desktopProvider");
    if (provider === "google" || provider === "github" || provider === "microsoft") {
      void authClient.signIn.social({ provider, callbackURL: authDestination(params.get("callbackUrl")) });
    }
  }, []);

  const handleEmailSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !password) {
      toast.error("Please fill in all fields");
      return;
    }
    // Site key configured → require a fresh token. If the token
    // expired mid-form-fill, the widget will auto-refresh but if the
    // user is racing the submit button we block and ask for a moment.
    if (
      process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY &&
      (!turnstileToken || turnstileExpired)
    ) {
      toast.error("Please complete the security check below.");
      return;
    }
    setLoading(true);
    startTransition(async () => {
      try {
        const { error } = await authClient.signUp.email({
          email,
          password,
          name: name.trim(),
        });
        if (error) {
          toast.error(error.message || String(error));
          setLoading(false);
          return;
        }
        toast.success("Account created! Redirecting...");
        router.push(redirectTo);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to sign up");
        setLoading(false);
      }
    });
  };

  const handleSocialSignIn = (provider: SocialAuthenticationProvider) => {
    if (window.desktop?.auth) {
      void window.desktop.auth.startBrowserSignIn({ page: "sign-up", provider, callbackUrl: redirectTo })
        .catch((e: unknown) => toast.error(e instanceof Error ? e.message : "Could not open browser sign-in"));
      return;
    }
    // Keep the requested in-app destination; default to the original dashboard.
    startTransition(async () => {
      try {
        await authClient.signIn.social({
          provider,
          callbackURL: redirectTo,
        });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Unknown error");
      }
    });
  };

  return (
    <Card className="w-full md:max-w-md bg-background border-none mx-auto shadow-none">
      <CardHeader>
        <CardTitle className="text-2xl text-center ">
          {isFirstUser ? t("Auth.SignUp.titleAdmin") : t("Auth.SignUp.title")}
        </CardTitle>
        <CardDescription className="text-center">
          {isFirstUser
            ? t("Auth.SignUp.signUpDescriptionAdmin")
            : t("Auth.SignUp.signUpDescription")}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <form onSubmit={handleEmailSignUp} className="flex flex-col gap-3">
          <Input
            type="text"
            placeholder="Full name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoComplete="name"
          />
          <Input
            type="email"
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
          <div className="relative">
            <Input
              type={showPassword ? "text" : "password"}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
              className="pr-12"
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              className="absolute right-2 top-1/2 -translate-y-1/2 h-7 px-2 text-xs text-muted-foreground hover:text-foreground transition-colors rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
          <TurnstileWidget
            mode="explicit"
            action="signup"
            onVerify={(token) => {
              setTurnstileToken(token);
              setTurnstileExpired(false);
            }}
            onExpire={() => {
              setTurnstileExpired(true);
              setTurnstileToken(null);
            }}
            onError={() => {
              setTurnstileToken(null);
              setTurnstileExpired(true);
            }}
          />
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Creating account..." : "Create Account"}
          </Button>
        </form>

        {socialAuthenticationProviders.length > 0 && (
          <>
            <div className="flex items-center gap-2 my-4">
              <div className="flex-1 h-px bg-border" />
              <span className="text-xs text-muted-foreground">
                or continue with
              </span>
              <div className="flex-1 h-px bg-border" />
            </div>

            <SocialProviders
              socialAuthenticationProviders={socialAuthenticationProviders}
              onSocialProviderClick={handleSocialSignIn}
            />
          </>
        )}
        <div className="my-8 text-center text-sm text-muted-foreground">
          {t("Auth.SignUp.haveAccount")}{" "}
          <Link
            href={authLink("/sign-in", redirectTo)}
            className="underline-offset-4 text-primary"
          >
            {t("Auth.SignUp.signIn")}
          </Link>
        </div>
        <div className="mt-2 text-center text-xs text-muted-foreground">
          By continuing, you agree to our
          <Link
            href="/terms-of-service"
            className="ml-1 underline-offset-4 text-primary"
          >
            Terms of Service
          </Link>{" "}
          and
          <Link
            href="/privacy-policy"
            className="underline-offset-4 text-primary"
          >
            Privacy Policy
          </Link>
          .
        </div>
      </CardContent>
    </Card>
  );
}
