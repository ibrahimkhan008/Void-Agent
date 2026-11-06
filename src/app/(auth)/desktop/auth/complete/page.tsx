import { DesktopHandoff, DesktopHandoffInvalid } from "@/components/auth/desktop-handoff";
import { auth, getSession } from "auth/server";
import { buildDesktopCallbackUrl, isValidDesktopState } from "lib/auth/desktop-handoff";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

export default async function DesktopAuthCompletePage({ searchParams }: { searchParams: Promise<{ state?: string | string[] }> }) {
  const { state } = await searchParams;
  if (!isValidDesktopState(state)) return <DesktopHandoffInvalid />;
  if (!await getSession()) return <DesktopHandoffInvalid />;

  try {
    const result = await auth.api.generateOneTimeToken({ headers: await headers() });
    return <DesktopHandoff deepLink={buildDesktopCallbackUrl({ token: result.token, state })} />;
  } catch {
    return <DesktopHandoffInvalid />;
  }
}
