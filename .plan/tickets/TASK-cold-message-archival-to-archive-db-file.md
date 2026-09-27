<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Cold message archival to archive DB file

**Status:** Not Started
**Priority:** medium
**Effort:** Large
**Epic:** epic-db-growth-tiered-storage
**Tags:** database, archival

**Summary:** Age-threshold move of messages + message_search_tokens (+FTS rows) to archive-messages.db; hot inserts unchanged; date-bounded reads via on-demand ATTACH; background job non-blocking; archive DB own WAL + FK pragma; migrations apply to archive DB (no drift).

**Context:** messages is the #1 growth hotspot with messages_fts + content_plaintext + per-word blind-index rows multiplying storage; the hot DB slows backups and WAL checkpoints. Tiered storage (not live sharding) keeps one writable hot DB per the DbSplittingProbe evaluation.

**Acceptance Criteria:**

- [ ] Messages older than threshold are absent from hot DB but still queryable; FTS5 over archive works.
- [ ] Archive DB has independent WAL + FK pragma; migrations apply to it (no drift).
- [ ] `bun run check` green.
