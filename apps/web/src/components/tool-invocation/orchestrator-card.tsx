"use client";

import type { ToolUIPart, UIMessage } from "ai";
import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronDownIcon,
  FlaskConical,
  Hammer,
  Loader2,
  Search,
  ShieldCheck,
} from "lucide-react";
import { memo, useMemo, useState } from "react";
import { TextShimmer } from "ui/text-shimmer";
import { Markdown } from "../markdown";

/**
 * Void Orchestrator card (§3.2/§3.4 — Stage 06): renders the parallel worker
 * lanes (06A Research / 06B Build / 06C Test), the verification gate, and the
 * consolidated report. Structural mirror of OrchestratorToolOutput
 * (lib/ai/orchestrator) — declared locally so this client component never
 * imports the server module.
 */

interface WorkerMessagePart {
  type: string;
  text?: string;
}

interface OrchestratorCardOutput {
  status?: string;
  objective?: string;
  workers?: Array<{
    key: string;
    name: string;
    role: string;
    status?: string;
    summary?: string;
    attempts?: number;
  }>;
  workerKey?: string;
  workerName?: string;
  role?: string;
  workerStatus?: string;
  summary?: string;
  message?: UIMessage;
  verification?: {
    passed: boolean;
    summary: string;
    failedChecks: string[];
  };
  report?: string;
  artifacts?: Array<{
    path: string;
    content: string;
    workerKey: string;
    workerName: string;
  }>;
  artifactConflicts?: Array<{ path: string; workers: string[] }>;
}

const ROLE_ICONS: Record<string, typeof Search> = {
  research: Search,
  build: Hammer,
  test: FlaskConical,
};

const ROLE_LABELS: Record<string, string> = {
  research: "06A · Research & Inspect",
  build: "06B · Build & Modify",
  test: "06C · Test & Analyze",
};

function extractWorkerText(message: UIMessage | undefined): string {
  if (!message) return "";
  let text = "";
  for (const part of (message.parts ?? []) as WorkerMessagePart[]) {
    if (part.type === "text" && part.text?.trim()) text = part.text.trim();
  }
  return text;
}

