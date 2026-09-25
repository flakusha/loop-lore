<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-agency-utility-scorer: Wire personality traits as utility weights for NPC reaction step

**Status:** Draft
**Priority:** P0 (within EPIC-RESEARCH-AGENCY-DECISION)
**Effort:** 2 days
**Parent epic:** `epic-research-agency-decision.md`
**Related:** `epic-character-internal-traits.md` (D7 coping, D8 approach, D9 autonomy), `src/characters/services/personality-service/`, `src/characters/services/character-systems/`, `epic-agency-story-points.md` (ReactionDecision type), `epic-actor-autonomy-story-drive.md` (reaction dispatch)

**Summary:**

## Goal

Make `PersonalityModifierResolver` (or equivalent) compute a utility score for each candidate reaction (`chat | wait | do_other | flee | attack | ignore`) so the autonomy scheduler can pick the highest-scoring reaction deterministically.

**Context:**

## Why

- Stanford Generative Agents reaction loop: scores candidates, picks max.
- The Sims: continuous needs x discrete actions, weighted sum.
- Loop-lore already has the personality axes (D7/D8/D9) - they are the weights; no schema work.

**Acceptance Criteria:**

- [ ] `scoreReaction(actor, candidates, context) -> ReactionDecision` returns the highest-utility option with a numeric score and a human-readable reason string.
- [ ] Unit tests cover all 6 reaction modes with at least 3 personality profiles per mode (autonomous-bold, cautious, neutral baseline).
- [ ] Wired into the autonomy scheduler's `reaction due` dispatch path; existing manual-reaction codepath unchanged.
- [ ] Telemetry: per-decision scores feed `interaction_log` (no new column required; store via existing `effect` JSON).

## Out of Scope

- Full GOAP-style plan composition.
- LLM-driven reaction commentary (defer to a followup if designers want narrativised reasoning).
- New personality axes.


git issue: 3aef0c6
