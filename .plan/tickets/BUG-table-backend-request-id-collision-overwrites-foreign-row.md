# BUG: Table backend `request_results.complete`/`fail` overwrite foreign row on request-id collision

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

## Summary

In `src/async/apply.ts:75-104`, the `complete` and `fail` write paths update `request_results` by `id` only (`where id = write.id`). The matching `upsert` path (`apply.ts:39-63`) uses `onConflict(...).doNothing()` — so when User A tracks `id=X` first, User B's `track({id: X, ...})` is a no-op. User B's handler then runs (in-memory cache key now scoped by userId, so the replay is blocked — fix landed in `c1cd4d8b`), and when B's handler calls `store.complete(X, responseB)`, the update overwrites User A's row with User B's response body. User A then polls status and reads User B's response — **cross-user response leak via the table backend**.

## Affected surface

- `src/async/apply.ts:80-92` — `complete` write lacks `AND user_id = write.userId` (or equivalent).
- `src/async/apply.ts:97-103` — `fail` write same issue.
- `src/async/apply.ts:65-72` — `progress` write same issue.
- Status endpoint (`src/routes/requests/status.ts`) ownership check is downstream of the overwrite; ownership alone does not prevent the leak.

## Recommended fix

Two options:

1. **Composite primary key** on `request_results`: `(id, user_id)`. Schema migration + Kysely schema regen. Strongest guarantee.
2. **Defensive WHERE clause** in complete/fail/progress: `where id = write.id AND user_id = write.userId`. Soft guarantee; if no row matches, the update is a no-op. Track must already have succeeded for the user.

Option (2) is the minimum fix and can ship without a migration.

## Acceptance Criteria

- [ ] Reproduction test: User A tracks `id=X`; User B calls complete with `id=X`. Assert row X retains User A's body (or update was no-op).
- [ ] complete/fail/progress guarded by user_id match.
- [ ] Existing status endpoint ownership check still passes.
- [ ] No behavior change for the legitimate same-user replay path.

## Related

- Originally identified during strict review of `c1cd4d8b` (the in-memory idempotency user-scoping fix).
- The original BUG-idempotency-cache-key-lacks-user-scope ticket only closed the in-memory replay vector; this ticket covers the parallel table-backend vector.