"use client";

import { cn } from "lib/utils";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Info,
  Loader2,
  Search,
  Shield,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

type Program = { id: string; name: string; programHandle: string };

const CATEGORIES = [
  { value: "xss", label: "XSS — Cross-Site Scripting" },
  { value: "sqli", label: "SQL Injection" },
  { value: "ssrf", label: "SSRF — Server-Side Request Forgery" },
  { value: "auth_bypass", label: "Authentication Bypass" },
  { value: "rate_limiting", label: "Rate Limiting / Brute Force" },
  { value: "information_disclosure", label: "Information Disclosure" },
  { value: "rce", label: "Remote Code Execution" },
  { value: "idor", label: "IDOR / Broken Access Control" },
  { value: "other", label: "Other" },
];

type MatchedAsset = {
  assetIdentifier: string;
  assetType: string;
  isInScope: boolean;
  instructionNotes?: string | null;
};

type ScopeResult = {
  status: "allowed" | "conditional" | "disallowed" | "unknown";
  isInScope: boolean;
  reason: string;
  matchedAssetIdentifier?: string | null;
  matchedAsset?: MatchedAsset | string | null;
  policyCitations: string[];
};

const STATUS_CONFIG = {
  allowed: {
    icon: CheckCircle2,
    label: "ALLOWED",
    colors: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
    iconColor: "text-emerald-400",
    bannerColor: "bg-emerald-500/5 border-emerald-500/20",
  },
  conditional: {
    icon: Info,
    label: "CONDITIONAL",
    colors: "text-amber-400 bg-amber-500/10 border-amber-500/30",
    iconColor: "text-amber-400",
    bannerColor: "bg-amber-500/5 border-amber-500/20",
  },
  disallowed: {
    icon: XCircle,
    label: "DISALLOWED",
    colors: "text-red-400 bg-red-500/10 border-red-500/30",
    iconColor: "text-red-400",
    bannerColor: "bg-red-500/5 border-red-500/20",
  },
  unknown: {
    icon: AlertCircle,
    label: "UNKNOWN",
    colors: "text-gray-400 bg-gray-500/10 border-gray-500/30",
    iconColor: "text-gray-400",
    bannerColor: "bg-gray-500/5 border-gray-500/20",
  },
};

