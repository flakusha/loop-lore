<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Branch-merges routes and TypeBox schemas

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-conversation-branching
**Tags:** branch-merge

**Summary:** New `src/routes/chats/branch-merges.ts` composed into `chatBranchRoutes`, with TypeBox schemas in `src/validation/schemas/branch-merges.ts`, serving initiate/preview/confirm/continue under `/api/v1/chats/:id/branch-merges`.
**Context:** Branch-merge design §3.2 + research §4.2/§7: composition precedent `branch-crud` in `src/routes/chats/branches.ts:47-65`; `{ data }` envelope + `statusFor` error mapping from `src/routes/chats/branch-shared.ts` (no 409 mapping today — extend it or reuse `conflictResponse`, `src/routes/http-utils/errors.ts`); schema barrel `src/validation/schemas/index.ts` re-exported by `src/validation/index.ts` (Elysia `t`, not Zod).
**Acceptance Criteria:** Initiate/preview/confirm/continue endpoints with validated bodies/responses, access-guarded, idempotent initiate, 409 on concurrent confirm, envelope + error mapping consistent with the branch routes.
**Related:** FEAT-046.md, FEAT-047.md, FEAT-message-swipe-replay-branch.md

## Summary

- Compose `src/routes/chats/branch-merges.ts` into `chatBranchRoutes` (`src/routes/chats/branches.ts`) so it inherits the existing mount chain; the structural `POST .../branches/:branchId/merge` endpoint stays untouched.
- Schemas in `src/validation/schemas/branch-merges.ts`, exported through the schemas barrel:
  - `BranchMergeInitiateBody` — `mode` (a `t.Literal` per `MergeMode` value), `sourceTips` (min 2 entries: `tipMessageId` + optional `branchId`), optional `idempotencyKey` → 201 `{ data: { mergeId, status, baseMessageId, sources, replayed } }`.
  - `BranchMergePreviewBody` — optional `regenerate`, `styleHint` → 200 with `kind: "llm" | "overlay"`, editable `draft` or `hunks`, `tokenEstimate`, `truncated`.
  - `BranchMergeConfirmBody` — optional `content[]`, `conflictChoices[]`, `branchName` (≤ `MAX_BRANCH_NAME_LENGTH`), `activate` (default true) → 200 `{ data: { mergeId, resultMessageIds, mergedBranchId, activeBranchId } }`.
  - `BranchMergeContinueBody` — optional `prompt`, `actorId` → 201 `{ data: { id, context } }`, mirroring `POST /chats/:id/messages`.
- Access check via the same guard as `withBranch` (`src/chat/service/branch-helpers.ts`); every tip verified to belong to `:id` inside the transaction.
- Error mapping: extend `statusFor` (or reuse `conflictResponse`) so `conflict` → 409; `not_found` → 404; `forbidden` → 403; everything else → 400. Idempotent initiate replays the existing draft with `replayed: true`.
- Response envelope: `{ data: … }` as in `branchRoute` (`src/routes/chats/branch-shared.ts`).

## Acceptance Criteria

- [ ] Initiate/preview/confirm/continue endpoints composed into `chatBranchRoutes` and reachable under `/api/v1/chats/:id/branch-merges`
- [ ] TypeBox bodies/response schemas live in `src/validation/schemas/branch-merges.ts` and are exported via the schemas barrel
- [ ] Initiate is idempotent (`replayed: true` on a repeated key) and access-checked with tips verified against `:id`
- [ ] Concurrent confirm maps to HTTP 409; other ServiceErrors map per the extended `statusFor`
- [ ] Route responses use the `{ data: … }` envelope of `branchRoute`
- [ ] Route tests cover auth, cross-chat tip IDOR, 409 and idempotent replay (see `TASK-branch-merge-tests-and-coverage.md`)
