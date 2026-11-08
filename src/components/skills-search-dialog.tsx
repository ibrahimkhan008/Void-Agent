"use client";

import { Check, Download, Loader, Search, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "ui/dialog";
import { Input } from "ui/input";

type RegistrySkill = {
  id: string;
  name: string;
  source: string;
  installs: number;
};
type SearchResult = { skills: RegistrySkill[]; unreachable?: boolean };
export type SkillImportDraft = {
  name: string;
  description?: string;
  markdown: string;
  source: string;
  slug: string;
  license: string;
  licenseNotice: string;
};

export function SkillsSearchDialog({
  open,
  onOpenChange,
  savedSources,
  onImport,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  savedSources: string[];
  onImport: (draft: SkillImportDraft) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<RegistrySkill[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const [unreachable, setUnreachable] = useState(false);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      setUnreachable(false);
      try {
        const params = new URLSearchParams();
        if (query.trim()) params.set("q", query.trim());
        const response = await fetch(`/api/skills/search?${params}`, {
          credentials: "same-origin",
          cache: "no-store",
          signal: controller.signal,
        });
        const body = (await response.json()) as SearchResult;
        if (!response.ok)
          throw new Error("Could not search the skills library.");
        setResults(body.skills ?? []);
        setUnreachable(Boolean(body.unreachable));
      } catch {
        if (!controller.signal.aborted) {
          setResults([]);
          setUnreachable(true);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [open, query]);

  const importSkill = async (skill: RegistrySkill) => {
    const key = `${skill.source}/${skill.id}`;
    setLoadingKey(key);
    try {
      const response = await fetch("/api/skills/import", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: skill.source, slug: skill.id }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "Could not load this skill.");
      onImport(body as SkillImportDraft);
      onOpenChange(false);
      toast.success(
        "Skill loaded as a draft. Review its instructions before saving.",
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not load this skill.",
      );
    } finally {
      setLoadingKey(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="md:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4" /> Browse skills
          </DialogTitle>
          <DialogDescription>
            Search the skills.sh catalog. Imported instructions are loaded as a
            draft and are not saved until you review and confirm them.
          </DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search skills"
            className="pl-9"
          />
        </div>
        <div className="max-h-[50vh] space-y-2 overflow-y-auto py-1">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader className="size-4 animate-spin" />
            </div>
          ) : unreachable ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              The skills library is unavailable. Try again later.
            </p>
          ) : results.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {query.trim() ? "No matching skills." : "No skills found."}
            </p>
          ) : (
            results.map((skill) => {
              const key = `${skill.source}/${skill.id}`;
              const saved = savedSources.includes(key);
              return (
                <div
                  key={key}
                  className="flex items-center gap-3 rounded-lg border p-3"
                >
                  <div className="flex size-8 items-center justify-center rounded-md bg-muted">
                    <Sparkles className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{skill.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {skill.source} · {skill.installs.toLocaleString()}{" "}
                      installs
                    </p>
                  </div>
                  {saved ? (
                    <Button variant="ghost" size="sm" disabled>
                      <Check className="mr-1 size-3.5" /> Saved
                    </Button>
                  ) : (
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={loadingKey !== null}
                      onClick={() => void importSkill(skill)}
                    >
                      {loadingKey === key ? (
                        <Loader className="mr-1 size-3.5 animate-spin" />
                      ) : (
                        <Download className="mr-1 size-3.5" />
                      )}{" "}
                      Draft
                    </Button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
