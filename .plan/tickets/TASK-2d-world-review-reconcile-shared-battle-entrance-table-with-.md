<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: 2D world review: reconcile shared battle-entrance table with current chat initiation path

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

FEAT-2d-world-shared-battle-entrance-rule-table designs a new entrance rule table evaluated from chat and sprite paths, but must reconcile with the current chat battle entrance (battleRoutes mounted src/elysia-app.ts, initiation via /battle start in src/assistant/commands/battle.ts + src/battle/). Verified: current initiation applies only the mechanic-enabled gate (`checkCommandMechanic`) + roster check (`character_stats` presence) — NO standing/karma/resource/range gates exist. So the shared table's gates (standing_floor, karma_floor, resource_check, range, skill_check) are genuinely new, not duplicates. Specify the table as an extension of the current path; the rule table's deterministic gates run before the existing mechanic gate. Without this ordering spec the two designs diverge per surface.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
