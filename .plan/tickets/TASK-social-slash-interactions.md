<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Social & influence slash interactions (/persuade /intimidate /lie /charm /brag /insult /toast …)

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-social-interaction

**Summary:**
**Context:**
**Acceptance Criteria:**

## Summary

Command surface for the Social & Influence category. Extends the existing `TASK-social-interaction` (skill/DC/reputation mechanics) with the concrete slash-command verbs from the expanded interaction catalog. Depends on `TASK-interaction-service-foundation`.

## Scope

- `/persuade` (logic/empathy), `/intimidate` (fear), `/lie` (deception vs awareness), `/charm` (charisma favor), `/flatter` (ego-targeted: info/discounts), `/brag` (renown up, jealousy risk), `/challenge` (duel or contest of wits), `/reverence` (cleric/religious NPCs), `/insult` (favor down, conflict risk), `/toast` (rapport in social settings).
- **Social ripple**: unlike battle, these write persistent NPC opinion / location reputation / renown via the foundation's social-state layer; later turns read it in prompt context.
- Charisma/Intimidation skill checks; action-point cost.

## Acceptance Criteria

- [ ] All 10 verbs registered with skill matrix entries
- [ ] `/insult`/`/brag` ripple effects observable in a later turn's NPC reaction
- [ ] `/challenge` resolves into battle or contest flow on acceptance
- [ ] Reuses TASK-social-interaction skill-check code — no duplicate DC logic
- [ ] Tests: favor/renown deltas persisted, challenge handoff

## Linked Epics

- `epic-social-interaction.md` (EPIC-041)
- `epic-relationships.md`
