<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: Migration 020 logs via console.warn with eslint-disable instead of emitWarning

**Status:** Done
**Priority:** low
**Effort:** Medium

**Summary:** migration 020 logs via console warn with eslint disable inst
**Context:** Context: 020_actor_story_points_partial_unique.ts:44 (this week).
**Acceptance Criteria:** switch to process.emitWarning.

## Summary

Context: 020_actor_story_points_partial_unique.ts:44 (this week). Severity: nit. console.warn + eslint-disable in a migration instead of the repo's process.emitWarning channel used by config/templates-loader/entity-position.ts:36. Fix: switch to process.emitWarning.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
