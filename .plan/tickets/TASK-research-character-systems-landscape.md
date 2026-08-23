<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Research — Famous Text-Game Character Systems Landscape

**Status:** ⬜ Not Started
**Priority:** P2 — Medium
**Effort:** Medium
**Type:** Research Task
**Tags:** research, characters, personality, companion, memory
**Epic:** epic-character-core-system (research sub-area)
**Related:** .tmp/character-template-gap-analysis.md, TASK-char-template-full-model-coverage

## Summary

The existing `docs/meta/research/*` corpus is mechanics-dominated (combat/dice/stats/items/
XP). It does NOT cover character *personality/trait* modeling, nor does it map famous
text-game character systems to loop-lore's gaps. This task produces a research doc that
surveys how leading text games and companion platforms model characters, and maps each to
loop-lore's current model and missing pieces — directly informing `TASK-char-template-
full-model-coverage` and the personality/companion roadmap.

## Background

Gap analysis (`.tmp/character-template-gap-analysis.md`) confirmed via grep that no doc
references Fallout/S.P.E.C.I.A.L., Disco Elysium internal monologue, BG3 approval/flags,
AI Dungeon memory, SillyTavern CCv3, or Kindroid/Nomi cascaded memory. Personality/trait
modeling and the config-template authoring layer are absent from research entirely.

## Work

1. **Survey famous text-game / companion character systems:**
   - **Fallout** — S.P.E.C.I.A.L. stat block (7 attributes)
   - **BG3** — 6 attributes + skills + approval system + origin fixed-personality + flags
   - **Disco Elysium** — internal thought voices (skills-as-characters), psyche, thought cabinet
   - **AI Dungeon** — memory + scenario, freeform authoring
   - **SillyTavern** — CCv2/CCv3, extensions, lorebook, regex scripts
   - **Kindroid** — 5-tier cascaded memory, 47 settings, inter-character dialogue
   - **Nomi** — 3-tier memory, group chat, proactive messaging
   - **Talkie** — mass character ecosystem, two-way voice, per-character voice
2. **Extract character-modeling patterns:** stat blocks, personality/trait dimensions
   (coping, speech style, autonomy), relationship/approval graphs, memory architectures
   (cascaded/3-tier), voice/multimodal identity, proactive/autonomous behavior.
3. **Map each pattern to loop-lore:** current equivalent (code/service/ticket) + gap.
4. **Author `docs/meta/research/character-systems-landscape.md`** with the survey + mapping
   table + recommendations for loop-lore's character model and config-template layer.

## Acceptance Criteria

- Doc covers ≥6 surveyed systems with concrete feature lists.
- Each system mapped to loop-lore current state + explicit gap.
- Recommendations reference existing tickets (stats, internal-traits, voice, memory,
  proactive) and the new `TASK-char-template-full-model-coverage`.
- Doc placed under `docs/meta/research/` and linked from `epic-character-core-system.md`.

## Related Files

- `docs/meta/research/rpg-systems-comparison.md` (companion reference for format)
- `docs/ideas/emergent-platform-landscape-2026.md` (companion-platform raw research)
- `.tmp/character-template-gap-analysis.md`

## Notes

- This is research only — no code. Output is the doc.
- Reuse `emergent-platform-landscape-2026.md` companion data; do not re-interview platforms.
