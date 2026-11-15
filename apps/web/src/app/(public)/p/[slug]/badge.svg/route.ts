import { publishedPageRepository } from "lib/db/repository";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /p/[slug]/badge.svg — the Void Deploy attribution badge (§3.9).
 *
 * A public, embeddable SVG the page's owner can put on any external site:
 * a status dot (green = live, gray = offline) + "Built with Void Agent".
 * Served only while the owner keeps badge visibility ON for the slug (they
 * control it from the Deploy dashboard). Short cache so status flips
 * propagate quickly without hammering the origin.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/i.test(slug)) {
    return new NextResponse("Invalid slug", { status: 400 });
  }

  const visible = await publishedPageRepository.isBadgeVisibleBySlug(slug);
  if (!visible) {
    return new NextResponse("Badge disabled by the page owner", {
      status: 404,
    });
  }

  // Visibility off covers the never-existed case too (no rows → false), so
  // a broken embed 404s through the same gate.
  const page = await publishedPageRepository.selectLiveBySlug(slug);
  const live = Boolean(page);
  const dot = live ? "#22c55e" : "#9ca3af";
  const statusText = live ? "Live" : "Offline";
  const label = "Built with Void Agent";

  // Rough width: the label dominates; keep the pill generous.
  const width = 208;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="28" viewBox="0 0 ${width} 28" role="img" aria-label="${label} — ${statusText}">
  <title>${label} — ${statusText}</title>
  <rect width="${width}" height="28" rx="6" fill="#09090b"/>
  <circle cx="16" cy="14" r="4" fill="${dot}"/>
  <text x="28" y="18" font-family="ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif" font-size="11" fill="#fafafa">${label}</text>
  <text x="${width - 62}" y="18" font-family="ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif" font-size="10" fill="${dot}">${statusText}</text>
</svg>`;

  return new NextResponse(svg, {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=60, s-maxage=60",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
