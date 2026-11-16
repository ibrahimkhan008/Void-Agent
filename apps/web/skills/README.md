# Void Agent system skills

This folder is the organised home for **system default skills** — the skills
that ship with the product and install without any network access.

## Convention

```
skills/
  <category>/            # a pack or domain, e.g. motion/
    manifest.json        # optional: pack metadata (source, provenance)
    <slug>/              # ONE folder per skill
      SKILL.md           # REQUIRED — the Agent Skills contract
    THIRD-PARTY-NOTICE.md  # required when the pack vendors third-party work
```

Rules:

1. One skill per folder; the folder name is the skill slug (`[a-z0-9-]+`).
2. `SKILL.md` is required at the folder root — no arbitrary files outside the
   skill's own folder.
3. YAML frontmatter `name`/`description` are used by the catalog when present.
4. Third-party content must carry its license in a `THIRD-PARTY-NOTICE.md` at
   the pack level. Every pack currently vendored is MIT.

## Loading

`apps/web/src/lib/skills/built-in.ts` walks this folder at request time and
serves it through `GET /api/skills/built-in` (list, content on demand). The
skills dialog renders these as system skills — installing one is a local
copy into the workspace skill library, no registry round trip.

## Current packs

- `motion/` — the Void Motion catalog (29 skills), vendored from
  [iart-ai](https://github.com/iart-ai) (`web-animation-skills`,
  `motion-design-skills`, `kinetic-typography-skills`, `data-animation-skills`,
  `javascript-animation-skills`, `explainer-video-skills`), all MIT.
  Provenance: `motion/manifest.json`; license: `motion/THIRD-PARTY-NOTICE.md`.
- `pdf/` — the professional PDF production toolkit (2 skills: `pdf`,
  `pdf-viewer`), vendored from the ZCode official `pdf` plugin, MIT.
  Provenance: `pdf/THIRD-PARTY-NOTICE.md`.
- `spreadsheets/` — spreadsheet production & analysis (2 skills: `xlsx`,
  `xlsx-viewer`), ZCode official plugin, MIT.
- `presentations/` — presentation production (2 skills: `pptx`,
  `pptx-viewer`), ZCode official plugin, MIT.
- `documents/` — document production (2 skills: `docx`, `docx-viewer`),
  ZCode official plugin, MIT.
- `visualize/` — interactive visualization skill (1), ZCode official
  plugin, Apache-2.0.
- `skill-creator/` — authoring new skills (1), ZCode official plugin, MIT.
- `design/` — the design system + 82 template skeletons (dashboard,
  blog-post, pitch-deck, valuation model, …), ZCode official plugin,
  Apache-2.0, with the design-rules hooks vendored as reference.
