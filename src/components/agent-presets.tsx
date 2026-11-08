"use client";

import { PRESET_AGENTS } from "lib/ai/agent/presets";
import { ArrowLeft, Loader2, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "ui/card";

export function AgentPresets() {
  const router = useRouter();
  const [creatingPreset, setCreatingPreset] = useState<string | null>(null);

  const createFromPreset = async (presetId: string) => {
    setCreatingPreset(presetId);
    try {
      const response = await fetch("/api/agent/from-preset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ presetId }),
      });
      if (response.status === 401) {
        router.push(`/login?next=${encodeURIComponent("/agents/presets")}`);
        return;
      }
      const result = (await response.json().catch(() => ({}))) as {
        agentId?: string;
        error?: string;
      };
      if (!response.ok || !result.agentId)
        throw new Error(result.error ?? "Could not create this agent.");
      router.push(`/agent/${result.agentId}`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not create this agent.",
      );
    } finally {
      setCreatingPreset(null);
    }
  };

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6 sm:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push("/agents")}
          >
            <ArrowLeft className="mr-2 size-4" />
            Back to agents
          </Button>
          <h1 className="text-3xl font-semibold">Agent templates</h1>
          <p className="max-w-2xl text-muted-foreground">
            Add a ready-to-use assistant to your private agents. You can edit
            its instructions and connected tools afterward.
          </p>
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {PRESET_AGENTS.map((preset) => (
          <Card key={preset.presetId} className="flex flex-col">
            <CardHeader className="flex-1">
              <div className="mb-2 flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className="flex size-11 items-center justify-center rounded-lg bg-muted"
                  style={preset.icon.style}
                >
                  <Sparkles className="size-5 text-white" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">
                    {preset.category}
                  </p>
                  <CardTitle className="text-lg">{preset.name}</CardTitle>
                </div>
              </div>
              <CardDescription>{preset.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                className="w-full"
                disabled={creatingPreset !== null}
                onClick={() => void createFromPreset(preset.presetId)}
              >
                {creatingPreset === preset.presetId ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : null}
                Add to my agents
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </main>
  );
}
