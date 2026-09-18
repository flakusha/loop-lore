<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Time Sync Replay Prohibition Policy

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-conversation-branching
**Tags:** time-sync, replay, policy

**Summary:**
Replay-prohibition policy: no replay of an already-merged branch; the merged chat only sees new messages from current-tick forward.

**Context:**
Replay complicates merging (deduplication, ordering). Banning replay simplifies the merge.

**Acceptance Criteria:**
- Policy doc: a chat marked `merged_from_branches` has its source branches frozen from new edits; only forward messages (current tick) may be appended.
- API: source-branch mutations after merge return `409 frozen`.
- UI: source branches display "merged, read-only" banner.
- Tests: post-merge edit rejected; pre-merge edits allowed.
