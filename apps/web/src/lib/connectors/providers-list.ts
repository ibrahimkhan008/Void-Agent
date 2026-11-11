/** Provider ids retained from the original Void-Agent connector catalog. */
export const BASE_OAUTH_PROVIDERS = [
  "gmail",
  "google-drive",
  "google-calendar",
  "google-docs",
  "google-forms",
  "google-keep",
  "google-meet",
  "google-sheets",
  "google-slides",
  "google-tasks",
  "youtube",
  "outlook",
  "slack",
  "notion",
  "github",
] as const;

export const NEW_OAUTH_PROVIDERS = [
  "google-docs",
  "google-forms",
  "google-keep",
  "google-meet",
  "google-sheets",
  "google-slides",
  "google-tasks",
  "youtube",
  "confluence",
  "jira",
  "linear",
  "asana",
  "clickup",
  "productboard",
  "testrail",
  "coda",
  "outline",
  "slab",
  "guru",
  "highspot",
  "document360",
  "gitlab",
  "bitbucket",
  "dropbox",
  "zendesk",
  "freshdesk",
  "salesforce",
  "hubspot",
  "airtable",
  "gong",
  "egnyte",
  "teams",
  "discord",
] as const;

export const TOKEN_PROVIDERS = [
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
] as const;

export const PUBLIC_PROVIDERS = ["wikipedia"] as const;

export const CONNECTOR_PROVIDERS = [
  "airtable",
  "asana",
  "axero",
  "bitbucket",
  "bookstack",
  "canvas",
  "clickup",
  "coda",
  "confluence",
  "discord",
  "discourse",
  "document360",
  "dropbox",
  "drupal-wiki",
  "egnyte",
  "fireflies",
  "freshdesk",
  "gitbook",
  "github",
  "gitlab",
  "gmail",
  "gong",
  "google-calendar",
  "google-docs",
  "google-drive",
  "google-forms",
  "google-keep",
  "google-meet",
  "google-sheets",
  "google-slides",
  "google-tasks",
  "guru",
  "highspot",
  "hubspot",
  "jira",
  "linear",
  "loopio",
  "mediawiki",
  "notion",
  "outline",
  "outlook",
  "productboard",
  "salesforce",
  "slab",
  "slack",
  "teams",
  "testrail",
  "wikipedia",
  "xenforo",
  "youtube",
  "zendesk",
  "zulip",
] as const;

export type ConnectorProvider = (typeof CONNECTOR_PROVIDERS)[number];

export function normalizeProviderSlug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const CONNECTOR_PROVIDER_SET: ReadonlySet<string> = new Set(
  CONNECTOR_PROVIDERS,
);

export function isConnectorProvider(value: string): value is ConnectorProvider {
  return CONNECTOR_PROVIDER_SET.has(value);
}
