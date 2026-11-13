import { ProjectDialog } from "@/components/projects/project-dialog";
import { Eyebrow } from "@/components/ui/eyebrow";
import { pgDb } from "@/lib/db/pg/db.pg";
import { ProjectMemberTable, ProjectTable } from "@/lib/db/pg/schema.pg";
import { getSession } from "auth/server";
import { and, desc, eq, or } from "drizzle-orm";
import { FolderOpen, Plus } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function ProjectsPage() {
  const session = await getSession();
  if (!session?.user?.id) redirect("/sign-in");

  const organizationId = (
    session.session as { activeOrganizationId?: string | null }
  ).activeOrganizationId;
  if (!organizationId) redirect("/");

  const projects = await pgDb
    .selectDistinct({ project: ProjectTable })
    .from(ProjectTable)
    .leftJoin(
      ProjectMemberTable,
      and(
        eq(ProjectMemberTable.projectId, ProjectTable.id),
        eq(ProjectMemberTable.userId, session.user.id),
      ),
    )
    .where(
      and(
        eq(ProjectTable.organizationId, organizationId),
        or(
          eq(ProjectTable.ownerUserId, session.user.id),
          eq(ProjectMemberTable.userId, session.user.id),
        ),
      ),
    )
    .orderBy(desc(ProjectTable.updatedAt));

  return (
    <main className="min-h-screen bg-background">
      {/* Section header: eyebrow → display heading → sub. */}
      <header className="px-4 pt-8 pb-6 sm:px-6 max-w-6xl mx-auto">
        <Eyebrow>Workspace</Eyebrow>
        <div className="mt-4 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-4xl font-normal tracking-[-0.03em] text-balance sm:text-5xl">
              Projects
            </h1>
            <p className="mt-3 text-lg/[1.55] text-muted-foreground max-w-[560px]">
              Shared project memory, documents, tools and knowledge graphs.
            </p>
          </div>
          <ProjectDialog>
            <button
              className="inline-flex h-10 shrink-0 items-center gap-2 rounded-[10px] px-4 text-sm font-medium transition active:scale-[0.97] bg-primary text-primary-foreground hover:bg-primary/90"
              data-testid="new-project-button"
            >
              <Plus className="size-4" />
              New project
            </button>
          </ProjectDialog>
        </div>
      </header>

      <div className="px-4 pb-8 sm:px-6 max-w-6xl mx-auto">
        {projects.length ? (
          /* Tray+card layering: grid of white cards on a
             soft tray frame. */
          <div className="tray">
            <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
              {projects.map(({ project }) => (
                <Link key={project.id} href={`/projects/${project.id}`}>
                  <div className="card-surface group p-5 h-full transition-shadow hover:shadow-[var(--shadow-card),0_12px_32px_-16px_rgba(0,0,0,0.2)]">
                    <h2 className="text-xl font-normal tracking-[-0.02em] text-foreground">
                      {project.name}
                    </h2>
                    <p className="mt-2 line-clamp-2 min-h-10 text-sm/6 text-muted-foreground">
                      {project.goal ??
                        project.description ??
                        "No project goal yet."}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center py-16 text-center">
            <FolderOpen className="mb-4 size-12 text-muted-foreground" />
            <h2 className="text-xl font-normal tracking-[-0.02em]">
              No projects yet
            </h2>
            <p className="mt-2 text-sm/6 text-muted-foreground">
              Create a project to begin building shared memory.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
