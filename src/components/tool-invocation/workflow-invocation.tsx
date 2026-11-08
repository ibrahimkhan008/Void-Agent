import { useCopy } from "@/hooks/use-copy";
import { VercelAIWorkflowToolStreamingResult } from "app-types/workflow";
import equal from "lib/equal";
import { cn } from "lib/utils";
import { AlertTriangleIcon, Check, Copy, Loader2, XIcon } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "ui/alert";
import { Button } from "ui/button";
import JsonView from "ui/json-view";
import { TextShimmer } from "ui/text-shimmer";
import { NodeIcon } from "../workflow/node-icon";
import { NodeResultPopup } from "../workflow/node-result-popup";
import { extractWorkflowVideoMedia } from "./workflow-video-media";
import { WorkflowVideoPlayer } from "./workflow-video-player";

interface WorkflowInvocationProps {
  result: VercelAIWorkflowToolStreamingResult;
}

function PureWorkflowInvocation({ result }: WorkflowInvocationProps) {
  const { copied, copy } = useCopy();
  const [decisionResult, setDecisionResult] = useState<
    VercelAIWorkflowToolStreamingResult | undefined
  >();
  const [decisionBusy, setDecisionBusy] = useState(false);
  const [decisionError, setDecisionError] = useState<string>();
  const current = decisionResult ?? result;
  const savedResult = useRef<VercelAIWorkflowToolStreamingResult>(result);
  const videoMedia = useMemo(
    () => extractWorkflowVideoMedia(current.result),
    [current.result],
  );
  const decide = useCallback(
    async (decision: "approve" | "reject") => {
      if (!current.executionId || !current.pendingEffect) return;
      setDecisionBusy(true);
      setDecisionError(undefined);
      try {
        const response = await fetch(
          `/api/workflow/executions/${encodeURIComponent(current.executionId)}/decision`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              decision,
              effectHash: current.pendingEffect.hash,
            }),
          },
        );
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          setDecisionError(
            typeof body.error === "string"
              ? body.error
              : "Could not process this workflow decision.",
          );
          return;
        }
        setDecisionResult({
          ...current,
          ...body,
          history: Array.isArray(body.history) ? body.history : current.history,
        });
      } catch {
        setDecisionError("Could not contact the workflow service.");
      } finally {
        setDecisionBusy(false);
      }
    },
    [current],
  );
  const output = useMemo(() => {
    if (current.status == "running") return null;
    if (current.status == "fail")
      return (
        <Alert variant={"destructive"} className="border-destructive">
          <AlertTriangleIcon className="size-3" />
          <AlertTitle>{current?.error?.name || "ERROR"}</AlertTitle>
          <AlertDescription>{current.error?.message}</AlertDescription>
        </Alert>
      );
    if (current.status === "effect_uncertain")
      return (
        <Alert variant="destructive" className="border-destructive">
          <AlertTriangleIcon className="size-3" />
          <AlertTitle>Action result uncertain</AlertTitle>
          <AlertDescription>
            {current.error?.message ||
              "This workflow will not automatically retry an action that may have completed."}
          </AlertDescription>
        </Alert>
      );
    if (!current.result) return null;

    if (videoMedia.length > 0) {
      return (
        <div className="w-full space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            {videoMedia.map((media) => (
              <WorkflowVideoPlayer key={media.url} media={media} />
            ))}
          </div>
          <div className="w-full rounded-lg border bg-card p-4 text-xs text-muted-foreground">
            <div className="flex items-center">
              <h5 className="select-none font-medium">Raw Response Data</h5>
              <div className="flex-1" />
              {copied ? (
                <Check className="size-3" />
              ) : (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-3 text-muted-foreground"
                  onClick={() => copy(JSON.stringify(current.result))}
                >
                  <Copy className="size-3" />
                </Button>
              )}
            </div>
            <div className="max-h-[200px] overflow-y-auto p-2">
              <JsonView data={current.result} />
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="w-full bg-card p-4 border text-xs rounded-lg text-muted-foreground">
        <div className="flex items-center">
          <h5 className="text-muted-foreground font-medium select-none">
            Response
          </h5>
          <div className="flex-1" />
          {copied ? (
            <Check className="size-3" />
          ) : (
            <Button
              variant="ghost"
              size="icon"
              className="size-3 text-muted-foreground"
              onClick={() => copy(JSON.stringify(current.result))}
            >
              <Copy className="size-3" />
            </Button>
          )}
        </div>
        <div className="p-2 max-h-[300px] overflow-y-auto">
          <JsonView data={current.result} />
        </div>
      </div>
    );
  }, [current.status, current.error, current.result, copied, videoMedia]);
  useEffect(() => {
    if (current.status == "running") {
      savedResult.current = result;
    }
  }, [current.status, result]);

  return (
    <div className="w-full flex flex-col gap-1">
      {current.history.map((item, i) => {
        const result = item.result || savedResult.current.history[i]?.result;
        return (
          <NodeResultPopup
            key={item.id}
            disabled={!result}
            history={{
              name: item.name,
              status: item.status,
              startedAt: item.startedAt,
              endedAt: item.endedAt,
              error: item.error?.message,
              result,
            }}
          >
            <div
              key={item.id}
              className={cn(
                "flex items-center gap-2 text-sm rounded-sm px-2 py-1.5 relative",
                item.status == "fail" && "text-destructive",
                !!result && "cursor-pointer hover:bg-secondary",
              )}
            >
              <div className="border rounded overflow-hidden">
                <NodeIcon
                  type={item.kind}
                  iconClassName="size-3"
                  className="rounded-none"
                />
              </div>
              {item.status == "running" ? (
                <TextShimmer className="font-semibold">
                  {`${item.name} Running...`}
                </TextShimmer>
              ) : (
                <span className="font-semibold">{item.name}</span>
              )}
              <span
                className={cn(
                  "ml-auto text-xs",
                  item.status != "fail" && "text-muted-foreground",
                )}
              >
                {item.status != "running" &&
                  ((item.endedAt! - item.startedAt!) / 1000).toFixed(2)}
              </span>
              {item.status == "success" ? (
                <Check className="size-3" />
              ) : item.status == "fail" ? (
                <XIcon className="size-3" />
              ) : (
                <Loader2 className="size-3 animate-spin" />
              )}
            </div>
          </NodeResultPopup>
        );
      })}
      {current.status === "awaiting_approval" && current.pendingEffect ? (
        <div className="mt-2 space-y-3 rounded-md border border-amber-500/40 bg-amber-500/5 p-3">
          <div>
            <p className="text-sm font-semibold">Review workflow action</p>
            <p className="text-xs text-muted-foreground">
              {current.pendingEffect.kind} · {current.pendingEffect.target}
            </p>
          </div>
          <div className="max-h-64 overflow-auto rounded border bg-background p-2 text-xs">
            <JsonView data={current.pendingEffect.payload} />
          </div>
          {decisionError ? (
            <p role="alert" className="text-sm text-destructive">
              {decisionError}
            </p>
          ) : null}
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => void decide("approve")}
              disabled={decisionBusy}
            >
              {decisionBusy ? (
                <Loader2 className="mr-2 size-3 animate-spin" />
              ) : null}
              Approve and continue
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void decide("reject")}
              disabled={decisionBusy}
            >
              Reject
            </Button>
          </div>
        </div>
      ) : null}
      <div className="mt-2">{output}</div>
    </div>
  );
}

function areEqual(
  prev: WorkflowInvocationProps,
  next: WorkflowInvocationProps,
) {
  if (prev.result.status != next.result.status) return false;
  if (prev.result.error?.message != next.result.error?.message) return false;
  if (prev.result.executionId != next.result.executionId) return false;
  if (!equal(prev.result.pendingEffect, next.result.pendingEffect))
    return false;
  if (prev.result.result != next.result.result) return false;
  if (!equal(prev.result.history, next.result.history)) return false;
  if (!equal(prev.result.result, next.result.result)) return false;
  return true;
}

export const WorkflowInvocation = memo(PureWorkflowInvocation, areEqual);
