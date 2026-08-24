<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Promote User to Moderator

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** Medium
**Epic:** epic-chat-lifecycle-moderation
**Related:** TASK-moderator-permission-gating-for-read-only-review-surface
**git issue:** 45d6f78

## Summary

Provide an admin action to elevate a registered user to moderator, propagating
moderator permissions and recording an audit trail.

## Context

No planning artifact owns the promotion workflow. Moderation permission *checks*
exist (TASK-moderator-permission-gating-for-read-only-review-surface) but the
promotion *action* — admin grants the moderator role, permissions propagate to the
user's sessions, and an audit entry is written — is entirely unplanned. This is a
core admin/permissions flow and was identified as a coverage gap in the core
functionality review.

## Acceptance Criteria

- [ ] Admin endpoint/action to promote a user to moderator (ownership + auth checks)
- [ ] Moderator role/permission propagation to the user's active sessions
- [ ] Audit log entry for the promotion (actor, target, timestamp)
- [ ] Demotion path symmetric (optional, noted if deferred)
- [ ] `bun run check` green
