"use client";

import { useMounted } from "@/hooks/use-mounted";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import React, { useCallback, useEffect, useState } from "react";

// Motion tuning per the design-engineering guidelines: entries use a strong
// ease-out so the start of the movement is immediate, exits are modest
// (nothing in the real world scales 2x as it vanishes), and per-letter
// stagger is capped so a long phrase completes well inside its cycle instead
// of lagging seconds behind.
const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];
const LETTER_STAGGER_S = 0.012;
const WORD_STAGGER_S = 0.05;
const WORD_ANIM_S = 0.24;

export const FlipWords = ({
  words,
  duration = 3000,
  className,
}: {
  words: string[];
  duration?: number;
  className?: string;
}) => {
  const [currentWord, setCurrentWord] = useState(words[0]);
  const [isAnimating, setIsAnimating] = useState<boolean>(false);
  const mounted = useMounted();
  const reduceMotion = useReducedMotion();

  // thanks for the fix Julian - https://github.com/Julian-AT
  const startAnimation = useCallback(() => {
    const word = words[words.indexOf(currentWord) + 1] || words[0];
    setCurrentWord(word);
    setIsAnimating(true);
  }, [currentWord, words]);

  useEffect(() => {
    // A single phrase animates once on mount; cycling the same text forever
    // turns a greeting into a distraction.
    if (words.length < 2) return;
    if (!isAnimating)
      setTimeout(() => {
        startAnimation();
      }, duration);
  }, [isAnimating, duration, startAnimation, words.length]);

  if (!mounted) return null;

  return (
    <AnimatePresence
      onExitComplete={() => {
        setIsAnimating(false);
      }}
    >
      <motion.div
        initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
        animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -12, filter: "blur(4px)" }}
        transition={{ duration: 0.24, ease: EASE_OUT }}
        className={cn(
          "z-10 inline-block relative text-left text-foreground px-2",
          className,
        )}
        key={currentWord}
      >
        {/* edit suggested by Sajal: https://x.com/DewanganSajal */}
        {currentWord.split(" ").map((word, wordIndex) => (
          <motion.span
            key={word + wordIndex}
            initial={
              reduceMotion
                ? { opacity: 0 }
                : { opacity: 0, y: 8, filter: "blur(3px)" }
            }
            animate={
              reduceMotion
                ? { opacity: 1 }
                : { opacity: 1, y: 0, filter: "blur(0px)" }
            }
            transition={{
              delay: wordIndex * WORD_STAGGER_S,
              duration: WORD_ANIM_S,
              ease: EASE_OUT,
            }}
            className="inline-block whitespace-nowrap"
          >
            {/* Letters carry only opacity: the word span owns the spatial
                motion, so per-letter transforms don't multiply across a long
                phrase. */}
            {word.split("").map((letter, letterIndex) => (
              <motion.span
                key={word + letterIndex}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{
                  delay:
                    wordIndex * WORD_STAGGER_S +
                    Math.min(
                      letterIndex * LETTER_STAGGER_S,
                      WORD_STAGGER_S * 0.8,
                    ),
                  duration: WORD_ANIM_S,
                  ease: EASE_OUT,
                }}
                className="inline-block"
              >
                {letter}
              </motion.span>
            ))}
            <span className="inline-block">&nbsp;</span>
          </motion.span>
        ))}
      </motion.div>
    </AnimatePresence>
  );
};
