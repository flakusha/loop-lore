<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Actors — Data Versioning (version table + backfill)

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-actors
**Tags:** actors, data-versioning, migration

## Summary

Data versioning for the actors table: 0–4 version table, bump-on-write migration contract, backfill script that promotes pre-existing rows to the current version, and the migration-on-write runtime hook. See .plan/tickets/TASK-actors-data-versioning.md

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
