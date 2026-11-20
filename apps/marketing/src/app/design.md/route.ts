import { NextResponse } from "next/server";

/**
 * /design.md — the written Void-Agent design system, published as Markdown
 * for AI tools and humans (the same convention as llms.txt). When this file
 * and the live site disagree, the live site wins.
 */
export function GET() {
  const body = `---
name: void-agent-design-guidelines
description: Design, build, or substantially improve a page, surface, or asset that should look and read like Void Agent.
---

# Design like Void Agent

Use this guide when you design or build anything that carries the Void-Agent
name: a public page, a product surface, a launch post, or a component. It is
the written form of the design system the live site already uses. When this
file and the live site disagree, the live site wins; report the difference.

## Void-Agent product and brand context

Void Agent is a universal autonomous AI workspace built in India. People use
it to chat with frontier models from many labs in one place, hand work to the
Cloud Agent (which plans, runs code in a sandbox, and keeps working after the
tab is closed), connect their own tools through MCP, schedule recurring work,
and create decks, documents, sheets, apps, and videos in Canvas.

The audience is builders: developers, founders, creators, researchers, and
operators who want results rather than demos. The tone is calm, plain, and
confident. Say what the product does in the words a user would use. Show the
work instead of praising it.

The look is a cool-white, minimal world with one living color. Surfaces are
soft and physical, type is quiet and precise, one italic accent word carries
the emotion of a headline, and imagery is rendered through a hard Bayer
dither. Graphite appears where something can be acted on or where meaning
lands. Everything else steps back.

Facts that must stay true:

- Location is shown only as "India". Never name a city or state.
- The brand is "Void Agent" (space) in prose and "Void-Agent" (hyphen) as the
  product identifier in UI. Never "Flare", "Cognix", or any prior name.
- Partner logos are technology partners, never customers.
- Plans are Free, Plus, Pro, and Scale (plus Enterprise through sales).
  Prices and limits come from the product, never from copy. Do not invent
  numbers, ratings, customer counts, or benchmarks.

## Use this priority order

When rules pull against each other, resolve them in this order:

1. Keep facts, product names, prices, and limits exactly as supplied. Never
   invent proof.
2. Make the page readable and usable for everyone (contrast, focus,
   landmarks, reduced motion).
3. Keep the brand identity intact: the mark, the word mark, the palette, and
   the type families.
4. Follow the visual system in this file: ground, trays, cards, accent words,
   dither.
5. Match the motion and interaction feel of the live site.
6. Refine density, rhythm, and responsive details.

## Composition

Open with the most characteristic thing for the page's job. Public pages
follow one rhythm:

1. A centered hero: eyebrow, headline with one accent word, a short lede, and
   at most two buttons.
2. Sections separated by generous space, each led by a heading.
3. Content in trays and cards, aligned to a single column grid.
4. A closing call to action and the footer with the large word mark over
   live dither.

Long reading pages (docs, legal) put a sticky, scroll-tracked contents list
on the left and a single text column (about 72 characters) on the right.

## Visual system

### Shell

- The navbar floats: a rounded, translucent bar with the mark and
  "Void-Agent" on the left, the page links centered in a segmented pill (the
  current page sits on a white chip), and "Log in" (outline) plus "Start
  free" (primary) on the right. It is 60 px tall and condenses on scroll.
- The footer ends every public page: link columns, then the word mark set
  very large over the live dither band, which fades behind the letters.
- Use one \`h1\` per page. Pages render on the ground color edge to edge;
  content never sits in a floating page-sized card.

### Grid and alignment

- Content width is 1280 px (\`max-w-7xl\`) with 24 px side padding. Reading
  and hero blocks narrow to 768 px (\`max-w-3xl\`).
- Hero blocks start below the floating navbar (\`pt-40 sm:pt-48\`).
- Grids step 1, 2, 4 columns for cards, with a 6 px gap inside a tray.

### Typography and rhythm

- **Geist** for everything: headlines, UI, and body. **Geist Mono** for
  eyebrows, labels, numbers in specs, and code. **Instrument Serif italic**
  only for accent words.
- Hero headline: \`text-5xl → text-7xl\`, line height 1.03, tracking -0.04em,
  weight 400.
- Section headline: \`text-4xl sm:text-5xl\`, line height 1.05, tracking
  -0.03em, weight 400, at most 22 characters per line.
- Lede and body: 16 to 18 px, line height 1.75, text at 60% ink. Keep lines
  under 72 characters.
- Eyebrow: Geist Mono, 11 px, tracking 0.14em, uppercase, 55% ink, led by a
  blue asterisk. One eyebrow per section, naming the section, never a
  slogan.
- Headlines use Title Case. End the accent phrase with a period when the
  headline is a statement: "Simple Pricing For *Every Builder.*"
- Use tabular numerals for prices, counts, and anything that changes.
- No em dashes in titles or headings. Use a colon or a new sentence.

### Accent words

- One accent per headline, usually the last word or two. It is set in
  Instrument Serif italic with a fade from ink (left) to Graphite (right)
  and a halftone dot mask (0.95 px dots on a 2.4 px grid).
- Never set body text, buttons, or labels in the accent face.

### Color, surfaces, and boundaries

| Name | Hex | Role |
| --- | --- | --- |
| Graphite | \`#18181b\` | Actions, accents, links, the mark's color, the glow inside primary buttons |
| Ink | \`#000000\` | Type and marks |
| Ground | \`#FFFFFF\` | The page |
| Surface | \`#f4f4f5\` | Trays and raised panels |
| Gray | \`#C7C7C4\` | Working neutral, rules, quiet fills |
| Silver | \`#a1a1aa\` | Active markers, the button glow, and gradient mid-tones |

- Three primaries carry the system: Graphite, Ink, and the white ground.
  Gray is the neutral in between; Silver tints markers, glows, and
  gradient mid-tones.
- Graphite is text-safe at every size (8.1:1 on white). Reserve Silver for
  graphic accents and markers, never for body text.
- Gradients fall like light: a white top that passes through Silver
  and deepens into Graphite at the base. Never blend two hues side to side; the
  blue always comes from below.
- Surfaces are physical. A **tray** is a Surface panel, 20 px radius, 6 px
  padding, a white inner highlight on top and a hairline outer ring.
  **Cards** sit inside trays: white, 14 px radius, a hairline ring, and a
  soft neutral shadow. Do not nest cards inside cards.
- Boundaries are hairlines at 5 to 10% black. Shadows are neutral and soft;
  never colored.
- Dark tone exists for marketing comparisons and contact-sales only: ground
  \`#080808\`, surface \`#141414\`, text \`#F2EFE9\`, blue \`#a1a1aa\`.
  Product and public pages default to the light tone.

### Imagery and texture

- Brand imagery is mountains, open land, and quiet skies, rendered in one
  ink through a hard Bayer dither. Shoot wide, keep the light high, and
  leave room around the words.
- Every image passes through the dither before it ships. House settings:
  Bayer 8x8, 2 px dots, ink \`#3C3C3C\` at 37% opacity, contrast stretched
  from the 1st to the 99th percentile, gamma 1.4.
- The hero runs the dither live with slow drifting mist. It pauses off
  screen and when the tab is hidden, and stops for reduced motion.
- Plan cards and section art use dithered landscape strips that fade into
  white at the bottom.
- Use \`image-rendering: pixelated\` on dithered images so dots stay crisp.

### Logo

- The mark is the "VA" monogram with an orbital swoosh. It sits on a fixed
  construction grid; never redraw, rotate, outline, recolor, or re-space it.
- Place it only on the three brand grounds: Ground \`#FFFFFF\`, Ink
  \`#000000\`, or Graphite \`#18181b\`.
- The word mark is Geist Medium at -2% tracking. Lockups pair the mark with
  "Void-Agent" (product) or "Void Agent" (full name) at a fixed gap,
  optically centered, in one flat color.

### Buttons and interaction

- Buttons are raised surfaces with a 10 px radius. Sizes: 32 px default,
  40 px large. Text is Geist Medium, 14 px.
- **Primary**: light gray surface with a dotted Silver glow on its right
  edge that widens on hover. **Outline**: white surface; on hover a dotted
  blue glow slides in from the bottom left. **Secondary**: light gray
  surface. **Ghost**: no surface, a 7% black fill on hover.
- Buttons never lift on hover. Press scales to 0.97 for 100 ms. Trailing
  arrows nudge 2 px on hover.
- One primary button per view. Pair it with an outline button, never with a
  second primary.
- Selection controls (billing period, view switches) are segmented pills: a
  light track with the selected option on a white chip.
- Focus is always visible: a 2 px ink outline offset by 2 px.

### Motion and delight

- Easing for everything: \`cubic-bezier(0.23, 1, 0.32, 1)\`. UI feedback
  finishes in 100 to 300 ms; section reveals take 600 ms.
- Sections reveal once as they enter the viewport: opacity 0 to 1, 14 px
  rise, 6 px blur to sharp, staggered by 60 ms. Never animate from
  \`scale(0)\`.
- Numbers that change (prices) roll digit by digit; swapped text crossfades
  with a short blur.
- Motion answers a person's action or marks one moment per page. Do not
  animate every card on hover.
- With \`prefers-reduced-motion\`, remove movement and blur and keep only
  instant state changes. The first render must match the server render.

### Data and evidence

- Use real product data: plan prices from the subscription tiers, limits
  from the tier presets, model names from the model registry.
- Tables sit in a tray with a white card inside. Header cells use Geist Mono
  at 11 px, uppercase, tracked, 55% ink. Rows are separated by hairlines.
- Show units next to numbers ("per month, billed yearly", "GB of storage").
  Format large numbers as 2.5M or 400K.

### Media and icons

- Icons are Lucide at 16 px, stroke 1.6, 40% ink inside lists and 100% ink
  inside buttons.
- Partner logos are shown as technology partners, never as customers, and
  are never recolored or redrawn.
- Screenshots of the product are framed in a tray. Never fake product UI
  that does not exist.

## Reject generated-design reflexes

- Cream backgrounds with a terracotta accent, or near-black pages with a
  single neon accent. Void Agent is cool white with blue.
- Neon glows, colored shadows, glassmorphism, gradient orbs, and side-to-side
  multi-hue gradients.
- Accenting one word in a different color or weight. The only accent is the
  Instrument Serif italic word.
- A second eyebrow, numbered markers on content that is not a sequence, or
  decorative status pills.
- Identical floating cards in a void, nested cards, and one radius on
  everything.
- Em dashes in headings, "Unlock", "Supercharge", "Revolutionize", and other
  inflated verbs.
- Stock photos, 3D blobs, and AI-generated people. Use dithered landscapes
  and real product surfaces.
- Invented metrics, ratings, customer logos, or testimonials.

## Inspect before delivering

Check the page at 375 px, 768 px, and 1440 px wide, with and without reduced
motion. Confirm:

- One \`h1\`, ordered headings, one accent word per headline.
- Every number and claim traces back to the product.
- Ground, tray, and card layering is consistent; no card sits inside a card.
- The navbar, footer, and dither are present on public pages.
- No console errors and no hydration warnings.
`;

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
