<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: 2D world review: reconcile shared battle-entrance table with current chat initiation path

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

FEAT-2d-world-shared-battle-entrance-rule-table designs a new entrance rule table evaluated from chat and sprite paths, but must reconcile with the current chat battle entrance (battleRoutes mounted src/elysia-app.ts, initiation via src/assistant/commands/battle.ts + src/battle/). Audit the existing initiation path first (gates it already applies: resources/standing/karma/range checks), then specify the shared table as an extension of it - not a parallel gate. Without this the two designs diverge and identical encounters resolve differently per surface.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
