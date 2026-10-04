<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: importChatDek throws on chat_keys primary-key collision instead of degrading

**Status:** Not Started
**Priority:** low
**Effort:** Small
**Tags:** federation

**Summary:**

chat_keys.id is PRIMARY KEY and chat_id carries a UNIQUE index (src/db/migrations/001_init.ts:1678, 1999-2003); dek-rewrap.ts:195-205 declares onConflict only on chat_id, so an artifact whose keyId equals an existing chat_keys.id bound to a different chat violates the PK (not a conflict target) and the insert throws. A sender can craft colliding key ids to break DEK imports for chosen chats (persistent replication failure). No production ingestion path yet. Fix: onConflict on both chat_id and id, or pre-select and fall back to the existing row, or reject with a typed error. Executed evidence (2026-10-04): bun:sqlite probe - a colliding PK id on a different chat_id under on conflict(chat_id) do nothing throws UNIQUE constraint failed: chat_keys.id; a plain chat_id conflict is a silent no-op.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
