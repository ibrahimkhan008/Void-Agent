import { authDestination, authLink } from "@/lib/auth/callback-url";
import SignUpPage from "@/components/auth/sign-up";
import { getAuthConfig } from "lib/auth/config";
import { getIsFirstUser } from "lib/auth/server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function SignUp({
  searchParams,
}: { searchParams: Promise<{ callbackUrl?: string | string[] }> }) {
  const callbackUrl = authDestination((await searchParams).callbackUrl);
  const isFirstUser = await getIsFirstUser();
  const { socialAuthenticationProviders, signUpEnabled } = getAuthConfig();

  if (!signUpEnabled) {
    redirect(authLink("/sign-in", callbackUrl));
  }
  const enabledProviders = (
    Object.keys(
      socialAuthenticationProviders,
    ) as (keyof typeof socialAuthenticationProviders)[]
  ).filter((key) => socialAuthenticationProviders[key]);
  return (
    <SignUpPage
      isFirstUser={isFirstUser}
      socialAuthenticationProviders={enabledProviders}
      callbackUrl={callbackUrl}
    />
  );
}
