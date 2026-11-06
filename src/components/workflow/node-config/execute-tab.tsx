import { generateObjectAction } from "@/app/api/chat/actions";
import { appStore } from "@/app/store";
import { useWorkflowStore } from "@/app/store/workflow.store";
import { SelectModel } from "@/components/select-model";
import { useObjectState } from "@/hooks/use-object-state";
import { useReactFlow } from "@xyflow/react";
import { allNodeValidate } from "lib/ai/workflow/node-validate";
import { NodeKind } from "lib/ai/workflow/workflow.interface";
import { UINode } from "lib/ai/workflow/workflow.interface";
import { notify } from "lib/notify";
import { cn } from "lib/utils";
import {
  AlertTriangleIcon,
  Check,
  Copy,
  Loader,
  WandSparklesIcon,
  XIcon,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "ui/alert";
import { Button } from "ui/button";
import { FlipWords } from "ui/flip-words";
import { Input } from "ui/input";
import JsonView from "ui/json-view";
import { Label } from "ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "ui/select";
import { Separator } from "ui/separator";
import { Switch } from "ui/switch";
import { Textarea } from "ui/textarea";

import { useCopy } from "@/hooks/use-copy";
import { useTranslations } from "next-intl";

export function ExecuteTab({
  close,
  onSave,
}: {
  close: () => void;
  onSave: () => Promise<void>;
}) {
  const { addProcess, processIds, workflow } = useWorkflowStore();

  const tabs = useMemo(
    () => [
      {
        label: "Input",
        value: "input",
      },
      {
        label: "Result",
        value: "result",
      },
    ],
    [],
  );

  const [tab, setTab] = useState<(typeof tabs)[number]["value"]>(tabs[0].value);
  const t = useTranslations();
  const [isRunning, setIsRunning] = useState(false);
  const [executionResult, setExecutionResult] = useState<unknown>();
  const [review, setReview] = useState<{
    workflowName: string;
    graphRevision: string;
    effects: string[];
    query: Record<string, unknown>;
  } | null>(null);
  const [isReviewing, setIsReviewing] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const { copied, copy } = useCopy();

  const isProcessing = useMemo(
    () => Boolean(processIds.length),
    [processIds.length],
  );

  const { getEdges, getNodes, setNodes } = useReactFlow<UINode>();
  const nodes = getNodes();

  const [query, setQuery] = useObjectState({} as Record<string, any>);
  const updateQuery = (next: Record<string, any>) => {
    setReview(null);
    setQuery(next);
  };

  const startNodeData = useMemo(() => {
    return nodes.find((node) => node.data.kind === NodeKind.Input)!.data;
  }, [nodes]);

  const inputSchema = useMemo(() => {
    return startNodeData.outputSchema;
  }, [startNodeData]);

  const inputSchemaIterator = useMemo(() => {
    return Object.entries(inputSchema.properties ?? {});
  }, [inputSchema]);

  const handleGenerateInputWithAI = useCallback(async () => {
    let model = appStore.getState().chatModel;
    const result = await notify.prompt({
      title: t("Common.generateInputWithAI"),
      description: (
        <div className="flex items-center gap-2">
          <p className="mr-auto">
            {t("Workflow.generateInputWithAIDescription")}
          </p>
          <SelectModel
            onSelect={(m) => {
              model = m;
            }}
          />
        </div>
      ),
    });
    if (!result) return;
    toast.promise(
      generateObjectAction({
        model,
        prompt: {
          system: `You are a parameter generator for tool execution.
Analyze the user's request and generate creative JSON data that matches the provided schema.
If information cannot be inferred from the user's question, use your creativity to generate engaging data.
Fill all required fields and return only valid JSON without explanations.

tool-name: ${workflow!.name}
${workflow!.description ? `tool-description: ${workflow!.description}` : ""}`,
          user: result,
        },
        schema: inputSchema,
      }).then((res) => {
        setReview(null);
        setQuery(res);
      }),
      {
        loading: t("Common.generatingInputWithAI"),
        success: t("Common.inputGeneratedSuccessfully"),
        error: t("Common.failedToGenerateInput"),
      },
    );
  }, [inputSchema]);

  const handleClick = async () => {
    await onSave();
    const failSchema = inputSchemaIterator.find(([key]) => {
      if (inputSchema.required?.includes(key) && query[key] === undefined)
        return true;
    });
    if (failSchema) {
      return toast.warning(`${failSchema[0]} is Empty`);
    }

    const validateResult = allNodeValidate({
      nodes,
      edges: getEdges(),
    });

    if (validateResult !== true) {
      if (validateResult.node) {
        setNodes((nds) => {
          return nds.map((node) => {
            if (node.id === validateResult.node?.id) {
              return { ...node, selected: true };
            }
            if (node.selected) {
              return { ...node, selected: false };
            }
            return node;
          });
        });
      }
      return toast.warning(validateResult.errorMessage);
    }
    setIsReviewing(true);
    try {
      const response = await fetch("/api/approvals/workflow-run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ previewN8nWorkflowId: workflow!.id }),
      });
      const payload = (await response.json().catch(() => null)) as {
        workflowName?: unknown;
        graphRevision?: unknown;
        effects?: unknown;
        error?: unknown;
      } | null;
      if (
        !response.ok ||
        typeof payload?.workflowName !== "string" ||
        typeof payload.graphRevision !== "string" ||
        !Array.isArray(payload.effects) ||
        !payload.effects.every((effect) => typeof effect === "string")
      ) {
        throw new Error(
          typeof payload?.error === "string"
            ? payload.error
            : "Could not review this workflow",
        );
      }
      setReview({
        workflowName: payload.workflowName,
        graphRevision: payload.graphRevision,
        effects: payload.effects,
        query: JSON.parse(JSON.stringify(query)) as Record<string, unknown>,
      });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not review this workflow",
      );
    } finally {
      setIsReviewing(false);
    }
  };

  const run = useCallback(
    async (
      query: Record<string, unknown>,
      approval: {
        workflowName: string;
        graphRevision: string;
        approvalToken: string;
      },
    ) => {
      const stop = addProcess();
      const abortController = new AbortController();
      setExecutionResult(undefined);
      setIsRunning(true);
      setNodes((nds) => {
        return nds.map((node) => {
          if (node.data.runtime?.status) {
            return {
              ...node,
              data: { ...node.data, runtime: { status: undefined } },
            };
          }
          return node;
        });
      });
      try {
        const response = await fetch(`/api/workflow/${workflow!.id}/execute`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ query, ...approval }),
          signal: abortController.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const execution = await response.json();
        setExecutionResult(execution);
        setTab("result");
        stop();
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          // User aborted execution; expected.
        } else {
          console.error("Workflow execution error:", error);
        }
        stop();
      } finally {
        setIsRunning(false);
      }
    },
    [workflow!.id],
  );

  const approveAndRun = async () => {
    if (!review) return;
    setIsApproving(true);
    try {
      const approvalResponse = await fetch("/api/approvals/workflow-run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: "n8n",
          target: workflow!.id,
          workflowName: review.workflowName,
          graphRevision: review.graphRevision,
          payload: review.query,
        }),
      });
      const payload = (await approvalResponse.json().catch(() => null)) as {
        approvalToken?: unknown;
        error?: unknown;
      } | null;
      if (!approvalResponse.ok || typeof payload?.approvalToken !== "string") {
        throw new Error(
          typeof payload?.error === "string"
            ? payload.error
            : "Could not save this workflow approval",
        );
      }
      const approvedReview = review;
      setReview(null);
      await run(approvedReview.query, {
        workflowName: approvedReview.workflowName,
        graphRevision: approvedReview.graphRevision,
        approvalToken: payload.approvalToken,
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not run this workflow",
      );
    } finally {
      setIsApproving(false);
    }
  };

  const resultView = useMemo(() => {
    if (isRunning) return;
    return (
      <div className="p-2">
        <JsonView data={executionResult ?? "No execution result yet"} />
      </div>
    );
  }, [executionResult, isRunning]);
  return (
    <div className="fade-300 w-sm h-[85vh] bg-card border rounded-lg shadow-lg overflow-y-auto py-4">
      <div className="flex flex-col px-4">
        <div className="flex items-center gap-2 w-full h-9">
          <span className="font-semibold">Test Run</span>
          <div
            className={cn(
              "p-1 rounded hover:bg-secondary cursor-pointer ml-auto",
              isProcessing && "sr-only",
            )}
            onClick={close}
          >
            <XIcon className="size-3.5" />
          </div>
        </div>
      </div>
      <div className="flex">
        {tabs.map((t) => (
          <Button
            key={t.value}
            variant="ghost"
            className={cn(
              "rounded-none",
              tab == t.value && "border-b border-primary",
            )}
            onClick={() => setTab(t.value)}
          >
            {t.label}
          </Button>
        ))}
      </div>
      <Separator className="mb-4" />

      {tab == tabs[0].value ? (
        <div className="px-4 flex flex-col gap-4">
          {inputSchemaIterator.length == 0 ? (
            <div className="flex items-center justify-center h-40">
              <FlipWords
                className="text-sm text-muted-foreground"
                words={["No input required for this workflow"]}
              />
            </div>
          ) : (
            <>
              <div
                tabIndex={1}
                onClick={handleGenerateInputWithAI}
                className="hover:bg-secondary rounded-sm px-2 py-1 flex items-center gap-2 ml-auto text-xs font-semibold cursor-pointer hover:text-primary transition-colors"
              >
                {t("Common.generateInputWithAI")}
                <WandSparklesIcon className="size-3" />
              </div>
              {inputSchemaIterator.map(([key, schema], i) => {
                return (
                  <div key={key ?? i}>
                    <Label
                      className="mb-2 text-sm font-semibold ml-0.5 gap-0.5"
                      htmlFor={key || String(i)}
                    >
                      {key || "undefined"}
                      {inputSchema.required?.includes(key) && (
                        <span className="text-xs text-destructive">*</span>
                      )}
                    </Label>
                    {schema.type == "number" ? (
                      <Input
                        disabled={isProcessing}
                        id={key || String(i)}
                        type="number"
                        placeholder={schema.description || "number"}
                        defaultValue={query[key] || undefined}
                        onChange={(e) =>
                          updateQuery({
                            ...query,
                            [key]: Number(e.target.value),
                          })
                        }
                      />
                    ) : schema.type == "boolean" ? (
                      <Switch
                        disabled={isProcessing}
                        id={key || String(i)}
                        checked={query[key]}
                        onCheckedChange={(checked) =>
                          updateQuery({ ...query, [key]: checked })
                        }
                      />
                    ) : schema.type == "string" && schema.enum ? (
                      <Select
                        disabled={isProcessing}
                        value={query[key]}
                        onValueChange={(value) =>
                          updateQuery({ ...query, [key]: value })
                        }
                      >
                        <SelectTrigger
                          id={key || String(i)}
                          className="min-w-46"
                        >
                          <SelectValue
                            placeholder={schema.description || "option"}
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {(schema.enum as string[]).map((item, i) => (
                            <SelectItem key={item ?? i} value={item}>
                              {item}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : schema.type == "string" ? (
                      <Textarea
                        disabled={isProcessing}
                        id={key || String(i)}
                        value={query[key]}
                        className="resize-none max-h-28 overflow-y-auto"
                        placeholder={schema.description || "string"}
                        onChange={(e) =>
                          updateQuery({ ...query, [key]: e.target.value })
                        }
                      />
                    ) : null}
                  </div>
                );
              })}
            </>
          )}
          {review && (
            <Alert className="my-3">
              <AlertTriangleIcon />
              <AlertTitle>Review workflow effects</AlertTitle>
              <AlertDescription className="space-y-2">
                <p>
                  Confirm these saved steps and the exact input before the
                  workflow runs.
                </p>
                <ul className="list-disc pl-5">
                  {review.effects.map((effect, index) => (
                    <li key={`${index}-${effect}`}>{effect}</li>
                  ))}
                </ul>
                <pre className="max-h-32 overflow-auto rounded bg-muted p-2 text-xs">
                  {JSON.stringify(review.query, null, 2)}
                </pre>
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    disabled={isApproving || isRunning}
                    onClick={() => setReview(null)}
                  >
                    Cancel
                  </Button>
                  <Button
                    disabled={isApproving || isRunning}
                    onClick={() => void approveAndRun()}
                  >
                    {isApproving ? "Approving…" : "Approve and run"}
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          )}
          <Button
            disabled={isProcessing || isReviewing || isApproving}
            className="font-bold w-full"
            onClick={handleClick}
          >
            {isProcessing ? (
              <Loader className="size-3.5 animate-spin" />
            ) : isReviewing ? (
              "Reviewing…"
            ) : (
              "Review effects before running"
            )}
          </Button>
        </div>
      ) : tab == tabs[1].value ? (
        <div className="px-4 py-4">
          <div className="flex items-center mb-4">
            <p className="font-semibold text-sm">Run request response</p>
            <Button
              variant="ghost"
              size="icon"
              className="ml-auto"
              onClick={() => copy(JSON.stringify(executionResult))}
            >
              {copied ? (
                <Check className="size-3" />
              ) : (
                <Copy className="size-3" />
              )}
            </Button>
          </div>
          {resultView}
        </div>
      ) : null}
    </div>
  );
}
