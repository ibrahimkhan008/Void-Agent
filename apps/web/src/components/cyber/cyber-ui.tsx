"use client";

import { cn } from "lib/utils";
import { Check, Copy, X } from "lucide-react";
import { useEffect, useId, useState } from "react";

export const SEVERITY_STYLES: Record<string, string> = {
  critical: "bg-red-500/12 text-red-700 dark:text-red-400 border-red-500/30",
  high: "bg-orange-500/12 text-orange-700 dark:text-orange-400 border-orange-500/30",
  medium:
    "bg-amber-500/12 text-amber-700 dark:text-amber-400 border-amber-500/30",
  low: "bg-blue-500/12 text-blue-700 dark:text-blue-400 border-blue-500/30",
  info: "bg-muted text-muted-foreground border-border",
};

export const STATUS_STYLES: Record<string, string> = {
  active:
    "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  verified:
    "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  resolved:
    "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  confirmed:
    "bg-cyan-500/12 text-cyan-700 dark:text-cyan-400 border-cyan-500/30",
  triaged: "bg-foreground/8 text-foreground border-foreground/20",
  reported:
    "bg-blue-500/12 text-blue-700 dark:text-blue-400 border-blue-500/30",
  paused:
    "bg-amber-500/12 text-amber-700 dark:text-amber-400 border-amber-500/30",
  warning:
    "bg-amber-500/12 text-amber-700 dark:text-amber-400 border-amber-500/30",
  suspended: "bg-red-500/12 text-red-700 dark:text-red-400 border-red-500/30",
  breach: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/40",
  revoked: "bg-muted text-muted-foreground border-border",
  completed: "bg-muted text-muted-foreground border-border",
  candidate: "bg-muted text-muted-foreground border-border",
  duplicate:
    "bg-orange-500/12 text-orange-700 dark:text-orange-400 border-orange-500/30",
  informational: "bg-muted text-muted-foreground border-border",
  info: "bg-muted text-muted-foreground border-border",
};

export const TIER_STYLES: Record<number, string> = {
  1: "bg-blue-500/12 text-blue-700 dark:text-blue-400 border-blue-500/30",
  2: "bg-cyan-500/12 text-cyan-700 dark:text-cyan-400 border-cyan-500/30",
  3: "bg-foreground/8 text-foreground border-foreground/20",
};

export const TIER_LABELS: Record<number, string> = {
  1: "Tier 1 · Auditor",
  2: "Tier 2 · Researcher",
  3: "Tier 3 · Admin",
};

export function SeverityBadge({
  severity,
  className,
}: {
  severity: string;
  className?: string;
}) {
  const key = severity.toLowerCase();
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border capitalize tracking-tight",
        SEVERITY_STYLES[key] ?? SEVERITY_STYLES.info,
        className,
      )}
    >
      {severity}
    </span>
  );
}

export function StatusBadge({
  status,
  pulse = false,
  className,
}: {
  status: string;
  pulse?: boolean;
  className?: string;
}) {
  const key = status.toLowerCase();
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold border capitalize tracking-tight",
        STATUS_STYLES[key] ?? STATUS_STYLES.candidate,
        className,
      )}
    >
      {pulse && (
        <span
          className="size-1.5 rounded-full bg-emerald-500 animate-pulse"
          aria-hidden="true"
        />
      )}
      {status}
    </span>
  );
}

export function CyberPageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-border/80">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold text-foreground tracking-tight text-balance">
          {title}
        </h1>
        {description && (
          <p className="text-sm text-muted-foreground mt-1 max-w-[68ch]">
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {actions}
        </div>
      )}
    </header>
  );
}

export function CyberDialog({
  title,
  description,
  onClose,
  maxWidth = "max-w-lg",
  headerActions,
  children,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  maxWidth?: string;
  headerActions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const titleId = useId();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] flex items-center justify-center p-4 animate-in fade-in duration-150"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          "bg-card border border-border rounded-xl shadow-2xl w-full max-h-[88vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150",
          maxWidth,
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-border shrink-0">
          <div className="min-w-0">
            <h2
              id={titleId}
              className="text-base font-semibold text-foreground tracking-tight"
            >
              {title}
            </h2>
            {description && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {description}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {headerActions}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close dialog"
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60 transition-colors"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
        <div className="p-5 overflow-y-auto flex-1 min-h-0">{children}</div>
      </div>
    </div>
  );
}

export function CyberCopyButton({
  value,
  label = "Copy",
  className,
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard unavailable
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border border-border bg-background text-muted-foreground hover:text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60 transition-colors",
        className,
      )}
    >
      {copied ? (
        <>
          <Check className="size-3 text-emerald-500" />
          Copied
        </>
      ) : (
        <>
          <Copy className="size-3" />
          {label}
        </>
      )}
    </button>
  );
}

export function CyberSkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden divide-y divide-border">
      <div className="h-10 bg-muted/40" />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="px-4 py-3.5 flex items-center gap-4">
          <div className="h-4 bg-muted rounded w-2/5 animate-pulse" />
          <div className="h-4 bg-muted rounded w-16 animate-pulse" />
          <div className="h-4 bg-muted rounded w-20 animate-pulse hidden sm:block" />
          <div className="h-4 bg-muted rounded w-24 animate-pulse ml-auto hidden md:block" />
        </div>
      ))}
    </div>
  );
}
