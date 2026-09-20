<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# FEAT: 2D world: shared battle entrance rule table (chat + sprite)

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Large
**Epic:** epic-2d-sprite-world
**Summary:** One tunable entrance rule table evaluated from both chat and sprite paths.
**Context:** Epic epic-2d-sprite-world; combat_event unifies both surfaces; must reconcile with current chat battle entrance.
**Acceptance Criteria:** Identical encounter resolves identically from chat and canvas.

## Summary

Tunable template {trigger: proximity|aggression|ambush|scripted, range, standing_floor, karma_floor, resource_check, skill_check, reroll_policy} -> allow|deny|escalate-to-GM. Same table from chat-initiated and sprite-proximity paths; combat_event unifies both surfaces; reconcile with current chat battle entrance. AC: identical encounter resolves identically from chat and canvas.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
