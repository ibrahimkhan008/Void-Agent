"use client";

import { cn } from "lib/utils";
import { AlertCircle, Minus, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

type ScopeRow = {
  id: string;
  assetIdentifier: string;
  assetType: string;
  isInScope: boolean;
  notes: string;
  intrusiveAllowed: boolean;
};

const ASSET_TYPES = [
  { value: "domain", label: "Domain" },
  { value: "url", label: "URL" },
  { value: "wildcard", label: "Wildcard (*.example.com)" },
  { value: "cidr", label: "IP Range / CIDR" },
  { value: "mobile_app", label: "Mobile App" },
];

function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 128);
}

export default function NewProgramPage() {
  const router = useRouter();
  const uid = useId();
  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [handleManual, setHandleManual] = useState(false);
  const [description, setDescription] = useState("");
  const [policy, setPolicy] = useState("");
  const [hasBounties, setHasBounties] = useState(false);
  const [currency, setCurrency] = useState("USD");
  const [scopes, setScopes] = useState<ScopeRow[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleNameChange(v: string) {
    setName(v);
    if (!handleManual) setHandle(slugify(v));
  }

  function addScope(inScope: boolean) {
    setScopes((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random()}`,
        assetIdentifier: "",
        assetType: "domain",
        isInScope: inScope,
        notes: "",
        intrusiveAllowed: false,
      },
    ]);
  }

  function removeScope(id: string) {
    setScopes((prev) => prev.filter((s) => s.id !== id));
  }

  function updateScope(id: string, patch: Partial<ScopeRow>) {
    setScopes((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Program name is required.");
      return;
    }
    if (!handle.trim() || handle.length < 3) {
      setError("Handle must be at least 3 characters.");
      return;
    }
    if (!/^[a-z0-9-]+$/.test(handle)) {
      setError(
        "Handle may only contain lowercase letters, numbers, and hyphens.",
      );
      return;
    }
    if (scopes.length === 0) {
      setError("At least one scope asset is required.");
      return;
    }
    if (scopes.some((s) => !s.assetIdentifier.trim())) {
      setError("All scope rows must have an asset identifier.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/cyber/programs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          programHandle: handle.trim(),
          description: description.trim() || undefined,
          policyMarkdown: policy.trim() || undefined,
          hasBounties,
          currency,
          scopes: scopes.map((s) => ({
            assetIdentifier: s.assetIdentifier.trim(),
            assetType: s.assetType,
            isInScope: s.isInScope,
            notes: s.notes.trim() || undefined,
            intrusiveAllowed: s.intrusiveAllowed,
          })),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to create program.");
        return;
      }
      router.push("/cyber/programs");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const inScopes = scopes.filter((s) => s.isInScope);
  const outScopes = scopes.filter((s) => !s.isInScope);

  return (
    <div className="p-6 max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground tracking-tight">
          New Target Program
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Define the scope and rules for a new security research program.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Info */}
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-foreground">
            Basic Information
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor={`${uid}-name`}
                className="block text-xs font-medium text-muted-foreground mb-1.5"
              >
                Program Name <span className="text-red-400">*</span>
              </label>
              <input
                id={`${uid}-name`}
                type="text"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="My Security Program"
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-colors"
                required
              />
            </div>
            <div>
              <label
                htmlFor={`${uid}-handle`}
                className="block text-xs font-medium text-muted-foreground mb-1.5"
              >
                Program Handle <span className="text-red-400">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                  @
                </span>
                <input
                  id={`${uid}-handle`}
                  type="text"
                  value={handle}
                  onChange={(e) => {
                    setHandleManual(true);
                    setHandle(
                      e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""),
                    );
                  }}
                  placeholder="my-program"
                  className="w-full bg-background border border-border rounded-lg pl-7 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-colors"
                  required
                  minLength={3}
                />
              </div>
            </div>
          </div>

          <div>
            <label
              htmlFor={`${uid}-desc`}
              className="block text-xs font-medium text-muted-foreground mb-1.5"
            >
              Description
            </label>
            <textarea
              id={`${uid}-desc`}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Brief description of the program..."
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 resize-none transition-colors"
            />
          </div>

          <div>
            <label
              htmlFor={`${uid}-policy`}
              className="block text-xs font-medium text-muted-foreground mb-1.5"
            >
              Policy / Rules (Markdown)
            </label>
            <textarea
              id={`${uid}-policy`}
              value={policy}
              onChange={(e) => setPolicy(e.target.value)}
              rows={5}
              placeholder="## Safe Harbor&#10;&#10;We will not pursue legal action..."
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 resize-y font-mono transition-colors"
            />
          </div>

          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <button
                type="button"
                role="switch"
                aria-checked={hasBounties}
                onClick={() => setHasBounties((v) => !v)}
                className={cn(
                  "relative w-10 h-6 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500/50",
                  hasBounties ? "bg-emerald-500" : "bg-border",
                )}
              >
                <span
                  className={cn(
                    "absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform",
                    hasBounties ? "translate-x-4" : "translate-x-0",
                  )}
                />
              </button>
              <label
                className="text-sm text-foreground cursor-pointer"
                onClick={() => setHasBounties((v) => !v)}
              >
                Has Bounties
              </label>
            </div>

            {hasBounties && (
              <div className="flex items-center gap-2">
                <label className="text-xs text-muted-foreground">
                  Currency
                </label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="bg-background border border-border rounded-lg px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                >
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                  <option value="GBP">GBP</option>
                </select>
              </div>
            )}
          </div>
        </div>

        {/* Scope Section */}
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">
              Scope Assets <span className="text-red-400">*</span>
            </h2>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => addScope(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-medium hover:bg-emerald-500/20 transition-colors"
              >
                <Plus className="size-3" /> In-Scope
              </button>
              <button
                type="button"
                onClick={() => addScope(false)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-medium hover:bg-red-500/20 transition-colors"
              >
                <Minus className="size-3" /> Out-of-Scope
              </button>
            </div>
          </div>

          {scopes.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4 border border-dashed border-border rounded-lg">
              Add at least one in-scope or out-of-scope asset.
            </p>
          )}

          {inScopes.length > 0 && (
            <div>
              <p className="text-xs font-medium text-emerald-400 uppercase tracking-wide mb-2">
                In-Scope
              </p>
              <div className="space-y-2">
                {inScopes.map((scope) => (
                  <ScopeRow
                    key={scope.id}
                    scope={scope}
                    onUpdate={(patch) => updateScope(scope.id, patch)}
                    onRemove={() => removeScope(scope.id)}
                    color="emerald"
                  />
                ))}
              </div>
            </div>
          )}

          {outScopes.length > 0 && (
            <div>
              <p className="text-xs font-medium text-red-400 uppercase tracking-wide mb-2">
                Out-of-Scope
              </p>
              <div className="space-y-2">
                {outScopes.map((scope) => (
                  <ScopeRow
                    key={scope.id}
                    scope={scope}
                    onUpdate={(patch) => updateScope(scope.id, patch)}
                    onRemove={() => removeScope(scope.id)}
                    color="red"
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="flex items-center gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400">
            <AlertCircle className="size-5 shrink-0" />
            <p className="text-sm">{error}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-cyan-500 text-white text-sm font-semibold hover:bg-cyan-600 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? "Creating..." : "Create Program"}
          </button>
          <button
            type="button"
            onClick={() => router.push("/cyber/programs")}
            className="px-5 py-2.5 rounded-lg border border-border text-muted-foreground text-sm font-medium hover:text-foreground hover:bg-accent transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

function ScopeRow({
  scope,
  onUpdate,
  onRemove,
  color,
}: {
  scope: ScopeRow;
  onUpdate: (patch: Partial<ScopeRow>) => void;
  onRemove: () => void;
  color: "emerald" | "red";
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-2 p-3 rounded-lg border",
        color === "emerald"
          ? "bg-emerald-500/5 border-emerald-500/20"
          : "bg-red-500/5 border-red-500/20",
      )}
    >
      <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-2">
        <input
          type="text"
          value={scope.assetIdentifier}
          onChange={(e) => onUpdate({ assetIdentifier: e.target.value })}
          placeholder="*.example.com or 192.168.0.0/24"
          className="bg-background border border-border rounded-lg px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
        />
        <select
          value={scope.assetType}
          onChange={(e) => onUpdate({ assetType: e.target.value })}
          className="bg-background border border-border rounded-lg px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
        >
          {ASSET_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <input
          type="text"
          value={scope.notes}
          onChange={(e) => onUpdate({ notes: e.target.value })}
          placeholder="Notes (optional)"
          className="bg-background border border-border rounded-lg px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
        />
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="p-1.5 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors mt-0.5 shrink-0"
        aria-label="Remove scope"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
