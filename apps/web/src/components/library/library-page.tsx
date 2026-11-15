"use client";

import { Eyebrow } from "@/components/ui/eyebrow";
import { fetcher } from "lib/utils";
import {
  File,
  FileArchive,
  FileImage,
  FileText,
  Film,
  LockKeyhole,
  Search,
  Share2,
  Sparkles,
} from "lucide-react";
import Image from "next/image";
import { useMemo, useState } from "react";
import useSWR from "swr";
import { Input } from "ui/input";

type LibraryFile = {
  id: string;
  name: string;
  contentType: string | null;
  size: number | null;
  createdAt: string | null;
  category: string;
  location: string;
  href: string;
  source: "storage" | "project" | "collection" | "canvas" | "shared-chat";
  visibility: string;
  previewUrl?: string;
};

const FILTERS = [
  "All",
  "Images",
  "Files",
  "Artifacts",
  "Canvases",
  "Videos",
  "Shared chats",
] as const;
type Filter = (typeof FILTERS)[number];

function formatBytes(size: number | null) {
  if (size === null) return null;
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024)
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatStorageBytes(size: number) {
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  if (size < 1024 * 1024 * 1024)
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function matchesFilter(file: LibraryFile, filter: Filter) {
  const type = file.contentType?.toLowerCase() ?? "";
  if (filter === "All") return true;
  if (filter === "Images") return type.startsWith("image/");
  if (filter === "Videos") return type.startsWith("video/");
  if (filter === "Canvases") return file.source === "canvas";
  if (filter === "Shared chats") return file.source === "shared-chat";
  if (filter === "Artifacts") return file.category === "Artifact";
  return (
    file.source !== "canvas" &&
    file.source !== "shared-chat" &&
    file.category !== "Artifact" &&
    !type.startsWith("image/") &&
    !type.startsWith("video/")
  );
}

function FileGlyph({ file }: { file: LibraryFile }) {
  const type = file.contentType?.toLowerCase() ?? "";
  if (type.startsWith("image/"))
    return <FileImage className="size-10 stroke-[1.4]" />;
  if (type.startsWith("video/"))
    return <Film className="size-10 stroke-[1.4]" />;
  if (file.source === "canvas")
    return <Sparkles className="size-10 stroke-[1.4]" />;
  if (file.source === "shared-chat")
    return <Share2 className="size-10 stroke-[1.4]" />;
  if (/zip|gzip|tar|rar|7z/.test(type))
    return <FileArchive className="size-10 stroke-[1.4]" />;
  if (/pdf|text|json|xml|word|sheet|presentation|csv/.test(type))
    return <FileText className="size-10 stroke-[1.4]" />;
  return <File className="size-10 stroke-[1.4]" />;
}

function extensionLabel(file: LibraryFile) {
  if (file.source === "canvas") return "HTML";
  if (file.source === "shared-chat") return "CHAT";
  const fromName = file.name.split(".").pop();
  const fromType = file.contentType?.split("/").pop();
  const extension = file.name.includes(".") ? fromName : fromType;
  return extension ? extension.slice(0, 5).toUpperCase() : "FILE";
}

function formatDate(date: string | null) {
  if (!date || !Number.isFinite(Date.parse(date))) return "";
  return new Date(date).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function LibraryPage() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("All");
  const { data, error, isLoading } = useSWR<{
    files: LibraryFile[];
    truncated?: boolean;
  }>("/api/library", fetcher, { revalidateOnFocus: false, errorRetryCount: 1 });

  const allFiles = data?.files ?? [];
  const totalBytes = allFiles.reduce((sum, file) => sum + (file.size ?? 0), 0);
  const files = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return allFiles.filter((file) => {
      const matchesSearch =
        !normalizedQuery ||
        `${file.name} ${file.category} ${file.location}`
          .toLocaleLowerCase()
          .includes(normalizedQuery);
      return matchesSearch && matchesFilter(file, filter);
    });
  }, [allFiles, filter, query]);

  return (
    <main className="mx-auto w-full max-w-[1104px] space-y-7 px-6 pb-12 pt-10">
      <header className="relative grid min-h-[154px] gap-7 overflow-hidden rounded-[24px] border border-white/[0.07] bg-gradient-to-br from-card via-card to-muted/30 p-7 shadow-[0_10px_35px_rgba(0,0,0,0.18)] md:grid-cols-[1fr_288px] md:items-center">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 w-1/2 opacity-30 [mask-image:linear-gradient(to_left,black,transparent)]"
          style={{
            backgroundImage:
              "radial-gradient(rgba(255,255,255,.12) .7px, transparent .7px)",
            backgroundSize: "8px 8px",
          }}
        />
        <div className="relative space-y-2">
          <Eyebrow>YOUR FILES</Eyebrow>
          <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.035em]">
            Library
          </h1>
          <p className="max-w-xl text-sm text-muted-foreground">
            Everything you&apos;ve uploaded and created, and who can see it.
          </p>
        </div>

        <div className="relative space-y-3">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="h-10 rounded-full border-white/[0.08] bg-background/80 pl-10 text-sm shadow-inner"
              placeholder="Search library"
              aria-label="Search library"
            />
          </label>
          <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            <span>Storage</span>
            <span>
              {isLoading
                ? "Loading"
                : `${formatStorageBytes(totalBytes)} of 10 GB used`}
            </span>
          </div>
          <div
            className="h-px w-full bg-gradient-to-r from-emerald-400/70 via-white/15 to-transparent"
            role="presentation"
          />
        </div>
      </header>

      <nav
        aria-label="Library categories"
        className="flex gap-1 overflow-x-auto"
      >
        {FILTERS.map((name) => (
          <button
            key={name}
            type="button"
            aria-pressed={filter === name}
            onClick={() => setFilter(name)}
            className={`shrink-0 rounded-full px-4 py-2 text-sm transition-colors ${
              filter === name
                ? "bg-secondary font-semibold text-foreground"
                : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
            }`}
          >
            {name}
          </button>
        ))}
      </nav>

      {isLoading ? (
        <p className="py-12 text-center text-sm text-muted-foreground">
          Loading your library…
        </p>
      ) : error ? (
        <p
          role="alert"
          className="rounded-xl border border-destructive/30 p-6 text-sm text-destructive"
        >
          Could not load your library. Please try again.
        </p>
      ) : files.length === 0 ? (
        <p className="rounded-xl border border-dashed border-white/10 p-12 text-center text-sm text-muted-foreground">
          {query
            ? "No items match your search."
            : filter === "All"
              ? "Files you upload or create will appear here."
              : `No ${filter.toLocaleLowerCase()} in your library yet.`}
        </p>
      ) : (
        <section
          aria-label={`${filter} in your library`}
          className="grid grid-cols-[repeat(auto-fill,minmax(190px,210px))] gap-3"
        >
          {files.map((file) => (
            <a
              key={file.id}
              href={file.href}
              className="group overflow-hidden rounded-[20px] border border-white/[0.025] bg-card/80 p-[6px] transition-colors hover:bg-secondary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              title={`${file.name} · ${file.visibility}`}
            >
              <div className="relative flex aspect-[1.34] items-center justify-center overflow-hidden rounded-[15px] border border-white/[0.04] bg-neutral-900/80 text-muted-foreground">
                {file.previewUrl ? (
                  <Image
                    src={file.previewUrl}
                    alt={file.name}
                    fill
                    unoptimized
                    sizes="210px"
                    className="object-cover"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <FileGlyph file={file} />
                    <span className="rounded-sm bg-background/70 px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground">
                      {extensionLabel(file)}
                    </span>
                  </div>
                )}
                <span
                  className="absolute left-2 top-2 flex size-6 items-center justify-center rounded-full border border-white/10 bg-black/35 text-white/60 backdrop-blur-sm"
                  title={file.visibility}
                  aria-label={file.visibility}
                >
                  {file.source === "shared-chat" || file.source === "canvas" ? (
                    <Share2 className="size-3" />
                  ) : (
                    <LockKeyhole className="size-3" />
                  )}
                </span>
              </div>
              <div className="space-y-0.5 px-1.5 pb-1 pt-2">
                <p
                  className="truncate text-[13px] font-semibold"
                  title={file.name}
                >
                  {file.name}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {file.category} · {formatBytes(file.size) ?? file.visibility}
                  {file.createdAt && ` · ${formatDate(file.createdAt)}`}
                </p>
              </div>
            </a>
          ))}
        </section>
      )}

      {data?.truncated && (
        <p className="text-center text-xs text-muted-foreground">
          Some file sources could not be listed or your library reached its
          safety limit.
        </p>
      )}
    </main>
  );
}
