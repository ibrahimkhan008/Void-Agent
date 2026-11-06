import { Tool } from "ai";
import type { DynamicTool } from "lib/db/pg/repositories/site-config-repository.pg";
import { siteConfigRepository } from "lib/db/repository";
import { AppDefaultToolkit, DefaultToolName } from ".";
import { artifactCreationTool } from "./artifacts/artifact-creator";
import {
  browserAgentTool,
  createBrowserAgentToolForUser,
} from "./browser/browser-agent";
import {
  cloakBrowserTool,
  createCloakBrowserToolForUser,
} from "./browser/cloak-browser";
import { buildAppTool } from "./build/build-tool";
import { canvasDesignTool } from "./canvas/ecanvas-tool";
import { canvasPptMakerTool } from "./canvas/ppt-maker";
import { jsExecutionTool } from "./code/js-run-tool";
import { pythonExecutionTool } from "./code/python-run-tool";
import {
  calendarTool,
  createCalendarToolForUser,
} from "./connectors/calendar-tool";
import {
  connectorsListTool,
  createConnectorsListToolForUser,
} from "./connectors/connectors-list-tool";
import { createDriveToolForUser, driveTool } from "./connectors/drive-tool";
import { createGitHubToolForUser, githubTool } from "./connectors/github-tool";
import { createGmailToolForUser, gmailTool } from "./connectors/gmail-tool";
// 42 new connectors added 2026-06-03 — see ./connectors/index.ts.
import {
  airtableTool,
  asanaTool,
  axeroTool,
  bitbucketTool,
  bookstackTool,
  canvasLmsTool,
  clickupTool,
  codaTool,
  confluenceTool,
  createAirtableToolForUser,
  createAsanaToolForUser,
  createAxeroToolForUser,
  createBitbucketToolForUser,
  createBookstackToolForUser,
  createCanvasLmsToolForUser,
  createClickUpToolForUser,
  createCodaToolForUser,
  createConfluenceToolForUser,
  createDiscordToolForUser,
  createDiscourseToolForUser,
  createDocument360ToolForUser,
  createDropboxToolForUser,
  createDrupalWikiToolForUser,
  createEgnyteToolForUser,
  createFirefliesToolForUser,
  createFreshdeskToolForUser,
  createGitLabToolForUser,
  createGitbookToolForUser,
  createGongToolForUser,
  createGuruToolForUser,
  createHighspotToolForUser,
  createHubSpotToolForUser,
  createJiraToolForUser,
  createLinearToolForUser,
  createLoopioToolForUser,
  createMediawikiToolForUser,
  createOutlineToolForUser,
  createProductboardToolForUser,
  createSalesforceToolForUser,
  createSlabToolForUser,
  createTeamsToolForUser,
  createTestRailToolForUser,
  createWikipediaToolForUser,
  createXenforoToolForUser,
  createZendeskToolForUser,
  createZulipToolForUser,
  discordTool,
  discourseTool,
  document360Tool,
  dropboxTool,
  drupalWikiTool,
  egnyteTool,
  firefliesTool,
  freshdeskTool,
  gitbookTool,
  gitlabTool,
  gongTool,
  guruTool,
  highspotTool,
  hubspotTool,
  jiraTool,
  linearTool,
  loopioTool,
  mediawikiTool,
  outlineTool,
  productboardTool,
  salesforceTool,
  slabTool,
  teamsTool,
  testrailTool,
  wikipediaTool,
  xenforoTool,
  zendeskTool,
  zulipTool,
} from "./connectors/index";
import { createNotionToolForUser, notionTool } from "./connectors/notion-tool";
import {
  createOutlookToolForUser,
  outlookTool,
} from "./connectors/outlook-tool";
import { createSlackToolForUser, slackTool } from "./connectors/slack-tool";
import { createHttpFetchTool, httpFetchTool } from "./http/fetch";
import { createMemoryTools } from "./memory";
import { createCockpitPushUpdateToolForUser } from "./notifications/cockpit-update";
import { sandboxTool } from "./sandbox/sandbox-tool";
import {
  createSchedulerToolForUser,
  schedulerTool,
} from "./scheduler/scheduler-tool";
import { videoGenerationTool } from "./video/video-generator";
import { createBarChartTool } from "./visualization/create-bar-chart";
import { createLineChartTool } from "./visualization/create-line-chart";
import { createPieChartTool } from "./visualization/create-pie-chart";
import { createTableTool } from "./visualization/create-table";
import { exaContentsTool, exaSearchTool } from "./web/web-search";
import { youtubeSearchTool } from "./web/youtube-search";
import { youtubeTranscriptTool } from "./web/youtube-transcript";
import { createWorkflowToolForUser, workflowTool } from "./workflow";
// Static tools (don't need user context)
export const APP_DEFAULT_TOOL_KIT: Record<
  AppDefaultToolkit,
  Record<string, Tool>
