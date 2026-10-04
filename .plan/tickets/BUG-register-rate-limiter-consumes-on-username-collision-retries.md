<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: register rate limiter consumes on username-collision retries

**Status:** Done (commit fba9dbcd8 — peek/record/refund split in src/middleware/rate-limit.ts:165-226, plus 3f6329b02 size refactor and register.ts gate swap to `peek` at the gate and `record` after commit.)
**Priority:** low
**Effort:** Medium
**Summary:** src/routes/auth/shared.ts `registerLimiter.consume(ip)` ran at register.ts line 37 before the insertUnique uniqueness check. A user fat-fingering a username burned 1 of 3 tokens on the resulting 409; an attacker brute-forcing the password gate with a claimed username burned the victim's per-IP budget. Move `consume()` after the gate returns a valid form AND a successful insert (or refund the token on 409 from insertUnique). Caught from post-merge audit of ba2871422.
**Context:** Filed as a followup to BUG-register-non-atomic-user-actor-key-insert (commit a14ebc174). Addressed in the register-idempotency-tx worktree (finalized 2026-09-27, merged to dev as fba9dbcd8 plus the 3f6329b02 size refactor).
**Acceptance Criteria:**

- [x] Implementation complete — split the rate-limit API into `peek()` (gate only, no record), `record()` (commit a slot), and `refund()` (undo a premature record). Register routes use the new pair: `peek` at the gate (src/routes/auth/register.ts:42), `record` only after all three writes commit (src/routes/auth/register.ts:176). A 409 on duplicate username costs the IP no slots. A 422 on bad form data costs the IP no slots. A 500 on transactional rollback costs the IP no slots.
- [x] Tests passing — `src/middleware/rate-limit.test.ts` adds six unit tests covering the new primitives (peek doesn't consume, peek matches consume under contention, record pushes a timestamp, refund pops the most recent timestamp, refund is a no-op when empty, refund releases a slot under sliding-window math). 47/47 tests pass on the touched files.
- [x] Documentation updated — the two-step gate usage block at src/middleware/rate-limit.ts:20-24 explains when to use `consume()` (one-step flows) vs `peek`/`record`/`refund` (gate-before-effect flows).

## Implementation Notes

Why peek/record/refund instead of consume-then-refund: the refund path needs a window-aware queue and an atomic pop. Doing the check-and-record together means the record happens optimistically; a refund-on-failure path would need to remember every recent record per key. Splitting peek from record keeps the gate decision stateless: peek reads, record writes, refund is a single pop.

Why consume() is preserved: one-step flows (login, demo-login, IP DOS protection) have no expensive-or-skippable work between gate and effect. The single API keeps the common case terse.

Edge case: if the window expires between `record()` and a subsequent `refund()`, the queue entry has already aged out and the `refund()` is a no-op (queue is empty). This is correct — the slot was already free.

Test note: the sliding-window test runs `peek + refund` three times in a tight loop and confirms the bucket stays at 3 free slots (no slots consumed by peeks). The assertion validates that peek is side-effect-free even under repeated calls.
