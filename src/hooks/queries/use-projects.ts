"use client";

import { fetcher } from "lib/utils";
import useSWR, { SWRConfiguration } from "swr";

export interface Project {
  id: string;
  userId: string;
  teamId: string | null;
  accessMode?: "team" | "selected";
  name: string;
  description: string | null;
  goal: string | null;
  systemPrompt: string | null;
  collectionIds: string[];
  role?: "owner" | "editor" | "viewer";
  createdAt: string;
  updatedAt: string;
}

export interface ProjectTeam {
  id: string;
  name: string;
  role: "owner" | "editor" | "viewer";
}

export function useProjects(options?: SWRConfiguration) {
  return useSWR<{ projects: Project[] }>("/api/projects", fetcher, {
    revalidateOnFocus: false,
    errorRetryCount: 0,
    fallbackData: { projects: [] },
    ...options,
  });
}

export function useProjectTeams(options?: SWRConfiguration) {
  return useSWR<{ teams: ProjectTeam[] }>("/api/projects/teams", fetcher, {
    revalidateOnFocus: false,
    errorRetryCount: 0,
    fallbackData: { teams: [] },
    ...options,
  });
}
