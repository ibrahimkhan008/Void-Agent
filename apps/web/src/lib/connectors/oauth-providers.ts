import type { ConnectorProvider } from "./providers-list";

export type OAuthProviderConfig = {
  clientIdEnv: string;
  clientSecretEnv: string;
  authorizeUrl: string;
  tokenUrl: string;
  scopes: string[];
  pkce: boolean;
  tokenFormat?: "form" | "json";
  tokenAuth?: "none" | "basic" | "pkce";
  extraAuthorizeParams?: Record<string, string>;
  identityUrl?: string;
  identityHeaders?: (accessToken: string) => Record<string, string>;
  identityEmail?: (body: Record<string, unknown>) => string | undefined;
  identityName?: (body: Record<string, unknown>) => string | undefined;
  tokenFromResponse?: (body: Record<string, unknown>) => string | undefined;
  refreshTokenFromResponse?: (
    body: Record<string, unknown>,
  ) => string | undefined;
};

const googleScopes: Partial<Record<ConnectorProvider, string[]>> = {
  gmail: [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/gmail.compose",
    "https://www.googleapis.com/auth/gmail.modify",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
  ],
  "google-calendar": [
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/userinfo.email",
  ],
  "google-docs": [
    "https://www.googleapis.com/auth/documents",
    "https://www.googleapis.com/auth/drive.file",
  ],
  "google-drive": [
    "https://www.googleapis.com/auth/drive.readonly",
    "https://www.googleapis.com/auth/drive.file",
  ],
  "google-forms": [
    "https://www.googleapis.com/auth/forms.body",
    "https://www.googleapis.com/auth/forms.responses.readonly",
    "https://www.googleapis.com/auth/drive.file",
  ],
  "google-keep": [
    "https://www.googleapis.com/auth/keep",
    "https://www.googleapis.com/auth/keep.readonly",
  ],
  "google-meet": [
    "https://www.googleapis.com/auth/meetings.space.created",
    "https://www.googleapis.com/auth/meetings.space.readonly",
  ],
  "google-sheets": [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive.file",
  ],
  "google-slides": [
    "https://www.googleapis.com/auth/presentations",
    "https://www.googleapis.com/auth/drive.file",
  ],
  "google-tasks": ["https://www.googleapis.com/auth/tasks"],
  youtube: [
    "https://www.googleapis.com/auth/youtube",
    "https://www.googleapis.com/auth/youtube.readonly",
  ],
};

const googleIdentity = {
  identityUrl: "https://www.googleapis.com/oauth2/v2/userinfo",
  identityHeaders: (token: string) => ({ Authorization: `Bearer ${token}` }),
  identityEmail: (body: Record<string, unknown>) =>
    typeof body.email === "string" ? body.email : undefined,
  identityName: (body: Record<string, unknown>) =>
    typeof body.name === "string" ? body.name : undefined,
};

const google = (provider: ConnectorProvider): OAuthProviderConfig => ({
  clientIdEnv: "GOOGLE_CLIENT_ID",
  clientSecretEnv: "GOOGLE_CLIENT_SECRET",
  authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenUrl: "https://oauth2.googleapis.com/token",
  scopes: [
    ...new Set([
      "openid",
      "email",
      "profile",
      ...(googleScopes[provider] ?? []),
    ]),
  ],
  pkce: true,
  extraAuthorizeParams: { access_type: "offline", prompt: "consent" },
  ...googleIdentity,
});

const microsoftScopes = [
  "offline_access",
  "Mail.Read",
  "Mail.ReadWrite",
  "Mail.Send",
  "User.Read",
];

const microsoft = (provider: "outlook" | "teams"): OAuthProviderConfig => ({
  clientIdEnv: "MICROSOFT_CLIENT_ID",
  clientSecretEnv: "MICROSOFT_CLIENT_SECRET",
  authorizeUrl:
    "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
  tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
  scopes:
    provider === "outlook"
      ? microsoftScopes
      : ["offline_access", "Chat.Read", "Chat.ReadWrite", "User.Read"],
  pkce: true,
  extraAuthorizeParams: {
    response_mode: "query",
    prompt: "select_account",
  },
  identityUrl: "https://graph.microsoft.com/v1.0/me",
  identityHeaders: (token: string) => ({ Authorization: `Bearer ${token}` }),
  identityEmail: (body: Record<string, unknown>) =>
    (typeof body.mail === "string" && body.mail) ||
    (typeof body.userPrincipalName === "string"
      ? body.userPrincipalName
      : undefined),
  identityName: (body: Record<string, unknown>) =>
    typeof body.displayName === "string" ? body.displayName : undefined,
});

