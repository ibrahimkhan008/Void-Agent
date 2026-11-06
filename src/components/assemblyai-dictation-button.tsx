"use client";

import { useAssemblyAIDictation } from "@/hooks/use-assemblyai-dictation";
import { Loader2, Mic, MicOff } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "ui/tooltip";

export function AssemblyAIDictationButton({
  onTranscript,
  disabled,
}: {
  onTranscript: (text: string) => void;
  disabled?: boolean;
}) {
  const [available, setAvailable] = useState(false);
  const { isStarting, isListening, start, stop } =
    useAssemblyAIDictation(onTranscript);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/assemblyai/token", {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => (response.ok ? response.json() : null))
      .then((payload) => setAvailable(payload?.available === true))
      .catch(() => setAvailable(false));
    return () => controller.abort();
  }, []);

  if (!available) return null;
  const active = isListening || isStarting;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant={isListening ? "secondary" : "ghost"}
          size="icon"
          className="rounded-full"
          aria-label={active ? "Stop voice dictation" : "Start voice dictation"}
          aria-pressed={isListening}
          disabled={disabled && !active}
          onClick={() => (active ? stop() : void start())}
        >
          {isStarting ? (
            <Loader2 className="size-4 animate-spin" />
          ) : isListening ? (
            <MicOff className="size-4" />
          ) : (
            <Mic className="size-4" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {isListening ? "Stop dictation" : "Dictate into message"}
      </TooltipContent>
    </Tooltip>
  );
}
