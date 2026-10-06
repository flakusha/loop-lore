<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Branch-merge tests and coverage

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-conversation-branching
**Tags:** branch-merge

**Summary:** Test suite for the content-merge feature — service unit tests, route tests, Alpine module tests — with every new module at the coverage floor.
**Context:** Branch-merge design §7 (T6): coverage floor gate from AGENTS.md (`bun run test:coverage` writes `.tmp/coverage/lcov.info`, gated by `scripts/check/coverage.mjs --floor=80`); route-test auth/IDOR patterns from the branch route tests; Alpine test patterns from the chat-variants/chat-branches modules; migration/roundtrip harness `src/db/migrations.test.ts` + `src/db/migration-roundtrip.test.ts` (owned by `TASK-branch-merge-db-migration-039.md`).
**Acceptance Criteria:** Graph/diff/criteria/budget units, route auth/IDOR/409/idempotency, Alpine module tests green; coverage floor met for every new module.
**Related:** FEAT-046.md, FEAT-047.md, FEAT-message-swipe-replay-branch.md

## Summary

- Service unit tests (`src/chat/service/merge/`): LCA/tail computation incl. unequal depths and the empty-tail `bad_request`; node-ceiling reject; overlay hunk classification; mode classification + option unions; token-budget allocation incl. prefix-overflow reject and the `truncated` flag; idempotent initiate replay; `merge_llm_parse` failure without partial writes.
- Route tests: unauthenticated 401, non-participant forbidden/404, cross-chat tip IDOR, concurrent-confirm 409, repeated-key initiate replay (`replayed: true`), confirm-then-continue happy path, continue-before-confirm rejection.
- Alpine module tests: wizard state-machine transitions, unresolved-conflict blocking of confirm, non-2xx → error toast without state mutation — following the chat-variants/chat-branches test patterns.
- Coverage: each new module (`src/chat/service/merge/*`, `src/routes/chats/branch-merges.ts`, `src/frontend/alpine/chat-branch-merge.ts`) at the repo coverage floor.

## Acceptance Criteria

- [ ] Unit tests cover graph/LCA, diff/overlay, criteria classification and token-budget overflow paths
- [ ] Route tests cover auth, cross-chat IDOR, 409 conflict and idempotent replay
- [ ] Alpine module tests cover wizard transitions and the error-toast-without-mutation contract
- [ ] Coverage floor met for every new module (`bun run test:coverage` + `scripts/check/coverage.mjs --floor=80`)
- [ ] `bun run check` green on the branch
