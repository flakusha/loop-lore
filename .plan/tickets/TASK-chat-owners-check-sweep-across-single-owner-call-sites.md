<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Chat owners check sweep across single-owner call sites

**Status:** Done
**Status Note:** Shipped 2026-10-30: created_by cutover (seed owners on create via create.ts + split-utils + insertChats/generator, transfer swaps owners-set only with created_by frozen, isChatOwner rows-only no fallback) + call-site sweep (access, settings access, read, batch, polls, music-links, split/reunion, transitions/migrate-carry, routes) + spec §5.1. Suite: bun test src/chat/ src/routes/ 4649 pass / 89 skip / 0 fail (448 files); gates: typecheck-backend, lint-eslint, wiring-check, size-check, db-schema-gate, migrations-ordering PASS; size-strict FAIL is frontend-owned (chat-types/core.ts 288L, ticket-5 scope).
**Priority:** medium
**Effort:** Medium
**Epic:** epic-chat-multi-ownership
**Tags:** chat, ownership, access-control
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Swap every created_by === userId single-owner check to the isChatOwner predicate, mechanically, no access-layer restructure: checkChatAccess (src/chat/service/access.ts:133), checkChatSettingsAccess (access.ts:210), transferOwnership authority (ownership.ts:201), read.ts:51 hidden-message read, batch.ts:24/56/104 owned-chat scoping (becomes owners-set membership), polls.ts:247 isChatOwner, music-links.ts:224, split.ts:97 and 191-196 party split/reunion, transitions.ts:55 ownership guard. Update docs/spec/chat-privacy.md 5.1 to the owners-set rule (creator retained as created_by). AC: each swapped call site gains a co-owner positive test (a second chat_owners row passes where the old created_by check denied); spec section updated; a repo grep for created_by === in src/chat leaves only creator-semantics uses.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [x] Implementation complete — isChatOwner rows-only; transfer/add/remove operate on chat_owners; created_by frozen; create/split/migrate/transitions seed or carry the set; insertChats + generate-db-types.ts generator seed the creator row; ownership.ts:46 comment corrected.
- [x] Tests passing — owners-authority.test.ts pins co-owner positives per call site (settings access, batch archive, hidden-message read, poll close, party-split gate incl. resigned-creator/stranger denial, migrate set-carry, creation invariant); ownership.test.ts + access.test.ts updated to owners-set post-states; bun test src/chat/ src/routes/ 4649 pass / 89 skip / 0 fail.
- [x] Documentation updated — docs/spec/chat-privacy.md §5.1 owners-set rule; src/chat grep for created_by === leaves only creator-semantics uses (owners.ts:91 duplicate check, ownership.ts:207/230 materialize/fallback reads) plus out-of-scope route checks tracked as epic follow-up.
