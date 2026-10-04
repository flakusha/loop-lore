<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: chat-seen-currentActorId-never-assigned-markSeen-sends-null

**Summary:** Frontend `markSeen` POSTed `actorId: this.currentActorId` (always null — field declared but never assigned); server read actorId from the client body instead of the session, inverting the trust boundary.
**Context:** Server fix in `src/routes/message-seen.ts:109-120` (POST derives actor via `resolvePrimaryActorId(database, userId)`; reads only `{ state }` from `ctx.body`); DELETE branch already used `requireActorFromSession` (`src/middleware/scope-by-user.ts`). Frontend `src/frontend/alpine/chat-seen.ts:50-54` no longer sends `actorId`. Regression evidence in `src/frontend/alpine/chat-seen.test.ts` (body assertion confirms `actorId` absent). Related interface fields (`currentActorId` in `src/frontend/alpine/chat-types/participants-state.ts`, `SendGateInputs.currentActorId` in `src/frontend/alpine/composer-pre-send/send-gate.ts`) are separate turn-order surfaces, not the markSeen trust boundary.
**Acceptance Criteria:** see below (server derives actor from session; body carries state only; tests passing).


**Status:** Done
**Status Note:** 89cc294a0
**Priority:** high
**Effort:** Medium

## Summary

Frontend \`markSeen\` POSTs \`actorId: this.currentActorId\` (always null) — root cause: field declared in ChatCoreState but never assigned anywhere. Trust boundary inverted: POST handler in src/routes/message-seen.ts reads actorId from client body instead of ctx.userId like the DELETE branch already does. Fix per investigation 2026-09-08 (Option A): derive actorId from requireActorFromSession on the server; drop currentActorId from ChatCoreState entirely. 1:1 user→actor mapping (idx_actors_user_id) makes userId ≡ actorId. Files: src/routes/message-seen.ts (POST handler), src/frontend/alpine/chat-seen.ts (drop actorId from body), src/frontend/alpine/chat-types/core.ts (drop unused field).

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated

## Resolution

Resolved in commit `89cc294a0 fix(security): derive seen-state actor from session, close client-trust inversion` (verified on dev HEAD 2026-09-12).

- Server: `src/routes/message-seen.ts` POST handler derives `actorId` via `resolvePrimaryActorId(database, userId,)` (line 118), no longer reads from `ctx.body`. The DELETE branch already used `requireActorFromSession` for comparison; the POST now mirrors that trust boundary.
- Frontend: `src/frontend/alpine/chat-seen.ts` `markSeen` only sends `{ state }` in the body (lines 40-44 — the `apiFetch` call inside the function; the comment at lines 35-39 explains the dropped `actorId` rationale). `this.currentActorId` is no longer referenced in any frontend source (`grep this.currentActorId src/frontend → 0 matches`; the bare identifier `currentActorId` still appears in test fixtures and `chat-types/participants-state.ts`/`composer-pre-send/send-gate.ts` interfaces, none of which use the `markSeen` trust boundary).
- Tests: `src/frontend/alpine/chat-seen.test.ts` already exists; the body assertion `JSON.parse(String(post.opts.body))` confirms `actorId` is absent.

Bookkeeping ticket: `TASK-bookkeeping-chat-bugfix-batch-1-scope-discovery`.
