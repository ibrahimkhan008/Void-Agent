import { z } from "zod";

/** Shared typed vocabulary for generated snapshots and notification transitions. */
export const ProjectBrainHealthSchema = z.enum([
  "green",
  "yellow",
  "red",
  "unknown",
]);

export type ProjectBrainHealth = z.infer<typeof ProjectBrainHealthSchema>;
