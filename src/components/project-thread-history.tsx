"use client";

import { MessageSquareText } from "lucide-react";
import Link from "next/link";
import React from "react";
import useSWR from "swr";
import { Card, CardContent, CardHeader, CardTitle } from "ui/card";

type ProjectThread = {
  id: string;
  title: string;
  createdAt: string | Date;
  lastMessageAt: string | null;
};

const fetcher = async (url: string) => {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error("Could not load project chats");
  return response.json() as Promise<{ threads: ProjectThread[] }>;
};

function updatedLabel(thread: ProjectThread) {
  const value = thread.lastMessageAt ?? thread.createdAt;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : `Updated ${date.toLocaleDateString()}`;
}

export function ProjectThreadHistory({ projectId }: { projectId: string }) {
  const { data, error, isLoading } = useSWR(
    `/api/projects/${projectId}/threads`,
    fetcher,
    { revalidateOnFocus: false },
  );
  const threads = data?.threads ?? [];

  return (
    <Card className="mt-4">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageSquareText className="size-4" /> Project chats
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading chats…</p>
        ) : error ? (
          <p role="alert" className="text-sm text-destructive">
            Could not load project chats.
          </p>
        ) : threads.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Chats you start in this project will appear here.
          </p>
        ) : (
          <ul className="divide-y">
            {threads.map((thread) => (
              <li key={thread.id} className="py-2 first:pt-0 last:pb-0">
                <Link
                  href={`/chat/${thread.id}`}
                  className="flex items-center justify-between gap-3 rounded-sm text-sm hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="truncate">{thread.title || "New chat"}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {updatedLabel(thread)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
