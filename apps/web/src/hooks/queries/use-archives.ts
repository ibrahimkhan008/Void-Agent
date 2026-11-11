import type { ArchiveWithItemCount } from "@/types/archive";
import { fetcher } from "lib/utils";
import useSWR from "swr";

type ArchiveListResponse = { archives: ArchiveWithItemCount[] };

export function useArchives() {
  return useSWR<ArchiveListResponse>("/api/archive", fetcher, {
    fallbackData: { archives: [] },
    revalidateOnFocus: false,
  });
}