const slack: OAuthProviderConfig = {
  clientIdEnv: "SLACK_CLIENT_ID",
  clientSecretEnv: "SLACK_CLIENT_SECRET",
  authorizeUrl: "https://slack.com/oauth/v2/authorize",
  tokenUrl: "https://slack.com/api/oauth.v2.access",
  scopes: [
    "channels:read",
    "channels:history",
    "groups:read",
    "groups:history",
    "im:read",
    "im:history",
    "mpim:read",
    "mpim:history",
    "chat:write",
    "users:read",
  ],
  pkce: true,
  // Slack PKCE must be enabled on the Slack app. The code exchange uses the
  // verifier and client id; it does not send the confidential client secret.
  tokenAuth: "pkce",
  extraAuthorizeParams: {
    user_scope:
      "channels:read,channels:history,groups:read,groups:history,im:read,im:history,mpim:read,mpim:history,chat:write,users:read",
  },
  tokenFromResponse: (body) => {
    const authedUser = body.authed_user;
    return authedUser &&
      typeof authedUser === "object" &&
      "access_token" in authedUser
      ? (authedUser as { access_token?: string }).access_token
      : undefined;
  },
  refreshTokenFromResponse: (body) => {
    const authedUser = body.authed_user;
    return authedUser &&
      typeof authedUser === "object" &&
      "refresh_token" in authedUser
      ? (authedUser as { refresh_token?: string }).refresh_token
      : stringField(body, "refresh_token");
  },
  identityUrl: "https://slack.com/api/auth.test",
  identityHeaders: (token: string) => ({ Authorization: `Bearer ${token}` }),
  identityEmail: () => undefined,
  identityName: (body) =>
    typeof body.user === "string" ? body.user : undefined,
};

function stringField(
  body: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = body[key];
  return typeof value === "string" ? value : undefined;
}

const notion: OAuthProviderConfig = {
  clientIdEnv: "NOTION_CLIENT_ID",
  clientSecretEnv: "NOTION_CLIENT_SECRET",
  authorizeUrl: "https://api.notion.com/v1/oauth/authorize",
  tokenUrl: "https://api.notion.com/v1/oauth/token",
  scopes: [],
  pkce: false,
  tokenFormat: "json",
  tokenAuth: "basic",
  extraAuthorizeParams: { owner: "user" },
  identityEmail: (body) => {
    const owner = body.owner as
      | { user?: { person?: { email?: unknown } } }
      | undefined;
    return typeof owner?.user?.person?.email === "string"
      ? owner.user.person.email
      : undefined;
  },
  identityName: (body) =>
    typeof body.workspace_name === "string" ? body.workspace_name : undefined,
};

const github: OAuthProviderConfig = {
  clientIdEnv: "GITHUB_CLIENT_ID",
  clientSecretEnv: "GITHUB_CLIENT_SECRET",
  authorizeUrl: "https://github.com/login/oauth/authorize",
  tokenUrl: "https://github.com/login/oauth/access_token",
  scopes: ["repo", "read:user", "user:email"],
  pkce: true,
  identityUrl: "https://api.github.com/user",
  identityHeaders: (token: string) => ({
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "Void Agent-connector",
  }),
  identityEmail: (body) =>
    typeof body.email === "string" ? body.email : undefined,
  identityName: (body) =>
    typeof body.login === "string" ? body.login : undefined,
};

const gitlab: OAuthProviderConfig = {
  clientIdEnv: "GITLAB_CLIENT_ID",
  clientSecretEnv: "GITLAB_CLIENT_SECRET",
  authorizeUrl: "https://gitlab.com/oauth/authorize",
  tokenUrl: "https://gitlab.com/oauth/token",
  scopes: ["read_api", "read_user"],
  pkce: true,
  identityUrl: "https://gitlab.com/api/v4/user",
  identityHeaders: (token: string) => ({ Authorization: `Bearer ${token}` }),
  identityEmail: (body) =>
    typeof body.email === "string" ? body.email : undefined,
  identityName: (body) =>
    typeof body.username === "string" ? body.username : undefined,
};

const asana: OAuthProviderConfig = {
  clientIdEnv: "ASANA_CLIENT_ID",
  clientSecretEnv: "ASANA_CLIENT_SECRET",
  authorizeUrl: "https://app.asana.com/-/oauth_authorize",
  tokenUrl: "https://app.asana.com/-/oauth_token",
  scopes: ["projects:read", "tasks:read", "tasks:write", "users:read"],
  pkce: true,
};

