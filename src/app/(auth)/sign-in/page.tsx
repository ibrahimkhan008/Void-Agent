import SignIn from "@/components/auth/sign-in";
import { authDestination } from "@/lib/auth/callback-url";
import { getAuthConfig } from "lib/auth/config";

export default async function SignInPage({
  searchParams,
}: { searchParams: Promise<{ callbackUrl?: string | string[] }> }) {
  const callbackUrl = authDestination((await searchParams).callbackUrl);
  const {
    signUpEnabled,
    emailAndPasswordEnabled,
    socialAuthenticationProviders,
  } = getAuthConfig();
  const enabledProviders = (
    Object.keys(
      socialAuthenticationProviders,
    ) as (keyof typeof socialAuthenticationProviders)[]
  ).filter((key) => socialAuthenticationProviders[key]);
  return (
    <SignIn
      signUpEnabled={signUpEnabled}
      emailAndPasswordEnabled={emailAndPasswordEnabled}
      socialAuthenticationProviders={enabledProviders}
      callbackUrl={callbackUrl}
    />
  );
}
