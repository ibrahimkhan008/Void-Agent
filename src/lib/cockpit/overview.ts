export type CockpitConnectionStatus = {
  connected: boolean;
  lastTestedAt: string | null;
  lastTestOk: boolean | null;
  canManage: boolean;
};

export type CockpitConnectionState =
  | "ready"
  | "needs-attention"
  | "connected-untested"
  | "not-connected"
  | "unavailable";

export type CockpitProviderSummary = {
  id: string;
  name: string;
  description: string;
  href: string;
  statusEndpoint: string;
};

export const COCKPIT_PROVIDERS: CockpitProviderSummary[] = [
  {
    id: "stripe",
    name: "Stripe",
    description:
      "Account balances, subscription revenue, payments, and payouts.",
    href: "/cockpit/stripe",
    statusEndpoint: "/api/cockpit/stripe/connection",
  },
  {
    id: "website",
    name: "Website analytics",
    description: "Traffic, acquisition channels, and marketing performance.",
    href: "/cockpit/website",
    statusEndpoint: "/api/cockpit/website/connection",
  },
  {
    id: "vercel",
    name: "Vercel deployments",
    description: "Production deployment health and recent errors.",
    href: "/cockpit/vercel",
    statusEndpoint: "/api/cockpit/vercel/connection",
  },
  {
    id: "revolut",
    name: "Revolut Business",
    description: "Read-only business balances and recent transactions.",
    href: "/cockpit/revolut",
    statusEndpoint: "/api/cockpit/revolut/connection",
  },
  {
    id: "superlog",
    name: "Superlog incidents",
    description: "Read-only incidents, alerts, and service error summaries.",
    href: "/cockpit/superlog",
    statusEndpoint: "/api/cockpit/superlog/connection",
  },
  {
    id: "seo",
    name: "Search performance",
    description: "DataForSEO domain, keyword, and backlink summaries.",
    href: "/cockpit/seo",
    statusEndpoint: "/api/cockpit/seo/connection",
  },
];

export function classifyCockpitConnection(
  status: CockpitConnectionStatus | null,
): CockpitConnectionState {
  if (!status) return "unavailable";
  if (!status.connected) return "not-connected";
  if (status.lastTestOk === true) return "ready";
  if (status.lastTestOk === false) return "needs-attention";
  return "connected-untested";
}

export function parseCockpitConnectionStatus(
  value: unknown,
): CockpitConnectionStatus | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.connected !== "boolean") return null;
  if (record.lastTestedAt !== null && typeof record.lastTestedAt !== "string")
    return null;
  if (record.lastTestOk !== null && typeof record.lastTestOk !== "boolean")
    return null;
  if (typeof record.canManage !== "boolean") return null;
  return {
    connected: record.connected,
    lastTestedAt: record.lastTestedAt,
    lastTestOk: record.lastTestOk,
    canManage: record.canManage,
  };
}

export type CockpitOperationalAlert = {
  id: string;
  provider: "vercel" | "superlog";
  title: string;
  detail: string;
  occurredAt: string | null;
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function shortText(value: unknown, fallback: string, limit = 160) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, limit)
    : fallback;
}

/** Produces a bounded, read-only operational feed from existing Cockpit APIs. */
export function buildCockpitOperationalAlerts(
  vercel: unknown,
  superlog: unknown,
): CockpitOperationalAlert[] {
  const alerts: CockpitOperationalAlert[] = [];
  const projects = record(vercel)?.projects;
  if (Array.isArray(projects)) {
    for (const item of projects.slice(0, 20)) {
      const project = record(item);
      const deploy = record(project?.deploy);
      if (deploy?.state !== "ERROR") continue;
      const key = shortText(deploy.id, "latest");
      const label = shortText(project?.label, "Project");
      alerts.push({
        id: `vercel:${key}`,
        provider: "vercel",
        title: `Deployment failed: ${label}`,
        detail: `The latest production deployment for ${label} ended in ERROR.`,
        occurredAt:
          typeof deploy.createdAt === "string" ? deploy.createdAt : null,
      });
    }
  }

  const incidents = record(superlog)?.incidents;
  if (Array.isArray(incidents)) {
    for (const item of incidents.slice(0, 20)) {
      const incident = record(item);
      if (!incident) continue;
      const id = shortText(incident.id, "");
      if (!id) continue;
      const title = shortText(incident.title, "Open incident");
      const service = shortText(incident.service, "");
      const severity = shortText(incident.severity, "");
      alerts.push({
        id: `superlog:${id}`,
        provider: "superlog",
        title: `Open incident: ${title}`,
        detail:
          [
            service && `Service: ${service}`,
            severity && `Severity: ${severity}`,
          ]
            .filter(Boolean)
            .join(" · ") || "An incident is currently open.",
        occurredAt:
          typeof incident.startedAt === "string" ? incident.startedAt : null,
      });
    }
  }
  return alerts.slice(0, 30);
}
