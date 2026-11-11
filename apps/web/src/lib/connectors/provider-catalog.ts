import {
  CONNECTOR_PROVIDERS,
  normalizeProviderSlug,
  type ConnectorProvider,
} from "./providers-list";

const DISPLAY_NAMES: Record<ConnectorProvider, string> = {
  airtable: "Airtable",
  asana: "Asana",
  axero: "Axero",
  bitbucket: "Bitbucket",
  bookstack: "BookStack",
  canvas: "Canvas LMS",
  clickup: "ClickUp",
  coda: "Coda",
  confluence: "Confluence",
  discord: "Discord",
  discourse: "Discourse",
  document360: "Document360",
  dropbox: "Dropbox",
  "drupal-wiki": "Drupal Wiki",
  egnyte: "Egnyte",
  fireflies: "Fireflies",
  freshdesk: "Freshdesk",
  gitbook: "GitBook",
  github: "GitHub",
  gitlab: "GitLab",
  gmail: "Gmail",
  gong: "Gong",
  "google-calendar": "Google Calendar",
  "google-docs": "Google Docs",
  "google-drive": "Google Drive",
  "google-forms": "Google Forms",
  "google-keep": "Google Keep",
  "google-meet": "Google Meet",
  "google-sheets": "Google Sheets",
  "google-slides": "Google Slides",
  "google-tasks": "Google Tasks",
  guru: "Guru",
  highspot: "Highspot",
  hubspot: "HubSpot",
  jira: "Jira",
  linear: "Linear",
  loopio: "Loopio",
  mediawiki: "MediaWiki",
  notion: "Notion",
  outline: "Outline",
  outlook: "Outlook",
  productboard: "Productboard",
  salesforce: "Salesforce",
  slab: "Slab",
  slack: "Slack",
  teams: "Microsoft Teams",
  testrail: "TestRail",
  wikipedia: "Wikipedia",
  xenforo: "XenForo",
  youtube: "YouTube",
  zendesk: "Zendesk",
  zulip: "Zulip",
};

export type ConnectorAuthMode = "oauth" | "api-key" | "server-token" | "none";

export type ConnectorCatalogEntry = {
  provider: ConnectorProvider;
  name: string;
  authMode: ConnectorAuthMode;
  /** Existing upstream connection flow, when a matching Composio toolkit exists. */
  composioToolkit?: string;
  /** This API catalog does not claim to provide a direct provider OAuth flow. */
  connectionFlow:
    | "direct-oauth"
    | "api-key"
    | "composio"
    | "not-integrated"
    | "not-configured";
};

const TOKEN_PROVIDERS = new Set<string>([
  "bookstack",
  "gitbook",
  "canvas",
  "loopio",
  "discourse",
  "xenforo",
  "drupal-wiki",
  "axero",
  "zulip",
  "mediawiki",
  "fireflies",
  "testrail",
]);

const NO_AUTH_PROVIDERS = new Set<string>(["wikipedia"]);

export const CONNECTOR_PROVIDER_CATALOG: ConnectorCatalogEntry[] =
  CONNECTOR_PROVIDERS.map((provider) => {
    const authMode: ConnectorAuthMode = NO_AUTH_PROVIDERS.has(provider)
      ? "none"
      : TOKEN_PROVIDERS.has(provider)
        ? "server-token"
        : "oauth";
    return {
      provider,
      name: DISPLAY_NAMES[provider],
      authMode: provider === "freshdesk" ? "api-key" : authMode,
      composioToolkit: normalizeProviderSlug(provider),
      connectionFlow: "not-integrated",
    };
  });

/**
 * Resolve a legacy provider against the live Composio toolkit catalog.
 * This is deliberately a reported compatibility match, not a claim that
 * every source connector action has a one-to-one equivalent.
 */
export function matchComposioToolkit(
  provider: ConnectorProvider,
  availableSlugs: ReadonlySet<string>,
): string | undefined {
  const entry = CONNECTOR_PROVIDER_CATALOG.find(
    (candidate) => candidate.provider === provider,
  );
  if (!entry?.composioToolkit) return undefined;

  const normalized = new Map(
    [...availableSlugs].map((slug) => [normalizeProviderSlug(slug), slug]),
  );
  return normalized.get(normalizeProviderSlug(entry.composioToolkit));
}
