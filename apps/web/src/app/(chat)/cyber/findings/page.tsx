"use client";

import {
  CyberDialog,
  CyberPageHeader,
  CyberSkeletonTable,
  SeverityBadge,
  StatusBadge,
} from "@/components/cyber/cyber-ui";
import {
  AlertCircle,
  Bug,
  ChevronDown,
  Filter,
  Loader2,
  Plus,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type Finding = {
  id: string;
  title: string;
  severity: string;
  status: string;
  affectedAsset: string;
  cvssScore: string | null;
  createdAt: string;
  sessionId: string | null;
};

type SessionOption = { id: string; title: string };

const SEVERITIES = ["critical", "high", "medium", "low", "info"];
const STATUSES = [
  "candidate",
  "verified",
  "triaged",
  "reported",
  "resolved",
  "duplicate",
  "informational",
];

function ReportFindingModal({
  sessions,
  onClose,
  onCreated,
}: {
  sessions: SessionOption[];
  onClose: () => void;
  onCreated: (f: Finding) => void;
}) {
  const [sessionId, setSessionId] = useState(sessions[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [severity, setSeverity] = useState("medium");
  const [affectedAsset, setAffectedAsset] = useState("");
  const [cweId, setCweId] = useState("");
  const [cvssScore, setCvssScore] = useState("");
  const [reproductionSteps, setReproductionSteps] = useState("");
  const [proofOfConcept, setProofOfConcept] = useState("");
  const [impactDescription, setImpactDescription] = useState("");
  const [remediationGuidance, setRemediationGuidance] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/cyber/findings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: sessionId || null,
          title,
          severity,
          affectedAsset,
          cweId: cweId || undefined,
          cvssScore: cvssScore || undefined,
          reproductionSteps,
          proofOfConcept,
          impactDescription,
          remediationGuidance: remediationGuidance || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to create finding");
        return;
      }
      onCreated(data.finding);
    } catch {
      setError("Network error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <CyberDialog
      title="Report Security Finding"
      description="Document a vulnerability for independent verification and report compilation."
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Research Session (optional)
          </label>
          <select
            value={sessionId}
            onChange={(e) => setSessionId(e.target.value)}
            required
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <option value="">Standalone / Free-form finding</option>
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        </div>

        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          placeholder="Finding title *"
          className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        />

        <div className="grid grid-cols-2 gap-3">
          <select
            value={severity}
            onChange={(e) => setSeverity(e.target.value)}
            aria-label="Severity"
            className="bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            {SEVERITIES.map((s) => (
              <option key={s} value={s} className="capitalize">
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={affectedAsset}
            onChange={(e) => setAffectedAsset(e.target.value)}
            required
            placeholder="Affected asset *"
            className="bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <input
            type="text"
            value={cweId}
            onChange={(e) => setCweId(e.target.value)}
            placeholder="CWE (e.g. CWE-89)"
            className="bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          />
          <input
            type="text"
            value={cvssScore}
            onChange={(e) => setCvssScore(e.target.value)}
            placeholder="CVSS (e.g. 8.2)"
            className="bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          />
        </div>

        <textarea
          value={reproductionSteps}
          onChange={(e) => setReproductionSteps(e.target.value)}
          required
          rows={3}
          placeholder="Step-by-step reproduction instructions *"
          className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 resize-none"
        />

        <textarea
          value={proofOfConcept}
          onChange={(e) => setProofOfConcept(e.target.value)}
          required
          rows={3}
          placeholder="Proof of Concept / HTTP request or payload *"
          className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 resize-none"
        />

        <textarea
          value={impactDescription}
          onChange={(e) => setImpactDescription(e.target.value)}
          required
          rows={2}
          placeholder="Security & business impact *"
          className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 resize-none"
        />

        <textarea
          value={remediationGuidance}
          onChange={(e) => setRemediationGuidance(e.target.value)}
          rows={2}
          placeholder="Recommended remediation (optional)"
          className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 resize-none"
        />

        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-700 dark:text-red-400 text-sm">
            <AlertCircle className="size-4 shrink-0" />
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-semibold disabled:opacity-60 transition-colors"
        >
          {submitting ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Bug className="size-4" />
          )}
          {submitting ? "Saving…" : "Save Finding"}
        </button>
      </form>
    </CyberDialog>
  );
}

export default function FindingsPage() {
  const router = useRouter();
  const [findings, setFindings] = useState<Finding[]>([]);
  const [sessions, setSessions] = useState<SessionOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showReportModal, setShowReportModal] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (severityFilter) params.set("severity", severityFilter);
    if (statusFilter) params.set("status", statusFilter);

    try {
      const [findRes, sessRes] = await Promise.all([
        fetch(`/api/cyber/findings?${params}`),
        fetch("/api/cyber/sessions?limit=50"),
      ]);
      if (!findRes.ok) {
        const data = await findRes.json().catch(() => ({}));
        setError(data.error ?? "Failed to load findings");
        return;
      }
      const data = await findRes.json();
      setFindings(data.findings ?? []);
      if (sessRes.ok) {
        const sData = await sessRes.json();
        setSessions(sData.sessions ?? []);
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, [severityFilter, statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="p-6 max-w-5xl space-y-6">
      <CyberPageHeader
        title="Security Findings"
        description="Track candidate vulnerabilities, run independent verification, and seal cryptographic evidence."
        actions={
          <button
            type="button"
            onClick={() => setShowReportModal(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-medium transition-colors"
          >
            <Plus className="size-4" /> Report Finding
          </button>
        }
      />

      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Filter className="size-3.5" />
          <span>Filter:</span>
        </div>
        <div className="relative">
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            aria-label="Filter by severity"
            className="appearance-none bg-card border border-border rounded-lg pl-3 pr-7 py-1.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <option value="">All Severities</option>
            {SEVERITIES.map((s) => (
              <option key={s} value={s} className="capitalize">
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 size-3 text-muted-foreground pointer-events-none" />
        </div>
        <div className="relative">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filter by status"
            className="appearance-none bg-card border border-border rounded-lg pl-3 pr-7 py-1.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <option value="">All Statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s} className="capitalize">
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 size-3 text-muted-foreground pointer-events-none" />
        </div>
      </div>

      {loading && <CyberSkeletonTable rows={5} />}

      {!loading && error && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-700 dark:text-red-400">
          <AlertCircle className="size-5 shrink-0" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      {!loading && !error && findings.length === 0 && (
        <div className="bg-card border border-dashed border-border rounded-xl py-16 px-6 text-center">
          <Bug className="size-8 text-muted-foreground mx-auto mb-3 opacity-60" />
          <h2 className="text-base font-semibold text-foreground mb-1">
            No findings match your filter
          </h2>
          <p className="text-muted-foreground text-sm max-w-sm mx-auto mb-6">
            Document vulnerabilities discovered during authorized research
            sessions.
          </p>
          <button
            type="button"
            onClick={() => setShowReportModal(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-medium transition-colors"
          >
            <Plus className="size-4" /> Report First Finding
          </button>
        </div>
      )}

      {!loading && !error && findings.length > 0 && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Title
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Severity
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden md:table-cell">
                  Status
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden lg:table-cell">
                  CVSS
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden lg:table-cell">
                  Found
                </th>
              </tr>
            </thead>
            <tbody>
              {findings.map((finding) => (
                <tr
                  key={finding.id}
                  className="border-b border-border last:border-0 hover:bg-accent/40 transition-colors cursor-pointer"
                  onClick={() => router.push(`/cyber/findings/${finding.id}`)}
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/cyber/findings/${finding.id}`}
                      className="font-medium text-foreground hover:text-foreground transition-colors"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {finding.title}
                    </Link>
                    <p className="text-xs text-muted-foreground font-mono mt-0.5 truncate max-w-xs">
                      {finding.affectedAsset}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <SeverityBadge severity={finding.severity} />
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <StatusBadge status={finding.status} />
                  </td>
                  <td className="px-4 py-3 text-muted-foreground tabular-nums hidden lg:table-cell">
                    {finding.cvssScore ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground tabular-nums hidden lg:table-cell">
                    {new Date(finding.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showReportModal && (
        <ReportFindingModal
          sessions={sessions}
          onClose={() => setShowReportModal(false)}
          onCreated={(f) => {
            setShowReportModal(false);
            router.push(`/cyber/findings/${f.id}`);
          }}
        />
      )}
    </div>
  );
}
