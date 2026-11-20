"use client";

import {
  CyberCopyButton,
  CyberDialog,
  SeverityBadge,
} from "@/components/cyber/cyber-ui";
import {
  AlertCircle,
  Bug,
  CheckCircle2,
  ChevronRight,
  FileText,
  Fingerprint,
  Loader2,
  Plus,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type Finding = {
  id: string;
  sessionId: string;
  title: string;
  cweId: string | null;
  cvssScore: string | null;
  severity: string;
  affectedAsset: string;
  status: string;
  reproductionSteps: string;
  proofOfConcept: string;
  impactDescription: string;
  remediationGuidance: string | null;
  verificationLog: string | null;
  createdAt: string;
};

type EvidenceItem = {
  id: string;
  evidenceType: string;
  sha256Hash: string;
  payloadBytes: string;
  capturedAt: string;
};

const STATUS_OPTIONS = [
  "candidate",
  "verified",
  "triaged",
  "reported",
  "resolved",
  "duplicate",
  "informational",
];

function AddEvidenceModal({
  findingId,
  onClose,
  onAdded,
}: {
  findingId: string;
  onClose: () => void;
  onAdded: (item: EvidenceItem) => void;
}) {
  const [evidenceType, setEvidenceType] = useState("http_trace");
  const [payloadBytes, setPayloadBytes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!payloadBytes.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/cyber/findings/${findingId}/evidence`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ evidenceType, payloadBytes }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to attach evidence");
        return;
      }
      onAdded(data.evidence);
    } catch {
      setError("Network error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <CyberDialog
      title="Attach Evidence Artifact"
      description="Sealed automatically with a cryptographic SHA-256 digest."
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">
            Evidence Type
          </label>
          <select
            value={evidenceType}
            onChange={(e) => setEvidenceType(e.target.value)}
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50"
          >
            <option value="http_trace">HTTP Request / Response Trace</option>
            <option value="poc_script">PoC Script</option>
            <option value="terminal_log">Terminal / Scanner Output</option>
            <option value="screenshot">Screenshot / Visual Proof</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">
            Artifact Payload
          </label>
          <textarea
            value={payloadBytes}
            onChange={(e) => setPayloadBytes(e.target.value)}
            required
            rows={6}
            placeholder="Paste raw HTTP trace, script, or log output..."
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50 resize-y"
          />
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-700 dark:text-red-400 text-sm">
            <AlertCircle className="size-4 shrink-0" />
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={submitting || !payloadBytes.trim()}
            className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-semibold disabled:opacity-60 transition-colors"
          >
            {submitting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Fingerprint className="size-4" />
            )}
            {submitting ? "Hashing & Sealing…" : "Seal in Evidence Vault"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-lg border border-border text-muted-foreground text-sm hover:text-foreground hover:bg-accent transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </CyberDialog>
  );
}

export default function FindingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();
  const [findingId, setFindingId] = useState<string | null>(null);
  const [finding, setFinding] = useState<Finding | null>(null);
  const [evidence, setEvidence] = useState<EvidenceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [compiling, setCompiling] = useState(false);
  const [showAddEvidence, setShowAddEvidence] = useState(false);
  const [feedbackBanner, setFeedbackBanner] = useState<string | null>(null);

  useEffect(() => {
    params.then((p) => setFindingId(p.id));
  }, [params]);

  const loadFinding = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/cyber/findings/${id}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to load finding");
        return;
      }
      setFinding(data.finding);
      setEvidence(data.evidence ?? []);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (findingId) loadFinding(findingId);
  }, [findingId, loadFinding]);

  async function handleStatusChange(newStatus: string) {
    if (!findingId || !finding) return;
    setUpdatingStatus(true);
    setFeedbackBanner(null);
    try {
      const res = await fetch(`/api/cyber/findings/${findingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (res.ok && data.finding) {
        setFinding(data.finding);
        setFeedbackBanner(`Finding status updated to "${newStatus}".`);
      }
    } finally {
      setUpdatingStatus(false);
    }
  }

  async function handleRunVerification() {
    if (!findingId) return;
    setVerifying(true);
    setFeedbackBanner(null);
    try {
      const res = await fetch(`/api/cyber/findings/${findingId}/verify`, {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok && data.finding) {
        setFinding(data.finding);
        setFeedbackBanner(
          data.verified
            ? `Verification passed — Quality Score: ${data.qualityScore}/100.`
            : `Verification completed with items needing attention (Quality Score: ${data.qualityScore}/100).`,
        );
      }
    } finally {
      setVerifying(false);
    }
  }

  async function handleCompileReport() {
    if (!findingId) return;
    setCompiling(true);
    try {
      const res = await fetch("/api/cyber/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ findingIds: [findingId], format: "markdown" }),
      });
      if (res.ok) router.push("/cyber/reports");
    } finally {
      setCompiling(false);
    }
  }

  if (loading) {
    return (
      <div className="p-6 max-w-4xl space-y-4">
        <div className="h-16 bg-muted/60 rounded-xl animate-pulse" />
        <div className="h-36 bg-muted/60 rounded-xl animate-pulse" />
        <div className="h-36 bg-muted/60 rounded-xl animate-pulse" />
      </div>
    );
  }

  if (error || !finding) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-700 dark:text-red-400">
          <AlertCircle className="size-5 shrink-0" />
          <p className="text-sm">{error ?? "Finding not found"}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl space-y-6">
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-2 text-xs text-muted-foreground"
      >
        <Link
          href="/cyber/findings"
          className="hover:text-foreground transition-colors"
        >
          Findings
        </Link>
        <ChevronRight className="size-3" />
        <span className="text-foreground truncate">{finding.title}</span>
      </nav>

      <header className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-5 border-b border-border/80">
        <div className="space-y-2 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <SeverityBadge severity={finding.severity} />
            {finding.cvssScore && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold tabular-nums bg-muted text-foreground border border-border">
                CVSS {finding.cvssScore}
              </span>
            )}
            {finding.cweId && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-mono bg-muted text-muted-foreground border border-border">
                {finding.cweId}
              </span>
            )}
          </div>
          <h1 className="text-xl font-semibold text-foreground tracking-tight">
            {finding.title}
          </h1>
          <p className="text-sm text-muted-foreground">
            Affected Asset:{" "}
            <code className="font-mono text-xs text-foreground bg-muted px-1.5 py-0.5 rounded">
              {finding.affectedAsset}
            </code>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <select
            value={finding.status}
            disabled={updatingStatus}
            onChange={(e) => handleStatusChange(e.target.value)}
            aria-label="Finding status"
            className="bg-card border border-border rounded-lg px-3 py-2 text-xs font-semibold text-foreground capitalize focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s} className="capitalize">
                {s}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={handleRunVerification}
            disabled={verifying}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-500/12 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400 text-xs font-semibold hover:bg-emerald-500/20 disabled:opacity-60 transition-colors"
          >
            {verifying ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <ShieldCheck className="size-3.5" />
            )}
            {verifying ? "Verifying…" : "Verify Finding"}
          </button>

          <button
            type="button"
            onClick={handleCompileReport}
            disabled={compiling}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-semibold disabled:opacity-60 transition-colors"
          >
            {compiling ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <FileText className="size-3.5" />
            )}
            {compiling ? "Compiling…" : "Generate Report"}
          </button>
        </div>
      </header>

      {feedbackBanner && (
        <div
          role="status"
          className="flex items-center gap-2 p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-800 dark:text-cyan-300 text-sm"
        >
          <CheckCircle2 className="size-4 shrink-0" />
          {feedbackBanner}
        </div>
      )}

      <section className="bg-card border border-border rounded-xl p-5 space-y-2">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Impact Description
        </h2>
        <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed max-w-[72ch]">
          {finding.impactDescription || "No impact description provided."}
        </p>
      </section>

      <section className="bg-card border border-border rounded-xl p-5 space-y-2">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Steps to Reproduce
        </h2>
        <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed max-w-[72ch]">
          {finding.reproductionSteps || "No reproduction steps provided."}
        </p>
      </section>

      <section className="bg-card border border-border rounded-xl p-5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Proof of Concept
          </h2>
          {finding.proofOfConcept && (
            <CyberCopyButton value={finding.proofOfConcept} label="Copy PoC" />
          )}
        </div>
        <pre className="text-xs font-mono text-foreground bg-background border border-border rounded-lg p-4 overflow-x-auto whitespace-pre-wrap">
          {finding.proofOfConcept || "# No PoC payload provided"}
        </pre>
      </section>

      {finding.remediationGuidance && (
        <section className="bg-card border border-border rounded-xl p-5 space-y-2">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Remediation Guidance
          </h2>
          <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed max-w-[72ch]">
            {finding.remediationGuidance}
          </p>
        </section>
      )}

      {finding.verificationLog && (
        <section className="bg-emerald-500/5 border border-emerald-500/25 rounded-xl p-5 space-y-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-emerald-600 dark:text-emerald-400" />
            <h2 className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wide">
              Independent Verification Log
            </h2>
          </div>
          <pre className="text-xs font-mono text-foreground whitespace-pre-wrap leading-relaxed">
            {finding.verificationLog}
          </pre>
        </section>
      )}

      <section className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Fingerprint className="size-4 text-cyan-600 dark:text-cyan-400" />
            <h2 className="text-sm font-semibold text-foreground">
              Evidence Vault ({evidence.length})
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setShowAddEvidence(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-500/12 border border-cyan-500/30 text-cyan-700 dark:text-cyan-400 text-xs font-medium hover:bg-cyan-500/20 transition-colors"
          >
            <Plus className="size-3.5" /> Add Evidence
          </button>
        </div>

        {evidence.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            <Bug className="size-6 mx-auto mb-2 opacity-60" />
            No cryptographic evidence attached yet. Attach HTTP traces, scripts,
            or terminal logs to seal them with SHA-256 hashes.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {evidence.map((item) => (
              <div key={item.id} className="p-4 space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-cyan-500/12 text-cyan-700 dark:text-cyan-400 border border-cyan-500/25 uppercase">
                    {item.evidenceType.replace("_", " ")}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono text-muted-foreground">
                      SHA-256: {item.sha256Hash.slice(0, 20)}…
                    </span>
                    <CyberCopyButton value={item.sha256Hash} label="Hash" />
                  </div>
                </div>
                <pre className="text-xs font-mono bg-background border border-border rounded-lg p-3 overflow-x-auto max-h-48 whitespace-pre-wrap">
                  {item.payloadBytes}
                </pre>
              </div>
            ))}
          </div>
        )}
      </section>

      {showAddEvidence && findingId && (
        <AddEvidenceModal
          findingId={findingId}
          onClose={() => setShowAddEvidence(false)}
          onAdded={(item) => {
            setEvidence((prev) => [item, ...prev]);
            setShowAddEvidence(false);
          }}
        />
      )}
    </div>
  );
}
