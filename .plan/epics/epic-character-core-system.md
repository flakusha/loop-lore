# EPIC: Character Core System

**Status:** 🟡 Partial — character API + validation + personality/traits implemented; RPG stat system + template system in progress
**Priority:** High
**Effort:** High
**Type:** Foundation Epic
**Tags:** characters, stats, personality, core-system

## Summary

Core character data model and services — mandatory/optional fields, RPG stats, personality traits, validation, and the unified character API. Foundation for character generation, import, and all character-consuming systems.

## Reference

- Spec: `docs/spec/character-spec.md` (611 lines — authoritative)
- Spec: `docs/spec/character-interactions.md`
- Spec: `docs/spec/rpg-mechanics.md`

## Scope

- Mandatory fields: `name`, `description`, `personality`
- Optional fields: `nickname`, `scenario`, `welcome_message`, `mes_example`, `system_prompt`, `post_history_instructions`, `alternate_greetings`, `tags`, `creator`
- RPG stats (STR, DEX, CON, INT, WIS, CHA, etc.)
- Personality traits, bonds, flaws, ideals
- Character validation (field lengths, constraints)
- Unified character API

## Current State (verified 2026-08-04)

The unified character API is **implemented and wired** — no `TBD` remains in `src/routes/characters.ts`:

- `charactersRoutes` mounted at `src/elysia-app.ts:163`
- Full CRUD: `GET/POST /api/actors`, `GET /api/actors/:actorId`, `GET /api/actors/:actorId/card`, `PUT/DELETE /api/actors/:actorId`, `GET /api/actors/:actorId/export`, `POST /api/actors/import`
- Companion character sub-routes all wired: `character-traits`, `character-mood`, `character-relationships`, `character-avatars`, `character-emotions`, `character-emotion-avatars`, `character-availability`, `character-licensing`, `character-io` (each mounted in `elysia-app.ts`)
- Personality + traits services: `src/characters/services/personality-service.ts`, `traits-service.ts`
- RPG subsystem (dice, combat, achievements, crafting, encounters, spells) under `src/rpg/`
- Import/export per `epic-import-export-io.md`

## Tasks

- [x] Character validation schemas (field lengths, required fields) — TypeBox `src/validation/schemas.ts`
- [x] Personality trait system — `traits-service.ts` + `personality-service.ts`
- [x] Character CRUD API routes — `src/routes/characters.ts` (wired, tested)
- [x] Character search/filter — `GET /api/actors` with `page`/`pageSize`/`type` query
- [ ] RPG stat system (base stats, modifiers, derived stats) — `src/rpg/` partial (dice/combat exist)
- [ ] Character template system — pending prompt-template-registry work

## Files

- `src/db/schema-core.ts` — Actors table (shared with actor system)
- `src/routes/characters.ts` — character API (implemented, wired)
- `src/rpg/` — RPG stat calculations (partial: dice, combat, achievements, etc.)

## Acceptance Criteria

- [x] Character creation with mandatory fields validated
- [x] Optional fields with correct defaults
- [ ] RPG stats calculate correctly
- [x] Character API serves full character data
- [x] Tests passing

## Related Epics

- `epic-actors.md` — characters are actors; this epic focuses on character-specific fields
- `epic-assistant-gm-flows.md` — character generation targets this system
- `epic-rpg-mechanics.md` — stat system integration
- `epic-character-spec.md` — spec details
- `epic-achievements.md` — stat-based achievements depend on character stats

## Tickets

- `TASK-character-core-system.md` — implementation tasks