> = {
  [AppDefaultToolkit.Visualization]: {
    [DefaultToolName.CreatePieChart]: createPieChartTool,
    [DefaultToolName.CreateBarChart]: createBarChartTool,
    [DefaultToolName.CreateLineChart]: createLineChartTool,
    [DefaultToolName.CreateTable]: createTableTool,
  },
  [AppDefaultToolkit.WebSearch]: {
    [DefaultToolName.WebSearch]: exaSearchTool,
    [DefaultToolName.WebContent]: exaContentsTool,
    [DefaultToolName.YouTubeSearch]: youtubeSearchTool,
    [DefaultToolName.YouTubeTranscript]: youtubeTranscriptTool,
  },
  [AppDefaultToolkit.Browser]: {
    [DefaultToolName.BrowserAgent]: browserAgentTool,
    [DefaultToolName.CloakBrowser]: cloakBrowserTool,
  },
  [AppDefaultToolkit.Http]: {
    [DefaultToolName.Http]: httpFetchTool,
  },
  [AppDefaultToolkit.Code]: {
    [DefaultToolName.JavascriptExecution]: jsExecutionTool,
    [DefaultToolName.PythonExecution]: pythonExecutionTool,
  },
  [AppDefaultToolkit.Video]: {
    [DefaultToolName.VideoGeneration]: videoGenerationTool,
  },
  [AppDefaultToolkit.Artifacts]: {
    [DefaultToolName.ArtifactCreation]: artifactCreationTool,
  },
  [AppDefaultToolkit.Automation]: {
    [DefaultToolName.Workflow]: workflowTool,
  },
  [AppDefaultToolkit.Canvas]: {
    [DefaultToolName.Canvas]: canvasPptMakerTool,
    [DefaultToolName.ECanvas]: canvasDesignTool,
  },
  [AppDefaultToolkit.Connectors]: {
    [DefaultToolName.Gmail]: gmailTool,
    [DefaultToolName.GoogleDrive]: driveTool,
    [DefaultToolName.GoogleCalendar]: calendarTool,
    [DefaultToolName.GitHub]: githubTool,
    [DefaultToolName.Outlook]: outlookTool,
    [DefaultToolName.Slack]: slackTool,
    [DefaultToolName.Notion]: notionTool,
    // 42 new connectors (added 2026-06-03)
    [DefaultToolName.Confluence]: confluenceTool,
    [DefaultToolName.Jira]: jiraTool,
    [DefaultToolName.Linear]: linearTool,
    [DefaultToolName.Asana]: asanaTool,
    [DefaultToolName.ClickUp]: clickupTool,
    [DefaultToolName.Productboard]: productboardTool,
    [DefaultToolName.TestRail]: testrailTool,
    [DefaultToolName.Coda]: codaTool,
    [DefaultToolName.Outline]: outlineTool,
    [DefaultToolName.Slab]: slabTool,
    [DefaultToolName.Guru]: guruTool,
    [DefaultToolName.Highspot]: highspotTool,
    [DefaultToolName.Document360]: document360Tool,
    [DefaultToolName.GitLab]: gitlabTool,
    [DefaultToolName.Bitbucket]: bitbucketTool,
    [DefaultToolName.Dropbox]: dropboxTool,
    [DefaultToolName.Zendesk]: zendeskTool,
    [DefaultToolName.Freshdesk]: freshdeskTool,
    [DefaultToolName.Salesforce]: salesforceTool,
    [DefaultToolName.HubSpot]: hubspotTool,
    [DefaultToolName.Airtable]: airtableTool,
    [DefaultToolName.Gong]: gongTool,
    [DefaultToolName.Egnyte]: egnyteTool,
    [DefaultToolName.Teams]: teamsTool,
    [DefaultToolName.Discord]: discordTool,
    [DefaultToolName.Bookstack]: bookstackTool,
    [DefaultToolName.Gitbook]: gitbookTool,
    [DefaultToolName.CanvasLms]: canvasLmsTool,
    [DefaultToolName.Loopio]: loopioTool,
    [DefaultToolName.Discourse]: discourseTool,
    [DefaultToolName.Xenforo]: xenforoTool,
    [DefaultToolName.DrupalWiki]: drupalWikiTool,
    [DefaultToolName.Axero]: axeroTool,
    [DefaultToolName.Zulip]: zulipTool,
    [DefaultToolName.Mediawiki]: mediawikiTool,
    [DefaultToolName.Fireflies]: firefliesTool,
    [DefaultToolName.Wikipedia]: wikipediaTool,
    [DefaultToolName.ConnectorsList]: connectorsListTool,
  },
  [AppDefaultToolkit.Memory]: {},
  [AppDefaultToolkit.Notifications]: {},
  [AppDefaultToolkit.Scheduler]: {
    [DefaultToolName.Scheduler]: schedulerTool,
  },
  [AppDefaultToolkit.CodeEngine]: {},
  // Populated only by getAppDefaultToolKitForUser — the Build tool needs a
  // userId/threadId to own its sandbox and build rows.
  [AppDefaultToolkit.Build]: {},
};