function ScopeCheckerInner() {
  const searchParams = useSearchParams();
  const initialProgramId = searchParams.get("programId") ?? "";

  const [programs, setPrograms] = useState<Program[]>([]);
  const [programId, setProgramId] = useState(initialProgramId);
  const [targetAsset, setTargetAsset] = useState("");
  const [category, setCategory] = useState("");
  const [isIntrusive, setIsIntrusive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScopeResult | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/cyber/programs")
      .then((r) => r.json())
      .then((d) => {
        const list: Program[] = d.programs ?? [];
        setPrograms(list);
        if (initialProgramId) {
          setProgramId(initialProgramId);
        }
      })
      .catch(() => {});
  }, [initialProgramId]);

  async function handleCheck(e: React.FormEvent) {
    e.preventDefault();
    if (!programId || !targetAsset.trim()) return;

    setLoading(true);
    setResult(null);
    setSubmitError(null);

    try {
      const res = await fetch("/api/cyber/scope/preflight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          programId,
          targetAsset: targetAsset.trim(),
          category: category || undefined,
          isIntrusive,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSubmitError(data.error ?? "Scope check failed.");
        return;
      }
      setResult(data as ScopeResult);
    } catch {
      setSubmitError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const statusCfg = result
    ? (STATUS_CONFIG[result.status] ?? STATUS_CONFIG.unknown)
    : null;

  const matchedIdentifier = result
    ? (result.matchedAssetIdentifier ??
      (typeof result.matchedAsset === "string"
        ? result.matchedAsset
        : (result.matchedAsset?.assetIdentifier ?? null)))
    : null;

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Search className="size-5 text-cyan-400" />
          <h1 className="text-2xl font-bold text-foreground tracking-tight">
            Scope Pre-flight Checker
          </h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Deterministically verify whether a target is within program scope
          before beginning any research activity.
        </p>
      </div>

      <form
        onSubmit={handleCheck}
        className="bg-card border border-border rounded-xl p-5 space-y-4"
      >
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">
            Target Program <span className="text-red-400">*</span>
          </label>
          <div className="relative">
            <select
              value={programId}
              onChange={(e) => setProgramId(e.target.value)}
              required
              className="w-full appearance-none bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 pr-8 transition-colors"
            >
              <option value="">Select a program…</option>
              {programs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} (@{p.programHandle})
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
          </div>
          {programs.length === 0 && (
            <p className="text-xs text-muted-foreground mt-1">
              No programs found.{" "}
              <Link
                href="/cyber/programs/new"
                className="text-cyan-400 hover:underline"
              >
                Create one first.
              </Link>
            </p>
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">
            Target Asset <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={targetAsset}
            onChange={(e) => setTargetAsset(e.target.value)}
            required
            placeholder="example.com  •  192.168.1.0/24  •  https://app.example.com/api/v1"
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-colors"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">
            Test / Attack Category (Optional — free-form)
          </label>
          <input
            type="text"
            list="cyber-category-suggestions"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="Type any security test, e.g. Cloudflare Workers audit, SSRF, BOLA, GraphQL auth…"
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-colors"
          />
          <datalist id="cyber-category-suggestions">
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </datalist>
        </div>

        <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 border border-border">
          <button
            type="button"
            role="switch"
            aria-checked={isIntrusive}
            onClick={() => setIsIntrusive((v) => !v)}
            className={cn(
              "relative mt-0.5 w-10 h-6 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500/50 shrink-0",
              isIntrusive ? "bg-amber-500" : "bg-border",
            )}
          >
            <span
              className={cn(
                "absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform",
                isIntrusive ? "translate-x-4" : "translate-x-0",
              )}
            />
          </button>
          <div>
            <p
              className="text-sm font-medium text-foreground cursor-pointer"
              onClick={() => setIsIntrusive((v) => !v)}
            >
              Intrusive / Active Scan
            </p>
            <p className="text-xs text-muted-foreground">
              Intrusive scans may cause service disruption. Requires explicit
              approval before execution.
            </p>
          </div>
        </div>

        {submitError && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
            <AlertCircle className="size-4 shrink-0" />
            {submitError}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !programId || !targetAsset.trim()}
          className="w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-cyan-500 text-white text-sm font-semibold hover:bg-cyan-600 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Checking…
            </>
          ) : (
            <>
              <Shield className="size-4" />
              Check Scope
            </>
          )}
        </button>
      </form>

      {result && statusCfg && (
        <div
          className={cn(
            "rounded-xl border p-5 space-y-4",
            statusCfg.bannerColor,
          )}
        >
          <div className="flex items-center gap-3">
            <statusCfg.icon className={cn("size-7", statusCfg.iconColor)} />
            <div>
              <span
                className={cn(
                  "inline-flex items-center px-3 py-1 rounded-lg text-sm font-bold border",
                  statusCfg.colors,
                )}
              >
                {statusCfg.label}
              </span>
            </div>
          </div>

          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
              Reason
            </p>
            <p className="text-sm text-foreground">{result.reason}</p>
          </div>

          {matchedIdentifier && (
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                Matched Asset
              </p>
              <code className="text-sm font-mono text-foreground bg-background/60 px-2 py-1 rounded">
                {matchedIdentifier}
              </code>
            </div>
          )}

          {result.policyCitations.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                Policy Citations
              </p>
              <ul className="space-y-1">
                {result.policyCitations.map((cite, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 text-sm text-muted-foreground"
                  >
                    <ChevronRight className="size-3.5 mt-1 shrink-0 text-cyan-400" />
                    {cite}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ScopeCheckerPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-full min-h-[50vh]">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <ScopeCheckerInner />
    </Suspense>
  );
}
