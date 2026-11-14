/**
 * Curated "Void Motion" catalog (master prompt §3.7): motion-graphics skill
 * packs that teach the agents to create motion as code — kinetic typography,
 * web animation, data-driven charts, explainers, JS-drawn canvas films — with
 * the deliver-and-verify loop. Sourced from the open iart-ai motion-skills
 * packs; each entry is importable through the standard skills flow
 * (source: owner/repo + slug → SKILL.md fetch).
 */

export interface CuratedMotionSkill {
  /** skills.sh-style source: owner/repo */
  source: string;
  /** The skill's directory name in the pack repo */
  slug: string;
  name: string;
  description: string;
  pack: string;
}

export const MOTION_PACKS = [
  {
    source: "iart-ai/web-animation-skills",
    pack: "Web animation",
    skills: [
      "60fps-animation",
      "accessible-animation",
      "micro-interaction",
      "page-transition-animation",
      "svg-animation",
      "lottie-animation",
      "gsap-web",
      "glassmorphism",
      "ascii-animation",
    ],
  },
  {
    source: "iart-ai/motion-design-skills",
    pack: "Motion design",
    skills: [
      "motion-background",
      "color-motion",
      "logo-animation",
      "motion-art-direction",
      "shot-composition",
      "beat-sync-editing",
      "animation-principles",
      "after-effects",
      "remotion-video",
    ],
  },
  {
    source: "iart-ai/kinetic-typography-skills",
    pack: "Kinetic typography",
    skills: ["kinetic-typography"],
  },
  {
    source: "iart-ai/data-animation-skills",
    pack: "Data animation",
    skills: ["chart-animation", "animated-infographic", "presentation-video"],
  },
  {
    source: "iart-ai/javascript-animation-skills",
    pack: "JS canvas films",
    skills: ["javascript-animation", "soundtrack"],
  },
  {
    source: "iart-ai/explainer-video-skills",
    pack: "Explainer videos",
    skills: [
      "explainer-video",
      "diagram-animation",
      "isometric-animation",
      "whiteboard-animation",
      "wrapped-video",
    ],
  },
] as const;

export const CURATED_MOTION_SKILLS: CuratedMotionSkill[] = MOTION_PACKS.flatMap(
  (pack) =>
    pack.skills.map((slug) => ({
      source: pack.source,
      slug,
      name: slug
        .split("-")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" "),
      description: `${pack.pack} skill from the Void Motion catalog.`,
      pack: pack.pack,
    })),
);

export function motionSkillsByPack() {
  return MOTION_PACKS.map((pack) => ({
    pack: pack.pack,
    source: pack.source,
    skills: CURATED_MOTION_SKILLS.filter((s) => s.source === pack.source),
  }));
}
