"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ChevronDown, ChevronUp, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

/**
 * AI Code Review settings (ChatGPT Codex-style): personal preferences are
 * the defaults, each GitHub repository overrides them field by field, and
 * enabling a repository provisions the unattended webhook pipeline.
 */

type Trigger = "pr_open" | "every_push" | "smart_detect";

interface UserPrefs {
  reviewTrigger: Trigger;
  exhaustiveReview: boolean;
}

interface RepoSetting {
  repository: string;
  autoReview: boolean;
  reviewTrigger: Trigger | null;
  exhaustiveReview: boolean | null;
  reviewInstructions: string | null;
  provisioned: boolean;
}

interface RepoInfo {
  fullName: string;
  private: boolean;
  description: string | null;
}

const TRIGGER_LABELS: Record<Trigger, string> = {
  pr_open: "On PR open",
  every_push: "On every push",
  smart_detect: "Smart detect (Experimental)",
};

const triggerLabel = (trigger: Trigger | null | undefined) =>
  trigger ? TRIGGER_LABELS[trigger] : "Follow personal preferences";

export function CodeReviewSettingsContent() {
  const [prefs, setPrefs] = useState<UserPrefs | null>(null);
  const [repos, setRepos] = useState<RepoInfo[]>([]);
  const [settings, setSettings] = useState<RepoSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [reposError, setReposError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [draft, setDraft] = useState<{
    autoReview: boolean;
    reviewTrigger: Trigger | null;
    exhaustiveReview: boolean | null;
    reviewInstructions: string | null;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setReposError(null);
    const [prefsResponse, settingsResponse] = await Promise.all([
      fetch("/api/code-review/preferences"),
      fetch("/api/code-review/settings"),
    ]);
    if (prefsResponse.ok) setPrefs(await prefsResponse.json());
    if (settingsResponse.ok) {
      const payload = await settingsResponse.json();
      setSettings(payload.settings ?? []);
    }
    const reposResponse = await fetch("/api/code-review/repositories");
    if (reposResponse.ok) {
      const payload = await reposResponse.json();
      setRepos(payload.repositories ?? []);
    } else {
      const payload = await reposResponse.json().catch(() => null);
      setReposError(payload?.error ?? "Could not list GitHub repositories");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const settingFor = useCallback(
    (repository: string) =>
      settings.find((item) => item.repository === repository),
    [settings],
  );

  const filteredRepos = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const configured = settings
      .filter(
        (item) => !needle || item.repository.toLowerCase().includes(needle),
      )
      .map<RepoInfo>((item) => ({
        fullName: item.repository,
        private: false,
        description: null,
      }));
    const listed = repos.filter(
      (repo) =>
        (!needle || repo.fullName.toLowerCase().includes(needle)) &&
        !settings.some((item) => item.repository === repo.fullName),
    );
    return [...configured, ...listed];
  }, [repos, settings, search]);

  function openRepo(repository: string) {
    if (expanded === repository) {
      setExpanded(null);
      setDraft(null);
      return;
    }
    const existing = settingFor(repository);
    setExpanded(repository);
    setSaveError(null);
    setDraft({
      autoReview: existing?.autoReview ?? false,
      reviewTrigger: existing?.reviewTrigger ?? null,
      exhaustiveReview: existing?.exhaustiveReview ?? null,
      reviewInstructions: existing?.reviewInstructions ?? null,
    });
  }

  async function savePrefs(patch: Partial<UserPrefs>) {
    if (!prefs) return;
    const next = { ...prefs, ...patch };
    setPrefs(next);
    await fetch("/api/code-review/preferences", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
  }

  async function saveRepo(repository: string) {
    if (!draft) return;
    setSaving(true);
    setSaveError(null);
    try {
      const response = await fetch(
        `/api/code-review/settings/${encodeURIComponent(repository)}`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            autoReview: draft.autoReview,
            reviewTrigger: draft.reviewTrigger,
            exhaustiveReview: draft.exhaustiveReview,
            reviewInstructions: draft.reviewInstructions?.trim()
              ? draft.reviewInstructions
              : null,
          }),
        },
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setSaveError(payload?.error ?? "Could not save the settings");
        return;
      }
      const saved = payload?.setting as RepoSetting | undefined;
      setSettings((current) => [
        ...current.filter((item) => item.repository !== repository),
        ...(saved
          ? [
              {
                repository,
                autoReview: saved.autoReview,
                reviewTrigger: saved.reviewTrigger,
                exhaustiveReview: saved.exhaustiveReview,
                reviewInstructions: saved.reviewInstructions,
                provisioned: saved.provisioned,
              },
            ]
          : []),
      ]);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-3 text-sm text-muted-foreground">
        Loading code review settings…
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Code Review</h2>
          <p className="text-sm text-muted-foreground">
            Choose how the agent reviews changes in your repositories
          </p>
        </div>

        <div className="rounded-lg border p-4">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">
            Personal preferences
          </Label>
          <div className="mt-3 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Review trigger</p>
              <p className="text-xs text-muted-foreground">
                Choose when automatic reviews should run. A repository&apos;s
                setting takes priority.
              </p>
            </div>
            <Select
              value={prefs?.reviewTrigger ?? "pr_open"}
              onValueChange={(value) =>
                void savePrefs({ reviewTrigger: value as Trigger })
              }
            >
              <SelectTrigger className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pr_open">On PR open</SelectItem>
                <SelectItem value="every_push">On every push</SelectItem>
                <SelectItem value="smart_detect">
                  Smart detect (Experimental)
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="mt-4 flex items-center justify-between gap-4 border-t pt-4">
            <div>
              <p className="text-sm font-medium">Exhaustive code review</p>
              <p className="text-xs text-muted-foreground">
                Keep looking for findings until the reviewer stops finding new
                issues
              </p>
            </div>
            <Switch
              checked={prefs?.exhaustiveReview ?? false}
              onCheckedChange={(checked) =>
                void savePrefs({ exhaustiveReview: checked })
              }
            />
          </div>
        </div>

        <div className="rounded-lg border p-4">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Repositories
              </Label>
              <p className="mt-1 text-sm text-muted-foreground">
                Choose a repository to configure its automatic reviews
              </p>
            </div>
          </div>
          {reposError ? (
            <p className="mt-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
              {reposError} — connect GitHub under Connectors first.
            </p>
          ) : (
            <div className="relative mt-3">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search repositories"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
          )}

          <div className="mt-3 divide-y">
            {filteredRepos.map((repo) => {
              const setting = settingFor(repo.fullName);
              const isOpen = expanded === repo.fullName;
              return (
                <div key={repo.fullName}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-4 py-3 text-left"
                    onClick={() => openRepo(repo.fullName)}
                  >
                    <span>
                      <span className="text-sm font-medium">
                        {repo.fullName}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        Automatic code review:{" "}
                        {setting?.autoReview
                          ? triggerLabel(
                              setting.reviewTrigger ?? prefs?.reviewTrigger,
                            )
                          : "Off"}
                        {setting?.provisioned ? " · webhook live" : ""}
                      </span>
                    </span>
                    {isOpen ? (
                      <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                  </button>

                  {isOpen && draft ? (
                    <div className="space-y-4 border-t pb-4 pt-4">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <p className="text-sm font-medium">
                            Automatic review
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Reviews pull requests with the user&apos;s connected
                            GitHub account and posts the findings as a review
                            comment
                          </p>
                        </div>
                        <Switch
                          checked={draft.autoReview}
                          onCheckedChange={(checked) =>
                            setDraft({ ...draft, autoReview: checked })
                          }
                        />
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <p className="text-sm font-medium">Review</p>
                        <Select
                          value={
                            draft.exhaustiveReview === null ||
                            draft.exhaustiveReview === undefined
                              ? "follow"
                              : draft.exhaustiveReview
                                ? "exhaustive"
                                : "standard"
                          }
                          onValueChange={(value) =>
                            setDraft({
                              ...draft,
                              exhaustiveReview:
                                value === "follow"
                                  ? null
                                  : value === "exhaustive",
                            })
                          }
                        >
                          <SelectTrigger className="w-56">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="follow">
                              Follow personal preferences
                            </SelectItem>
                            <SelectItem value="standard">Standard</SelectItem>
                            <SelectItem value="exhaustive">
                              Exhaustive
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <p className="text-sm font-medium">Trigger</p>
                        <Select
                          value={draft.reviewTrigger ?? "follow"}
                          onValueChange={(value) =>
                            setDraft({
                              ...draft,
                              reviewTrigger:
                                value === "follow" ? null : (value as Trigger),
                            })
                          }
                        >
                          <SelectTrigger className="w-56">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="follow">
                              Follow personal preferences
                            </SelectItem>
                            <SelectItem value="pr_open">On PR open</SelectItem>
                            <SelectItem value="every_push">
                              On every push
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">
                          Review instructions
                        </Label>
                        <Textarea
                          rows={3}
                          maxLength={4000}
                          placeholder="Add review guidelines for this repository (AGENTS.md and SECURITY.md in the repo are followed automatically)"
                          value={draft.reviewInstructions ?? ""}
                          onChange={(event) =>
                            setDraft({
                              ...draft,
                              reviewInstructions: event.target.value,
                            })
                          }
                        />
                      </div>
                      {saveError ? (
                        <p className="text-sm text-red-600 dark:text-red-400">
                          {saveError}
                        </p>
                      ) : null}
                      <Button
                        disabled={saving}
                        onClick={() => void saveRepo(repo.fullName)}
                      >
                        {saving ? "Saving…" : "Save repository settings"}
                      </Button>
                    </div>
                  ) : null}
                </div>
              );
            })}
            {!filteredRepos.length && !reposError ? (
              <p className="py-3 text-sm text-muted-foreground">
                No repositories match.
              </p>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}
