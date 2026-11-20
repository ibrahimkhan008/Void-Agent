"use client";

import { EASE, Section } from "@/components/landing/ui";
import { cn } from "@/lib/utils";
import { IconPlus } from "@tabler/icons-react";
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";

export interface FaqItem {
  question: string;
  answer: string;
}

/**
 * Single-open FAQ accordion in the landing's dark tray style: the open item
 * lifts out of the tray with the inner card shadow; the plus icon rotates 45°
 * when open; height animates via AnimatePresence; first item open on load.
 */
export function Faq({
  items,
  defaultOpen = 0,
}: {
  items: FaqItem[];
  defaultOpen?: number;
}) {
  const [open, setOpen] = useState<number | null>(defaultOpen);

  return (
    <Section id="faq" className="py-24 sm:py-32">
      <div className="mx-auto max-w-3xl px-6">
        <h2 className="text-4xl font-medium tracking-tight text-balance sm:text-5xl">
          Frequently asked questions
        </h2>
        <ul className="mt-14 space-y-1.5 rounded-[20px] bg-[#141414] p-1.5 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.8)]">
          {items.map((item, i) => {
            const isOpen = open === i;
            return (
              <li
                key={item.question}
                className={cn(
                  "rounded-[14px] transition-colors duration-150",
                  isOpen &&
                    "bg-[#0a0a0a] shadow-[0_1px_2px_rgba(0,0,0,0.6),0_4px_12px_-2px_rgba(0,0,0,0.55),0_16px_32px_-12px_rgba(0,0,0,0.7)]",
                )}
              >
                <h3>
                  <button
                    type="button"
                    id={`faq-q-${i}`}
                    aria-expanded={isOpen}
                    aria-controls={`faq-a-${i}`}
                    onClick={() => setOpen(isOpen ? null : i)}
                    className="flex w-full items-center justify-between gap-6 rounded-[14px] px-5 py-4 text-left text-base text-(--paper) hover:bg-white/[0.03]"
                  >
                    {item.question}
                    <IconPlus
                      className={cn(
                        "size-4 shrink-0 text-(--paper)/50 transition-transform duration-200",
                        isOpen && "rotate-45",
                      )}
                      aria-hidden
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
                      transition={{ duration: 0.28, ease: EASE }}
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
      </div>
    </Section>
  );
}
