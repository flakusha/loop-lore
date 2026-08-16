---
title: "FEAT-045: Branching data model"
status: open
priority: medium
labels: [feature, chat, data-model]
epic: epic-conversation-branching
related: [FEAT-046, FEAT-047]
---

<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# FEAT-045: Branching data model

## What

Extend the chat message tree to support explicit branching — forking a conversation at any point to explore alternative paths without losing the original.

## Why

Users want to explore "what if" scenarios in roleplay: try a different response, see where a different choice leads, then optionally merge back. The existing `parent_id` field on messages already supports tree structures, but there's no concept of a "branch point" or branch metadata. Branching enables save-scumming, A/B narrative testing, and multi-path story exploration.

## Current State

- `src/db/migrations/parts/006_messages_keys.ts` — `parent_id` column on messages (tree structure exists)
- `src/chat/service/` — message CRUD with parent_id support
- `src/db/migrations/025_vn_choices.ts` — VN choice branching (story-specific, not general)
- No branch metadata, branch naming, or branch navigation exists

## Acceptance Criteria

- [ ] **`chat_branches` table** — `id`, `chat_id`, `parent_message_id` (fork point), `name`, `created_at`, `is_active`
- [ ] **Fork operation** — `POST /api/chats/:id/fork` creates a new branch from a specified message, copying the message path from root to fork point
- [ ] **Branch switching** — `PATCH /api/chats/:id/active-branch` switches the visible message path
- [ ] **Message scoping** — message queries filter by active branch (follow parent_id chain from branch tip to root)
- [ ] **Branch metadata** — name, description, message count, last activity timestamp
- [ ] **Auto-naming** — branches auto-named "Branch 1", "Branch 2" unless user provides custom name
- [ ] Unit tests for fork, switch, and message scoping

## Implementation Notes

- Messages table already has `parent_id` — branching is a metadata layer on top
- Fork: INSERT into `chat_branches` with `parent_message_id` pointing to fork point
- Active branch: store `active_branch_id` on `chats` table (new column, migration)
- Query: `getMessagesForBranch(db, chatId, branchId)` walks parent_id chain
- Keep existing message queries unchanged — branch filtering is opt-in via parameter
- Size gate: branching files <250L each

## Dependencies

- Blocked by: nothing (extends existing parent_id tree)
- Blocks: FEAT-046 (branch navigation API), FEAT-047 (branch UI controls)
