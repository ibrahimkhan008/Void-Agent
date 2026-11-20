"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

/**
 * Raised code block (§4.12): header bar with a mono label + copy button,
 * body in a white rounded-[14px] well with the card shadow.
 */
export function CodeBlock({
  label,
  code,
}: {
  label: string;
  code: string;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard unavailable (insecure context) — leave the button silent.
    }
  };

  return (
    <div className="mt-6 rounded-[20px] bg-(--ink-2) p-1.5 shadow-[var(--bs-shadow-tray)]">
      <div className="overflow-hidden rounded-[14px] bg-[#0a0a0a]">
        <div className="flex h-9 items-center justify-between px-2.5">
          <span className="px-1.5 font-mono text-xs text-(--paper)/55">
            {label}
          </span>
          <button
            type="button"
            onClick={copy}
            title={`Copy ${label}`}
            aria-label={`Copy ${label}`}
            className="grid size-7 place-items-center rounded-md text-(--paper)/55 transition-colors hover:bg-white/5 hover:text-(--paper)"
          >
            {copied ? (
              <Check className="size-3.5 text-(--brand)" />
            ) : (
              <Copy className="size-3.5" />
            )}
          </button>
        </div>
        <pre className="overflow-x-auto border-t border-white/[0.06] p-4 font-mono text-[13px]/6 text-(--paper)/85">
          {code}
        </pre>
      </div>
    </div>
  );
}
