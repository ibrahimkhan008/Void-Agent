"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "auth/client";
import { Loader } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

export default function ForgotPassword() {
  const t = useTranslations("Auth.ForgotPassword");
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    try {
      const result = await authClient.requestPasswordReset({
        email: email.trim(),
        redirectTo: "/reset-password",
      });
      if (result.error) {
        toast.error(result.error.message || t("failed"));
        return;
      }
      // Same confirmation for registered and unknown email addresses.
      setSubmitted(true);
    } catch {
      toast.error(t("failed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-full w-full flex-col justify-center p-4 md:p-8">
      <Card className="mx-auto w-full border-none bg-background shadow-none md:max-w-md">
        <CardHeader className="my-4">
          <CardTitle className="my-1 text-center text-2xl">
            {t("title")}
          </CardTitle>
          <CardDescription className="text-center text-muted-foreground">
            {submitted ? t("checkEmailDescription") : t("description")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {submitted ? (
            <p className="text-center text-sm text-muted-foreground">
              {t("checkEmailBody", { email })}
            </p>
          ) : (
            <form onSubmit={submit} className="flex flex-col gap-4">
              <div className="grid gap-2">
                <Label htmlFor="reset-email">{t("email")}</Label>
                <Input
                  id="reset-email"
                  autoComplete="email"
                  autoFocus
                  type="email"
                  required
                  maxLength={320}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  disabled={loading}
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <Loader className="size-4 animate-spin" />
                ) : (
                  t("send")
                )}
              </Button>
            </form>
          )}
          <div className="my-8 text-center text-sm">
            <Link href="/sign-in" className="text-primary hover:underline">
              {t("backToSignIn")}
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
