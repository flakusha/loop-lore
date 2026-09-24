<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: InteractionService foundation (heavy-action engine)

**Status:** ✅ Resolved
**Priority:** High
**Effort:** High
**Epic:** epic-rpg-mechanics

**Summary:**
**Context:**
**Acceptance Criteria:**

## Summary

`interactionService` provides the shared heavy-action engine used by stealth, survival, social, economy, and intellect command surfaces. The implementation keeps one resolution path for dice math, modifier provenance, resource gates, persistence, and later prompt context.

## Scope

- `src/rpg/interaction/` module: `InteractionContext` (actor, target, location, action points), solver entry, and `interaction_logs` persistence.
- **Skill/modifier matrix**: command → primary skill check plus character-stat ability modifiers and canonical relationship-tier modifiers (`/forage`→Survival, `/evaluate`→Intellect, `/persuade`→Persuasion, `/hide`→Stealth, `/study`→Intellect).
- **Material dependency gate**: insufficient materials return a friendly system message and persist a blocked interaction record instead of throwing.
- **Social ripple effect**: social outcomes update canonical `character_relationships` through `RelationshipsService`; the interaction record retains the resulting state changes.
- Slash-command dispatch integration via the existing registry (`src/assistant/commands/registry.ts` + `src/routes/messages/command.ts` dispatch).

## Out of scope

- Individual command definitions (one ticket per category in this batch).
- Fast actions (`/say`, `/draft`, …) — separate prompt-pipeline ticket; fast actions do not enter `interaction_logs`.

## Acceptance Criteria

- [x] `src/rpg/interaction/` service with `InteractionContext`, skill matrix, automatic ability modifiers, relationship modifiers, and resource gate
- [x] `interaction_logs` table + migration with roll math, modifier provenance, outcomes, and state changes
- [x] Successful, failed, and blocked interactions persist and surface in later prompt context
- [x] Social-state writes use canonical relationships and survive the dispatch → service round trip
- [x] Reference verbs are wired end-to-end through `dispatchCommand`
- [x] Unit + integration tests cover modifier math, blocked persistence, prompt context, and relationship updates

## Linked Epics

- `epic-rpg-mechanics.md`
- `epic-battle-action-systems.md` (solver/roll conventions to reuse)
