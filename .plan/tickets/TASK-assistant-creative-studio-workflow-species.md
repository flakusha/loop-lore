<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Assistant Creative Studio — Species Generation Workflow

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** 📝 Draft
**Priority:** High (post-Gate C, with parent epic)
**Effort:** Medium
**Epic:** `epic-assistant-creative-studio-workflows` (§7.6)
**Target entity epic:** `epic-enemies-monsters.md`
**Depends on:** `epic-assistant-creative-studio-workflows` (runner/loader),
`epic-enemies-monsters.md` (bestiary data model — `TASK-bestiary-catalog-schema-and-migration.md`),
`TASK-assistant-creative-studio-workflow-npc.md` (new-intent-target precedent)

## Summary

Implement the **species generation workflow template** — a config-driven, multi-step,
gated path for assistant-driven bestiary species creation (flora / fauna / monster).
Wraps the bestiary-insert backend with prompt preview, step validation, and
confirmation gating. Like `npc`, `species` is **not** yet an `INTENT_PATTERNS`
target — this task adds it. Generated species feed the same review/approval surface
as every other entity kind; story-introduced species reuse the in-place mechanism
(`FEAT-in-story-character-generation-via-assistant-chat-handoff.md`).

## Design (from epic §7.6)

- **`intent.target`:** `species` — **NEW**, must be added to `INTENT_PATTERNS`
  (`src/regex/intent.ts`). Triggers: `create/generate/new species`, `bestiary`,
  `flora`, `fauna`, `monster` mentions.
- **Step schema (§7.6b):** `category` (choice `flora|fauna|monster`),
  `behaviour_profile` (aggressiveness, intellect, friendliness, diet, schedule,
  territorial, pack — mirrors `BestiaryEntry.behaviour`), `stats` (monsters;
  `CharacterStats`), `habitat` (preferred location tags, predator/prey links),
  `loot_and_xp` (loot table binding + XP reward), `repopulation` (mode, interval,
  cap, probability).
- **`entity_type_presets.species` (§7.6c):** required steps (category, behaviour,
  habitat); `dispatch_target: bestiary-insert`, scoped by `world_id`.
- **Quality gates (§7.6d):** `schema`, `consistency`, `duplicate`, `balance`
  (stats/loot within world progression curve — reuses the item balance gate).
- **Review/approve:** confirmation gate required before `bestiary_entries` insert;
  approval surface shared with the entity review flow.

## Acceptance Criteria

- [ ] `species` added as a `generate` target in `INTENT_PATTERNS` with appropriate triggers.
- [ ] `configs/templates/workflows/species-generation.yaml` defines the workflow
      (intent.target `species`, steps, dispatch, approval).
- [ ] `entity_type_presets.species` added to
      `configs/templates/workflows/entity-types.yaml`.
- [ ] Runner validates each step; blocks on schema/consistency/duplicate/balance failure.
- [ ] Confirmation + review gate required before dispatch to bestiary insert.
- [ ] Dispatch inserts a `bestiary_entries` row with correct `world_id` scoping and
      validated `category` enum (depends on the bestiary schema ticket).
- [ ] In-place path: story-introduced species hand off to the unified mechanism with
      the species per-kind template (no parallel flow).
- [ ] Unit test: intent → workflow routing + step validation; integration: end-to-end
      species creation gated by approval.

## Files

| File                                              | Action                       |
| ------------------------------------------------- | ---------------------------- |
| `src/regex/intent.ts`                             | modify (add `species` target) |
| `configs/templates/workflows/species-generation.yaml` | new                   |
| `configs/templates/workflows/entity-types.yaml`   | modify                       |
| `src/assistant/workflow-runner.ts`                | reuse                        |

## Related

- `epic-assistant-creative-studio-workflows.md` §7.6
- `epic-enemies-monsters.md` (bestiary model), `TASK-bestiary-catalog-schema-and-migration.md`
- `FEAT-in-story-character-generation-via-assistant-chat-handoff.md` (in-place path)
- `TASK-assistant-gm-flows.md` (gating resolution)
- `TASK-assistant-creative-studio-workflows.md` (parent task)
