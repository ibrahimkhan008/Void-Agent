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
