# EPIC: Character Core System

**Status:** 📝 Draft
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

## Tasks

- [ ] Character validation schemas (field lengths, required fields)
- [ ] RPG stat system (base stats, modifiers, derived stats)
- [ ] Personality trait system
- [ ] Character CRUD API routes
- [ ] Character search/filter
- [ ] Character template system

## Files

- `src/db/schema-core.ts` — Actors table (shared with actor system)
- `src/routes/characters.ts` — character API (TBD)
- `src/rpg/` — RPG stat calculations (TBD)

## Acceptance Criteria

- [ ] Character creation with mandatory fields validated
- [ ] Optional fields with correct defaults
- [ ] RPG stats calculate correctly
- [ ] Character API serves full character data
- [ ] Tests passing

## Related Epics

- `epic-actors.md` — characters are actors; this epic focuses on character-specific fields
- `epic-assistant-gm-flows.md` — character generation targets this system
- `epic-rpg-mechanics.md` — stat system integration
- `epic-character-spec.md` — spec details
- `epic-achievements.md` — stat-based achievements depend on character stats

## Tickets

- `TASK-character-core-system.md` — implementation tasks
