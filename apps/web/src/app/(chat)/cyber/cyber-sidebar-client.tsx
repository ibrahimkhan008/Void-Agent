"use client";

import { TIER_LABELS, TIER_STYLES } from "@/components/cyber/cyber-ui";
import { cn } from "lib/utils";
import {
  Activity,
  Bot,
  Bug,
  FileText,
  LayoutDashboard,
  Menu,
  Search,
  Shield,
  Target,
  Terminal,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

interface CyberProfile {
  accessTier: number;
  role: string;
  status: string;
  voidTrustScore: number;
}

interface CyberSidebarClientProps {
  cyberProfile: CyberProfile | null;
}

const NAV_ITEMS = [
  { label: "Cyber Chat", href: "/cyber", icon: Shield, exact: true },
  {
    label: "Dashboard",
    href: "/cyber/dashboard",
    icon: LayoutDashboard,
    exact: false,
  },
  { label: "Cyber Agents", href: "/cyber/agents", icon: Bot, exact: false },
  { label: "Programs", href: "/cyber/programs", icon: Target, exact: false },
  {
    label: "Scope Checker",
    href: "/cyber/scope-checker",
    icon: Search,
    exact: false,
  },
  { label: "Sessions", href: "/cyber/sessions", icon: Terminal, exact: false },
  { label: "Findings", href: "/cyber/findings", icon: Bug, exact: false },
  { label: "Reports", href: "/cyber/reports", icon: FileText, exact: false },
];

// Strictly Admin / Owner ONLY (never visible to regular users/researchers)
const ADMIN_NAV_ITEMS = [
  { label: "Audit Trail", href: "/cyber/audit", icon: Activity, exact: false },
  {
    label: "User Governance",
    href: "/cyber/admin/users",
    icon: Users,
    exact: false,
  },
];

function VoidTrustBar({ score }: { score: number }) {
  const pct = Math.min(Math.max(Math.round((score / 1000) * 100), 0), 100);
  const barColor =
    score < 300
      ? "bg-red-500"
      : score < 600
        ? "bg-amber-500"
        : "bg-emerald-500";
  const textColor =
    score < 300
      ? "text-red-600 dark:text-red-400"
      : score < 600
        ? "text-amber-600 dark:text-amber-400"
        : "text-emerald-600 dark:text-emerald-400";

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">
          VoidTrust
        </span>
        <span className={cn("text-xs font-semibold tabular-nums", textColor)}>
          {score}
          <span className="text-muted-foreground font-normal"> / 1000</span>
        </span>
      </div>
      <div
        className="h-1.5 w-full rounded-full bg-muted overflow-hidden"
        role="progressbar"
        aria-valuenow={score}
        aria-valuemin={0}
        aria-valuemax={1000}
        aria-label="VoidTrust reputation score"
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-300",
            barColor,
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function NavItem({
  href,
  icon: Icon,
  label,
  exact,
  onClick,
}: {
  href: string;
  icon: React.ElementType;
  label: string;
  exact: boolean;
  onClick?: () => void;
}) {
  const pathname = usePathname();
  const isActive = exact ? pathname === href : pathname.startsWith(href);

  return (
    <Link
      href={href}
      onClick={onClick}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60",
        isActive
          ? "bg-cyan-500/12 text-cyan-700 dark:text-cyan-400"
          : "text-muted-foreground hover:text-foreground hover:bg-accent/70",
      )}
    >
      <Icon
        className={cn(
          "size-4 shrink-0",
          isActive ? "text-cyan-600 dark:text-cyan-400" : "",
        )}
      />
      <span className="truncate">{label}</span>
    </Link>
  );
}

export function CyberSidebarClient({ cyberProfile }: CyberSidebarClientProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Keep `/cyber` 100% identical to `/` and `/cloud-agent` — NO extra side panel on default Cyber Chat.
  // The Cyber workspace sidebar only appears on `/cyber/dashboard` and extra feature routes.
  if (pathname === "/cyber") {
    return null;
  }

  const tierLabel = cyberProfile
    ? (TIER_LABELS[cyberProfile.accessTier] ??
      `Tier ${cyberProfile.accessTier}`)
    : "No Access";

  const tierColor = cyberProfile
    ? (TIER_STYLES[cyberProfile.accessTier] ?? TIER_STYLES[1])
    : "text-muted-foreground bg-muted border-border";

  const navItems = [
    ...NAV_ITEMS,
    ...(cyberProfile && cyberProfile.accessTier >= 3 ? ADMIN_NAV_ITEMS : []),
  ];

  const sidebarBody = (
    <div className="flex flex-col h-full">
      <div className="px-4 py-4 border-b border-border space-y-2">
        <div className="flex items-center gap-2">
          <Shield className="size-4 text-cyan-600 dark:text-cyan-400 shrink-0" />
          <span className="font-semibold text-sm text-foreground tracking-tight">
            Void Cyber
          </span>
        </div>
        <span
          className={cn(
            "inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border",
            tierColor,
          )}
        >
          {tierLabel}
        </span>
      </div>

      <nav
        aria-label="Void Cyber navigation"
        className="flex-1 overflow-y-auto px-2.5 py-3 space-y-0.5"
      >
        {navItems.map((item) => (
          <NavItem
            key={item.href}
            href={item.href}
            icon={item.icon}
            label={item.label}
            exact={item.exact}
            onClick={() => setOpen(false)}
          />
        ))}
      </nav>

      <div className="px-4 py-4 border-t border-border">
        {cyberProfile ? (
          <VoidTrustBar score={cyberProfile.voidTrustScore} />
        ) : (
          <p className="text-xs text-muted-foreground">No cyber profile</p>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Compact mobile top bar instead of floating button */}
      <div className="lg:hidden sticky top-0 z-30 flex items-center justify-between px-4 py-2.5 border-b border-border bg-card/95 backdrop-blur-xs">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            className="p-1.5 -ml-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60 transition-colors"
            aria-label="Open Void Cyber navigation"
            onClick={() => setOpen(true)}
          >
            <Menu className="size-4" />
          </button>
          <Shield className="size-4 text-cyan-600 dark:text-cyan-400" />
          <span className="text-sm font-semibold text-foreground">
            Void Cyber
          </span>
        </div>
        <span
          className={cn(
            "inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold border",
            tierColor,
          )}
        >
          {tierLabel}
        </span>
      </div>

      {/* Mobile overlay */}
      {open && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-[1px]"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Mobile drawer */}
      <aside
        className={cn(
          "lg:hidden fixed inset-y-0 left-0 z-50 w-64 bg-card border-r border-border shadow-xl transform transition-transform duration-200 flex flex-col",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="text-xs font-semibold text-muted-foreground">
            Navigation
          </span>
          <button
            type="button"
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            aria-label="Close navigation"
            onClick={() => setOpen(false)}
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="flex-1 min-h-0">{sidebarBody}</div>
      </aside>

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-56 shrink-0 h-full border-r border-border bg-card/60">
        {sidebarBody}
      </aside>
    </>
  );
}
