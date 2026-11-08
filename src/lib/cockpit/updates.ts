export const COCKPIT_UPDATE_TYPES = [
  "agent_update_info",
  "agent_update_warning",
  "agent_update_alert",
] as const;

export type CockpitUpdateSeverity = "info" | "warning" | "alert";

export function parseCockpitUpdateSeverity(
  type: string,
): CockpitUpdateSeverity | null {
  if (type === "agent_update_info") return "info";
  if (type === "agent_update_warning") return "warning";
  if (type === "agent_update_alert") return "alert";
  return null;
}
