<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Research — Creative Content Systems Landscape

**Status:** ⬜ Not Started
**Priority:** P2 — Medium
**Effort:** Medium
**Type:** Research Task
**Tags:** research, lorebook, scenario, notes, assets, gallery
**Epic:** epic-creative-studio (research sub-area)
**Related:** .tmp/creative-content-systems-gap-analysis.md, TASK-lorebook-template-seeding,
TASK-scenario-system-authoring, TASK-asset-templates, TASK-gallery-editor-structured-ui,
TASK-gm-shadow-notes

## Summary

The existing `docs/meta/research/*` corpus is mechanics-dominated (combat/dice/stats/items/
XP) and contains **zero** docs on lorebook/context-injection, scenario systems, notes/
author's-note, or asset/gallery management. This task produces a research doc surveying how
leading platforms model these five creative-content systems and maps each to loop-lore's
current state + gaps — informing the lorebook/seeding, scenario-authoring, and asset/gallery
roadmaps.

## Background

Gap analysis (`.tmp/creative-content-systems-gap-analysis.md`) confirmed via directory listing
that none of the five areas have a `docs/meta/research/` doc (and none in `docs/ideas/`).
loop-lore's runtime for lorebook/notes is already advanced vs famous systems; the missing
piece is research grounding + the config/authoring bridges (covered by the linked tickets).

## Work

1. **Survey lorebook / context-injection systems:**
   - SillyTavern `character_book` (keywords, insertion order/depth, token budget, cooldowns,
     activation, recursive scanning)
   - AI Dungeon lore / memory, NovelAI lorebook (keys, context, recurrence), KoboldAI memory
2. **Survey scenario systems:**
   - AI Dungeon published/community scenarios (title, description, prompt, tags, remixes)
   - SillyTavern / Tavern scenario & story-strings
3. **Survey notes / author's-note:**
   - SillyTavern Author's Note (AN — steering directive, depth, sweep/recursion)
   - Contrast with loop-lore `gm-shadow-notes` (TTL, categories, pinned)
4. **Survey asset / gallery management:**
   - SillyTavern extras/gallery, character.image
   - Companion platforms: Kindroid/Nomi avatars, Talkie voice, multimodal identity
5. **Map each pattern to loop-lore:** current equivalent (table/service/ticket) + gap.
6. **Author `docs/meta/research/creative-content-systems-landscape.md`** with survey + mapping
   table + recommendations.

## Acceptance Criteria

- Doc covers ≥4 areas (lorebook, scenario, notes, assets/gallery) with concrete feature lists
  from ≥2 famous systems each.
- Each system mapped to loop-lore current state + explicit gap.
- Recommendations reference linked tickets (lorebook seeding, scenario authoring, asset-
  templates, gallery editor, gm-shadow-notes).
- Doc placed under `docs/meta/research/` and linked from the creative-studio epic.

## Related Files

- `docs/meta/research/rpg-systems-comparison.md` (format companion)
- `docs/spec/assets.md`, `docs/spec/gm-shadow-notes.md`
- `.tmp/creative-content-systems-gap-analysis.md`

## Notes

- Research only — no code. Output is the doc.
- Emphasize that loop-lore's lorebook/notes runtime already leads; research informs the
  authoring/research gaps, not a rebuild.
