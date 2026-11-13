import { agentInstallRepository as pgAgentInstallRepository } from "./pg/repositories/agent-install-repository.pg";
import { pgAgentRepository } from "./pg/repositories/agent-repository.pg";
import { apiKeyRepository as pgRestApiKeyRepository } from "./pg/repositories/api-key-repository.pg";
import { apiUsageRepository as pgRestApiUsageRepository } from "./pg/repositories/api-usage-repository.pg";
import { pgAppBuildRepository } from "./pg/repositories/app-build-repository.pg";
import { pgBookmarkRepository } from "./pg/repositories/bookmark-repository.pg";
import { pgBrowserCredentialRepository } from "./pg/repositories/browser-credential-repository.pg";
import { bugReportRepository as pgBugReportRepository } from "./pg/repositories/bug-bounty-repository.pg";
import { pgChatExportRepository } from "./pg/repositories/chat-export-repository.pg";
import { pgChatRepository } from "./pg/repositories/chat-repository.pg";
import { pgCockpitConnectionRepository } from "./pg/repositories/cockpit-connection-repository.pg";
import { pgDodoPaymentsRepository } from "./pg/repositories/dodo-payments-repository.pg";
import { embedSessionRepository as pgEmbedSessionRepository } from "./pg/repositories/embed-session-repository.pg";
import { inboundRepository as pgInboundRepository } from "./pg/repositories/inbound-repository.pg";
import { mcpInstallRepository as pgMcpInstallRepository } from "./pg/repositories/mcp-install-repository.pg";
import { pgMcpOAuthRepository } from "./pg/repositories/mcp-oauth-repository.pg";
import { pgMcpRepository } from "./pg/repositories/mcp-repository.pg";
import { pgMcpServerCustomizationRepository } from "./pg/repositories/mcp-server-customization-repository.pg";
import { pgMcpMcpToolCustomizationRepository } from "./pg/repositories/mcp-tool-customization-repository.pg";
import { pgMemoryRepository } from "./pg/repositories/memory-repository.pg";
import { pgProblemReportRepository } from "./pg/repositories/problem-report-repository.pg";
import { pgPublishedPageRepository } from "./pg/repositories/published-page-repository.pg";
import { siteConfigRepository as pgSiteConfigRepository } from "./pg/repositories/site-config-repository.pg";
import { pgSkillRepository } from "./pg/repositories/skill-repository.pg";
import { pgUserRepository } from "./pg/repositories/user-repository.pg";
import { pgCustomVoiceDeviceRepository } from "./pg/repositories/voice-device-custom-repository.pg";
import { pgVoiceDeviceRepository } from "./pg/repositories/voice-device-repository.pg";
import { webhookRepository as pgWebhookRepository } from "./pg/repositories/webhook-repository.pg";
import { pgWorkflowRepository } from "./pg/repositories/workflow-repository.pg";

export const chatRepository = pgChatRepository;
// C44 — Bug Bounty port: owner-scoped reports, repository-only admin paths.
export const bugReportRepository = pgBugReportRepository;
export const dodoPaymentsRepository = pgDodoPaymentsRepository;
export const userRepository = pgUserRepository;
export const mcpRepository = pgMcpRepository;
export const mcpMcpToolCustomizationRepository =
  pgMcpMcpToolCustomizationRepository;
export const mcpServerCustomizationRepository =
  pgMcpServerCustomizationRepository;
export const mcpOAuthRepository = pgMcpOAuthRepository;
export const mcpInstallRepository = pgMcpInstallRepository;
export const memoryRepository = pgMemoryRepository;

export const workflowRepository = pgWorkflowRepository;
export const agentRepository = pgAgentRepository;
export const agentInstallRepository = pgAgentInstallRepository;
export const skillRepository = pgSkillRepository;
export const bookmarkRepository = pgBookmarkRepository;
export const appBuildRepository = pgAppBuildRepository;
export const chatExportRepository = pgChatExportRepository;
export const publishedPageRepository = pgPublishedPageRepository;
export const voiceDeviceRepository = pgVoiceDeviceRepository;
// Void Agent's richer hardware OTA/history workflows are kept separate from
// the upstream device-pairing contract so both APIs can coexist safely.
export const voiceDeviceCustomRepository = pgCustomVoiceDeviceRepository;
export const browserCredentialRepository = pgBrowserCredentialRepository;
export const problemReportRepository = pgProblemReportRepository;
export const cockpitConnectionRepository = pgCockpitConnectionRepository;

// Destination-only API, webhook, inbound-trigger, and embed persistence.
// Keep these aliases separate from upstream Better Auth's `ApiKeyTable`
// repository usage and preserve the repository module's PostgreSQL adapter
// pattern.
export const apiKeyRepository = pgRestApiKeyRepository;
export const apiUsageRepository = pgRestApiUsageRepository;
export const webhookRepository = pgWebhookRepository;
export const inboundRepository = pgInboundRepository;
export const embedSessionRepository = pgEmbedSessionRepository;
export const siteConfigRepository = pgSiteConfigRepository;
