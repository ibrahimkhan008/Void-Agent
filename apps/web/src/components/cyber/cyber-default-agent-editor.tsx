"use client";

import { AgentIconPicker } from "@/components/agent/agent-icon-picker";
import { AgentToolSelector } from "@/components/agent/agent-tool-selector";
import { GenerateAgentDialog } from "@/components/agent/generate-agent-dialog";
import { SelectModel } from "@/components/select-model";
import { useKnowledgeBases } from "@/hooks/queries/use-knowledge-bases";
import { useMcpList } from "@/hooks/queries/use-mcp-list";
import { useSkills } from "@/hooks/queries/use-skills";
import { useWorkflowToolList } from "@/hooks/queries/use-workflow-tool-list";
import { formatAgentModel, parseAgentModel } from "@/lib/ai/agent-model";
import type { AgentKnowledgeBaseBinding } from "app-types/agent";
import type { ChatMention } from "app-types/chat";
import type { MCPServerInfo } from "app-types/mcp";
import type { WorkflowSummary } from "app-types/workflow";
import { defaultToolMentionsFromNames } from "lib/ai/agent/default-tool-mentions";
import type { CyberDefaultAgentConfig } from "lib/cyber/default-agent-types";
import {
  ChevronDown,
  Loader2,
  RotateCcw,
  Save,
  ShieldAlert,
  WandSparklesIcon,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "ui/dropdown-menu";
import { Input } from "ui/input";
import { Label } from "ui/label";
import { Textarea } from "ui/textarea";

function CyberKnowledgeBaseSelector({
  bindings,
  disabled,
  onChange,
}: {
  bindings: AgentKnowledgeBaseBinding[];
  disabled?: boolean;
  onChange: (bindings: AgentKnowledgeBaseBinding[]) => void;
}) {
  const { knowledgeBases, projects, isLoading } = useKnowledgeBases();

  const toggle = (binding: AgentKnowledgeBaseBinding, checked: boolean) => {
    onChange(
      checked
        ? [...bindings.filter((b) => b.id !== binding.id), binding]
        : bindings.filter((b) => b.id !== binding.id),
    );
  };
  const isBound = (id: string) => bindings.some((b) => b.id === id);

  const label = bindings.length
    ? bindings.map((b) => b.name || "Untitled").join(", ")
    : "None — add a knowledge base";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="secondary"
          className="bg-secondary/40 max-w-full justify-start data-[state=open]:bg-input! hover:bg-input!"
          disabled={disabled || isLoading}
        >
          <span className="truncate">{label}</span>
          <ChevronDown className="ml-auto size-3.5 opacity-60 shrink-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        {knowledgeBases.length === 0 && projects.length === 0 && (
          <DropdownMenuLabel className="font-normal text-muted-foreground">
            No knowledge bases yet — upload one from chat&apos;s + menu.
          </DropdownMenuLabel>
        )}
        {knowledgeBases.length > 0 && (
          <>
            <DropdownMenuLabel>Knowledge bases</DropdownMenuLabel>
            {knowledgeBases.map((kb) => (
              <DropdownMenuCheckboxItem
                key={kb.id}
                checked={isBound(kb.id)}
                onCheckedChange={(checked) =>
                  toggle({ type: "kb", id: kb.id, name: kb.name }, !!checked)
                }
                onSelect={(e) => e.preventDefault()}
              >
                {kb.name}
              </DropdownMenuCheckboxItem>
            ))}
          </>
        )}
        {projects.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Projects</DropdownMenuLabel>
            {projects.map((project) => (
              <DropdownMenuCheckboxItem
                key={project.id}
                checked={isBound(project.id)}
                onCheckedChange={(checked) =>
                  toggle(
                    { type: "project", id: project.id, name: project.name },
                    !!checked,
                  )
                }
                onSelect={(e) => e.preventDefault()}
              >
                {project.name}
              </DropdownMenuCheckboxItem>
            ))}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface CyberDefaultAgentEditorProps {
  title: string;
  subtitle: string;
  value: CyberDefaultAgentConfig;
  factoryDefault?: CyberDefaultAgentConfig;
  saving?: boolean;
  saveLabel?: string;
  onSave: (next: CyberDefaultAgentConfig) => Promise<void> | void;
}

/**
 * Matches the `/agent/new` (EditAgent) creation & editing system 1-to-1
 * (Name + IconPicker, Description, Instructions, Tools/Skills, Model Picker,
 * Knowledge Bases, Generate with AI) PLUS the required Extra Mandatory
 * System Prompt enforced unconditionally on every Void Cyber execution.
 */
export function CyberDefaultAgentEditor({
  title,
  subtitle,
  value,
  factoryDefault,
  saving = false,
  saveLabel = "Save Agent",
  onSave,
}: CyberDefaultAgentEditorProps) {
  const [draft, setDraft] = useState<CyberDefaultAgentConfig>(value);
  const [openGenerate, setOpenGenerate] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const { data: mcpList, isLoading: isMcpLoading } = useMcpList();
  const { data: workflowToolList, isLoading: isWorkflowLoading } =
    useWorkflowToolList();
  useSkills();

  useEffect(() => {
    setDraft(value);
    setValidationError(null);
  }, [value]);

  const isLoadingTool = isMcpLoading || isWorkflowLoading;

  const assignToolsByNames = useCallback(
    (toolNames: string[]) => {
      const allMentions: ChatMention[] = [
        ...defaultToolMentionsFromNames(toolNames),
      ];

      (mcpList as (MCPServerInfo & { id: string })[])?.forEach((mcp) => {
        mcp.toolInfo.forEach((tool) => {
          if (toolNames.includes(tool.name)) {
            allMentions.push({
              type: "mcpTool",
              serverName: mcp.name,
              name: tool.name,
              serverId: mcp.id,
            });
          }
        });
      });

      (workflowToolList as WorkflowSummary[])?.forEach((workflow) => {
        if (toolNames.includes(workflow.name)) {
          allMentions.push({
            type: "workflow",
            name: workflow.name,
            workflowId: workflow.id,
          });
        }
      });

      setDraft((prev) => ({ ...prev, mentions: allMentions }));
    },
    [mcpList, workflowToolList],
  );

  const handleAgentGenerated = useCallback((generated: any) => {
    setDraft((prev) => ({
      ...prev,
      ...(typeof generated?.name === "string" && generated.name.trim()
        ? { name: generated.name }
        : {}),
      ...(typeof generated?.description === "string"
        ? { description: generated.description }
        : {}),
      ...(typeof generated?.instructions === "string" &&
      generated.instructions.trim()
        ? { systemPrompt: generated.instructions }
        : {}),
    }));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.name.trim()) {
      setValidationError("Agent name is required.");
      return;
    }
    if (!draft.systemPrompt.trim()) {
      setValidationError("Agent instructions / system prompt is required.");
      return;
    }
    if (!draft.mandatorySystemPrompt.trim()) {
      setValidationError(
        "Extra Mandatory System Prompt is required and cannot be left blank.",
      );
      toast.error("Extra Mandatory System Prompt is required.");
      return;
    }
    setValidationError(null);
    await onSave({
      ...draft,
      name: draft.name.trim(),
      description: draft.description.trim(),
      systemPrompt: draft.systemPrompt.trim(),
      mandatorySystemPrompt: draft.mandatorySystemPrompt.trim(),
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-card border border-border rounded-xl p-6 space-y-6 max-w-3xl"
    >
      {/* Header matching /agent/new */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-border">
        <div className="space-y-0.5">
          <h2 className="text-xl font-bold text-foreground tracking-tight">
            {title}
          </h2>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={saving}
            onClick={() => setOpenGenerate(true)}
          >
            <WandSparklesIcon className="size-3.5" />
            Generate with AI
          </Button>
          {factoryDefault && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={saving}
              onClick={() => setDraft({ ...factoryDefault })}
            >
              <RotateCcw className="size-3.5" />
              Reset Default
            </Button>
          )}
        </div>
      </div>

      {/* Name + Icon Picker (exact /agent/new pattern) */}
      <div className="flex gap-4">
        <div className="flex flex-col justify-between gap-2 flex-1">
          <Label htmlFor="cyber-agent-name">Name &amp; Icon *</Label>
          <Input
            id="cyber-agent-name"
            value={draft.name}
            onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))}
            disabled={saving}
            required
            placeholder="e.g. Void Cyber (Auto)"
            className="hover:bg-input bg-secondary/40 transition-colors border-transparent border-none! focus-visible:bg-input! ring-0!"
          />
        </div>
        <AgentIconPicker
          icon={draft.icon}
          disabled={saving}
          onChange={(icon) =>
            setDraft((p) => ({
              ...p,
              icon: {
                type: "emoji",
                value: icon.value,
                style: icon.style,
              },
            }))
          }
        />
      </div>

      {/* Description */}
      <div className="flex flex-col gap-2">
        <Label htmlFor="cyber-agent-description">Description</Label>
        <Input
          id="cyber-agent-description"
          value={draft.description}
          onChange={(e) =>
            setDraft((p) => ({ ...p, description: e.target.value }))
          }
          disabled={saving}
          placeholder="Describe what this Cyber agent specializes in…"
          className="hover:bg-input placeholder:text-xs bg-secondary/40 transition-colors border-transparent border-none! focus-visible:bg-input! ring-0!"
        />
      </div>

      {/* Agent Instructions / System Prompt */}
      <div className="flex flex-col gap-2">
        <Label htmlFor="cyber-agent-instructions" className="text-base">
          Agent Instructions (System Prompt) *
        </Label>
        <Textarea
          id="cyber-agent-instructions"
          value={draft.systemPrompt}
          onChange={(e) =>
            setDraft((p) => ({ ...p, systemPrompt: e.target.value }))
          }
          disabled={saving}
          required
          placeholder="Define this agent's persona, workflow, methodology, and output structure…"
          className="p-4 hover:bg-input min-h-40 max-h-80 overflow-y-auto resize-y placeholder:text-xs bg-secondary/40 transition-colors border-transparent border-none! focus-visible:bg-input! ring-0!"
        />
      </div>

      {/* EXTRA MANDATORY SYSTEM PROMPT */}
      <div className="flex flex-col gap-2 p-4 rounded-xl bg-amber-500/6 border border-amber-500/30">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <Label
            htmlFor="cyber-mandatory-system-prompt"
            className="text-base flex items-center gap-2 text-foreground"
          >
            <ShieldAlert className="size-4 text-amber-600 dark:text-amber-400" />
            Extra Mandatory System Prompt *
          </Label>
          <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30">
            Mandatory · Always Enforced
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          Required governance &amp; safety contract injected unconditionally
          before every Void Cyber run. Users cannot override or bypass these
          rules.
        </p>
        <Textarea
          id="cyber-mandatory-system-prompt"
          value={draft.mandatorySystemPrompt}
          onChange={(e) =>
            setDraft((p) => ({ ...p, mandatorySystemPrompt: e.target.value }))
          }
          disabled={saving}
          required
          placeholder="Enter mandatory Cyber rules, authorized-scope constraints, and non-negotiable behavior…"
          className="p-4 bg-background/90 border border-amber-500/25 min-h-36 max-h-72 overflow-y-auto resize-y text-xs font-mono focus-visible:ring-2 focus-visible:ring-amber-500/50"
        />
      </div>

      {/* Tools & Skills (exact /agent/new AgentToolSelector) */}
      <div className="flex flex-col gap-2">
        <Label className="text-base">Tools &amp; Skills</Label>
        <AgentToolSelector
          mentions={draft.mentions}
          isLoading={isLoadingTool}
          disabled={saving}
          hasEditAccess={true}
          onChange={(mentions) => setDraft((p) => ({ ...p, mentions }))}
        />
      </div>

      {/* Model Selector (exact /agent/new SelectModel) */}
      <div className="flex flex-col gap-2">
        <Label className="text-base">Model</Label>
        <p className="text-xs text-muted-foreground">
          Pin a specific model for this Cyber agent, or leave on Default model.
        </p>
        <div className="flex items-center gap-2">
          <SelectModel
            currentModel={parseAgentModel(draft.model) ?? undefined}
            onSelect={(model) =>
              setDraft((p) => ({ ...p, model: formatAgentModel(model) }))
            }
          >
            <Button
              type="button"
              variant="secondary"
              className="bg-secondary/40 data-[state=open]:bg-input! hover:bg-input!"
              disabled={saving}
            >
              {parseAgentModel(draft.model)?.model ?? "Default model"}
              <ChevronDown className="size-3.5 opacity-60" />
            </Button>
          </SelectModel>
          {draft.model && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              disabled={saving}
              onClick={() => setDraft((p) => ({ ...p, model: null }))}
            >
              Use default
            </Button>
          )}
        </div>
      </div>

      {/* Knowledge Bases (exact /agent/new selector) */}
      <div className="flex flex-col gap-2">
        <Label className="text-base">Knowledge bases</Label>
        <p className="text-xs text-muted-foreground">
          Attach knowledge bases or projects this Cyber agent should search when
          answering.
        </p>
        <CyberKnowledgeBaseSelector
          bindings={draft.knowledgeBases}
          disabled={saving}
          onChange={(knowledgeBases) =>
            setDraft((p) => ({ ...p, knowledgeBases }))
          }
        />
      </div>

      {validationError && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-700 dark:text-red-400 text-xs">
          <ShieldAlert className="size-4 shrink-0" />
          {validationError}
        </div>
      )}

      <div className="flex justify-end pt-2 border-t border-border">
        <Button type="submit" disabled={saving}>
          {saving ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Save className="size-4" />
          )}
          {saving ? "Saving…" : saveLabel}
        </Button>
      </div>

      <GenerateAgentDialog
        open={openGenerate}
        onOpenChange={setOpenGenerate}
        onAgentChange={handleAgentGenerated}
        onToolsGenerated={assignToolsByNames}
      />
    </form>
  );
}
