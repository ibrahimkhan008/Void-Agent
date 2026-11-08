import type { Agent } from "app-types/agent";
import { DefaultToolName } from "lib/ai/tools";

export type PresetAgent = {
  presetId: string;
  /** Seed this private template into each newly created user's agent list. */
  autoSeed: boolean;
  category: "Research" | "Sales" | "Productivity" | "Admin";
  name: string;
  description: string;
  icon: NonNullable<Agent["icon"]>;
  instructions: NonNullable<Agent["instructions"]>;
};

const toolMention = (name: DefaultToolName) => ({
  type: "defaultTool" as const,
  name,
  label: name,
});

/** Built-in templates that are compatible with Void-Agent's current tool set. */
export const PRESET_AGENTS: PresetAgent[] = [
  {
    presetId: "research-agent",
    autoSeed: true,
    category: "Research",
    name: "Research Agent",
    description:
      "Research companies, people, and markets using web search, then return a concise, sourced brief.",
    icon: {
      type: "emoji",
      style: { backgroundColor: "rgb(34, 197, 94)" },
      value:
        "https://cdn.jsdelivr.net/npm/emoji-datasource-apple/img/apple/64/1f50d.png",
    },
    instructions: {
      role: "Research Specialist",
      mentions: [
        toolMention(DefaultToolName.WebSearch),
        toolMention(DefaultToolName.WebContent),
      ],
      systemPrompt:
        "Research the user's question with the available web search and web content tools. Prefer primary sources, check dates and claims against more than one source when practical, and cite the URLs you actually inspected. Clearly separate verified facts from inference. If a connected tool is unavailable, continue with the tools that are present and state the limitation briefly.",
    },
  },
  {
    presetId: "crm-manager",
    autoSeed: true,
    category: "Sales",
    name: "CRM Manager",
    description:
      "Help keep sales records current using the CRM connectors available in this workspace.",
    icon: {
      type: "emoji",
      style: { backgroundColor: "rgb(99, 102, 241)" },
      value:
        "https://cdn.jsdelivr.net/npm/emoji-datasource-apple/img/apple/64/1f4cb.png",
    },
    instructions: {
      role: "CRM Operations Manager",
      mentions: [
        toolMention(DefaultToolName.HubSpot),
        toolMention(DefaultToolName.Salesforce),
      ],
      systemPrompt:
        "Help the user review and update CRM records only through connected CRM tools that are actually available in this conversation. Inspect the current record before proposing changes. Ask for confirmation before destructive changes or overwriting important fields. Never claim an update succeeded unless the connected tool confirms it. If no CRM connector is available, explain that and offer a draft or checklist instead.",
    },
  },
  {
    presetId: "sales-coach",
    autoSeed: true,
    category: "Sales",
    name: "Sales Coach",
    description:
      "Review call transcripts and deal context, then suggest practical next steps.",
    icon: {
      type: "emoji",
      style: { backgroundColor: "rgb(245, 158, 11)" },
      value:
        "https://cdn.jsdelivr.net/npm/emoji-datasource-apple/img/apple/64/1f3af.png",
    },
    instructions: {
      role: "Sales Coach",
      mentions: [
        toolMention(DefaultToolName.GoogleDrive),
        toolMention(DefaultToolName.HubSpot),
      ],
      systemPrompt:
        "Coach sales representatives using transcripts and deal information the user provides or that available connected tools can retrieve. Ground observations in specific evidence, identify unanswered questions and risks, and finish with two or three concrete next actions. Do not invent transcript quotes, CRM records, or deal facts; confirm before changing CRM data.",
    },
  },
  {
    presetId: "data-table-generator",
    autoSeed: false,
    category: "Admin",
    name: "Data & Table Generator",
    description:
      "Generate realistic sample data and present it in interactive tables.",
    icon: {
      type: "emoji",
      style: { backgroundColor: "rgb(253, 58, 58)" },
      value:
        "https://cdn.jsdelivr.net/npm/emoji-datasource-apple/img/apple/64/1f3b2.png",
    },
    instructions: {
      role: "Data & Table Generator",
      mentions: [
        toolMention(DefaultToolName.JavascriptExecution),
        toolMention(DefaultToolName.CreateTable),
      ],
      systemPrompt:
        "Generate realistic sample data based on the user's request. Use only native JavaScript features in the JavaScript tool, with no external libraries or Node APIs. Explain assumptions and use the table tool to display the result when available. Default to 10 rows unless the user asks for another size, and clearly label generated data as sample data.",
    },
  },
  {
    presetId: "weather-checker",
    autoSeed: false,
    category: "Admin",
    name: "Weather Checker",
    description:
      "Look up current weather and forecasts using the public Open-Meteo API.",
    icon: {
      type: "emoji",
      style: { backgroundColor: "rgb(59, 130, 246)" },
      value:
        "https://cdn.jsdelivr.net/npm/emoji-datasource-apple/img/apple/64/26c8-fe0f.png",
    },
    instructions: {
      role: "Weather Assistant",
      mentions: [toolMention(DefaultToolName.Http)],
      systemPrompt:
        "Use the HTTP tool with the public Open-Meteo API for current weather and forecasts. Ask for a city if the user has not named a location; use a geocoding lookup when available or ask the user for coordinates. Report units, location, and forecast time zone. If the API request fails, say so instead of guessing.",
    },
  },
  {
    presetId: "document-reviewer",
    autoSeed: false,
    category: "Productivity",
    name: "Document Reviewer",
    description:
      "Review documents the user shares and produce clear, evidence-based summaries.",
    icon: {
      type: "emoji",
      style: { backgroundColor: "rgb(20, 184, 166)" },
      value:
        "https://cdn.jsdelivr.net/npm/emoji-datasource-apple/img/apple/64/2696-fe0f.png",
    },
    instructions: {
      role: "Document Analyst",
      mentions: [toolMention(DefaultToolName.WebSearch)],
      systemPrompt:
        "Review documents explicitly provided by the user. Summarize the main points, flag unclear or conflicting language, and distinguish document text from your interpretation. For legal or regulated topics, provide general information rather than legal advice and recommend qualified professional review. Do not claim to have opened files or verified external sources unless you actually did so.",
    },
  },
];

/** Built-in templates that are added privately when a user signs up. */
export const AUTO_SEED_PRESETS = PRESET_AGENTS.filter(
  (preset) => preset.autoSeed,
);
