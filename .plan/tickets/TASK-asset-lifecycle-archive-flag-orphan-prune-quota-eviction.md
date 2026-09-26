<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Asset lifecycle: archive flag, orphan prune, quota eviction

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-db-growth-tiered-storage
**Tags:** database, assets

**Summary:** assets archived_at flag + archived timestamp; orphaned storage_path file prune job; per-user/world size quota with oldest-first eviction enforced on upload.

**Context:** Asset metadata grows unbounded while files live on disk outside the backup chain; orphaned storage_path files accumulate with no prune path and no quota backpressure.

**Acceptance Criteria:**

- [ ] Assets can be archived and hard-deleted; orphaned files detected and removed.
- [ ] Storage quota configurable and enforced on upload (test).
- [ ] `bun run check` green.
