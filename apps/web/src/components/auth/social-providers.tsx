import { SocialAuthenticationProvider } from "app-types/authentication";
import { cn } from "lib/utils";
import { GithubIcon } from "ui/github-icon";
import { GoogleIcon } from "ui/google-icon";
import { MicrosoftIcon } from "ui/microsoft-icon";
import { BrandButton } from "../ui/brand-button";

// Cognix §4.15: provider buttons are outline, h-9, in a 3-col grid on
// sm+, with the dotted green glow revealing from bottom-left on hover.
export default function SocialProviders({
  socialAuthenticationProviders,
  onSocialProviderClick,
  className,
  disabled = false,
}: {
  socialAuthenticationProviders: SocialAuthenticationProvider[];
  onSocialProviderClick: (provider: SocialAuthenticationProvider) => void;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <div className={cn("grid gap-2 w-full sm:grid-cols-3", className)}>
      {socialAuthenticationProviders.includes("google") && (
        <BrandButton
          variant="outline"
          size="md"
          onClick={() => onSocialProviderClick("google")}
          className="h-9 text-[13px]"
          data-testid="google-signup-button"
          disabled={disabled}
          aria-label="Continue with Google"
        >
          <GoogleIcon className="size-4 fill-current" />
          Google
        </BrandButton>
      )}
      {socialAuthenticationProviders.includes("github") && (
        <BrandButton
          variant="outline"
          size="md"
          onClick={() => onSocialProviderClick("github")}
          className="h-9 text-[13px]"
          data-testid="github-signup-button"
          disabled={disabled}
          aria-label="Continue with GitHub"
        >
          <GithubIcon className="size-4 fill-current" />
          GitHub
        </BrandButton>
      )}
      {socialAuthenticationProviders.includes("microsoft") && (
        <BrandButton
          variant="outline"
          size="md"
          onClick={() => onSocialProviderClick("microsoft")}
          className="h-9 text-[13px]"
          data-testid="microsoft-signup-button"
          disabled={disabled}
          aria-label="Continue with Microsoft"
        >
          <MicrosoftIcon className="size-4 fill-current" />
          Microsoft
        </BrandButton>
      )}
    </div>
  );
}
