<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Character Internal Traits Schema + API

**Epic:** epic-character-internal-traits
**Priority:** High (P6-D — character/agentic core, matrix G27/G36 dep)
**Effort:** Medium
**Status:** Not Started
**Created:** 2026-08-15
**Related:** G27 (BDI Planning ↔ Internal Traits), G36 (Character Growth ↔ Internal Traits)

## Summary

Give authors structured, hidden character state — internal traits, aspirations & plans,
moral disposition, and behavioral dimensions (coping, approach, autonomy) — that the
model must play instead of collapsing to default LLM helpfulness. Schema/API-focused;
hard visibility requirement: hidden fields reach the LLM prompt but are stripped from
player-facing API responses.

## Background

Personality is currently free-text (`CanonicalCharacter.personality`, `src/characters/spec/character.ts:86-107`).
BDI planning (`TASK-npc-bdi-planning.md`) needs aspiration data; character growth
(`TASK-character-growth-development.md`) needs trait data. Without a schema-backed
internal-traits layer both integrations are blocked (matrix G27, G36).

## Requirements

### Schema

- `InternalTraits` — hidden author-planted facts about a character (invisible to players/other characters)
- `Aspirations` — global aim + hidden/visible plans to achieve it (engine of goal-driven agency)
- `MoralDisposition` — helpfulness ↔ evilness axis + openness
- `BehavioralDimensions` — coping mechanisms, approach tendencies, autonomy/free will

### API + prompt assembly

- CRUD on character spec (extend `CharacterSpec` API)
- Prompt-injection mechanics: hidden fields in LLM prompt, stripped from player-facing responses
- Cross-ref: `epic-agency-story-points.md` (runtime goal-tracking loop, decoupled but fed by this)

## Acceptance Criteria

- [ ] Schema types for traits/aspirations/disposition/behavioral dimensions
- [ ] API surface (create/read/update/delete on character)
- [ ] Hidden fields injected into prompt, stripped from player-facing API responses
- [ ] BDI planning can read aspiration data (G27 unblocked)
- [ ] Character growth can read trait data (G36 unblocked)

## Notes

Epic is Draft (extended D7–D9: coping, approach, autonomy). Wire into `epic-character-core-system.md`
ownership model. Ticket created 2026-08-15 during `.plan/` reconciliation (was flagged
"needs ticket" in `backlog/priority.md` P6-D).
