"use client";

import { BasicUser } from "app-types/user";
import { motion, useReducedMotion } from "framer-motion";
import { fetcher } from "lib/utils";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import useSWR from "swr";
import { FlipWords } from "ui/flip-words";
import { useMounted } from "@/hooks/use-mounted";

function getGreetingByTime() {
  const hour = new Date().getHours();
  if (hour < 12) return "goodMorning";
  if (hour < 18) return "goodAfternoon";
  return "goodEvening";
}

// Strong ease-out for entrance movement: the start of the animation is the
// moment the eye is tracking, so it should move first.
const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];

// Static second lines give the heading a hierarchy partner without turning
// the greeting into a loop: the name line lands once, the prompt line stays.
const SECOND_LINES = [
  "niceToSeeYouAgain",
  "whatAreYouWorkingOnToday",
  "letMeKnowWhenYoureReadyToBegin",
  "whatAreYourThoughtsToday",
  "whereWouldYouLikeToStart",
  "whatAreYouThinking",
] as const;

export const ChatGreeting = () => {
  const { data: user } = useSWR<BasicUser>(`/api/user/details`, fetcher, {
    revalidateOnMount: false,
  });
  const t = useTranslations("Chat.Greeting");
  const reduceMotion = useReducedMotion();
  // Time-of-day and the random phrase pick differ between the server render
  // and the client, so the text mounts only after hydration — the min-h-20
  // block holds the space meanwhile and the composer below never jumps.
  const mounted = useMounted();

  const secondLine = useMemo(
    () => SECOND_LINES[Math.floor(Math.random() * SECOND_LINES.length)],
    [],
  );

  const greeting = useMemo(() => {
    if (!user?.name) return "";
    return t(getGreetingByTime(), { name: user.name });
  }, [user?.name, t]);

  return (
    <motion.div
      key="welcome"
      className="min-h-20 max-w-3xl mx-auto my-6 flex flex-col items-center gap-3 text-center"
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
      animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: EASE_OUT }}
    >
      {mounted ? (
        <>
          <h1 className="text-3xl md:text-4xl font-medium tracking-tight leading-[1.15]">
            {greeting ? (
              <FlipWords words={[greeting]} className="text-foreground" />
            ) : null}
          </h1>
          <motion.p
            className="text-base md:text-lg text-muted-foreground"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.12, duration: 0.24, ease: EASE_OUT }}
          >
            {t(secondLine, { name: user?.name ?? "" })}
          </motion.p>
        </>
      ) : null}
    </motion.div>
  );
};
