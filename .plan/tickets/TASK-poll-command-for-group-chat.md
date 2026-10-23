<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: poll command for group chat

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-chat-rich-engagement
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Register `/poll <question> <options…>` when polls land, so group participants
(including AI actors via cascade) can vote without a polls-only modal. Source:
assistant integration review 2026-10-23 (row chat-rich-engagement / rec 9).

**Context:**

Polls arrive via the `071_message_polls` migration in the in-flight
chat-rich-engagement worktree; no slash surface is planned [INFERENCE —
review]. Without a command, voting is a fixed-flow panel and AI actors cannot
participate.

**Approach**

- New `src/assistant/commands/poll.ts`: create poll + render poll message via
  `CommandResult` action payload; votes resolve through group cascade
  (`triggerGroupCascade`, `src/generation/auto-gen/group-cascade.ts:122`) so
  mentioned/next actors can answer.
- Depends on the polls schema + service landing from chat-rich-engagement.

**Acceptance Criteria:**

- [ ] `/poll <question> <options…>` creates a poll message in the group chat
- [ ] Participants (users + AI actors) can cast votes in-flow
- [ ] Poll closes and posts results as a system message
- [ ] Unit tests: creation, duplicate vote rejection, close path
