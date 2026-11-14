"use client";

import { fetcher } from "lib/utils";
import { Download, Loader2, Search, Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";
import { Button } from "ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "ui/card";

interface RecommendedSkill {
  id?: string;
  skillId?: string;
  name?: string;
  installs?: number;
  source?: string;
}

interface Recommendation {
  domain: string;
  label: string;
  why: string;
  queries: string[];
  skills: RecommendedSkill[];
  unreachable: boolean;
}

/**
 * Project-aware skill recommendations (master prompt §3.12): detects what the
 * project touches and recommends matching skills.sh queries with live
 * results, ready to install into the user's skill set.
 */
export function ProjectSkillRecommendationsCard({
  projectId,
  canEdit,
}: {
  projectId: string;
  canEdit: boolean;
}) {
  const recsKey = `/api/projects/${projectId}/skill-recommendations`;
  const { data, error } = useSWR<{ recommendations: Recommendation[] }>(
    canEdit ? recsKey : null,
    fetcher,
  );
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [installedSlugs, setInstalledSlugs] = useState<string[]>([]);

  const install = async (skill: RecommendedSkill) => {
    if (!skill.source || !skill.name) return;
    const key = skill.source + "/" + (skill.id ?? skill.name);
    setInstallingId(key);
    try {
      const res = await fetch("/api/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: skill.name,
          slug: (skill.id ?? skill.name)
            .toLowerCase()
            .replace(/[^a-z0-9.-]+/g, "-"),
          source: skill.source,
        }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(payload?.error ?? "Failed to save skill");
      }
      setInstalledSlugs((prev) => [...prev, key]);
      toast.success(`Installed "${skill.name}".`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save skill");
    } finally {
      setInstallingId(null);
    }
  };

  if (!canEdit || error || !data?.recommendations?.length) return null;

  return (
    <Card className="lg:col-span-2">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>Recommended skills</CardTitle>
        <Sparkles className="size-4 text-primary" />
      </CardHeader>
      <CardContent className="space-y-4">
        {data.recommendations.map((rec) => (
          <div key={rec.domain} className="space-y-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-medium">{rec.label}</p>
              {rec.unreachable && (
                <p className="text-[11px] text-muted-foreground">
                  Registry unreachable — search manually.
                </p>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{rec.why}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {(rec.skills ?? []).map((skill, i) => {
                const key =
                  (skill.source ?? "") + "/" + (skill.id ?? skill.name ?? i);
                const isInstalled = installedSlugs.includes(key);
                return (
                  <div
                    key={key + i}
                    className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium">
                        {skill.name ?? "Unnamed skill"}
                      </p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {skill.source}
                        {typeof skill.installs === "number"
                          ? ` · ${skill.installs.toLocaleString()} installs`
                          : ""}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 shrink-0 px-2 text-xs"
                      disabled={isInstalled || installingId === key}
                      onClick={() => install(skill)}
                    >
                      {installingId === key ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : isInstalled ? (
                        "Installed"
                      ) : (
                        <>
                          <Download className="mr-1 size-3" />
                          Install
                        </>
                      )}
                    </Button>
                  </div>
                );
              })}
              {(rec.skills ?? []).length === 0 && !rec.unreachable && (
                <p className="text-xs text-muted-foreground">
                  No registry matches — search{" "}
                  <span className="font-mono">{rec.queries[0]}</span> in the
                  skills dialog.
                </p>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// Search icon used by the empty state hint.
export { Search as _SearchIcon } from "lucide-react";
void Search;
