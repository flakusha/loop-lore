<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Narration / Actor Separation

**Status:** Not Started
**Priority:** High
**Effort:** Medium–Large
**Type:** Feature Epic
**Tags:** narration, actors, role-contract, message-kind, scene-exposition, rendering, regex
**Related:** epic-narration-pipeline.md, epic-perspective-narration-voice.md, epic-two-pass-delivery.md (pass-2 role split), epic-messages.md, epic-assistant-gm-flows.md, epic-immersion-presentation.md (rendering)
**Matrix:** `matrix-story-coherence.md` (SC2, SC6, SC8, SC10)

## Summary

Make **narration and actor output two distinct, first-class kinds of message** with an
explicit contract of who says what:

- **Narration (assistant/GM)** — scene-level *exposition*: atmosphere, environment,
  situation, time/place, and the required hint level about actors' reactions to each
  other. Narration describes the stage; it never scripts actors' inner states.
- **Actors (user persona, characters, NPCs)** — *their own* slice only: actions, dialogue,
  internal mood, thoughts, perception. An actor speaks for itself and never for others or
  for the scene at large.

Enhancement axis: because narration owns exposition, its generation can be tuned
independently (voice, pacing, hint dosage) from actor generation (voice fidelity,
embodiment) — better prompts and better rendering for both.

## Current State (reviewed 2026-09-01)

- Message rows carry **no first-class narration/actor kind** (no such column in
  `src/db/migrations/`); the distinction is implicit in the author (GM persona vs
  participant) — downstream logic (context assembly, regex extraction, rendering) infers
  role from authoring, which breaks when the GM is itself an LLM actor or absent.
- Pieces exist uncoordinated: `src/story/game-master/narration.ts` (GM beat text),
  `src/regex/narrative.ts` (action markers / entity extraction from prose), migration 012
  `narrative_style` (transition handling), 024 shadow/white notes (GM directives).
- No prompt contract enforcing exposition-vs-action ownership: today a character reply can
  puppet the whole scene, and GM output often slips into speaking *for* characters.

## Design

1. **Message kind** — explicit `kind` on generated/stored messages:
   `narration | actor_action | system` (OOC, skips, gate notices ride `system`), derived
   deterministically from the generation path, not guessed from author.
2. **Role contracts in prompts** — narration prompt: exposition + mood + reaction hints,
   *never* actor interiors; actor prompt: own actions/dialogue/thoughts/perception, *never*
   scene-level authority. Contracts are machine-checkable (see 4).
3. **Narrator-absent degradation (mandatory contract):** chats may have **no
   narrator/GM/assistant present** (pure actor rooms). Then the overall scene info MUST
   still reach the players — actors surface it themselves, at best-effort quality:
   - actor prompts gain an *ambient-notice clause*: perceptions in dialogue/action carry
     needed scene state (weather turned, guards approaching, door unlocked).
   - dosage rule: actors reveal scene info only through their own POV (what they see/hear),
     never omniscient prose — separation survives the fallback.
   - a scene-info-coverage check (quality scorer) detects starvation: beats where pending
     world facts went un-communicated for N turns in a narrator-less chat → optional GM
     spotlight suggestion.
4. **Extraction + enforcement** — regex/aux pipeline tags violations (actor puppeting the
   scene, narration writing actor interiors) feeding quality gating; violation score per
   message kind.
5. **Rendering** — distinct visual treatment per kind (typography/indent/color token) in
   web + TUI; i18n-safe labels.

## Narration levels (extension design)

- Per-chat narration level: `off | actors-only | actors-plus-narrator`,
  stored in chat config.
  - `off`: no narrator turns are scheduled; absence renders as `system`
    `MessageKind` records (same contract as `turn.skipped` above).
  - `actors-only`: the narrator never takes a turn; actors carry scene
    state through their own POV via the ambient-notice clause.
  - `actors-plus-narrator`: the narrator interleaves on a parametrized cadence.
- Cadence becomes a parameter instead of a constant: today `sceneBasedSelect`
  (`src/turning/turn-strategies.ts`) hardcodes the narrator override to every
  3rd turn. The extension replaces the literal with per-chat cadence config, so
  dreamrunner-style variants (all-actor runs vs actor/narrator interleavings)
  are configuration rather than forks.
- → `TASK-narration-levels`.

## Work Items

- [ ] **Message kind column + backfill** — schema, migration, generation-path stamping. → TASK-narration-sep-message-kind
- [ ] **Prompt role contracts** — narration vs actor ownership clauses in assembly. → TASK-narration-sep-contracts
- [ ] **Narrator-absent ambient clause + coverage scorer** — scene-info surfacing and starvation detection. → TASK-narration-sep-narrator-absent
- [ ] **Violation extraction** — regex/aux tagging of contract breaches → quality gate. → TASK-narration-sep-violations
- [ ] **Rendering per kind** — web (htmx/Alpine) + TUI treatment. → TASK-narration-sep-rendering

## Non-Goals

- Owning narration *content* generation (`epic-narration-pipeline.md` generates; this epic defines and enforces who may say what)
- Two-pass draft/final mechanics (`epic-two-pass-delivery.md` consumes these kinds)
- Perspective/POV voice settings (`epic-perspective-narration-voice.md`)

## Acceptance Criteria

- [ ] Every stored message has an explicit kind; no component infers role from author anymore (grep-clean call sites migrated).
- [ ] Actor reply that narrates the scene (puppeting) is flagged by the violation scorer; narration writing a character's private thoughts is flagged likewise.
- [ ] Narrator-less chat: with world facts pending, coverage scorer confirms actors surface them within N turns (ambient clause active) without omniscient prose.
- [ ] Rendering distinguishes kinds in both frontends with user-visible, i18n-labeled treatment.

## Integration Points

### Systems This Epic Depends On

| System | What It Provides | How Used |
| ------ | ---------------- | -------- |
| epic-messages.md / db migrations | message storage | `kind` column + backfill |
| src/regex extraction pipeline | prose parsing | contract-violation tagging |

### Systems That Depend On This Epic

| System | What It Consumes | How Used |
| ------ | ---------------- | -------- |
| all four coherence epics | `MessageKind` | routing, gating, rendering, interlocks (SC1–SC9) — land this epic first |
| epic-immersion-presentation.md / TUI | kind-aware rendering | distinct visual treatment per kind |
| epic-context-injection-correctness.md | kind | assembly excludes/weights kinds differently |

### Shared Data Contracts

| Contract | Shared With | Purpose |
| -------- | ----------- | ------- |
| `MessageKind = narration \| actor_action \| system` | all | replaces author-inference |
| `scene.info.starved` signal | GM spotlight, UI | narrator-absent fallback escalation |

### Cross-System Events

| Event | Direction | Purpose |
| ----- | --------- | ------- |
| `scene.info.starved` | emits | coverage scorer detects un-communicated world facts |
| `turn.skipped` | subscribes | render absence as `system` record |
