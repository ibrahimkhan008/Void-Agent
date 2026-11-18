export const INTERNAL_HOOK_EVENT_TYPES = [
  "project.created",
  "project.updated",
  "project.deleted",
  "project.record.updated",
  "project.record.restored",
  "memory.record.updated",
  "agent.run.completed",
  "workflow.run.completed",
] as const;

export type InternalHookEventType = (typeof INTERNAL_HOOK_EVENT_TYPES)[number];
