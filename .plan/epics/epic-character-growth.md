<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Character Growth & Arc Progression

**Status:** 🟡 Draft
**Priority:** High
**Effort:** High
**Type:** Feature Epic
**Tags:** characters, growth, arc, skills, traits, relationships, evolution, drift, static, narrative, prompt-assembly

## Summary

Give authors a structured way to declare **whether a character changes through
the story** — and if so, **how** — across four axes:

1. **Arc** — a per-character narrative arc with stages (introduction → rising
   action → crisis → resolution) that the prompt assembly surfaces so the model
   plays a *character in motion* rather than a static personality snapshot.
2. **Skill acquisition** — first-class growth events recording new skills the
   character gains through the story, layered on top of the existing RPG skills
   service (`src/rpg/skills/service/`).
3. **Trait drift** — narrow, opt-in drift of secondary traits (world traits,
   social traits, voice) over time, guarded by the personality integrity rules
   so core identity never moves.
4. **Relationship evolution** — explicit bond-strength transitions recorded as
   growth events so arcs that change relationships are durable in the database,
   not just inferred at prompt time.

Each character also has a `growth_mode` of `dynamic | static` (author toggle).
Static characters **never** change — the growth service refuses mutations, and
prompt assembly emits a static-mode directive so the LLM never drifts them.

This epic is the **schema + service + prompt-assembly + API + frontend**
foundation. Runtime detection (when *should* growth happen) lives in the
triggering services (chat, story, achievements, skills service) and is wired
via events; an optional LLM-assist pass proposes growth events the author/GM
confirms before they land.

## Why This Matters

Characters today are authored as fixed snapshots (`CanonicalCharacter` at
`src/characters/spec/character.ts:97-118`). The model sees the same
`personality` + `description` every turn. Two failure modes dominate:

- **Static characters drift anyway** — the LLM-helpfulness default pulls even a
  "gruff loner" toward warmth over many turns, because nothing in the prompt
  tells the model the character *cannot* change. Today authors work around
  this with `post_history_instructions` reassertion; there is no first-class
  way to say "this character does not grow".
- **Dynamic characters don't grow durably** — when a character *should*
  evolve (acquires a skill, shifts a worldview, deepens a bond), the change
  evaporates with the context window. There is no growth log, so the model
  forgets the arc and resets to baseline. Authors today work around this with
  manually-edited `data_json` overrides; there is no first-class record of
  growth.

## Current State

- **Character model is a static snapshot.** `CanonicalCharacter`
  (`src/characters/spec/character.ts:97-118`) has `personality: string`,
  `description`, `scenario`, `system_prompt`, `post_history_instructions`. No
  `growth_mode`, no `arc`, no growth log.
- **Skills system is service-only and growth-naive.**
  `src/rpg/skills/service/progression.ts:14-72` (`addXp` body) mutates XP and
  recomputes level, but does not record *when* a skill was acquired.
  Acquisition happens via `src/rpg/skills/service/crud.ts` `createSkill`,
  which writes a new `character_skills` row (migration 036) without an
  `acquired_at` / `acquisition_reason` field. Growth events (story-driven
  skill gains) cannot be distinguished from baseline skills.
- **Internal traits already have a prompt section but no growth surface.**
  `src/assistant/prompt/sections/internal-traits.ts` already exists and is
  wired in `src/assistant/prompt/registry.ts:46` between `actorHeaderSection`
  and `loreSection`. The internal-traits epic (`epic-character-internal-traits.md`)
  is itself 🟡 Draft — its `toPublicCard()` transform is not yet implemented.
  Growth shares the player's redaction boundary but MUST NOT block on it;
  growth defines its own `redactForPlayerCard()` helper until internal-traits
  lands and they unify.
- **Traits are permanent, world, or location only.**
  `src/characters/services/traits-service/types.ts:11-30` defines three layers.
  There is no per-trait drift over time; the personality integrity module
  (`src/characters/services/personality-service/integrity.ts:54-92`) treats
  identity / personality / background categories as fully immutable and
  `social` traits as "shiftable by world/story requirements, not changed".
- **Relationships exist as rows, not as evolution.**
  `src/characters/services/relationships-service/` writes
  `CharacterRelationship` rows; there is no log of *how* `strength` reached
  its current value.
- **No growth section in prompt assembly.** The prompt registry
  (`src/assistant/prompt/registry.ts:36-58`) has no section that emits arc
  state or growth log; growth must be added.
- **No growth-mode toggle.** No `growth_mode` enum, no static-mode directive.

