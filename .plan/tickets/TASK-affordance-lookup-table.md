<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-affordance-lookup-table: `(actor_caps, item_props, context_state) -> AffordanceResult`

**Status:** ✅ Done (commit 625e36bd — `feat(agency): ship action-parser + affordance + scorer + budget-gate`; 6×16 matrix + novel-item fallback wired into ActorItemsService.equip; 35/35 affordance tests green)
**Priority:** P0 (within EPIC-RESEARCH-AGENCY-AFFORDANCE)
**Effort:** 1-2 days
**Parent epic:** `epic-research-agency-affordance.md`
**Related:** `TASK-affordance-action-parser` (upstream), `src/services/actor-items.ts` (`ActorItemsService.equip/unequip/transfer`), `src/validation/schemas/actors.ts`, prior-batch `TASK-math-modifier-source-table` (related normalisation work)

**Summary:**

## Goal

Given a typed Action from `TASK-affordance-action-parser`, evaluate whether it is **afforded** for the actor in the current context. Return `{ allowed: boolean, reason: string }` so unsupported actions are explained, not silently dropped.

**Context:**

## Why

- Gibson/Norman: affordance is the **cross-product** of `(actor.capabilities, item.properties, context.state)`. Hard-coding verb lists per item does not scale.
- HOI-CL compositional learning: zero-shot generalisation validates the cross-product math for novel items.
- Existing `ActorItemsService` denies silently on slot-conflict / encumbrance / requirement failures - users get no actionable feedback.

**Acceptance Criteria:**

- [ ] `AffordanceResult { allowed: boolean, reason: string, missing?: string[] }` typed contract.
- [ ] Lookup table seeded with the canonical item categories (`weapon`, `armor`, `accessory`, `consumable`, `key`, `quest`) x verb matrix.
- [ ] Hooks into `ActorItemsService.equip/unequip/transfer` so denial responses include `reason`.
- [ ] Unknown-item fallback: novel items get the **maximum affordance** (verb agnostic) until seeded; marked with `reason: "novel_item_default"`.
- [ ] Unit tests: every category x every verb pair has at least 1 positive and 1 negative test.

## Out of Scope

- Per-character-custom affordance tables (defer).
- LLM-driven affordance reasoning (defer; deterministic table covers 100% of current use cases).


git issue: 9c23bd8
