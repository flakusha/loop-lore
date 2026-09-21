<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: InteractionService foundation (heavy-action engine)

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** High
**Epic:** epic-rpg-mechanics

**Summary:**
**Context:**
**Acceptance Criteria:**

## Summary

`interactionService` does not exist yet (`src/rpg/` has battles, intimacy, body-systems — no general interaction engine). This ticket establishes the shared heavy-action engine that the stealth / survival / social / economy / intellect command-surface tickets (same batch, branch `commands-interaction-extension`) plug into. Design source: expanded interaction catalog (2026-09-21 session).

## Scope

- `src/rpg/interaction/` module: `InteractionContext` (actor, target, location, action points), solver entry, `interaction_logs` persistence (mirrors battles logging).
- **Skill-requirement matrix**: command → primary skill check (`/forage`→Survival, `/evaluate`→Intellect, `/barter`→Charisma, `/sniff`→Perception, …). Data-driven table, extensible without code change per new verb.
- **Material dependency gate**: `/craft`, `/repair`, `/forage` verify inventory ingredients / tools before the `InteractionContext` is initialized; insufficient-cost is a friendly systemMessage, not a throw (see BUG-command-dispatch-async-handler-uncaught).
- **Social ripple effect**: social verbs write persistent Social State (NPC opinion, location reputation, renown) instead of terminating like battle — read by later turns.
- Slash-command dispatch integration via the existing registry (`src/assistant/commands/registry.ts` + `src/routes/messages/command.ts` dispatch).

## Out of scope

- Individual command definitions (one ticket per category in this batch).
- Fast actions (`/say`, `/draft`, …) — separate prompt-pipeline ticket; fast actions do not enter `interaction_logs`.

## Acceptance Criteria

- [ ] `src/rpg/interaction/` service with `InteractionContext` + skill matrix + resource gate
- [ ] `interaction_logs` table + migration (append-only policy)
- [ ] Social-state writes persist and surface in later prompt context
- [ ] At least one reference verb per category wired end-to-end through dispatchCommand
- [ ] Unit + integration tests: dispatch → service → persisted state round trip

## Linked Epics

- `epic-rpg-mechanics.md`
- `epic-battle-action-systems.md` (solver/roll conventions to reuse)
