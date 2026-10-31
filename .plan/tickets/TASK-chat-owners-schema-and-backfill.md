<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Chat owners schema and backfill

**Status:** Done
**Status Note:** Done 2026-10-30 in worktree tree/chat-multi-ownership (commit follows): migration 087 (renumbered from 082 in c2fe32732) + backfill; `bun run db:sync-types && db:sync-manifest && schemas:check` green; targeted suite `src/db/087_chat_owners.test.ts` + chain suites (migrations/roundtrip/schema-sync) 278/278 pass; gates db-schema/migrations-ordering/typecheck-backend/size-strict PASS. Git issue closes at finalize.
**Priority:** high
**Effort:** Small
**Epic:** epic-chat-multi-ownership
**Tags:** chat, ownership, db
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Migration 087_chat_owners (number picked against real src/db/migrations HEAD at implementation time; HEAD is 081 as of filing; renumbered 082 → 087 in c2fe32732): CREATE TABLE chat_owners (id text PK, chat_id text FK chats.id cascade, user_id text FK users.id cascade, granted_by text FK users.id nullable, granted_at text, reason text nullable CHECK length <= 500, UNIQUE(chat_id, user_id)) plus backfill of one row per existing chat from chats.created_by (granted_by null). chats.created_by stays untouched — semantic becomes creator, append-only; no column churn on chats (one CREATE TABLE per the migrations README policy). Includes bun run db:sync-types + db:sync-manifest artifacts. AC: migration up/down green on empty and seeded DBs; every pre-existing chat ends with exactly one chat_owners row equal to its created_by; UNIQUE rejects a duplicate (chat_id, user_id) insert; down drops the table cleanly.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [x] Implementation complete — `src/db/migrations/087_chat_owners.ts` (CREATE TABLE + UNIQUE + CHECK + FK cascades + idx_chat_owners_user + creator backfill; down() drops the table).
- [x] Tests passing — `bun test src/db/087_chat_owners.test.ts src/db/migrations.test.ts src/db/migration-roundtrip.test.ts src/db/schema-sync.test.ts` → 278 pass / 0 fail (backfill exactness, UNIQUE rejection, reason CHECK 500/501, FK cascades, down() reversal).
- [x] Documentation updated — `docs/spec/schema.md` Entity Relationships gains chat_owners; generated artifacts regenerated via db:sync-types/db:sync-manifest (schemas:check green).
