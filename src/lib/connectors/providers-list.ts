// 42 new connector providers being added.
// Order is alphabetical within each auth-type group for readability.
export const NEW_OAUTH_PROVIDERS = [
  // Google Workspace
  "google-docs",
  "google-forms",
  "google-keep",
  "google-meet",
  "google-sheets",
  "google-slides",
  "google-tasks",
  "youtube",
  // Atlassian
  "confluence",
  "jira",
  // Issue trackers
  "linear",
  "asana",
  "clickup",
  "productboard",
  "testrail",
  // Docs / wikis
  "coda",
  "outline",
  "slab",
  "guru",
  "highspot",
  "document360",
  // Code / VCS
  "gitlab",
  "bitbucket",
  // Storage
  "dropbox",
  // CRM / support
  "zendesk",
  "freshdesk",
  "salesforce",
  "hubspot",
  "airtable",
  // Sales enablement
  "gong",
  "egnyte",
  // Microsoft Graph (reuses tenant)
  "teams",
  // Communication
  "discord",
] as const;

export const NEW_TOKEN_PROVIDERS = [
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
  "wikipedia",
] as const;

export const NEW_PROVIDERS = [
  ...NEW_OAUTH_PROVIDERS,
  ...NEW_TOKEN_PROVIDERS,
] as const;

export const BASE_CONNECTOR_PROVIDERS = [
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

export const CONNECTOR_PROVIDERS = [
  ...BASE_CONNECTOR_PROVIDERS,
  ...NEW_PROVIDERS,
] as const;

export type ConnectorProvider = (typeof CONNECTOR_PROVIDERS)[number];

const CONNECTOR_PROVIDER_SET: ReadonlySet<string> = new Set(
  CONNECTOR_PROVIDERS,
);

export function isConnectorProvider(value: string): value is ConnectorProvider {
  return CONNECTOR_PROVIDER_SET.has(value);
}

export type NewOAuthProvider = (typeof NEW_OAUTH_PROVIDERS)[number];
export type NewTokenProvider = (typeof NEW_TOKEN_PROVIDERS)[number];
export type NewProvider = (typeof NEW_PROVIDERS)[number];
