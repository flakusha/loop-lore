<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Epic: Entity Generation Workflows

**Overview:** (see sections below)


**Status:** ⬜ Not Started
**Priority:** High (MVP scoped, post-Gate C)
**Effort:** Medium
**Type:** Feature Epic
**Tags:** assistant, workflows, entity-generation, character, world, location, item, npc
**Parent Epic:** Assistant Creative Studio — Workflow Templates (epic-assistant-creative-studio-workflows.md)
**Depends on:** Workflow Engine (`epic-workflow-engine.md`)

## Summary

Entity generation — **character, world, location, item, npc** — as a first-class workflow category. These workflows give the existing `/create` assistant command the **prompt preview, validation, and confirmation gating** it currently lacks (see `TASK-assistant-gm-flows.md`: `/create` inserts directly with no quality pipeline and no user approval). Image/video vary by *model family* (`epic-model-family-presets.md`); entity workflows vary by *entity shape*.

## Design

### Intent → Entity Workflow Mapping (§7.6a)

`INTENT_PATTERNS` in `src/regex/intent.ts` already defines generation targets for four
entity types. Workflow templates bind to these targets 1:1, so `classifyIntent` routing
feeds straight into `WorkflowRunner.startWorkflow(...)`.

| Entity    | `intent.target` | In `INTENT_PATTERNS`? | Creation backend (dispatch)                                                    |
| --------- | --------------- | --------------------- | ------------------------------------------------------------------------------ |
| Character | `character`     | ✅ (L27)              | `src/assistant/commands/create.ts` → actor insert                              |
| World     | `world`         | ✅ (L48)              | world creation service                                                         |
| Location  | `location`      | ✅ (L41)              | world-location insert                                                          |
| Item      | `item`          | ✅ (L34)              | `POST /api/worlds/:worldId/items/generate-llm` (see `TASK-item-generation.md`) |
| NPC       | `npc`           | ❌ — needs new target | actor insert with `is_npc`                                                     |
| Species   | `species`       | ❌ — needs new target | bestiary insert (`TASK-assistant-creative-studio-workflow-species.md`)          |

**Decision (open):** add `npc` as a distinct `INTENT_PATTERNS` target (preferred — clean
separation, matches `epic-npcs.md`), OR route NPC generation through the `character`
target with an `is_npc: true` step default. Default to adding the `npc` target. `species` (bestiary flora/fauna/monster) follows the same rule — a distinct target, per `TASK-assistant-creative-studio-workflow-species.md`.

### Per-Entity Step Schemas (§7.6b)

Each entity workflow defines its own `steps[]` collecting the fields the entity's data
model requires:

- **character**: identity (name/species/homeland/culture — see
  `FEAT-origin-capture-generation-seeding.md`), appearance, personality, backstory,
  motivation; `world_id` scope.
- **world**: theme/genre, tone, core conflict, geography sketch, magic/tech level.
- **location**: type (city/region/dungeon), environment/biome, notable features,
  connections/travel, resource profile.
- **item**: category, rarity range, stats intent, lore/flavor, tags/theme.
- **npc**: role/function, faction allegiance (see `epic-faction-reputation.md`),
  personality, relationship to player/other actors.
- **species**: category (flora/fauna/monster), behaviour profile, stats (monsters),
  habitat, loot/XP binding, repopulation rule (see `epic-enemies-monsters.md`).

### Entity Type Presets (§7.6c)

A companion `entity_type_presets` config block (`configs/templates/workflows/entity-types.yaml`)
defines per-entity prompt formatting, required-field validation, and consistency gates —
the entity analog of `model_family_presets`. Full YAML example: see parent epic §7.6c.

### Quality Gates for Entities (§7.6d)

Entity workflows reuse `approval.quality_gates` from the engine but add entity-specific checks:

- `schema` — assembled entity satisfies the target table's constraints (NOT NULL, FK to
  `world_id`, enum domains).
- `consistency` — new entity does not contradict existing entities in the same
  `world_id` (e.g. duplicate name, impossible geography).
- `duplicate` — no near-identical existing entity (name + key attributes).
- `balance` (items/loot only) — stats within the world's progression curve (see
  `epic-rarity-extensions.md`, `TASK-item-generation.md`).

### Relationship to `/create` (§7.6e)

`/create` (via `src/assistant/commands/create.ts`) currently performs inline, ungated
entity generation. The workflow system is the **gating + UX layer** that wraps it:

```
/create character "..."  →  intent.target = character
  → matches character-generation workflow
  → preview steps + recommendations (§7.6b)
  → validate each step (§7.6c)
  → final confirmation (approval gate)
  → dispatch → /create backend (actor insert)
```

This closes the `TASK-assistant-gm-flows.md` gap (no quality validation / no confirmation
gating) without forking the creation backends. Entity workflows are the *only* sanctioned
path for assistant-driven entity creation post-MVP.

Example workflow file (`configs/templates/workflows/character-generation.yaml`) and the
analogous `world-generation`, `location-generation`, `item-generation`, `npc-generation`
files: see parent epic §7.6f.

### In-Place Story-Triggered Generation

Entity workflows are also the finalize/review substrate for **story-triggered
in-place generation** (`FEAT-in-story-character-generation-via-assistant-chat-handoff.md`):
a story-introduced entity hands off to an assistant creation chat whose context is
scoped to the introducing world/location
(`TASK-creation-chat-world-location-context-scoping.md`); the finalized spec passes
the same quality gates and review/approval before insert, and the approved entity
can be backfilled as owner of the messages that introduced it
(`TASK-in-place-generation-owner-backfill.md`). One mechanism, per-kind templates —
no per-kind forks.

## Tasks

- [ ] Entity-generation workflow templates (character/world/location/item/npc) with `entity_type_presets` (§7.6c) + per-entity quality gates (§7.6d); wire `intent.target` bindings (§7.6a)
- [ ] Decide and implement the NPC intent target: distinct `INTENT_PATTERNS` target (preferred) vs. routing through `character` with an `is_npc: true` step default


- [ ] Entity-generation workflows (character/world/location/item/npc), each with: intent routing to its `INTENT_PATTERNS` target, per-entity step schema (§7.6b), `entity_type_presets` validation (§7.6c), schema/consistency/duplicate (+balance for items) quality gates, confirmation, and dispatch to the correct creation backend
- [ ] User can add/override/replace workflows via config (merge strategies work)
- [ ] Species-generation workflow template (`species` intent target, bestiary step schema, `entity_type_presets.species`, +balance gate); dispatch to bestiary insert — `TASK-assistant-creative-studio-workflow-species.md`

## Dependencies

- **Parent hub:** Assistant Creative Studio — Workflow Templates (`epic-assistant-creative-studio-workflows.md`)
- **Requires:** `epic-workflow-engine.md` — entity templates are workflow instances;
  schema/loader/runner/approval plumbing all come from the engine.
- **Siblings:** `epic-model-family-presets.md` (pattern analog for `entity_type_presets`);
  `epic-gallery-batch-operations.md` is independent of this epic.

## Related Epics

- `epic-character-spec.md` — character data model targeted by character workflows
- `epic-items.md` / `epic-worlds-extension.md` / `epic-locations.md` / `epic-npcs.md` — entity systems these workflows create into
- `epic-enemies-monsters.md` — bestiary data model species workflows create into
- `epic-faction-reputation.md` — NPC faction allegiance steps
- `TASK-item-generation.md` — item creation backend
