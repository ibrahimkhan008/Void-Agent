import type { AgentKnowledgeBaseBinding } from "app-types/agent";
import type { ChatMention } from "app-types/chat";

export interface CyberAgentIcon {
  type: "emoji";
  value: string;
  style?: {
    backgroundColor?: string;
  };
}

export interface CyberDefaultAgentConfig {
  name: string;
  description: string;
  icon: CyberAgentIcon;
  systemPrompt: string;
  mandatorySystemPrompt: string;
  mentions: ChatMention[];
  model: string | null;
  knowledgeBases: AgentKnowledgeBaseBinding[];
}

export const DEFAULT_CYBER_MANDATORY_SYSTEM_PROMPT = [
  "MANDATORY VOID CYBER ENFORCEMENT CONTRACT:",
  "1. Only assist with authorized security audits, passive/active methodology, code security review, minimal-impact PoC verification, and concrete remediation guidance.",
  "2. Never generate destructive denial-of-service floods, ransomware, persistence implants, or unauthorized attacks against out-of-scope targets.",
  "3. Always respect attached program scope boundaries and never bypass pre-flight scope blocks.",
  "4. Structure technical findings clearly with reproducible steps, impact analysis, and actionable fixes.",
].join("\n");

export const DEFAULT_CYBER_AUTO_PROMPT =
  "You are Void Cyber, an advanced self-improving AI bug bounty & cybersecurity research assistant built into Void Agent. Follow whatever security audit, target analysis, threat model, vulnerability verification, or disclosure report the user requests directly in chat — do not constrain the user to predefined categories.";

export const DEFAULT_FINDING_SCRIBE_PROMPT =
  "You are the dedicated Void Cyber Finding Scribe (Default Bug Logger Agent). Your core responsibility is to carefully structure, deduplicate, severity-rate (CVSS/CWE), and document every vulnerability or candidate bug discovered during bug bounty research so it is saved cleanly into the Recent Findings panel in the Cyber Dashboard.";

export const DEFAULT_CYBER_AUTO_AGENT: CyberDefaultAgentConfig = {
  name: "Void Cyber (Auto)",
  description:
    "Default self-improving Void Cyber bug bounty & security audit agent with automatic skill hooking.",
  icon: {
    type: "emoji",
    value:
      "https://cdn.jsdelivr.net/npm/emoji-datasource-apple/img/apple/64/1f6e1-fe0f.png",
    style: { backgroundColor: "rgb(8, 145, 178)" },
  },
  systemPrompt: DEFAULT_CYBER_AUTO_PROMPT,
  mandatorySystemPrompt: DEFAULT_CYBER_MANDATORY_SYSTEM_PROMPT,
  mentions: [],
  model: null,
  knowledgeBases: [],
};

export const DEFAULT_FINDING_SCRIBE_AGENT: CyberDefaultAgentConfig = {
  name: "Finding Scribe (Bug Logger)",
  description:
    "Dedicated default bug logger that structures CVSS/CWE/PoC findings and saves them straight to Recent Findings.",
  icon: {
    type: "emoji",
    value:
      "https://cdn.jsdelivr.net/npm/emoji-datasource-apple/img/apple/64/1f41b.png",
    style: { backgroundColor: "rgb(5, 150, 105)" },
  },
  systemPrompt: DEFAULT_FINDING_SCRIBE_PROMPT,
  mandatorySystemPrompt: DEFAULT_CYBER_MANDATORY_SYSTEM_PROMPT,
  mentions: [],
  model: null,
  knowledgeBases: [],
};
