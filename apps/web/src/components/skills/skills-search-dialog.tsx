"use client";

import { useSkills } from "@/hooks/queries/use-skills";
import { motionSkillsByPack } from "@/lib/skills/motion-catalog";
import type { SkillSearchResult } from "app-types/skill";
import type { SkillSummary } from "app-types/skill";
import { fetcher } from "lib/utils";
import { cn } from "lib/utils";
import { Check, Download, Loader, Search, Sparkles } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useSWRConfig } from "swr";
import { Button } from "ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "ui/dialog";
import { Input } from "ui/input";

function SkillResultCard({
  skill,
  saved,
  onSave,
  saving,
}: {
  skill: SkillSearchResult;
  saved: boolean;
  onSave: (skill: SkillSearchResult) => void;
  saving: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border p-3">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted">
        <Sparkles className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{skill.name}</p>
        <p className="truncate text-xs text-muted-foreground">
          {skill.source} · {skill.installs.toLocaleString()} installs
        </p>
      </div>
      {saved ? (
        <Button variant="ghost" size="sm" disabled className="gap-1">
          <Check className="size-3.5" /> Saved
        </Button>
      ) : (
        <Button
          variant="secondary"
          size="sm"
          className="gap-1"
          disabled={saving}
          onClick={() => onSave(skill)}
        >
          {saving ? (
            <Loader className="size-3.5 animate-spin" />
          ) : (
            <Download className="size-3.5" />
          )}
          Save
        </Button>
      )}
    </div>
  );
}

