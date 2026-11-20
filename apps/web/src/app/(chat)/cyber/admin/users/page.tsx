"use client";

import {
  CyberDialog,
  CyberPageHeader,
  CyberSkeletonTable,
  StatusBadge,
  TIER_LABELS,
  TIER_STYLES,
} from "@/components/cyber/cyber-ui";
import { cn } from "lib/utils";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Loader2,
  Plus,
  Shield,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";

type Researcher = {
  userId: string;
  email: string | null;
  name: string | null;
  accessTier: number;
  role: string;
  status: string;
  voidTrustScore: number;
  mfaEnforced: boolean;
  createdAt: string;
};

function GrantAccessModal({
  onClose,
  onGranted,
}: {
  onClose: () => void;
  onGranted: (r: Researcher) => void;
}) {
  const [identifier, setIdentifier] = useState("");
  const [accessTier, setAccessTier] = useState(2);
  const [role, setRole] = useState("researcher");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!identifier.trim()) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/cyber/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier: identifier.trim(),
          accessTier,
          role,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to grant access");
        return;
      }
      onGranted(data.researcher);
    } catch {
      setError("Network error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <CyberDialog
      title="Grant Cyber Access"
      description="Authorize an internal user account by email address or UUID."
      onClose={onClose}
      maxWidth="max-w-md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">
            User Email or UUID *
          </label>
          <input
            type="text"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            required
            placeholder="researcher@company.com or user UUID"
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              Access Tier
            </label>
            <div className="relative">
              <select
                value={accessTier}
                onChange={(e) => setAccessTier(Number(e.target.value))}
                className="w-full appearance-none bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50 pr-8"
              >
                {[1, 2, 3].map((tier) => (
                  <option key={tier} value={tier}>
                    {TIER_LABELS[tier]}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              Role
            </label>
            <div className="relative">
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full appearance-none bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50 pr-8"
              >
                <option value="researcher">Researcher</option>
                <option value="auditor">Auditor</option>
                <option value="admin">Admin</option>
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
            </div>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-700 dark:text-red-400 text-sm">
            <AlertCircle className="size-4 shrink-0" />
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting || !identifier.trim()}
          className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-semibold disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          {submitting ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Shield className="size-4" />
          )}
          {submitting ? "Granting…" : "Grant Access"}
        </button>
      </form>
    </CyberDialog>
  );
}

export default function AdminUsersPage() {
  const [researchers, setResearchers] = useState<Researcher[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showGrant, setShowGrant] = useState(false);
  const [updating, setUpdating] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/cyber/users")
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data.error ?? "Access denied or failed to load");
          return;
        }
        const data = await res.json();
        setResearchers(data.researchers ?? []);
      })
      .catch(() => setError("Network error"))
      .finally(() => setLoading(false));
  }, []);

  async function toggleStatus(researcher: Researcher) {
    const newStatus = researcher.status === "active" ? "suspended" : "active";
    setUpdating(researcher.userId);
    try {
      const res = await fetch(`/api/cyber/users/${researcher.userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        setResearchers((prev) =>
          prev.map((r) =>
            r.userId === researcher.userId ? { ...r, status: newStatus } : r,
          ),
        );
      }
    } finally {
      setUpdating(null);
    }
  }

  async function updateTier(researcher: Researcher, tier: number) {
    setUpdating(researcher.userId);
    try {
      const res = await fetch(`/api/cyber/users/${researcher.userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessTier: tier }),
      });
      if (res.ok) {
        setResearchers((prev) =>
          prev.map((r) =>
            r.userId === researcher.userId ? { ...r, accessTier: tier } : r,
          ),
        );
      }
    } finally {
      setUpdating(null);
    }
  }

  return (
    <div className="p-6 max-w-5xl space-y-6">
      <CyberPageHeader
        title="User Governance"
        description="Manage internal researcher access tiers, account status, and VoidTrust scores."
        actions={
          <button
            type="button"
            onClick={() => setShowGrant(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-medium transition-colors"
          >
            <Plus className="size-4" /> Grant Access
          </button>
        }
      />

      {loading && <CyberSkeletonTable rows={4} />}

      {!loading && error && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-700 dark:text-red-400">
          <AlertCircle className="size-5 shrink-0" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      {!loading && !error && researchers.length === 0 && (
        <div className="bg-card border border-dashed border-border rounded-xl py-16 px-6 text-center">
          <Users className="size-8 text-muted-foreground mx-auto mb-3 opacity-60" />
          <h2 className="text-base font-semibold text-foreground mb-1">
            No researchers provisioned
          </h2>
          <p className="text-muted-foreground text-sm max-w-sm mx-auto mb-6">
            Grant access to internal security engineers and auditors to enable
            their Void Cyber workspaces.
          </p>
          <button
            type="button"
            onClick={() => setShowGrant(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-medium transition-colors"
          >
            <Plus className="size-4" /> Grant First Access
          </button>
        </div>
      )}

      {!loading && !error && researchers.length > 0 && (
        <div className="bg-card border border-border rounded-xl overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                {[
                  "Researcher",
                  "Role",
                  "Tier",
                  "Status",
                  "VoidTrust",
                  "MFA",
                  "Actions",
                ].map((h) => (
                  <th
                    key={h}
                    className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {researchers.map((r) => (
                <tr
                  key={r.userId}
                  className="border-b border-border last:border-0 hover:bg-accent/40 transition-colors"
                >
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">
                      {r.name || r.email || r.userId.slice(0, 12)}
                    </p>
                    {r.email && (
                      <p className="text-xs text-muted-foreground">{r.email}</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-foreground capitalize">
                      {r.role}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="relative inline-block">
                      <select
                        value={r.accessTier}
                        onChange={(e) => updateTier(r, Number(e.target.value))}
                        disabled={updating === r.userId}
                        aria-label={`Access tier for ${r.email ?? r.userId}`}
                        className={cn(
                          "appearance-none pl-2.5 pr-6 py-1 rounded-md text-xs font-semibold border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50 disabled:opacity-50 cursor-pointer",
                          TIER_STYLES[r.accessTier] ?? TIER_STYLES[1],
                        )}
                      >
                        {[1, 2, 3].map((tier) => (
                          <option key={tier} value={tier}>
                            {TIER_LABELS[tier]}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 size-3 pointer-events-none opacity-60" />
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge
                      status={r.status}
                      pulse={r.status === "active"}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        "text-sm font-semibold tabular-nums",
                        r.voidTrustScore >= 600
                          ? "text-emerald-600 dark:text-emerald-400"
                          : r.voidTrustScore >= 300
                            ? "text-amber-600 dark:text-amber-400"
                            : "text-red-600 dark:text-red-400",
                      )}
                    >
                      {r.voidTrustScore}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {r.mfaEnforced ? (
                      <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => toggleStatus(r)}
                      disabled={updating === r.userId}
                      className={cn(
                        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors disabled:opacity-50",
                        r.status === "active"
                          ? "bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-400 hover:bg-red-500/20"
                          : "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/20",
                      )}
                    >
                      {updating === r.userId && (
                        <Loader2 className="size-3 animate-spin" />
                      )}
                      {r.status === "active" ? "Suspend" : "Activate"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showGrant && (
        <GrantAccessModal
          onClose={() => setShowGrant(false)}
          onGranted={(r) => {
            setResearchers((prev) => {
              const exists = prev.some((x) => x.userId === r.userId);
              return exists
                ? prev.map((x) => (x.userId === r.userId ? r : x))
                : [r, ...prev];
            });
            setShowGrant(false);
          }}
        />
      )}
    </div>
  );
}
