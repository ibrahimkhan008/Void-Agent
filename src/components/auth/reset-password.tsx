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
import {
  passwordRegexPattern,
  passwordRequirementsText,
  passwordSchema,
} from "lib/validations/password";
import { Loader } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

export default function ResetPassword() {
  const t = useTranslations("Auth.ResetPassword");
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const invalidToken = !token || Boolean(searchParams.get("error"));
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!token) return;
    const parsed = passwordSchema.safeParse(password);
    if (!parsed.success) {
      toast.error(parsed.error.issues.map((issue) => issue.message).join("\n"));
      return;
    }
    if (password !== confirmation) {
      toast.error(t("passwordMismatch"));
      return;
    }
    setLoading(true);
    try {
      const result = await authClient.resetPassword({
        newPassword: password,
        token,
      });
      if (result.error) {
        toast.error(result.error.message || t("failed"));
        return;
      }
      router.replace("/sign-in");
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
            {invalidToken ? t("invalidTokenDescription") : t("description")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {invalidToken ? (
            <div className="my-4 text-center text-sm">
              <Link
                href="/forgot-password"
                className="text-primary hover:underline"
              >
                {t("requestNewLink")}
              </Link>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="grid gap-2">
                <Label htmlFor="new-password">{t("newPassword")}</Label>
                <Input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  maxLength={20}
                  pattern={passwordRegexPattern}
                  title={passwordRequirementsText}
                  disabled={loading}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="confirm-password">{t("confirmPassword")}</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  maxLength={20}
                  pattern={passwordRegexPattern}
                  title={passwordRequirementsText}
                  disabled={loading}
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void submit();
                  }}
                />
              </div>
              <Button
                type="button"
                className="w-full"
                disabled={loading || invalidToken}
                onClick={() => void submit()}
              >
                {loading ? (
                  <Loader className="size-4 animate-spin" />
                ) : (
                  t("submit")
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
