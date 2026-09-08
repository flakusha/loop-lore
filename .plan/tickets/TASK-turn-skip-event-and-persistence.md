<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Turn skip event and persistence

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

Persist first-class turn_skip {actor, beat, mode: hold|advance}. Builds on filterPassedActors convention (trailing [PASS]) — promote to event + context-assembly rendering as absence, never action. Acceptance: skip row persists; context renders absence record; no fake action attributed.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
