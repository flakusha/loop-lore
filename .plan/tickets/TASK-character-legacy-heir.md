# TASK: Character Legacy & Heir System

**Priority:** Medium
**Status:** ⬜ Not Started
**Epic:** epic-character-core-system
**Tags:** character, legacy, inheritance, generational

## Description

Extend the Character Core System with a legacy/heir mechanic — when a character dies or retires, their traits, relationships, and possessions can be inherited by a new character or passed to a descendant. Creates generational continuity across sessions and worlds.

## How It Extends Existing Work

Builds on the Character Core System epic's mandatory/optional fields, personality integrity, and licensing. Adds a new layer on top of the existing data model without modifying core character fields.

## Acceptance Criteria

- [ ] `legacy` field on character schema (heir_id, parent_id, generation, inheritance_flags)
- [ ] Character death/retirement event triggers legacy options (pass traits, pass possessions, pass relationships)
- [ ] Heir character inherits configurable subset of parent's traits (personality, skills, reputation)
- [ ] Inheritance quality modifier based on relationship strength and world state
- [ ] Legacy chain tracking (ancestor → descendant lineage)
- [ ] `GET /api/characters/:id/legacy` endpoint
- [ ] Frontend legacy panel showing lineage tree
- [ ] Optional: bloodline perks that strengthen with each generation

## Technical Notes

- New table `character_legacy` linking parent and child character IDs
- Inheritance flags: `traits`, `possessions`, `relationships`, `reputation`, `memories`
- Personality integrity constraint: inherited traits cannot override core personality (from epic)
- Lineage tree rendering in frontend using Alpine.js component
