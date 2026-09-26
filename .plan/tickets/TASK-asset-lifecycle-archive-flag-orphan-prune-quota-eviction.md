<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Asset lifecycle: archive flag, orphan prune, quota eviction

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-db-growth-tiered-storage
**Tags:** database, assets

## Summary

assets archived_at flag + archived_at timestamp; orphaned storage_path file prune job; per-user/world size quota with oldest-first eviction enforced on upload. Acceptance: archive + hard-delete work; orphans detected/removed; quota enforced (test); check green.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