// Function to get tools with user context (for tools that need user data)
export function getAppDefaultToolKitForUser(
  userId: string,
  threadId?: string,
): Record<AppDefaultToolkit, Record<string, Tool>> {
  return {
    ...APP_DEFAULT_TOOL_KIT,
    // E2B app builder. User-scoped (owns the sandbox + build rows) and
    // thread-scoped (builds belong to a conversation), so it can only be
    // constructed here rather than in the static toolkit.
    // Real Linux sandbox, alongside the browser-based JS/Python runners.
    // User- and thread-scoped: the sandbox persists per conversation.
    [AppDefaultToolkit.Code]: {
      ...APP_DEFAULT_TOOL_KIT[AppDefaultToolkit.Code],
      [DefaultToolName.Sandbox]: sandboxTool({
        userId,
        threadId: threadId ?? "",
      }),
    },
    [AppDefaultToolkit.Http]: {
      [DefaultToolName.Http]: createHttpFetchTool(userId),
    },
    [AppDefaultToolkit.Build]: {
      [DefaultToolName.Build]: buildAppTool({
        userId,
        threadId: threadId ?? "",
      }),
    },
    [AppDefaultToolkit.Browser]: {
      [DefaultToolName.BrowserAgent]: createBrowserAgentToolForUser(
        userId,
        threadId,
      ),
      [DefaultToolName.CloakBrowser]: createCloakBrowserToolForUser(
        userId,
        threadId,
      ),
    },
    [AppDefaultToolkit.Connectors]: {
      [DefaultToolName.Gmail]: createGmailToolForUser(userId),
      [DefaultToolName.GoogleDrive]: createDriveToolForUser(userId),
      [DefaultToolName.GoogleCalendar]: createCalendarToolForUser(userId),
      [DefaultToolName.GitHub]: createGitHubToolForUser(userId),
      [DefaultToolName.Outlook]: createOutlookToolForUser(userId),
      [DefaultToolName.Slack]: createSlackToolForUser(userId),
      [DefaultToolName.Notion]: createNotionToolForUser(userId),
      // 42 new connectors (added 2026-06-03)
      [DefaultToolName.Confluence]: createConfluenceToolForUser(userId),
      [DefaultToolName.Jira]: createJiraToolForUser(userId),
      [DefaultToolName.Linear]: createLinearToolForUser(userId),
      [DefaultToolName.Asana]: createAsanaToolForUser(userId),
      [DefaultToolName.ClickUp]: createClickUpToolForUser(userId),
      [DefaultToolName.Productboard]: createProductboardToolForUser(userId),
      [DefaultToolName.TestRail]: createTestRailToolForUser(userId),
      [DefaultToolName.Coda]: createCodaToolForUser(userId),
      [DefaultToolName.Outline]: createOutlineToolForUser(userId),
      [DefaultToolName.Slab]: createSlabToolForUser(userId),
      [DefaultToolName.Guru]: createGuruToolForUser(userId),
      [DefaultToolName.Highspot]: createHighspotToolForUser(userId),
      [DefaultToolName.Document360]: createDocument360ToolForUser(userId),
      [DefaultToolName.GitLab]: createGitLabToolForUser(userId),
      [DefaultToolName.Bitbucket]: createBitbucketToolForUser(userId),
      [DefaultToolName.Dropbox]: createDropboxToolForUser(userId),
      [DefaultToolName.Zendesk]: createZendeskToolForUser(userId),
      [DefaultToolName.Freshdesk]: createFreshdeskToolForUser(userId),
      [DefaultToolName.Salesforce]: createSalesforceToolForUser(userId),
      [DefaultToolName.HubSpot]: createHubSpotToolForUser(userId),
      [DefaultToolName.Airtable]: createAirtableToolForUser(userId),
      [DefaultToolName.Gong]: createGongToolForUser(userId),
      [DefaultToolName.Egnyte]: createEgnyteToolForUser(userId),
      [DefaultToolName.Teams]: createTeamsToolForUser(userId),
      [DefaultToolName.Discord]: createDiscordToolForUser(userId),
      [DefaultToolName.Bookstack]: createBookstackToolForUser(userId),
      [DefaultToolName.Gitbook]: createGitbookToolForUser(userId),
      [DefaultToolName.CanvasLms]: createCanvasLmsToolForUser(userId),
      [DefaultToolName.Loopio]: createLoopioToolForUser(userId),
      [DefaultToolName.Discourse]: createDiscourseToolForUser(userId),
      [DefaultToolName.Xenforo]: createXenforoToolForUser(userId),
      [DefaultToolName.DrupalWiki]: createDrupalWikiToolForUser(userId),
      [DefaultToolName.Axero]: createAxeroToolForUser(userId),
      [DefaultToolName.Zulip]: createZulipToolForUser(userId),
      [DefaultToolName.Mediawiki]: createMediawikiToolForUser(userId),
      [DefaultToolName.Fireflies]: createFirefliesToolForUser(userId),
      [DefaultToolName.Wikipedia]: createWikipediaToolForUser(userId),
      [DefaultToolName.ConnectorsList]: createConnectorsListToolForUser(userId),
    },
    [AppDefaultToolkit.Memory]: createMemoryTools(userId),
    [AppDefaultToolkit.Notifications]: {
      [DefaultToolName.CockpitPushUpdate]: createCockpitPushUpdateToolForUser(
        userId,
        threadId,
      ),
    },
    [AppDefaultToolkit.Scheduler]: {
      [DefaultToolName.Scheduler]: createSchedulerToolForUser(userId, threadId),
    },
    [AppDefaultToolkit.Automation]: {
      [DefaultToolName.Workflow]: createWorkflowToolForUser(userId),
    },
    [AppDefaultToolkit.CodeEngine]: {},
  };
}

/**
 * Returns dynamic tools from site-config, filtered to only enabled entries.
 * These are informational descriptors stored in the DB — they do not create
 * executable AI tools yet (that would require full MCP integration).
 */
export async function getDynamicTools(): Promise<Record<string, DynamicTool>> {
  try {
    const config = await siteConfigRepository.getConfig("tools");
    const dynamicTools = config?.dynamicTools ?? {};
    // Return only tools that are enabled
    return Object.fromEntries(
      Object.entries(dynamicTools).filter(([, tool]) => tool.enabled),
    );
  } catch {
    return {};
  }
}
