<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Language-gated lore visibility

**Summary:** Character languages are a free-form string[] on the canonical character and lore audience gating (src/assistant/lore/audience.ts isLoreVisibleTo) checks race/profession/location/presence only — language is not a gate. Extend lore visibility so lore written in a language the character does not speak is inaccessible, and species-linked languages (in-world species languages currently have no spec or ticket) resolve from Character.species.
**Context:** Language dimension was flagged UNCOVERED in the 2026-09-21 world-side review; pairs with FEAT-race-origin-lore-identity-model which adds homeland/origin/culture audience dimensions.
**Acceptance Criteria:** isLoreVisibleTo (or sibling) accepts a language dimension; characters lacking the lore's language cannot see it; species → default language resolution; unknown/unset language fails open with a logged warning rather than hiding lore; unit tests for known/unknown/species-derived language cases.

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Small–Medium

**References:**
- Epic: .plan/epics/epic-character-world-integration.md
- Consumes: src/assistant/lore/audience.ts, src/db/enums-character/character-species.ts, src/rpg/species-mechanics.ts
- Related: .plan/tickets/FEAT-race-origin-lore-identity-model.md, TASK-world-lore-lifecycle-confidence-decay-distortion

**Branch:** open on dev.
