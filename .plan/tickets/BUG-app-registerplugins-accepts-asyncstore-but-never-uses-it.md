<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: app: registerPlugins accepts asyncStore but never uses it

**Status:** [OK] Resolved (worktree fix-register-plugins-asyncstore)

**Priority:** low

**Effort:** Medium

## Summary

`RegisterPluginsOpts` declared `asyncStore` but `registerPlugins`
destructured only `database` and `config`, silently dropping the
store. The downstream effect: `maybeAutoReply(...)` always received
`asyncStore === undefined`, its `requestId !== undefined &&
asyncStore !== undefined` guard never fired, and POSTs to
`/api/chats/:id/messages` carrying `x-request-id` never showed up
at `GET /api/requests/:id/status`.

## Fix

Wired `asyncStore` through three layers:

1. `src/routes/messages/types.ts` — `HandlerOpts` now declares
   optional `asyncStore?: AsyncStore`.
2. `src/app/register-plugins.ts` — destructures `asyncStore` and
   includes it in `handleOpts`.
3. `src/routes/messages/create.ts` — `createRoutes` forwards
   `opts.asyncStore` to `maybeAutoReply`.

The asyncStore guard inside maybeAutoReply already handled the
optional case correctly — the bug was at the call site, not in the
guard. No behaviour change for routes that don't pass an asyncStore.

## Tests

`bun test src/routes/messages/reply.test.ts` on dev HEAD `ebcebb12`
— 5/5 pass:
- 2 pre-existing swipe-race tests (concurrent maybeAutoReply calls
  produce distinct swipe_indexes; 503 service_busy when all retries
  collide)
- 2 new asyncStore forwarding tests
  (added by `c91edd02`):
  - "calls asyncStore.track() when requestId header + asyncStore
    are both supplied" — verifies the track() payload shape.
  - "does NOT call asyncStore.track() when asyncStore is undefined
    (defensive)" — guards against regressing the optional chain.
- 1 TS2366 regression guard
  (added later by `f53ab849` — not part of this ticket's scope):

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing (5/5 messages/reply on dev HEAD ebcebb12:
2 pre-existing swipe-race + 2 new asyncStore forwarding from
this commit + 1 TS2366 regression guard added by f53ab849)
- [x] Documentation updated (this ticket + code comments)

## Reviewed alternative (rejected)

A reviewer suggested dropping `asyncStore` from `RegisterPluginsOpts`
entirely as a "simpler fix" that avoids threading the field through
~10 route modules' `HandlerOpts` types. Rejected because:

- The user-facing bug was that `create.ts` (a route) was never given
  an `asyncStore` to forward to `maybeAutoReply`, leaving requestId
  status polling dead on the chat-message-create path. Removing the
  field from `RegisterPluginsOpts` would not fix that: `create.ts`
  would still default to `undefined`, and the bug would remain.
- `HandlerOpts` is not duplicated across ~10 modules — each route
  domain (messages, battle, worlds, character-traits, etc.) has its
  own scoped `HandlerOpts` type. Only `src/routes/messages/types.ts`
  needed the new optional field (4 lines: one new import + one new
  field + the surrounding JSDoc). One file changed, not ten.
- The committed test `calls asyncStore.track() when requestId header
  - asyncStore are both supplied` exercises the now-live code path;
  the rejected alternative would have left that path unchanged
  (`asyncStore === undefined` at the call site).

## Adjacent nit (out of scope, not addressed here)

`reply.ts:53` uses `requestId !== undefined`. With Bun's `Request`,
an empty-string header value (`x-request-id: ""`) returns `""`
(not `undefined`), so the guard fires and `track()` is called with
`id: ""`. Pre-H7 this path was unreachable because the second
clause `asyncStore !== undefined` was always false. After H7 it is
reachable, producing a row with an empty-string primary key in
`request_results`.

Impact is bounded: the row lands in `request_results` with
`id: ""`, but the idempotency layer (`src/middleware/idempotency.ts:143`)
guards with `if (!requestId) return undefined` so empty-string
requestIds are rejected and the request flows through to the real
handler — the user gets the real response, not an empty replay.
The nit is a wasted DB row, not a replay-confusion defect. The
one-line guard tightening (`requestId &&` instead of `requestId
!== undefined`) in `reply.ts:53` is left as a follow-up rather
than bundled here to keep this commit's diff scoped to the
wire-up defect.