export function SkillsSearchDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { mutate } = useSWRConfig();
  const { skills: savedSkills } = useSkills();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [results, setResults] = useState<SkillSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [unreachable, setUnreachable] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [importUrl, setImportUrl] = useState("");
  const [importingUrl, setImportingUrl] = useState(false);
  const [importingFile, setImportingFile] = useState(false);
  const [importingZip, setImportingZip] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const savedSources = new Set(
    savedSkills.map((s: SkillSummary) => `${s.source}/${s.slug}`),
  );

  const runSearch = useCallback(async (query: string) => {
    setIsLoading(true);
    setUnreachable(false);
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      const data = (await fetcher(
        `/api/skills/search?${params.toString()}`,
      )) as {
        skills: SkillSearchResult[];
        unreachable?: boolean;
      };
      setResults(data.skills ?? []);
      setUnreachable(Boolean(data.unreachable));
    } catch {
      setResults([]);
      setUnreachable(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const importFromUrl = async () => {
    const url = importUrl.trim();
    if (!url) return;
    setImportingUrl(true);
    try {
      const res = await fetch("/api/skills/import-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(payload?.error ?? "Could not fetch that URL.");
      }
      const name = payload.name || url.split("/").pop() || "imported-skill";
      await saveImported(
        name,
        sourceFromUrl(url),
        payload.content,
        payload.description,
      );
      setImportUrl("");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not import from that URL.",
      );
    } finally {
      setImportingUrl(false);
    }
  };

  const importFromFile = async (file: File) => {
    setImportingFile(true);
    try {
      const content = await file.text();
      if (content.length > 200_000) {
        throw new Error("That file is too large (200 KB max).");
      }
      const name = file.name.replace(/\.md$/i, "").replace(/[^\w.-]+/g, "-");
      await saveImported(name, `local/${name}`, content);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not import that file.",
      );
    } finally {
      setImportingFile(false);
    }
  };

  const saveImported = async (
    name: string,
    source: string,
    content: string,
    description?: string,
  ) => {
    const res = await fetch("/api/skills", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, slug: name, source, content, description }),
    });
    const payload = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(payload?.error ?? "Failed to save skill");
    }
    toast.success(`Imported "${name}".`);
    void mutate(
      (key) => typeof key === "string" && key.startsWith("/api/skills"),
    );
  };

  // POST /api/skills validates source as owner/repo. GitHub URLs map to
  // their owner/repo; anything else keeps its host + first path segment.
  const sourceFromUrl = (url: string) => {
    try {
      const parsed = new URL(url);
      const segments = parsed.pathname.split("/").filter(Boolean);
      if (
        (parsed.hostname === "github.com" ||
          parsed.hostname === "raw.githubusercontent.com") &&
        segments.length >= 2
      ) {
        return `${segments[0]}/${segments[1]}`;
      }
      return `${parsed.hostname}/${segments[0] ?? "import"}`.slice(0, 180);
    } catch {
      return `local/${url.replace(/[^\w.-]+/g, "-").slice(0, 60) || "import"}`;
    }
  };

  const importFromZip = async (file: File) => {
    setImportingZip(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/skills/import-zip", {
        method: "POST",
        body,
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(payload?.error ?? "Could not import that archive.");
      }
      const imported: Array<{ name: string }> = payload.imported ?? [];
      const failed: Array<{ folder: string; error: string }> =
        payload.failed ?? [];
      toast.success(
        imported.length === 1
          ? `Imported "${imported[0].name}".`
          : `Imported ${imported.length} skills from the archive.`,
      );
      for (const f of failed) toast.error(`${f.folder}: ${f.error}`);
      void mutate(
        (key) => typeof key === "string" && key.startsWith("/api/skills"),
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not import that archive.",
      );
    } finally {
      setImportingZip(false);
    }
  };

  const onSearchChange = (value: string) => {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(value), 350);
  };

  // Open the dialog on the leaderboard (blank query = most-installed), then
  // re-query as the debounced search changes.
  useEffect(() => {
    if (!open) return;
    runSearch(debouncedSearch);
  }, [open, debouncedSearch, runSearch]);

  const onSave = useCallback(
    async (skill: SkillSearchResult) => {
      setSavingId(skill.id);
      try {
        const res = await fetch("/api/skills", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: skill.name,
            slug: skill.id,
            source: skill.source,
          }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? "Failed to save skill");
        }
        // Refresh every saved-skills list view.
        mutate(
          (key) => typeof key === "string" && key.startsWith("/api/skills?"),
        );
      } catch (error: any) {
        toast.error(error?.message ?? "Failed to save skill");
      } finally {
        setSavingId(null);
      }
    },
    [mutate],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="md:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4" /> Add a skill
          </DialogTitle>
          <DialogDescription>
            Search the skills library, import from a URL or file, or upload a
            .zip of skill folders (each folder needs a SKILL.md).
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search skills…"
            className="pl-9"
          />
        </div>

        <div className="flex items-center gap-2">
          <Input
            value={importUrl}
            onChange={(e) => setImportUrl(e.target.value)}
            placeholder="Import from a raw SKILL.md URL…"
            className="h-9 text-xs"
          />
          <Button
            variant="outline"
            size="sm"
            disabled={!importUrl.trim() || importingUrl}
            onClick={importFromUrl}
          >
            {importingUrl ? (
              <Loader className="size-3.5 animate-spin" />
            ) : (
              "Import"
            )}
          </Button>
          <label className="inline-flex">
            <input
              type="file"
              accept=".md,text/markdown"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void importFromFile(file);
                e.target.value = "";
              }}
            />
            <Button
              variant="outline"
              size="sm"
              disabled={importingFile}
              onClick={(e) => {
                e.preventDefault();
                e.currentTarget.previousElementSibling
                  ?.querySelector("input")
                  ?.click();
              }}
            >
              {importingFile ? (
                <Loader className="size-3.5 animate-spin" />
              ) : (
                "Upload .md"
              )}
            </Button>
          </label>
          <label className="inline-flex">
            <input
              type="file"
              accept=".zip,application/zip,application/x-zip-compressed"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void importFromZip(file);
                e.target.value = "";
              }}
            />
            <Button
              variant="outline"
              size="sm"
              disabled={importingZip}
              onClick={(e) => {
                e.preventDefault();
                e.currentTarget.previousElementSibling
                  ?.querySelector("input")
                  ?.click();
              }}
            >
              {importingZip ? (
                <Loader className="size-3.5 animate-spin" />
              ) : (
                "Upload .zip"
              )}
            </Button>
          </label>
        </div>

        <div className="flex max-h-[50vh] flex-col gap-2 overflow-y-auto py-1">
          {isLoading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader className="size-4 animate-spin" />
            </div>
          ) : unreachable ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              The skills library is unreachable right now. Please try again.
            </p>
          ) : results.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {search.trim()
                ? `No skills found for "${search}"`
                : "No skills found."}
            </p>
          ) : (
            <>
              {!search.trim() && (
                <>
                  <p className="px-1 text-xs font-medium text-muted-foreground">
                    Most popular
                  </p>
                  <div className="mb-4 space-y-3">
                    <p className="flex items-center gap-1.5 px-1 text-xs font-semibold text-foreground">
                      <Sparkles className="size-3.5 text-primary" />
                      Void Motion — motion graphics packs
                    </p>
                    {motionSkillsByPack().map((group) => (
                      <div key={group.source} className="rounded-xl border p-3">
                        <p className="text-xs font-semibold text-muted-foreground">
                          {group.pack}{" "}
                          <span className="font-normal">· {group.source}</span>
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {group.skills.map((skill) => {
                            const saved = savedSources.has(
                              `${skill.source}/${skill.slug}`,
                            );
                            return (
                              <button
                                key={skill.slug}
                                type="button"
                                disabled={saved || savingId === skill.slug}
                                onClick={async () => {
                                  try {
                                    await onSave({
                                      name: skill.name,
                                      id: skill.slug,
                                      source: skill.source,
                                      description: skill.description,
                                      installs: 0,
                                    } as unknown as SkillSearchResult);
                                  } catch {
                                    // onSave surfaces its own errors
                                  }
                                }}
                                className={cn(
                                  "rounded-full border px-2.5 py-1 text-[11px] transition-colors",
                                  saved
                                    ? "border-primary/40 bg-primary/10 text-primary"
                                    : "hover:bg-muted",
                                )}
                                title={skill.description}
                              >
                                {saved ? "✓ " : "+ "}
                                {skill.name}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
              {results.map((skill) => (
                <SkillResultCard
                  key={`${skill.source}/${skill.id}`}
                  skill={skill}
                  saved={savedSources.has(`${skill.source}/${skill.id}`)}
                  saving={savingId === skill.id}
                  onSave={onSave}
                />
              ))}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