## Scope

### In Scope

1. **Schema** — `character_arc`, `growth_log`, `character_growth_mode` columns
   on `actors`, and `acquired_at` / `acquisition_reason` on `character_skills`.
   Migration regenerated via `bun run db:sync-types && bun run db:sync-manifest`.
2. **`growth_mode: 'dynamic' | 'static'`** — author/owner toggle on
   `CanonicalCharacter`. Static blocks all growth mutations and emits a
   prompt-assembly directive.
3. **Arc model** — `ArcStage` (`introduction | rising_action | crisis |
   resolution | epilogue`) per character; current stage + stage history
   recorded in `growth_log`.
4. **Growth log** — append-only `growth_log` table; rows are
   `{event_type, axis, before, after, reason, source_event_id, recorded_at}`.
   Read API + audit trail.
5. **Skill acquisition events** — when a `character_skills` row is created
   with `xp > 0` *and* source is story/event (not config seed), a growth_log
   entry is written (`event_type='skill_acquired'`).
6. **Trait drift events** — opt-in per-trait; only `social` / `world` trait
   categories may drift, and only when the integrity module approves
   (`src/characters/services/personality-service/integrity.ts:54-58`). Core
   identity/personality/background traits are locked even in dynamic mode.
7. **Relationship evolution events** — when `character_relationships.strength`
   changes by ≥ threshold or `type` transitions (e.g. `rival` → `friend`), a
   growth_log entry is written.
8. **Prompt assembly** — new `actorGrowthSection` registered after
   `actorHeaderSection` in `src/assistant/prompt/registry.ts`. Emits the
   current arc stage, recent growth log entries, and the growth-mode
   directive (dynamic encourages evolution; static forbids it).
9. **Anti-collapse directive** — when `growth_mode === 'static'`, the prompt
   must explicitly countermand drift.
10. **LLM-assist pass** — an optional aux-LLM summarizer (run every N turns)
    proposes a `growth_log` entry by summarizing the recent conversation; the
    entry is **pending** until author/GM confirms via the API.
11. **API surface** — CRUD on arc stage (`/api/character-growth/arc`), read
    on growth log (`/api/character-growth/growth-log`), mutation on growth log
    (`/api/character-growth/growth-log/:entryId/confirm` for pending entries),
    and growth-mode toggle (`PUT /api/actors/:actorId` accepts `growth_mode`).
    All mutations role-gated (author/owner/GM).
12. **Frontend** — player card surfaces only arc stage + last N growth log
    entries (no internal drift details); author/GM editor renders the full
    log with confirm/reject affordances for pending entries.
13. **Validation & migration** — extend `src/characters/validator/fields.ts`;
    add migration; regenerate DB schemas via `db:sync-types` +
    `db:sync-manifest`.
14. **Tests** — unit (schema, validation, growth log CRUD, integrity
    interaction), integration (event-driven growth from skills /
    relationships services), prompt assembly (dynamic vs static directives).

### Out of Scope

- Runtime goal progression / plan-step execution →
  `epic-agency-story-points.md` (this epic records *what* grew; agency
  drives *how* the character pursues goals).
- Karma / reputation systems (`epic-world-diplomacy-karma.md`).
- Mood service interaction (`TASK-character-mood-happiness.md`) — mood is
  reactive, growth is durable.
- Internal traits / aspirations (`epic-character-internal-traits.md`) —
  growth is the *evolution* axis; internal traits are the *static*
  personality overlay.
- RPG combat / loot / crafting epics — growth is the bookkeeping layer.

## Key Design Decisions

### D1. `growth_mode: 'dynamic' | 'static'` is an author toggle on the character

`CanonicalCharacter.growth_mode` defaults to `'dynamic'`. Static characters
opt out of all growth: the growth service refuses mutations, and prompt
assembly emits a static-mode directive that countermands drift.

### D2. Growth is a typed event log, not a state table

`growth_log` rows are events, not state. The current arc stage is derived
by replaying the log; current skill list comes from `character_skills`; current
trait values come from `character_*_traits`.

### D3. Trait drift respects personality integrity

Drift only touches traits the integrity module already allows to change
(`social` / `world` traits per
`src/characters/services/personality-service/integrity.ts:54-92`). Identity,
personality, and background categories remain locked even in dynamic mode.

### D4. Static characters are immutable end-to-end

When `growth_mode === 'static'`:

- Growth service rejects all `growth_log` inserts except `event_type='arc_stage_set'`
- Skill service refuses `addXp` from story/event sources; config-seeded
  baseline skills remain.