const clickup: OAuthProviderConfig = {
  clientIdEnv: "CLICKUP_CLIENT_ID",
  clientSecretEnv: "CLICKUP_CLIENT_SECRET",
  authorizeUrl: "https://app.clickup.com/api",
  tokenUrl: "https://api.clickup.com/api/v2/oauth/token",
  scopes: [],
  pkce: false,
};

const linear: OAuthProviderConfig = {
  clientIdEnv: "LINEAR_CLIENT_ID",
  clientSecretEnv: "LINEAR_CLIENT_SECRET",
  authorizeUrl: "https://linear.app/oauth/authorize",
  tokenUrl: "https://api.linear.app/oauth/token",
  scopes: ["read", "write"],
  pkce: true,
  tokenAuth: "pkce",
};

const productboard: OAuthProviderConfig = {
  clientIdEnv: "PRODUCTBOARD_CLIENT_ID",
  clientSecretEnv: "PRODUCTBOARD_CLIENT_SECRET",
  authorizeUrl: "https://app.productboard.com/oauth2/authorize",
  tokenUrl: "https://app.productboard.com/oauth2/token",
  scopes: ["entities:read", "entities:write"],
  pkce: true,
};

const jira: OAuthProviderConfig = {
  clientIdEnv: "ATLASSIAN_CLIENT_ID",
  clientSecretEnv: "ATLASSIAN_CLIENT_SECRET",
  authorizeUrl: "https://auth.atlassian.com/authorize",
  tokenUrl: "https://auth.atlassian.com/oauth/token",
  scopes: ["read:jira-work", "write:jira-work", "offline_access"],
  pkce: true,
  extraAuthorizeParams: { audience: "api.atlassian.com", prompt: "consent" },
};

const zendesk: OAuthProviderConfig = {
  clientIdEnv: "ZENDESK_CLIENT_ID",
  clientSecretEnv: "ZENDESK_CLIENT_SECRET",
  authorizeUrl: "https://example.zendesk.com/oauth/authorizations/new",
  tokenUrl: "https://example.zendesk.com/oauth/tokens",
  scopes: ["tickets:read", "tickets:write"],
  pkce: true,
};

export const OAUTH_PROVIDER_CONFIG: Partial<
  Record<ConnectorProvider, OAuthProviderConfig>
> = {
  gmail: google("gmail"),
  "google-calendar": google("google-calendar"),
  "google-docs": google("google-docs"),
  "google-drive": google("google-drive"),
  "google-forms": google("google-forms"),
  "google-keep": google("google-keep"),
  "google-meet": google("google-meet"),
  "google-sheets": google("google-sheets"),
  "google-slides": google("google-slides"),
  "google-tasks": google("google-tasks"),
  youtube: google("youtube"),
  outlook: microsoft("outlook"),
  teams: microsoft("teams"),
  slack,
  notion,
  github,
  gitlab,
  asana,
  clickup,
  linear,
  productboard,
  jira,
  zendesk,
};

export function getOAuthClientCredentials(config: OAuthProviderConfig) {
  const clientId = process.env[config.clientIdEnv]?.trim();
  const clientSecret = process.env[config.clientSecretEnv]?.trim();
  if (!clientId || (config.tokenAuth !== "pkce" && !clientSecret)) return null;
  return { clientId, clientSecret: clientSecret ?? "" };
}

export function resolveProviderEndpoints(
  provider: ConnectorProvider,
  config: OAuthProviderConfig,
): { authorizeUrl: URL; tokenUrl: URL } {
  const tenant = process.env.MICROSOFT_TENANT_ID?.trim() || "common";
  // A tenant is a path segment, never an arbitrary URL supplied by the user.
  if (provider === "outlook" || provider === "teams") {
    if (!/^(common|organizations|consumers|[0-9a-f-]{36})$/i.test(tenant)) {
      throw new Error("Invalid Microsoft tenant configuration");
    }
    return {
      authorizeUrl: new URL(
        `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`,
      ),
      tokenUrl: new URL(
        `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
      ),
    };
  }
  if (provider === "zendesk") {
    const subdomain = process.env.ZENDESK_SUBDOMAIN?.trim().toLowerCase();
    if (
      !subdomain ||
      !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(subdomain)
    ) {
      throw new Error("Invalid Zendesk subdomain configuration");
    }
    return {
      authorizeUrl: new URL(
        `https://${subdomain}.zendesk.com/oauth/authorizations/new`,
      ),
      tokenUrl: new URL(`https://${subdomain}.zendesk.com/oauth/tokens`),
    };
  }
  return {
    authorizeUrl: new URL(config.authorizeUrl),
    tokenUrl: new URL(config.tokenUrl),
  };
}
