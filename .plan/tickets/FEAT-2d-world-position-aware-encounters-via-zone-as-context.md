<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# FEAT: 2D world: position-aware encounters via zone-as-context

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-2d-sprite-world
**Summary:** Zone/participants passed as context into the pure random-events generator.
**Context:** Epic epic-2d-sprite-world; random-events.ts stays side-effect free; caller persists via current path; no new trigger service in v1.
**Acceptance Criteria:** Zone entry yields contextual events through the existing pipeline.

## Summary

Pass zone/participants as context into pure random-events.ts generator; caller persists via current path. Rules gate first (resources/standing/karma/range), LLM narrates. No new trigger service in v1. AC: zone entry yields contextual events through existing pipeline.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
