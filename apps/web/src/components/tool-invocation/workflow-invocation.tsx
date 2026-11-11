import { MediaPreview } from "@/components/media";
import { useCopy } from "@/hooks/use-copy";
import { normalizeWorkflowVideoResponse } from "@/lib/utils/mcp-media-parser";
import { VercelAIWorkflowToolStreamingResult } from "app-types/workflow";
import equal from "lib/equal";
import { cn } from "lib/utils";
import {
  AlertCircle,
  AlertTriangleIcon,
  Check,
  Copy,
  Loader2,
  XIcon,
} from "lucide-react";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "ui/alert";
import { Button } from "ui/button";
import JsonView from "ui/json-view";
import { TextShimmer } from "ui/text-shimmer";
import { NodeIcon } from "../workflow/node-icon";
import { NodeResultPopup } from "../workflow/node-result-popup";

interface WorkflowInvocationProps {
  result: VercelAIWorkflowToolStreamingResult;
  canDecide?: boolean;
}

function PureWorkflowInvocation({
  result,
  canDecide = true,
}: WorkflowInvocationProps) {
  const [decisionResult, setDecisionResult] =
    useState<VercelAIWorkflowToolStreamingResult | null>(null);
  const [decisionBusy, setDecisionBusy] = useState(false);
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const displayedResult = decisionResult ?? result;
  const { copied, copy } = useCopy();
  const savedResult = useRef<VercelAIWorkflowToolStreamingResult>(result);

  useEffect(() => {
    savedResult.current = result;
    if (result.status === "running") setDecisionResult(null);
  }, [result]);

  const decidePendingEffect = async (decision: "approve" | "reject") => {
    if (
      decisionBusy ||
      !displayedResult.executionId ||
      !displayedResult.pendingEffect
    )
      return;
    setDecisionBusy(true);
    setDecisionError(null);
    try {
      const response = await fetch(
        `/api/workflow/executions/${encodeURIComponent(displayedResult.executionId)}/decision`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            effectHash: displayedResult.pendingEffect.hash,
            decision,
          }),
        },
      );
      const body = (await response.json()) as Record<string, any>;
      if (!response.ok) {
        throw new Error(
          body.error || "Could not process this workflow decision.",
        );
      }
      if (decision === "reject") {
        setDecisionResult({
          ...displayedResult,
          status: "cancelled",
          pendingEffect: undefined,
        });
      } else {
        const allowedStatuses = new Set([
          "success",
          "fail",
          "awaiting_approval",
          "effect_uncertain",
          "cancelled",
        ]);
        setDecisionResult({
          ...displayedResult,
          ...body,
          status: allowedStatuses.has(body.status) ? body.status : "fail",
          pendingEffect: body.pendingEffect,
        });
      }
    } catch (cause) {
      setDecisionError(
        cause instanceof Error
          ? cause.message
          : "Could not process this workflow decision.",
      );
    } finally {
      setDecisionBusy(false);
    }
  };

  // Check if this is a video workflow result
  const hasVideoResults = useMemo(() => {
    if (!displayedResult.result) return false;

    // Helper function to check if an item contains video data
    const hasVideoData = (item: any) => {
      if (!item || typeof item !== "object") return false;

      // Check for flat Twelve Labs format (legacy)
      const hasLegacyFormat = "video_id" in item && "thumbnail_url" in item;

      // Check for n8n HTTP response format (current) - only require video_url
      const hasHttpFormat = item.body?.hls?.video_url;

      return hasLegacyFormat || hasHttpFormat;
    };

    // Try different possible array locations
    const possibleArrays = [
      displayedResult.result.data, // Standard: result.result.data
      displayedResult.result.output, // Alternative: result.result.output
      displayedResult.result, // Direct: result.result is array
    ];

    for (const arrayData of possibleArrays) {
      if (Array.isArray(arrayData) && arrayData.some(hasVideoData)) {
        return true;
      }
    }

    return false;
  }, [displayedResult.result]);

  // Process video results for MediaPreview
  const videoMediaResult = useMemo(() => {
    if (!hasVideoResults || !displayedResult.result) return null;
    return normalizeWorkflowVideoResponse(displayedResult.result);
  }, [hasVideoResults, displayedResult.result]);

  const output = useMemo(() => {
    if (displayedResult.status == "running") return null;
    if (displayedResult.status == "fail")
      return (
        <Alert variant={"destructive"} className="border-destructive">
          <AlertTriangleIcon className="size-3" />
          <AlertTitle>{displayedResult?.error?.name || "ERROR"}</AlertTitle>
          <AlertDescription>{displayedResult.error?.message}</AlertDescription>
        </Alert>
      );
    if (
      displayedResult.status === "awaiting_approval" &&
      displayedResult.pendingEffect
    ) {
      return (
        <Alert className="border-amber-500/50">
          <AlertCircle className="size-4" />
          <AlertTitle>Review the next workflow action</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>
              {displayedResult.pendingEffect.kind.toUpperCase()}:{" "}
              {displayedResult.pendingEffect.target}
            </p>
            <div className="max-h-48 overflow-auto rounded border bg-background p-2 text-xs">
              <JsonView data={displayedResult.pendingEffect.payload} />
            </div>
            {!canDecide && (
              <p>
                This shared transcript is read-only; the action cannot be
                approved here.
              </p>
            )}
            {decisionError && (
              <p role="alert" className="text-destructive">
                {decisionError}
              </p>
            )}
            {canDecide && (
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  disabled={decisionBusy}
                  onClick={() => void decidePendingEffect("reject")}
                >
                  Reject action
                </Button>
                <Button
                  disabled={decisionBusy}
                  onClick={() => void decidePendingEffect("approve")}
                >
                  {decisionBusy ? "Processing..." : "Approve action"}
                </Button>
              </div>
            )}
          </AlertDescription>
        </Alert>
      );
    }
    if (displayedResult.status === "effect_uncertain") {
      return (
        <Alert variant="destructive">
          <AlertTriangleIcon className="size-4" />
          <AlertTitle>Workflow action needs review</AlertTitle>
          <AlertDescription>
            {displayedResult.error?.message ||
              "The external action may have completed. It was not retried."}
          </AlertDescription>
        </Alert>
      );
    }
    if (displayedResult.status === "cancelled") {
      return (
        <Alert>
          <XIcon className="size-4" />
          <AlertTitle>Workflow stopped</AlertTitle>
          <AlertDescription>The pending action was rejected.</AlertDescription>
        </Alert>
      );
    }
    if (!displayedResult.result) return null;

    // If this is a video workflow result, render with MediaPreview
    if (hasVideoResults && videoMediaResult) {
      return (
        <div className="w-full space-y-4">
          {/* Video media preview */}
          <MediaPreview mediaResources={videoMediaResult} groupByType={true} />

          {/* Raw data toggle for debugging */}
          <div className="w-full bg-card p-4 border text-xs rounded-lg text-muted-foreground">
            <div className="flex items-center">
              <h5 className="text-muted-foreground font-medium select-none">
                Raw Response Data
              </h5>
              <div className="flex-1" />
              {copied ? (
                <Check className="size-3" />
              ) : (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-3 text-muted-foreground"
                  onClick={() => copy(JSON.stringify(displayedResult.result))}
                >
                  <Copy className="size-3" />
                </Button>
              )}
            </div>
            <div className="p-2 max-h-[200px] overflow-y-auto">
              <JsonView data={displayedResult.result} />
            </div>
          </div>
        </div>
      );
    }

    // Default JSON view for non-video results
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
              onClick={() => copy(JSON.stringify(displayedResult.result))}
            >
              <Copy className="size-3" />
            </Button>
          )}
        </div>
        <div className="p-2 max-h-[300px] overflow-y-auto">
          <JsonView data={displayedResult.result} />
        </div>
      </div>
    );
  }, [
    displayedResult.status,
    displayedResult.error,
    displayedResult.result,
    copied,
    hasVideoResults,
    videoMediaResult,
    decisionError,
    decisionBusy,
    displayedResult.executionId,
    displayedResult.pendingEffect,
    canDecide,
  ]);
  useEffect(() => {
    if (result.status == "running") {
      savedResult.current = result;
    }
  }, [result]);

  return (
    <div className="w-full flex flex-col gap-1">
      {displayedResult.history.map((item, i) => {
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
      <div className="mt-2">{output}</div>
    </div>
  );
}

function areEqual(
  prev: WorkflowInvocationProps,
  next: WorkflowInvocationProps,
) {
  if (prev.result.status != next.result.status) return false;
  if (prev.canDecide !== next.canDecide) return false;
  if (prev.result.error?.message != next.result.error?.message) return false;
  if (prev.result.result != next.result.result) return false;
  if (!equal(prev.result.history, next.result.history)) return false;
  if (!equal(prev.result.result, next.result.result)) return false;
  return true;
}

export const WorkflowInvocation = memo(PureWorkflowInvocation, areEqual);
