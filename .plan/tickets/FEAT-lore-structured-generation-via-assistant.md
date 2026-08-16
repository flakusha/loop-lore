<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# FEAT: Lore Structured Generation via Assistant

**Status:** Open
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-assistant-gm-flows
**Labels:** assistant, lore, generation
**Issue:** `8e34ac4`
**Related:** `docs/spec/lore.md`, `src/assistant/commands/create.ts`, `src/assistant/lore/audience.ts`, `src/assistant/prompt/sections/lore.ts`, `src/db/migrations/028_lore_audience_scope.ts`

## Summary

Generated entities (`/create world/loc/char/item`) should emit **structured lorebook entries** (`world_lore_entries` / `actor_lore_entries`) with subject-based `audience_scope`, `keys`, and `constant`/`selective` flags — **NOT** prose-only lore. Structured entries are more concise and precise for context injection than human-readable text, and flow through the already-wired audience-scoped `loreSection` without injection changes.

## Background

Lore audience scoping was recently implemented (uncommitted on `dev`):

- `src/assistant/lore/audience.ts` — pure `isLoreVisibleTo()` / `parseLoreScope()`, `ActorIdentity`, `LoreSubject` taxonomy (world/location/profession/race/faction/item)
- Migration `028_lore_audience_scope.ts` — `audience_scope` JSON column on **both** `world_lore_entries` + `actor_lore_entries`
- `loreSection` filters both lore fetches through `isLoreVisibleTo` (race from `species` trait, professions from traits + `professions.discipline`) **before** cooldown/constant/selective gates

**Gap:** `/create` (`src/assistant/commands/create.ts`) emits prose only — `world.lore` is a single human-readable paragraph, `description` strings for char/loc/item. It never creates `world_lore_entries` / `actor_lore_entries`. Result: a generated world's lore is injected wholesale to every actor — leaking dark-elf secrets to humans, no per-fact scoping.

## Scope

### 1. Structured generation output

Extend the `/create` LLM prompt to emit a `lore[]` array alongside entity data. The LLM returns JSON like:

```json
{
  "name": "Undercroft",
  "description": "...",
  "lore": [
    {
      "name": "Abandoned Castle",
      "content": "The underground castle has been abandoned for centuries.",
      "keys": ["castle", "undercroft"],
      "subject": { "kind": "race", "race": "dark elf" },
      "constant": false,
      "selective": true
    }
  ]
}
```

### 2. Entity → lore target mapping

| `/create` | Lore target                                                    | Subject                                                               |
| --------- | -------------------------------------------------------------- | --------------------------------------------------------------------- |
| `world`   | `world_lore_entries`                                           | `world` (global) + `race`/`profession`/`location` for culture         |
| `loc`     | `world_lore_entries`                                           | `location` bound to generated `locationId`, `requires_presence: true` |
| `char`    | `actor_lore_entries` (private book) + race/profession subjects | `race`/`profession`                                                   |
| `item`    | `world_lore_entries`                                           | `item`                                                                |

### 3. Persistence + validation

- Parse/validate `lore[]` against `LoreSubject` schema (`src/validation/schemas.ts` TypeBox) — reject invalid subject kinds
- Insert into `world_lore_entries` / `actor_lore_entries` with `audience_scope` JSON (existing `createEntityRoutes` already handles JSON fields)
- Clamp `keys`, respect `constant` / `selective` / `position`

### 4. Injection

No change needed — `loreSection` is already audience-filtered. This is **data population only**; generated entries flow through existing scoped injection automatically.

## Additional Shaping (ties to `epic-world-locations` — Lore Following / Quality Investigation)

- **Lore consistency check** on creation (conflict detection vs existing entries)
- **Lore enrichment suggestions** (fill missing subjects/keys)
- **Duplicate detection** before insert

## Acceptance Criteria

- [ ] `/create world` emits + persists structured `world_lore_entries` (with `audience_scope`)
- [ ] `/create loc` emits location-bound lore entries (`subject.kind="location"`, `requires_presence`)
- [ ] `/create char` emits `actor_lore_entries` (private book) + race/profession subjects
- [ ] `/create item` emits item lore entries
- [ ] `lore[]` validated against `LoreSubject` schema; invalid kinds rejected
- [ ] `keys` clamped; `constant`/`selective`/`position` respected
- [ ] Generated entries flow through existing audience-scoped `loreSection` (no injection regression)
- [ ] Duplicate/consistency detection before insert (ties to epic-world-locations)
- [ ] Unit tests for generation→parse→persist and audience-scoped injection
- [ ] `bun run check` + `bun test src/` pass

## Files

- `src/assistant/commands/create.ts` — extend prompts + persistence (primary)
- `src/validation/schemas.ts` — `LoreSubject` validation (TypeBox)
- `src/assistant/lore/` — reuse `LoreSubject`/`LoreScope` types
- `src/db/schema-story.ts` — `WorldLoreEntries`/`ActorLoreEntries` (already have `audience_scope`)
- `src/assistant/prompt/sections/lore.ts` — verify injection (no change expected)

## Notes

- Separate ticket intentionally — other tickets in `epic-assistant-gm-flows` are being touched; this isolates the lore-generation work.
- Builds on the already-implemented audience-scoping foundation; this ticket is data-population on top.
