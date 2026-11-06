/** Keep post-auth navigation inside this app, retaining the original dashboard default. */
export function authDestination(
  value: string | string[] | undefined | null,
): string {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (
    !candidate ||
    !candidate.startsWith("/") ||
    candidate.startsWith("//") ||
    /[\\\x00-\x20\x7f]/.test(candidate)
  )
    return "/dashboard";
  try {
    const url = new URL(candidate, "https://void-agent.invalid");
    if (
      url.origin !== "https://void-agent.invalid" ||
      /^\/(sign-in|sign-up|api\/auth)(\/|$)/.test(url.pathname)
    )
      return "/dashboard";
    return url.pathname + url.search + url.hash;
  } catch {
    return "/dashboard";
  }
}

export function authLink(
  path: "/sign-in" | "/sign-up",
  destination: string,
): string {
  return `${path}?callbackUrl=${encodeURIComponent(authDestination(destination))}`;
}
