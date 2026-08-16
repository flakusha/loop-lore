<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: User Story & Use Case Improvements

**Status:** 🟡 Permanently Ongoing
**Priority:** Medium
**Effort:** Continuous
**Epic:** epic-user-stories

## Summary

Ongoing user story and use case improvements — refining requirements, adding acceptance criteria, and ensuring specs align with user needs. Holding bin for UX/use-case refinements that don't belong to a feature epic.

## Current Backlog (2026-08-16)

| Item | Status | Notes |
| ---- | ------ | ----- |
| Chat flow section navigation (multi-location journey UI) | 🟡 Partial | Backend sectioning shipped (`routes/chat-sections/` CRUD + `alpine/chat-sections.ts` + chat.html panel); story-spanning navigation open — see `TASK-chat-flow-section-navigation` |
| Chat backgrounds location sync | ⬜ Not Started | See `TASK-chat-backgrounds-location-sync` |
| Chat room filters — extended filters | 🟡 Partial | Type/archived/sort shipped; world/min/max-messages/updated-since now wired (2026-08-16); tags pending (no tags table in schema) — see `TASK-chat-room-filters` |
| User seeding & role expansion | ⬜ Not Started | See `TASK-user-seeding-role-expansion` (Epic: Logic Reconciliation) |
| User block/ban/shadow | ⬜ Not Started | Low priority, postponed — see `TASK-user-block-ban-shadow` (Epic: Chat Lifecycle & Moderation) |

## Triage Rule

New UX ideas land here first. When an idea matures into a scoped feature, create a ticket under its owning epic (chat → `epic-chat-*`, auth → `epic-auth-access`, admin → `epic-frontend-admin`) and remove from this epic's linked list. This epic only keeps items with no better home.

## Acceptance Criteria

- [ ] Every backlog item has a owning ticket with concrete acceptance criteria
- [ ] Items that mature into features move to their owning epic
- [ ] Specs (`docs/frontend/`) stay aligned with shipped code
- [ ] No stale "Not Started" items without an owning ticket

## Linked Epics

- `epic-user-stories.md`