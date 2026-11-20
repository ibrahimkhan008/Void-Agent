"use client";

import { CyberPageHeader } from "@/components/cyber/cyber-ui";
import { AlertCircle, Plus, Shield, Target } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

type CyberProgram = {
  id: string;
  name: string;
  programHandle: string;
  description: string | null;
  hasBounties: boolean;
  currency: string | null;
  scopeCount?: number;
  inScopeCount?: number;
  createdAt: string;
};

function ProgramCard({ program }: { program: CyberProgram }) {
  return (
    <Link
      href={`/cyber/programs/${program.id}`}
      className="block bg-card border border-border rounded-xl p-5 hover:border-border hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 transition-colors group"
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-1.5 rounded-lg bg-accent border border-border shrink-0">
            <Target className="size-4 text-foreground" />
          </div>
          <div className="min-w-0">
            <h2 className="font-semibold text-sm text-foreground truncate group-hover:text-foreground transition-colors">
              {program.name}
            </h2>
            <p className="text-xs text-muted-foreground">
              @{program.programHandle}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {program.hasBounties && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-500/12 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30">
              Bounty
            </span>
          )}
          {program.scopeCount !== undefined && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold tabular-nums bg-muted text-muted-foreground border border-border">
              {program.scopeCount} asset{program.scopeCount === 1 ? "" : "s"}
            </span>
          )}
        </div>
      </div>
      {program.description && (
        <p className="text-xs text-muted-foreground line-clamp-2 mt-2 leading-relaxed">
          {program.description}
        </p>
      )}
    </Link>
  );
}

export default function ProgramsPage() {
  const [programs, setPrograms] = useState<CyberProgram[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/cyber/programs")
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data.error ?? "Failed to load programs");
          return;
        }
        const data = await res.json();
        setPrograms(data.programs ?? []);
      })
      .catch(() => setError("Network error"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-6 max-w-5xl space-y-6">
      <CyberPageHeader
        title="Target Programs"
        description="Define authorized domains, wildcards, IP ranges, exclusions, and rules of engagement."
        actions={
          <Link
            href="/cyber/programs/new"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-medium transition-colors"
          >
            <Plus className="size-4" /> New Program
          </Link>
        }
      />

      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-28 bg-muted/60 rounded-xl animate-pulse"
            />
          ))}
        </div>
      )}

      {!loading && error && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-700 dark:text-red-400">
          <AlertCircle className="size-5 shrink-0" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      {!loading && !error && programs.length === 0 && (
        <div className="bg-card border border-dashed border-border rounded-xl py-16 px-6 text-center">
          <Shield className="size-8 text-muted-foreground mx-auto mb-3 opacity-60" />
          <h2 className="text-base font-semibold text-foreground mb-1">
            No target programs yet
          </h2>
          <p className="text-muted-foreground text-sm max-w-sm mx-auto mb-6">
            Create your first in-app program with in-scope and out-of-scope
            assets to unlock scope checking and research sessions.
          </p>
          <Link
            href="/cyber/programs/new"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-medium transition-colors"
          >
            <Plus className="size-4" /> Create First Program
          </Link>
        </div>
      )}

      {!loading && !error && programs.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {programs.map((program) => (
            <ProgramCard key={program.id} program={program} />
          ))}
        </div>
      )}
    </div>
  );
}
