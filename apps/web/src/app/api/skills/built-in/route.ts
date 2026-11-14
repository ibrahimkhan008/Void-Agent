import { getBuiltInSkill, listBuiltInSkills } from "@/lib/skills/built-in";
import { withAuth } from "auth/route-guard";

/**
 * GET /api/skills/built-in          — the system default skills catalog
 * GET /api/skills/built-in?category=motion&slug=60fps-animation
 *                                   — one skill, with its SKILL.md content
 *
 * Built-in skills ship with the product (apps/web/skills/, see the README
 * there) and install offline: the client copies the returned content into
 * the workspace skill library through POST /api/skills with `content`.
 */
export const GET = withAuth(async (request) => {
  const url = new URL(request.url);
  const category = url.searchParams.get("category");
  const slug = url.searchParams.get("slug");

  if (category && slug) {
    const skill = getBuiltInSkill(category, slug);
    if (!skill) {
      return Response.json(
        { error: "Built-in skill not found" },
        { status: 404 },
      );
    }
    return Response.json({ skill });
  }

  return Response.json({ skills: listBuiltInSkills() });
});
