<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Cold message archival to archive DB file

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Large
**Epic:** epic-db-growth-tiered-storage
**Tags:** database, archival

## Summary

Age-threshold move of messages + message_search_tokens (+FTS rows) to archive-messages.db; hot inserts unchanged; date-bounded reads via on-demand ATTACH; background job non-blocking; archive DB own WAL + FK pragma; migrations apply to archive DB (no drift). Acceptance: old messages queryable but absent from hot DB; FTS over archive works; check green.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
