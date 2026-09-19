<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# FEAT: Battle Core Implementation

**Status:** ✅ Resolved (already on dev, 2026-09-19)
**Priority:** high
**Effort:** XL
**Summary:** Battle Core Implementation
**Context:** Epic epic-battle-action-systems; tags battle, combat.
**Acceptance Criteria:** See ## Acceptance Criteria below.
**Epic:** epic-battle-action-systems
**Tags:** battle, combat

## Summary

Implement src/battle/ core turn order, initiative, HP tracking, morale, flee/retreat.
Source: docs/meta/reviews/review-topics.md §12.

## Resolution

Already implemented on dev — verified 2026-09-19 docs-gap reconcile audit (epic-docs-vs-plan-gap-audit-2026-09-19.md):

- src/routes/battle/ (morale,resolution,equipment,npc,weather,social)
- src/rpg/combat/
- src/battle/resolution-integration/initiative.ts

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
