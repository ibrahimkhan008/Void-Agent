"use client";

import { cn } from "lib/utils";
import { Plus } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";

export interface FaqItem {
  question: string;
  answer: string;
}

/**
 * Single-open FAQ accordion (§4.10): tray list of rounded-[14px] items, the
 * open one white with the card shadow; plus icon rotates 45° when open;
 * height animates via AnimatePresence; first item open on load.
 */
export function FaqAccordion({
  items,
  defaultOpen = 0,
}: {
  items: FaqItem[];
  defaultOpen?: number;
}) {
  const [open, setOpen] = useState<number | null>(defaultOpen);

  return (
    <ul className="mt-14 space-y-1.5 rounded-[20px] bg-(--ink-2) p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_0_0_1px_rgba(0,0,0,0.05),0_1px_2px_rgba(0,0,0,0.05),0_24px_60px_-36px_rgba(0,0,0,0.25)]">
      {items.map((item, i) => {
        const isOpen = open === i;
        return (
          <li
            key={item.question}
            className={cn(
              "rounded-[14px] transition-colors duration-150",
              isOpen ? "bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.05),0_1px_2px_rgba(0,0,0,0.06),0_8px_20px_-12px_rgba(0,0,0,0.12)]" : "",
            )}
          >
            <h3>
              <button
                type="button"
                id={`faq-q-${i}`}
                aria-expanded={isOpen}
                aria-controls={`faq-a-${i}`}
                onClick={() => setOpen(isOpen ? null : i)}
                className="flex w-full items-center justify-between gap-6 rounded-[14px] px-5 py-4 text-left text-base text-(--paper) hover:bg-white/70"
              >
                {item.question}
                <Plus
                  className={cn(
                    "size-4 shrink-0 text-(--paper)/50 transition-transform duration-200",
                    isOpen && "rotate-45",
                  )}
                />
              </button>
            </h3>
            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div
                  id={`faq-a-${i}`}
                  role="region"
                  aria-labelledby={`faq-q-${i}`}
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1] }}
                  className="overflow-hidden"
                >
                  <p className="px-5 pb-5 text-[15px]/7 text-pretty text-(--paper)/60">
                    {item.answer}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </li>
        );
      })}
    </ul>
  );
}
