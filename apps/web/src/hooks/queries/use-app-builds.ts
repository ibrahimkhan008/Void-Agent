import { fetcher } from "lib/utils";
import useSWR from "swr";

export type AppBuildStatus =
  | "queued"
  | "generating"
  | "provisioning"
  | "ready"
  | "failed"
  | "cancelled";

export type AppBuildSummary = {
  id: string;
  threadId: string;
  title: string | null;
  summary: string | null;
  status: AppBuildStatus;
  previewUrl: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AppBuildDetail = AppBuildSummary & {
  prompt: string;
  files: { path: string; content: string }[];
  sandboxId: string | null;
  buildLog: string;
};

export function useAppBuilds() {
  return useSWR<{ builds: AppBuildSummary[] }>("/api/build", fetcher, {
    fallbackData: { builds: [] },
    revalidateOnFocus: false,
    refreshInterval: 5_000,
  });
}

export function useAppBuild(id: string) {
  return useSWR<{ build: AppBuildDetail }>(
    id ? `/api/build/${encodeURIComponent(id)}` : null,
    fetcher,
    {
      revalidateOnFocus: false,
      refreshInterval: (data) =>
        data && ["ready", "failed", "cancelled"].includes(data.build.status)
          ? 0
          : 1_500,
    },
  );
}
