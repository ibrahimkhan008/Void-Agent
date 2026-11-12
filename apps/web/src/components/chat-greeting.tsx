"use client";

import { AccentSpan } from "@/components/ui/accent-span";
import { Eyebrow } from "@/components/ui/eyebrow";
import { useMounted } from "@/hooks/use-mounted";
import { BasicUser } from "app-types/user";
import { motion, useReducedMotion } from "framer-motion";
import { fetcher } from "lib/utils";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import useSWR from "swr";

function getGreetingByTime() {
  const hour = new Date().getHours();
  if (hour < 12) return "goodMorning";
  if (hour < 18) return "goodAfternoon";
  return "goodEvening";
}

// Strong ease-out: the start of the entrance is the moment the eye is
// tracking. The heading uses the Cognix display H1 spec (§3.4).
const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];

// Static second lines give the heading a hierarchy partner without
// turning the greeting into a loop: the name line lands once, the
// prompt line stays.
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
  // and the client, so the text mounts only after hydration — the min-h
  // block holds the space meanwhile and the composer below never jumps.
  const mounted = useMounted();

  const secondLine = useMemo(
    () => SECOND_LINES[Math.floor(Math.random() * SECOND_LINES.length)],
    [],
  );

  const greetingKey = useMemo(() => getGreetingByTime(), []);
  const greeting = useMemo(() => {
    if (!user?.name) return "";
    return t(greetingKey, { name: user.name });
  }, [user?.name, greetingKey, t]);

  return (
    <motion.div
      key="welcome"
      className="min-h-32 max-w-3xl mx-auto my-8 flex flex-col items-center gap-4 text-center"
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
      animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: EASE_OUT }}
    >
      {mounted ? (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.04, duration: 0.2, ease: EASE_OUT }}
          >
            <Eyebrow>Void-Agent</Eyebrow>
          </motion.div>

          {/* Cognix display H1 (§3.4): 400-weight, tracking-[-0.035em],
              leading-[1.04], text-balance; the user's name lands as the
              Instrument Serif accent word (§4.7). */}
          <motion.h1
            className="text-[36px] leading-[1.04] font-normal tracking-[-0.035em] text-balance sm:text-[44px] lg:text-[56px]"
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 14 }}
            animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
            transition={{ delay: 0.06, duration: 0.28, ease: EASE_OUT }}
          >
            {greeting ? (
              <>
                {t(greetingKey, { name: "" }).replace(/,\s*$/, "")}
                {", "}
                <AccentSpan>{user?.name}</AccentSpan>
              </>
            ) : null}
          </motion.h1>

          {/* Muted prompt line: the sub of the display hierarchy. */}
          <motion.p
            className="text-lg/[1.55] text-foreground/60 max-w-[560px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.14, duration: 0.24, ease: EASE_OUT }}
          >
            {t(secondLine, { name: user?.name ?? "" })}
          </motion.p>
        </>
      ) : null}
    </motion.div>
  );
};