- Relationships service refuses `strength` writes unless the change is
  purely cosmetic.
- Prompt assembly emits the static-mode directive every turn.

### D5. Arc stages are author-set, not auto-detected

Arc stage transitions are *authored*. The LLM-assist pass may *propose* a
stage transition (pending entry in the log), but the author confirms.

### D6. LLM-assist pass is opt-in and pending

The aux-LLM pass runs every N turns (configurable, default 20) and proposes
a `growth_log` entry. Proposed entries have `status='pending'` and are
**never** applied to the live state until an author/GM confirms.

### D7. Prompt assembly surfaces current arc + recent growth

`actorGrowthSection` emits current arc stage + last 5 growth_log entries
+ the growth-mode directive. Registered after `internalTraitsSection`
(currently position 12 in `PROMPT_SECTIONS`).

### D8. Growth log is shared, not duplicated per axis

One `growth_log` table covers all four axes; `axis` column discriminates.

### D9. Relationship evolution is opt-in per relationship

`evolution_tracked: true` per relationship; default true on insert.

### D10. Acquired skills are first-class; baseline skills are not growth events

Config-seeded baseline skills are *not* growth events. Story-driven skill
acquisitions are growth events with `acquisition_source='story'`.

## Schema (proposed)

```ts
// src/characters/spec/growth.ts (new)
export type GrowthMode = "dynamic" | "static";
export const ArcStage = {
  Introduction: "introduction",
  RisingAction: "rising_action",
  Crisis: "crisis",
  Resolution: "resolution",
  Epilogue: "epilogue",
} as const;
export const GrowthAxis = {
  Arc: "arc", Skill: "skill", Trait: "trait", Relationship: "relationship",
} as const;
export const GrowthEventType = {
  ArcStageSet: "arc_stage_set", ArcStageProposed: "arc_stage_proposed",
  SkillAcquired: "skill_acquired", TraitDrifted: "trait_drifted",
  RelationshipShifted: "relationship_shifted", Observation: "observation",
} as const;
export const GrowthEntryStatus = {
  Pending: "pending", Applied: "applied", Rejected: "rejected",
} as const;

export interface CharacterArc {
  actorId: string;
  currentStage: ArcStage;
  stageDescription: string | null;
  updatedAt: string;
}

export interface GrowthLogEntry {
  id: string;
  actorId: string;
  axis: GrowthAxis;
  eventType: GrowthEventType;
  status: GrowthEntryStatus;
  subjectKind: string | null;
  subjectId: string | null;
  beforeJson: string | null;
  afterJson: string | null;
  reason: string;
  sourceEventId: string | null;
  recordedAt: string;
  confirmedAt: string | null;
  confirmedBy: string | null;
}
```

## Files (proposed)

- `src/db/migrations/099_character_growth.ts` — schema migration
- Generated (via `db:sync-types && db:sync-manifest`):
  `src/db/schema-*.ts`, `src/db/schema.ts`, `src/db/schema-manifest.ts`,
  `src/test-utils/insert-helpers.ts`, `src/validation/db-schemas.ts`
- `src/characters/spec/growth.ts` — public type contracts
- `src/characters/spec/character.ts` — `CanonicalCharacter` extension
- `src/characters/services/growth-service/` — service module
  (types, crud, redact, llm-assist, index)
- `src/characters/services/skills-service-bridge.ts` — skills bridge
- `src/characters/services/traits-service-bridge.ts` — traits bridge
- `src/characters/services/relationships-service-bridge.ts` — relationships bridge
- `src/characters/validator/fields.ts` — `validateGrowthFields`
- `src/characters/validator/index.ts` — wire into `validateCharacter`
- `src/assistant/prompt/sections/actor-growth.ts` — prompt section
- `src/assistant/prompt/registry.ts` — register section
- `src/assistant/prompt/types.ts` — `PRIORITY.actorGrowth = 1`
- `src/routes/character-growth/index.ts` — API routes
- `src/routes/characters/update.ts` — accept `growth_mode` + `llm_assist_enabled` on PATCH
- `src/app/register-plugins.ts` — register routes
- `src/views/partials/character-journey.html` — player card journey
- `src/views/partials/character-growth-editor.html` — author/GM editor
- `src/frontend/character-growth-editor.js` — Alpine.js wiring
- `src/characters/services/growth-service/redact.ts` — `redactForPlayerCard()`
  (Q7: merge with `toPublicCard()` once internal-traits lands)

## Tasks

