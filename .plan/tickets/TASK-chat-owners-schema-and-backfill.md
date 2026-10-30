<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Chat owners schema and backfill

**Status:** Not Started
**Priority:** high
**Effort:** Small
**Epic:** epic-chat-multi-ownership
**Tags:** chat, ownership, db
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Migration 082_chat_owners (number picked against real src/db/migrations HEAD at implementation time; HEAD is 081 as of filing): CREATE TABLE chat_owners (id text PK, chat_id text FK chats.id cascade, user_id text FK users.id cascade, granted_by text FK users.id nullable, granted_at text, reason text nullable CHECK length <= 500, UNIQUE(chat_id, user_id)) plus backfill of one row per existing chat from chats.created_by (granted_by null). chats.created_by stays untouched — semantic becomes creator, append-only; no column churn on chats (one CREATE TABLE per the migrations README policy). Includes bun run db:sync-types + db:sync-manifest artifacts. AC: migration up/down green on empty and seeded DBs; every pre-existing chat ends with exactly one chat_owners row equal to its created_by; UNIQUE rejects a duplicate (chat_id, user_id) insert; down drops the table cleanly.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