export const OrchestratorCard = memo(function OrchestratorCard({
  part,
}: {
  part: ToolUIPart;
}) {
  const input = part.input as
    | {
        objective?: string;
        workers?: Array<{ key: string; name: string; role: string }>;
      }
    | undefined;
  const output = part.output as OrchestratorCardOutput | undefined;

  const [expandedWorker, setExpandedWorker] = useState<string | null>(null);

  const lanes = useMemo(() => {
    // Latest text per worker, accumulated from the running frames.
    const map = new Map<
      string,
      { name: string; role: string; status: string; text: string }
    >();
    for (const worker of input?.workers ?? []) {
      map.set(worker.key, {
        name: worker.name,
        role: worker.role,
        status: "running",
        text: "",
      });
    }
    if (output?.status === "worker-running" && output.workerKey) {
      const lane = map.get(output.workerKey);
      if (lane) {
        lane.text = extractWorkerText(output.message);
      }
    }
    if (output?.status === "worker-done" && output.workerKey) {
      const lane = map.get(output.workerKey);
      if (lane) {
        lane.status = output.workerStatus ?? "done";
        lane.text = output.summary ?? lane.text;
      }
    }
    if (output?.status === "done" && output.workers) {
      // Terminal state: the authoritative results.
      for (const worker of output.workers) {
        map.set(worker.key, {
          name: worker.name,
          role: worker.role,
          status: worker.status ?? "done",
          text: worker.summary ?? "",
        });
      }
    }
    return map;
  }, [input?.workers, output]);

  const report = output?.report ?? "";
  const verification = output?.verification;

  return (
    <div className="my-3 space-y-2 rounded-xl border p-3">
      <div className="flex items-center gap-2">
        <span className="font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
          Void Orchestrator
        </span>
        {output?.status === "done" ? (
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary">
            complete
          </span>
        ) : output?.status === "failed" ? (
          <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] text-destructive">
            failed
          </span>
        ) : null}
      </div>

      {output?.status === "planning" ? (
        <TextShimmer className="text-sm" duration={1.6}>
          Planning the worker team…
        </TextShimmer>
      ) : null}

      {/* Worker lanes */}
      <div className="space-y-1.5">
        {(input?.workers ?? []).map((worker) => {
          const lane = lanes.get(worker.key);
          const Icon = ROLE_ICONS[worker.role] ?? Search;
          const status = lane?.status ?? "running";
          const isLaneRunning =
            status === "running" && output?.status !== "done";
          const workerText = lane?.text ?? "";
          return (
            <div key={worker.key} className="rounded-lg border p-2">
              <div className="flex items-center gap-2">
                <Icon className="size-3.5 text-muted-foreground" />
                <span className="text-xs font-medium">{worker.name}</span>
                <span className="text-[10px] text-muted-foreground">
                  {ROLE_LABELS[worker.role] ?? worker.role}
                </span>
                {status === "succeeded" ? (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary">
                    done
                  </span>
                ) : status === "failed" ? (
                  <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] text-destructive">
                    failed
                  </span>
                ) : isLaneRunning ? (
                  <Loader2 className="size-3 animate-spin text-muted-foreground" />
                ) : null}
              </div>
              {workerText ? (
                <>
                  <button
                    type="button"
                    className="mt-1 inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
                    onClick={() =>
                      setExpandedWorker(
                        expandedWorker === worker.key ? null : worker.key,
                      )
                    }
                  >
                    <ChevronDownIcon
                      className={`size-3 transition-transform ${
                        expandedWorker === worker.key ? "rotate-180" : ""
                      }`}
                    />
                    Worker report
                  </button>
                  <AnimatePresence initial={false}>
                    {expandedWorker === worker.key ? (
                      <motion.div
                        initial={variants.collapsed}
                        animate={variants.expanded}
                        exit={variants.collapsed}
                        className="overflow-hidden"
                      >
                        <div className="rounded bg-muted/50 p-2 text-xs">
                          <Markdown>{workerText}</Markdown>
                        </div>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* Verification gate */}
      {output?.status === "verifying" ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <ShieldCheck className="size-4 animate-pulse" />
          Verifying build outputs against the criteria…
        </div>
      ) : null}
      {output?.status === "verification" || verification ? (
        <div
          className={`rounded-lg border p-2 text-xs ${
            verification?.passed
              ? "border-primary/40 bg-primary/5"
              : "border-destructive/40 bg-destructive/5"
          }`}
        >
          <p className="font-medium">
            <ShieldCheck className="mr-1 inline size-3.5" />
            Verification {verification?.passed ? "PASSED" : "FAILED"}
          </p>
          {verification?.summary ? (
            <div className="mt-1 text-muted-foreground">
              <Markdown>{verification.summary}</Markdown>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Consolidated report */}
      {output?.artifacts?.length ? (
        <section className="space-y-1 rounded-lg border p-3">
          <h4 className="text-xs font-medium">
            Generated files ({output.artifacts.length})
          </h4>
          {output.artifacts.map((artifact) => (
            <div
              key={`${artifact.workerKey}:${artifact.path}`}
              className="flex items-center justify-between gap-3 text-xs"
            >
              <span className="truncate font-mono">{artifact.path}</span>
              <a
                className="shrink-0 text-primary underline underline-offset-2"
                href={`data:text/plain;charset=utf-8,${encodeURIComponent(artifact.content)}`}
                download={artifact.path.replaceAll("/", "__")}
              >
                Download
              </a>
            </div>
          ))}
        </section>
      ) : null}
      {output?.artifactConflicts?.length ? (
        <section className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs">
          <h4 className="font-medium text-destructive">
            Conflicting files were withheld
          </h4>
          {output.artifactConflicts.map((conflict) => (
            <p key={conflict.path} className="mt-1">
              <code>{conflict.path}</code>: {conflict.workers.join(", ")}
            </p>
          ))}
        </section>
      ) : null}
      {report ? (
        <div className="rounded-lg bg-muted/40 p-3 text-sm">
          <Markdown>{report}</Markdown>
        </div>
      ) : isLaneAnyRunning() ? (
        <TextShimmer className="text-xs" duration={1.6}>
          Workers running in parallel…
        </TextShimmer>
      ) : null}
    </div>
  );

  function isLaneAnyRunning() {
    return [...lanes.values()].some(
      (lane) => lane.status === "running" && output?.status !== "done",
    );
  }
});

const variants = {
  collapsed: { height: 0, opacity: 0, marginTop: 0, marginBottom: 0 },
  expanded: {
    height: "auto",
    opacity: 1,
    marginTop: "0.5rem",
    marginBottom: "0.5rem",
  },
};