| Task                                  | Description                                                                                            | Priority | Status      |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------ | -------- | ----------- |
| TASK-char-growth-schema               | Migration `099_character_growth.ts` + regenerate schemas                                               | High     | Not Started |
| TASK-char-growth-types                | `src/characters/spec/growth.ts` + `CanonicalCharacter` extension                                       | High     | Not Started |
| TASK-char-growth-service              | `src/characters/services/growth-service/` (CRUD, redact, llm-assist)                                  | High     | Not Started |
| TASK-char-growth-bridges              | Skills / traits / relationships bridges                                                                | High     | Not Started |
| TASK-char-growth-validation           | Extend `src/characters/validator/fields.ts`                                                            | Medium   | Not Started |
| TASK-char-growth-prompt               | `actorGrowthSection` builder + registry + PRIORITY                                                    | High     | Not Started |
| TASK-char-growth-api                  | `/api/character-growth/*` routes + PATCH on actors                                                    | Medium   | Not Started |
| TASK-char-growth-frontend             | Player card "Character Journey" + author/GM editor + Alpine.js wiring                                 | Medium   | Not Started |
| TASK-char-growth-llm-assist           | Replace stub with aux-pipeline pass                                                                    | Low      | Not Started |
| TASK-char-growth-tests                | Schema, validation, integrity, events, prompt section, API, integration                               | High     | Not Started |

## Current-State Verification Required Before Implementation

- Confirm `src/rpg/skills/service/progression.ts:14-72` (`addXp`)
  semantics to design the bridge event correctly.
- Confirm `src/characters/services/traits-service/` public API for
  `updatePermanentTrait` / `updateWorldTrait`.
- Confirm `src/characters/services/relationships-service/write.ts` API.
- Confirm prompt-section budget/drop behavior in `prompt-assembler.ts`.
- Confirm `redactForPlayerCard()` ownership: this epic defines
  `src/characters/services/growth-service/redact.ts` standalone. When
  `epic-character-internal-traits.md` lands its `toPublicCard()`, merge
  into `src/characters/to-public-card.ts` (follow-on ticket per Q7).
- Confirm `bun run db:sync-types && bun run db:sync-manifest` workflow.

## Open Questions

1. **Should LLM-assist proposals also affect the arc stage automatically,
   or only via author confirmation?** Recommendation: always via author
   confirmation — D5.
2. **Should the growth log be exportable as a "character journey" artifact?**
   Defer to follow-on epic.
3. **Should `growth_mode === 'static'` also disable config-seeded skill
   grants from new worlds the character enters?** Recommendation: yes.
4. **Should relationship type transitions be auto-recorded, or only when
   `evolution_tracked === true`?** D9 says opt-in per relationship.
5. **How does growth interact with character spec version migrations?**
   Recommendation: carry forward (the log is durable history).
6. **Should growth events emit cross-system events (`character.grew`)**
   for downstream subscribers (memory, achievements)? Recommendation:
   yes — emit `character.grew` with `axis` and `event_type`.
7. **How should the growth-owned `redactForPlayerCard()` merge with
   `toPublicCard()` from `epic-character-internal-traits.md`?**
   Recommendation: grow the shared transform into
   `src/characters/to-public-card.ts` once both epics are implemented;
   track the merge as a follow-on ticket.

## Tickets

- `.plan/tickets/TASK-char-growth-*.md` — one per task above.

## Related Epics

- `epic-character-core-system.md` — base character model
  (`CanonicalCharacter`).
- `epic-character-internal-traits.md` — internal traits + aspirations.
  Player-card redaction is **NOT** shared yet (internal-traits is Draft;
  `toPublicCard()` not implemented). Growth ships its own
  `redactForPlayerCard()`; merge into a shared `toPublicCard()` once
  internal-traits lands (Q7 follow-on).
- `epic-character-spec.md` — validation modes (strict / relaxed), review
  workflow role model.
- `epic-character-world-setup.md` — per-world setup.
- `epic-agency-story-points.md` — runtime goal progression.
- `epic-actor-autonomy-story-drive.md` — actor-level story drive.
- `epic-character-npc-lore-access.md` — NPC lore access.
- `epic-rpg-mechanics.md` — RPG umbrella.
- `epic-achievements.md` — achievements may trigger growth events.
- `epic-memory-knowledge-systems.md` — G24 emotional-impact integration.
- `TASK-character-mood-happiness.md` — mood may *trigger* a growth event.
- `epic-world-diplomacy-karma.md` — karma is learned reputation.
- `epic-skills-professions-config.md` — config-seeded baseline skills.
