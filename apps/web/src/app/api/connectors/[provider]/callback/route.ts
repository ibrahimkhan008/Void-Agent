import { consumeConnectorOAuthState } from "lib/connectors/oauth-state";
import { finishConnectorOAuth } from "lib/connectors/oauth-flow";
import { isConnectorProvider } from "lib/connectors/providers-list";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider: rawProvider } = await params;
  if (!isConnectorProvider(rawProvider)) return oauthPage("error", "unknown");

  const query = new URL(request.url).searchParams;
  const state = query.get("state") ?? "";
  const providerError = query.get("error");
  const code = query.get("code") ?? "";
  if (!state || state.length > 96) return oauthPage("error", rawProvider);

  if (providerError) {
    await consumeConnectorOAuthState(state).catch(() => null);
    return oauthPage("error", rawProvider);
  }
  if (!code || code.length > 4096) return oauthPage("error", rawProvider);

  const result = await finishConnectorOAuth(rawProvider, code, state);
  return oauthPage(result.ok ? "success" : "error", rawProvider);
}

function oauthPage(status: "success" | "error", provider: string) {
  const safeProvider = JSON.stringify(provider);
  const messageType =
    status === "success" ? "CONNECTOR_OAUTH_SUCCESS" : "CONNECTOR_OAUTH_ERROR";
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Connector authorization</title></head><body><p>${status === "success" ? "Connector connected. You may close this window." : "Connector authorization failed. You may close this window and try again."}</p><script>
    try { window.opener?.postMessage({ type: ${JSON.stringify(messageType)}, provider: ${safeProvider}${status === "success" ? ", success: true" : ", error: 'Authorization failed'"} }, window.location.origin); } catch {}
    setTimeout(() => window.close(), 300);
  </script></body></html>`;
  return new NextResponse(html, {
    status: status === "success" ? 200 : 400,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Content-Security-Policy":
        "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    },
  });
}
