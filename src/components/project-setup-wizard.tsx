"use client";

import { ProjectAssignedAgents } from "@/components/project-assigned-agents";
import { ProjectAssignedWorkflows } from "@/components/project-assigned-workflows";
import { ProjectBrainPanel } from "@/components/project-brain-panel";
import { ProjectCollaboratorsPanel } from "@/components/project-collaborators-panel";
import { ProjectDocumentsPanel } from "@/components/project-documents-panel";
import { useCollections } from "@/hooks/queries/use-collections";
import type { Project } from "@/hooks/queries/use-projects";
import React, { useState } from "react";
import { toast } from "sonner";
import { Button } from "ui/button";
import { Textarea } from "ui/textarea";

const STEPS = [
  "goal",
  "knowledge",
  "documents",
  "tools",
  "people",
  "agents",
] as const;
type SetupStep = (typeof STEPS)[number];

const TITLES: Record<SetupStep, string> = {
  goal: "Set a project goal",
  knowledge: "Choose knowledge collections",
  documents: "Add project documents",
  tools: "Connect project tools",
  people: "Invite collaborators",
  agents: "Assign agents and workflows",
};

async function responseMessage(response: Response) {
  try {
    const body = (await response.clone().json()) as { error?: unknown };
    if (typeof body.error === "string") return body.error;
  } catch {
    // Some existing project endpoints return plain text errors.
  }
  return (
    (await response.text().catch(() => "")) || "Could not save project setup"
  );
}

export function ProjectSetupWizard({
  project,
  onClose,
  onProjectChanged,
}: {
  project: Project;
  onClose: () => void;
  onProjectChanged: () => void | Promise<unknown>;
}) {
  const initialStep = STEPS.includes(project.onboardingStep as SetupStep)
    ? (project.onboardingStep as SetupStep)
    : "goal";
  const [step, setStep] = useState<SetupStep>(initialStep);
  const [goal, setGoal] = useState(project.goal ?? "");
  const [collectionIds, setCollectionIds] = useState(
    project.collectionIds ?? [],
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { data: collectionData } = useCollections();
  const stepIndex = STEPS.indexOf(step);

  const persistStep = async (nextStep: SetupStep | "complete") => {
    const response = await fetch(`/api/projects/${project.id}/onboard`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ step: nextStep }),
    });
    if (!response.ok) throw new Error(await responseMessage(response));
  };

  const persistCurrentStepData = async () => {
    if (step !== "goal" && step !== "knowledge") return;
    const response = await fetch(`/api/projects/${project.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        step === "goal" ? { goal: goal.trim() || null } : { collectionIds },
      ),
    });
    if (!response.ok) throw new Error(await responseMessage(response));
  };

  const advance = async (skipCurrent = false) => {
    setSaving(true);
    setError(null);
    try {
      if (!skipCurrent) await persistCurrentStepData();
      if (stepIndex === STEPS.length - 1) {
        await persistStep("complete");
        await onProjectChanged();
        toast.success("Project setup complete");
        onClose();
        return;
      }
      const nextStep = STEPS[stepIndex + 1];
      await persistStep(nextStep);
      setStep(nextStep);
      await onProjectChanged();
    } catch (saveError) {
      const message =
        saveError instanceof Error
          ? saveError.message
          : "Could not save project setup";
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const goBack = async () => {
    if (stepIndex === 0) return;
    const previous = STEPS[stepIndex - 1];
    setSaving(true);
    setError(null);
    try {
      await persistStep(previous);
      setStep(previous);
      await onProjectChanged();
    } catch (saveError) {
      const message =
        saveError instanceof Error
          ? saveError.message
          : "Could not resume project setup";
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section
      aria-label="Project setup wizard"
      className="mt-5 rounded-lg border bg-card p-4 md:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground">
            Project setup · Step {stepIndex + 1} of {STEPS.length}
          </p>
          <h3 className="mt-1 text-lg font-semibold">{TITLES[step]}</h3>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          Skip for now
        </Button>
      </div>

      <nav aria-label="Setup steps" className="my-4 flex flex-wrap gap-2">
        {STEPS.map((item, index) => (
          <button
            key={item}
            type="button"
            aria-current={item === step ? "step" : undefined}
            disabled={saving || index > stepIndex}
            onClick={() => {
              if (index < stepIndex) void goBackTo(index);
            }}
            className={`rounded-full px-3 py-1 text-xs ${item === step ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
          >
            {TITLES[item]}
          </button>
        ))}
      </nav>

      {error && (
        <p role="alert" className="mb-3 text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="min-h-40">
        {step === "goal" && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Describe what this project should help you accomplish.
            </p>
            <Textarea
              aria-label="Project goal"
              maxLength={4000}
              value={goal}
              onChange={(event) => setGoal(event.target.value)}
              placeholder="What outcome are you working toward?"
            />
          </div>
        )}
        {step === "knowledge" && (
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">
              Attach knowledge collections
            </legend>
            {!collectionData?.collections.length ? (
              <p className="text-sm text-muted-foreground">
                No collections available yet. You can skip this step and add
                knowledge later from the Knowledge page.
              </p>
            ) : (
              collectionData.collections.map((collection) => (
                <label
                  key={collection.id}
                  className="flex items-center gap-2 rounded-md border p-2 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={collectionIds.includes(collection.id)}
                    onChange={(event) =>
                      setCollectionIds((current) =>
                        event.target.checked
                          ? [...new Set([...current, collection.id])]
                          : current.filter((id) => id !== collection.id),
                      )
                    }
                  />
                  {collection.name}
                </label>
              ))
            )}
          </fieldset>
        )}
        {step === "documents" && (
          <ProjectDocumentsPanel
            projectId={project.id}
            collectionIds={collectionIds}
            canEdit={project.role !== "viewer"}
          />
        )}
        {step === "tools" && (
          <>
            <p className="mb-3 text-sm text-muted-foreground">
              Connect data sources and approved read-only tools for this
              project&apos;s knowledge brain.
            </p>
            <ProjectBrainPanel
              projectId={project.id}
              canReview={project.role !== "viewer"}
            />
          </>
        )}
        {step === "people" &&
          (project.teamId ? (
            <ProjectCollaboratorsPanel
              projectId={project.id}
              projectRole={project.role ?? "owner"}
              accessMode={project.accessMode ?? "team"}
              onProjectChanged={onProjectChanged}
            />
          ) : (
            <p className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
              Personal projects do not support collaborators. Choose a team
              workspace when creating a project to add people.
            </p>
          ))}
        {step === "agents" && (
          <div className="space-y-5">
            <ProjectAssignedAgents
              projectId={project.id}
              isTeamProject={Boolean(project.teamId)}
            />
            <ProjectAssignedWorkflows projectId={project.id} />
          </div>
        )}
      </div>

      <footer className="mt-5 flex flex-wrap justify-between gap-2 border-t pt-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => void goBack()}
          disabled={stepIndex === 0 || saving}
        >
          Back
        </Button>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => void advance(true)}
            disabled={saving}
          >
            Skip this step
          </Button>
          <Button
            type="button"
            onClick={() => void advance()}
            disabled={saving}
          >
            {saving
              ? "Saving…"
              : stepIndex === STEPS.length - 1
                ? "Finish setup"
                : "Next"}
          </Button>
        </div>
      </footer>
    </section>
  );

  async function goBackTo(target: number) {
    const previous = STEPS[target];
    setSaving(true);
    setError(null);
    try {
      await persistStep(previous);
      setStep(previous);
      await onProjectChanged();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Could not resume project setup",
      );
    } finally {
      setSaving(false);
    }
  }
}
