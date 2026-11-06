import { publishedPageRepository } from "lib/db/repository";
import { isValidPageSlug } from "lib/published-page/slug-validation";

export const dynamic = "force-dynamic";

const pageHeaders = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  // CSP sandbox gives the page an opaque origin. Only inline scripts/styles
  // and remote images/fonts required for static page display are permitted;
  // forms, popups, top navigation, fetch/XHR, frames and plugins stay blocked.
  "Content-Security-Policy":
    "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src https: data:; font-src https: data:; media-src https: data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; sandbox allow-scripts",
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  if (!isValidPageSlug(slug))
    return new Response("Not found", { status: 404, headers: pageHeaders });
  try {
    const page = await publishedPageRepository.selectLiveBySlug(slug);
    if (!page)
      return new Response("Not found", { status: 404, headers: pageHeaders });
    return new Response(page.html, { status: 200, headers: pageHeaders });
  } catch {
    return new Response("Page unavailable", {
      status: 503,
      headers: pageHeaders,
    });
  }
}
