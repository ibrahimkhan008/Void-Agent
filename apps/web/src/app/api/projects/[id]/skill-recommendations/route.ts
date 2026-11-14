import { pgDb } from "@/lib/db/pg/db.pg";
import { ProjectTable } from "@/lib/db/pg/schema.pg";
import { detectSkillDomains } from "@/lib/skills/recommendations";
import {
  requireProjectAccess,
  toProjectErrorResponse,
} from "@/lib/projects/access";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

const SEARCH_API_BASE = process.env.SKILLS_API_URL || "https://skills.sh";

/**
 * Project-aware skill recommendations (master prompt §3.12): detects what the
 * project touches from its name/goal/description and returns matching
 * skills.sh searches with a few live results each, ready to install.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: projectId } = await params;
    const { actor } = await requireProjectAccess({ projectId });

    const [project] = await pgDb
      .select({
        name: ProjectTable.name,
        goal: ProjectTable.goal,
        description: ProjectTable.description,
      })
      .from(ProjectTable)
      .where(
        and(
          eq(ProjectTable.id, projectId),
          eq(ProjectTable.organizationId, actor.organizationId),
        ),
      )
      .limit(1);

    if (!project) {
      return NextResponse.json(
        { error: "Project not found." },
        { status: 404 },
      );
    }

    const haystack = [
      project.name,
      project.goal ?? "",
      project.description ?? "",
    ]
      .join(" ")
      .slice(0, 4000);
    const recommendations = detectSkillDomains(haystack);

    // Fetch a few live registry results per recommendation (skills.sh proxy),
    // best-effort — an unreachable registry still returns the queries.
    const withResults = await Promise.all(
      recommendations.slice(0, 6).map(async (rec) => {
        try {
          const params = new URLSearchParams({
            q: rec.queries[0],
            limit: "4",
          });
          const res = await fetch(`${SEARCH_API_BASE}/api/search?${params}`, {
            headers: { Accept: "application/json" },
            signal: AbortSignal.timeout(8000),
          });
          if (!res.ok) return { ...rec, skills: [], unreachable: true };
          const data = (await res.json()) as { skills?: unknown[] };
          return { ...rec, skills: data.skills ?? [], unreachable: false };
        } catch {
          return { ...rec, skills: [], unreachable: true };
        }
      }),
    );

    return NextResponse.json({ recommendations: withResults });
  } catch (err) {
    return toProjectErrorResponse(err);
  }
}
