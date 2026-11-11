"use client";

import { fetcher } from "lib/utils";
import useSWR, { type SWRConfiguration } from "swr";

export type Collection = {
  id: string;
  userId: string;
  orgId: null;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CollectionItem = {
  id: string;
  collectionId: string;
  sourceType: "file" | "source-url";
  sourceUrl: string | null;
  filename: string | null;
  mediaType: string | null;
  status: "pending" | "chunking" | "ready" | "failed";
  error: string | null;
  chunkCount: number;
  createdAt: string;
  updatedAt: string;
};

export function useCollections(options?: SWRConfiguration) {
  return useSWR<{ collections: Collection[] }>("/api/collections", fetcher, {
    revalidateOnFocus: false,
    errorRetryCount: 0,
    fallbackData: { collections: [] },
    ...options,
  });
}

export function useCollection(id?: string, options?: SWRConfiguration) {
  return useSWR<{
    collection: Collection;
    items: CollectionItem[];
    nextCursor: string | null;
  }>(id ? `/api/collections/${encodeURIComponent(id)}` : null, fetcher, {
    revalidateOnFocus: false,
    errorRetryCount: 0,
    ...options,
  });
}
