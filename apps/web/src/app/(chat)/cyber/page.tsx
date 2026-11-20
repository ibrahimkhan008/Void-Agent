"use client";

import {
  CyberPageHeader,
  SeverityBadge,
  StatusBadge,
  TIER_LABELS,
  TIER_STYLES,
} from "@/components/cyber/cyber-ui";
import { cn } from "lib/utils";
import {
  Activity,
  ArrowRight,
  Bug,
  Plus,
  Search,
  Shield,
  Target,
  Terminal,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

type CyberSession = {
  id: string;
  title: string;
  status: string;
  createdAt: string;
};

type CyberFinding = {
  id: string;
  title: string;
  severity: string;
  status: string;
  affectedAsset: string;
  createdAt: string;
};

type AuditEvent = {
  id: string;
  eventType: string;
  severity: string;
  timestamp: string;
};

export default function CyberCommandCenter() {
  const [profile, setProfile] = useState<{
    accessTier: number;
    role: string;
    voidTrustScore: number;
    status: string;
  } | null>(null);
  const [sessions, setSessions] = useState<CyberSession[]>([]);
  const [findings, setFindings] = useState<CyberFinding[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [programCount, setProgramCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const profRes = await fetch("/api/cyber/users/me");
        if (profRes.status === 401 || profRes.status === 403) {
          setAccessDenied(true);
          return;
        }
        const profData = await profRes.json();
        const userProfile = profData.profile ?? null;
        setProfile(userProfile);

        if (!userProfile || userProfile.status !== "active") {
          setAccessDenied(true);
          return;
        }

        const [sessRes, findRes, progRes, auditRes] = await Promise.all([
          fetch("/api/cyber/sessions?limit=5"),
          fetch("/api/cyber/findings?limit=6"),
          fetch("/api/cyber/programs?limit=50"),
          fetch("/api/cyber/audit?limit=6"),
        ]);

        if (sessRes.ok) {
          const d = await sessRes.json();
          setSessions(d.sessions ?? []);
        }
        if (findRes.ok) {
          const d = await findRes.json();
          setFindings(d.findings ?? []);
        }
        if (progRes.ok) {
          const d = await progRes.json();
          setProgramCount((d.programs ?? []).length);
        }
        if (auditRes.ok) {
          const d = await auditRes.json();
          setAuditEvents(d.events ?? []);
        }
      } catch {
        // Network error
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="p-6 max-w-5xl space-y-6">
        <div className="h-14 bg-muted/60 rounded-xl animate-pulse" />
        <div className="h-20 bg-muted/60 rounded-xl animate-pulse" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-64 bg-muted/60 rounded-xl animate-pulse" />
          <div className="h-64 bg-muted/60 rounded-xl animate-pulse" />
        </div>
      </div>
    );
  }

  if (accessDenied || !profile) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[60vh] p-8 text-center">
        <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 mb-4">
          <Shield className="size-8 text-red-600 dark:text-red-400" />
        </div>
        <h1 className="text-xl font-semibold text-foreground mb-2">
          Void Cyber Access Required
        </h1>
        <p className="text-sm text-muted-foreground max-w-md mb-6">
          {profile?.status && profile.status !== "active"
            ? `Your researcher account is currently ${profile.status}. Contact a Void Cyber administrator to review your access.`
            : "Void Cyber is restricted to authorized internal security researchers and administrators."}
        </p>
        <div className="bg-card border border-border rounded-xl p-4 text-left max-w-sm w-full space-y-2">
          <p className="text-xs font-semibold text-foreground">
            How to request access
          </p>
          <ol className="text-xs text-muted-foreground space-y-1.5 list-decimal list-inside">
            <li>Contact your Void Cyber Tier 3 administrator</li>
            <li>Request an internal Researcher or Auditor tier assignment</li>
            <li>Reload this page once your account has been approved</li>
          </ol>
        </div>
      </div>
    );
  }

  const activeSessions = sessions.filter((s) => s.status === "active");
  const criticalOrHigh = findings.filter(
    (f) => f.severity === "critical" || f.severity === "high",
  ).length;
  const verifiedFindings = findings.filter(
    (f) => f.status === "verified" || f.status === "resolved",
  ).length;

  return (
    <div className="p-6 max-w-5xl space-y-6">
      <CyberPageHeader
        title="Command Center"
        description="Scope-enforced security research operations, findings verification, and behavioral audit telemetry."
        actions={
          <>
            <Link
              href="/cyber/scope-checker"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-card border border-border text-sm font-medium text-foreground hover:bg-accent transition-colors"
            >
              <Search className="size-4 text-muted-foreground" />
              Check Scope
            </Link>
            <Link
              href="/cyber/sessions"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-medium transition-colors"
            >
              <Plus className="size-4" />
              New Session
            </Link>
          </>
        }
      />

      {/* Unified Telemetry Strip */}
      <section
        aria-label="Operational metrics"
        className="bg-card border border-border rounded-xl grid grid-cols-2 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-border"
      >
        <div className="p-4">
          <p className="text-xs text-muted-foreground">Active Sessions</p>
          <p className="text-2xl font-semibold text-foreground tabular-nums mt-1">
            {activeSessions.length}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {sessions.length} recent total
          </p>
        </div>
        <div className="p-4">
          <p className="text-xs text-muted-foreground">Target Programs</p>
          <p className="text-2xl font-semibold text-foreground tabular-nums mt-1">
            {programCount}
          </p>
          <Link
            href="/cyber/programs"
            className="text-[11px] text-cyan-600 dark:text-cyan-400 hover:underline mt-0.5 inline-block"
          >
            Manage scopes
          </Link>
        </div>
        <div className="p-4">
          <p className="text-xs text-muted-foreground">Findings Logged</p>
          <div className="flex items-baseline gap-2 mt-1">
            <p className="text-2xl font-semibold text-foreground tabular-nums">
              {findings.length}
            </p>
            {criticalOrHigh > 0 && (
              <span className="text-xs font-medium text-red-600 dark:text-red-400">
                {criticalOrHigh} high/crit
              </span>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {verifiedFindings} verified
          </p>
        </div>
        <div className="p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">VoidTrust</p>
            <span
              className={cn(
                "px-1.5 py-0.5 rounded text-[10px] font-semibold border",
                TIER_STYLES[profile.accessTier] ?? TIER_STYLES[1],
              )}
            >
              {TIER_LABELS[profile.accessTier] ?? `Tier ${profile.accessTier}`}
            </span>
          </div>
          <p className="text-2xl font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums mt-1">
            {profile.voidTrustScore}
            <span className="text-xs font-normal text-muted-foreground">
              /1000
            </span>
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5 capitalize">
            Status: {profile.status}
          </p>
        </div>
      </section>

      {/* Main Operational Split */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Active Sessions */}
        <section className="bg-card border border-border rounded-xl overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Terminal className="size-4 text-cyan-600 dark:text-cyan-400" />
              <h2 className="text-sm font-semibold text-foreground">
                Recent Sessions
              </h2>
            </div>
            <Link
              href="/cyber/sessions"
              className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 transition-colors"
            >
              View all <ArrowRight className="size-3" />
            </Link>
          </div>
          {sessions.length === 0 ? (
            <div className="p-8 text-center flex-1 flex flex-col items-center justify-center">
              <Target className="size-7 text-muted-foreground mb-2 opacity-60" />
              <p className="text-sm font-medium text-foreground mb-1">
                No research sessions yet
              </p>
              <p className="text-xs text-muted-foreground mb-4 max-w-xs">
                Create a target program with in-scope assets, then open a
                workspace session.
              </p>
              <Link
                href="/cyber/programs/new"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-500/12 border border-cyan-500/30 text-cyan-700 dark:text-cyan-400 text-xs font-medium hover:bg-cyan-500/20 transition-colors"
              >
                <Plus className="size-3.5" /> Create Program
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {sessions.map((s) => (
                <Link
                  key={s.id}
                  href={`/cyber/sessions/${s.id}`}
                  className="px-4 py-3 flex items-center justify-between gap-3 hover:bg-accent/40 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {s.title}
                    </p>
                    <p className="text-xs text-muted-foreground tabular-nums mt-0.5">
                      {new Date(s.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <StatusBadge
                    status={s.status}
                    pulse={s.status === "active"}
                  />
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* Recent Findings */}
        <section className="bg-card border border-border rounded-xl overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bug className="size-4 text-cyan-600 dark:text-cyan-400" />
              <h2 className="text-sm font-semibold text-foreground">
                Recent Findings
              </h2>
            </div>
            <Link
              href="/cyber/findings"
              className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 transition-colors"
            >
              View all <ArrowRight className="size-3" />
            </Link>
          </div>
          {findings.length === 0 ? (
            <div className="p-8 text-center flex-1 flex flex-col items-center justify-center">
              <Bug className="size-7 text-muted-foreground mb-2 opacity-60" />
              <p className="text-sm font-medium text-foreground mb-1">
                No vulnerabilities logged
              </p>
              <p className="text-xs text-muted-foreground max-w-xs">
                Document findings inside any workspace to verify scope, seal
                SHA-256 evidence, and compile reports.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {findings.map((finding) => (
                <Link
                  key={finding.id}
                  href={`/cyber/findings/${finding.id}`}
                  className="px-4 py-3 flex items-center justify-between gap-3 hover:bg-accent/40 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {finding.title}
                    </p>
                    <p className="text-xs text-muted-foreground font-mono truncate mt-0.5">
                      {finding.affectedAsset}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <SeverityBadge severity={finding.severity} />
                    <StatusBadge status={finding.status} />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Audit Activity Feed */}
      <section className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="size-4 text-cyan-600 dark:text-cyan-400" />
            <h2 className="text-sm font-semibold text-foreground">
              Recent Security Audit Events
            </h2>
          </div>
          <Link
            href="/cyber/audit"
            className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 transition-colors"
          >
            Full audit log <ArrowRight className="size-3" />
          </Link>
        </div>
        {auditEvents.length === 0 ? (
          <p className="px-4 py-6 text-xs text-muted-foreground text-center">
            No audit events recorded yet. Run a pre-flight scope check to see
            live enforcement logs.
          </p>
        ) : (
          <div className="divide-y divide-border">
            {auditEvents.map((ev) => (
              <div
                key={ev.id}
                className="px-4 py-2.5 flex items-center justify-between gap-3 text-xs"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <StatusBadge status={ev.severity} />
                  <code className="font-mono text-foreground truncate">
                    {ev.eventType}
                  </code>
                </div>
                <time className="text-muted-foreground tabular-nums shrink-0">
                  {new Date(ev.timestamp).toLocaleString()}
                </time>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
