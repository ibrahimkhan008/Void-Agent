"use client";

import { ProjectBrainPanel } from "@/components/project-brain-panel";
import { ProjectCollaboratorsPanel } from "@/components/project-collaborators-panel";
import { ProjectDocumentsPanel } from "@/components/project-documents-panel";
import { useCollections } from "@/hooks/queries/use-collections";
import {
  Project,
  useProjectTeams,
  useProjects,
} from "@/hooks/queries/use-projects";
import { FolderKanban, Loader2, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "ui/card";
import { Input } from "ui/input";
import { Label } from "ui/label";
import { Textarea } from "ui/textarea";

type Draft = {
  name: string;
  description: string;
  goal: string;
  systemPrompt: string;
  collectionIds: string[];
  teamId: string;
};

const emptyDraft = (): Draft => ({
  name: "",
  description: "",
  goal: "",
  systemPrompt: "",
  collectionIds: [],
  teamId: "",
});

export default function ProjectsDashboard() {
  const { data, isLoading, mutate } = useProjects();
  const { data: collectionData } = useCollections();
  const { data: teamData } = useProjectTeams();
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [editing, setEditing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const projects = data?.projects ?? [];

  const save = async () => {
    if (!draft.name.trim()) return toast.error("Project name is required");
    setSaving(true);
    try {
      const response = await fetch(
        editing ? `/api/projects/${editing}` : "/api/projects",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: draft.name,
            description: draft.description || null,
            goal: draft.goal || null,
            systemPrompt: draft.systemPrompt || null,
            collectionIds: draft.collectionIds,
            ...(!editing ? { teamId: draft.teamId || null } : {}),
          }),
        },
      );
      if (!response.ok) throw new Error(await response.text());
      await mutate();
      setDraft(emptyDraft());
      setEditing(null);
      toast.success(editing ? "Project updated" : "Project created");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not save project",
      );
    } finally {
      setSaving(false);
    }
  };

  const edit = (project: Project) => {
    setEditing(project.id);
    setDraft({
      name: project.name,
      description: project.description ?? "",
      goal: project.goal ?? "",
      systemPrompt: project.systemPrompt ?? "",
      collectionIds: project.collectionIds ?? [],
      teamId: project.teamId ?? "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const remove = async (project: Project) => {
    if (
      !window.confirm(`Delete “${project.name}”? Existing chats will remain.`)
    )
      return;
    try {
      const response = await fetch(`/api/projects/${project.id}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error(await response.text());
      await mutate();
      if (editing === project.id) {
        setEditing(null);
        setDraft(emptyDraft());
      }
      toast.success("Project deleted");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not delete project",
      );
    }
  };

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-8">
      <header className="mb-8">
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <FolderKanban className="size-6" />
          Projects
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Organize conversations around a goal, shared instructions, and
          selected knowledge collections.
        </p>
      </header>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>{editing ? "Edit project" : "Create a project"}</CardTitle>
          <CardDescription>
            Project instructions and knowledge are applied when a chat uses this
            project.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="project-name">Name</Label>
            <Input
              id="project-name"
              maxLength={100}
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="project-team">Workspace</Label>
            <select
              id="project-team"
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              value={draft.teamId}
              disabled={Boolean(editing)}
              onChange={(e) => setDraft({ ...draft, teamId: e.target.value })}
            >
              <option value="">Personal</option>
              {(teamData?.teams ?? [])
                .filter((team) => team.role !== "viewer")
                .map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Team projects are visible to current workspace members.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="project-description">Description</Label>
            <Textarea
              id="project-description"
              maxLength={1000}
              value={draft.description}
              onChange={(e) =>
                setDraft({ ...draft, description: e.target.value })
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="project-goal">Goal</Label>
            <Textarea
              id="project-goal"
              maxLength={4000}
              value={draft.goal}
              onChange={(e) => setDraft({ ...draft, goal: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="project-instructions">Assistant instructions</Label>
            <Textarea
              id="project-instructions"
              maxLength={12000}
              value={draft.systemPrompt}
              onChange={(e) =>
                setDraft({ ...draft, systemPrompt: e.target.value })
              }
            />
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">
              Knowledge collections
            </legend>
            {(collectionData?.collections ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Create collections in{" "}
                <Link className="underline" href="/knowledge">
                  Knowledge
                </Link>{" "}
                to attach them here.
              </p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {collectionData?.collections.map((collection) => (
                  <label
                    key={collection.id}
                    className="flex items-center gap-2 rounded-md border p-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={draft.collectionIds.includes(collection.id)}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          collectionIds: event.target.checked
                            ? [...draft.collectionIds, collection.id]
                            : draft.collectionIds.filter(
                                (id) => id !== collection.id,
                              ),
                        })
                      }
                    />
                    {collection.name}
                  </label>
                ))}
              </div>
            )}
          </fieldset>
          <div className="flex gap-2">
            <Button onClick={save} disabled={saving}>
              {saving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : editing ? null : (
                <Plus className="size-4" />
              )}
              {editing ? "Save changes" : "Create project"}
            </Button>
            {editing && (
              <Button
                variant="outline"
                onClick={() => {
                  setEditing(null);
                  setDraft(emptyDraft());
                }}
              >
                Cancel
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <section className="space-y-3" aria-label="Your projects">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading projects…</p>
        ) : projects.length === 0 ? (
          <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
            No projects yet. Create one to keep chats and knowledge focused.
          </div>
        ) : (
          projects.map((project) => (
            <Card key={project.id}>
              <CardContent className="pt-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <h2 className="font-semibold">{project.name}</h2>
                    {project.description && (
                      <p className="mt-1 text-sm text-muted-foreground">
                        {project.description}
                      </p>
                    )}
                    {project.goal && (
                      <p className="mt-2 text-sm">Goal: {project.goal}</p>
                    )}
                    <p className="mt-2 text-xs text-muted-foreground">
                      {project.teamId
                        ? ((teamData?.teams ?? []).find(
                            (team) => team.id === project.teamId,
                          )?.name ?? "Team workspace")
                        : "Personal workspace"}{" "}
                      · {project.collectionIds.length} knowledge collection(s) ·{" "}
                      {project.role ?? "owner"}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => edit(project)}
                      disabled={project.role === "viewer"}
                    >
                      Edit
                    </Button>
                    {project.role === "owner" && (
                      <Button
                        variant="outline"
                        size="icon"
                        aria-label={`Delete ${project.name}`}
                        onClick={() => remove(project)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    )}
                  </div>
                </div>
                <ProjectBrainPanel
                  projectId={project.id}
                  canReview={project.role !== "viewer"}
                />
                {project.teamId && (
                  <ProjectCollaboratorsPanel
                    projectId={project.id}
                    projectRole={project.role ?? "owner"}
                    accessMode={project.accessMode ?? "team"}
                    onProjectChanged={mutate}
                  />
                )}
                <ProjectDocumentsPanel
                  projectId={project.id}
                  collectionIds={project.collectionIds}
                  canEdit={project.role !== "viewer"}
                />
              </CardContent>
            </Card>
          ))
        )}
      </section>
    </main>
  );
}
