<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: importChatDek throws on chat_keys primary-key collision instead of degrading

**Status:** Wontfix
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


## Resolution

The SQL claim in the Summary is CORRECT and reproduces: the insert at
`src/federation/dek-rewrap.ts:195-205` declares `onConflict` only on
`chat_id`, so a PRIMARY KEY violation on `id` is not a conflict target and the
insert throws `SQLITE_CONSTRAINT_PRIMARYKEY: UNIQUE constraint failed:
chat_keys.id`.

Not reachable, on two independent grounds:

1. `importChatDek` (`src/federation/dek-rewrap.ts:184`) has zero production
   callers — only `src/federation/dek-rewrap.test.ts` and
   `docs/review/federation-local-multi-instance-review.md:66`. There is no
   inbound DEK wire route.
2. `keyId` is not free-form. `exportChatDekForPeer` returns the SENDER's own
   `chat_keys` row id (`src/federation/dek-rewrap.ts:111`, read at `:86-90`),
   and that id is minted by `crypto.randomUUID()`
   (`src/crypto/chat-keys.ts:143`). A sender cannot craft an arbitrary
   `keyId` at all, so the described "crafted colliding key id" is not
   reachable even once a route lands.

Fix direction for whenever a wire route does land: widen the conflict target
to `.onConflict(oc => oc.columns(["id", "chat_id"]).doNothing())`, or reuse
the pre-read already present at `:207-211` to detect the collision and fall
back to the existing row. Wontfix rather than Done: the defect is real in the
query but cannot occur, so no code change was made.
