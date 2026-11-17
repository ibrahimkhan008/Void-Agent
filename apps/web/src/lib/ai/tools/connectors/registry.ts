import { DefaultToolName } from "lib/ai/tools";
import { createAsanaToolForUser } from "./asana-tool";
import { createCalendarToolForUser } from "./calendar-tool";
import { createClickUpToolForUser } from "./clickup-tool";
import { createConnectorsListToolForUser } from "./connectors-list-tool";
import { createDriveToolForUser } from "./drive-tool";
import { createFreshdeskToolForUser } from "./freshdesk-tool";
import { createGitHubToolForUser } from "./github-tool";
import { createGitLabToolForUser } from "./gitlab-tool";
import { createGmailToolForUser } from "./gmail-tool";
import { createGoogleDocsToolForUser } from "./google-docs-tool";
import { createGoogleFormsToolForUser } from "./google-forms-tool";
import { createGoogleKeepToolForUser } from "./google-keep-tool";
import { createGoogleMeetToolForUser } from "./google-meet-tool";
import { createGoogleSheetsToolForUser } from "./google-sheets-tool";
import { createGoogleSlidesToolForUser } from "./google-slides-tool";
import { createGoogleTasksToolForUser } from "./google-tasks-tool";
import { createJiraToolForUser } from "./jira-tool";
import { createLinearToolForUser } from "./linear-tool";
import { createNotionToolForUser } from "./notion-tool";
import { createOutlookToolForUser } from "./outlook-tool";
import { createProductboardToolForUser } from "./productboard-tool";
import { createSlackToolForUser } from "./slack-tool";
import { createTeamsToolForUser } from "./teams-tool";
import { createYouTubeConnectorToolForUser } from "./youtube-connector-tool";
import { createZendeskToolForUser } from "./zendesk-tool";
import { createZulipToolForUser } from "./zulip-tool";

export function createConnectorToolsForUser(userId: string) {
  if (!userId) return {};
  return {
    [DefaultToolName.Gmail]: createGmailToolForUser(userId),
    [DefaultToolName.GoogleDrive]: createDriveToolForUser(userId),
    [DefaultToolName.GoogleDocs]: createGoogleDocsToolForUser(userId),
    [DefaultToolName.GoogleSheets]: createGoogleSheetsToolForUser(userId),
    [DefaultToolName.GoogleForms]: createGoogleFormsToolForUser(userId),
    [DefaultToolName.GoogleKeep]: createGoogleKeepToolForUser(userId),
    [DefaultToolName.GoogleMeet]: createGoogleMeetToolForUser(userId),
    [DefaultToolName.GoogleSlides]: createGoogleSlidesToolForUser(userId),
    [DefaultToolName.GoogleTasks]: createGoogleTasksToolForUser(userId),
    [DefaultToolName.GoogleCalendar]: createCalendarToolForUser(userId),
    [DefaultToolName.YouTubeConnector]:
      createYouTubeConnectorToolForUser(userId),
    [DefaultToolName.GitHub]: createGitHubToolForUser(userId),
    [DefaultToolName.GitLab]: createGitLabToolForUser(userId),
    [DefaultToolName.Outlook]: createOutlookToolForUser(userId),
    [DefaultToolName.Slack]: createSlackToolForUser(userId),
    [DefaultToolName.Notion]: createNotionToolForUser(userId),
    [DefaultToolName.Teams]: createTeamsToolForUser(userId),
    [DefaultToolName.Asana]: createAsanaToolForUser(userId),
    [DefaultToolName.ClickUp]: createClickUpToolForUser(userId),
    [DefaultToolName.Linear]: createLinearToolForUser(userId),
    [DefaultToolName.Jira]: createJiraToolForUser(userId),
    [DefaultToolName.Zendesk]: createZendeskToolForUser(userId),
    [DefaultToolName.Freshdesk]: createFreshdeskToolForUser(userId),
    [DefaultToolName.Productboard]: createProductboardToolForUser(userId),
    [DefaultToolName.Zulip]: createZulipToolForUser(userId),
    [DefaultToolName.ConnectorsList]: createConnectorsListToolForUser(userId),
  };
}
