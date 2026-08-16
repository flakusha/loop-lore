<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Character Core System

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** Very High
**Epic:** epic-character-core-system

## Summary

Consolidated character system improvements: mandatory/optional fields, RPG stats, personality traits, validation, and unified character API. From `epic-character-core-system.md`.

## Scope

### Character Model

- Mandatory fields: name, description, personality
- Optional fields: nickname, scenario, welcome_message, etc.
- RPG stats (STR, DEX, CON, INT, WIS, CHA)

### Validation

- Character validation schemas
- Field length limits
- Required field enforcement

### Unified API

- Character CRUD operations
- Character search and filtering
- Character import/export

## Linked Epics

- `epic-character-core-system.md`

## Acceptance Criteria

- [ ] Character model with mandatory/optional fields
- [ ] RPG stat system with base stats and modifiers
- [ ] Personality trait system
- [ ] Character validation schemas
- [ ] Unified character API (CRUD, search, filter)
- [ ] Character import/export support
- [ ] Integration with actor system
- [ ] Unit tests for character calculations
- [ ] Integration tests for character workflow

## Notes

- Reference `epic-character-core-system.md` for full system design
- See `docs/spec/character-spec.md` for authoritative spec
- Characters are actors — this epic focuses on character-specific fields
