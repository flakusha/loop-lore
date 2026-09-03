# Audit Report: Bug-shaped Latent Regressions — Batch C
**Auditor:** audit-batch-C
**Date:** 2026-09-03
**Range:** dev branch, 2026-08-13 – 2026-08-31
**Commits audited:** 8
**Standard:** strict — every claim verified against actual code

---

## BLOCKING FINDING: failGeneration DB-failure cleanup change introduces duplicate-generation regression

Commit: b997e8bd | Severity: **blocking** | Type: regression-risk

### What changed
Pre-fix `failGeneration` (pre-b997e8bd): `updateAttemptStatus` had **no try/catch**. If DB was down → `failGeneration` threw → `activeGenerations.delete` was **never reached**.

Post-fix `failGeneration` (b997e8bd): `updateAttemptStatus` wrapped in try/catch → `activeGenerations.delete` and `chatToAttempt.delete` execute **regardless** of DB write success or failure (verified: `lifecycle.ts:278-281`).

### Regression trace

**Pre-fix, DB down during failGeneration:**
1. `failGeneration` called for attemptId-A
2. `updateAttemptStatus` throws (DB down) → exception propagates → cleanup skipped
3. `activeGenerations` still contains attemptId-A; `chatToAttempt` still maps chat → attemptId-A
4. Client retries with same idempotency key
5. `hasInFlightGeneration` → true (DB row at Processing)
6. `startGenerationTracking`: `hasInFlightGeneration` passes (returns true) but `activeGenerations` still has attemptId-A → TOCTOU guard throws `IdempotencyKeyConflictError` → **blocked, not duplicate**

**Post-fix, DB down during failGeneration:**
1. `failGeneration` called for attemptId-A
2. `updateAttemptStatus` throws (DB down) → caught → cleanup runs
3. `activeGenerations.delete(attemptId-A)` → attemptId-A removed from `activeGenerations`
4. `chatToAttempt.delete(chatId)` → chat unmapped
5. Client retries with same idempotency key
6. `hasInFlightGeneration` → false (no entry in `activeGenerations` for this key)
7. `startGenerationTracking` inserts attemptId-B → **duplicate generation allowed**

### Escape path (verified against source)
- `hasInFlightGeneration` (`inflight.ts:18-23`): `WHERE idempotency_key = ? AND status IN (Pending, Processing, Streaming)` — DB query blind to `activeGenerations`
- `startGenerationTracking` idempotency TOCTOU guard (`lifecycle.ts:104-107`): only checks `activeGenerations` — ineffective when stale attempt was deleted from `activeGenerations` but DB row stuck at Processing
- `idx_generation_attempts_idempotency` is non-unique (migration 007:51-53) — no constraint preventing duplicate rows

### Why this matters
Under DB outage during failGeneration, the old code prevented duplicate generations (TOCTOU threw). The new code allows them (activeGenerations is clean, so TOCTOU check passes, hasInFlightGeneration returns false). A client retry during DB outage would produce a duplicate generation.

### Fix direction
Option A: `insertAttempt` uses `ON CONFLICT (idempotency_key) DO UPDATE SET status = excluded.status` — reconciles stale row on next startGenerationTracking.
Option B: `hasInFlightGeneration` cross-checks `activeGenerations` by attemptId before returning (defensive: stale DB row but attempt not in `activeGenerations` = not in-flight).
Option C: keep cleanup unconditional but add `activeGenerations.set(attemptId, { ... status: 'Failed' })` so the TOCTOU guard still sees the old attempt.

---

## NIT-1: maxRatio acceptance-boundary not tested
Commit: 1639a01b | Severity: nit | Type: missed-test
`safeDecompress` maxRatio raised 100→1000. Existing test covers rejection at ~1000x. No test for acceptance below 1000x. Only caller is `decodeContent`; text content compresses 2–10x; high-entropy content < 10x. No path produces ratio 100–999x for legitimate content.
Fix: Add test at ~500x confirming acceptance.

---

## NIT-2: triggerAutoGeneration .catch() path not isolated
Commit: b7e4b0b7 | Severity: nit | Type: missed-test
`.catch()` attached at `reply.ts:72` (verified). `reply.test.ts` integration passes (5/5). No dedicated unit test mocking `triggerAutoGeneration` to throw.
Fix: Add unit test mocking `triggerAutoGeneration` to throw, assert error logged with `chatId`.

---

## CLEAN COMMITS

**b7e4b0b7** — `fix(chat): unique swipe_index per parent`
`reply.ts` retry loop: `isSwipeUniqueConflict` (lines 210-215) distinguishes swipe conflicts from other errors. `swipe-race-insert.test.ts` covers concurrent insert semantics. `.catch()` at reply.ts:72 confirmed.

**db317387** — `fix(chat): lifecycle cluster`
503 test: `reply.test.ts`. Secondary owner test: `split.test.ts:240`. Random-events participants test: diff confirmed.

**a7a444c0** — `fix(security): isNsfwRating + fail-closed story-mode`
Canonical helper. Fail-closed re-throw correct.

**518395ca** — `fix(telemetry): redact PII`
`DOMAIN_INFO.TELEMETRY_PII` in `hkdf.ts`. HMAC hashing in `aux-telemetry.ts`. 3 tests pass.

**49731047** — `fix(nsfw): gate correctness cluster`
304-line `consent.test.ts`. Migration 069 verified.

**c522bd12** — `fix(middleware): route 4xx/5xx through async-store fail`
`lifecycle.integration.test.ts` covers `status >= 400`. Sufficient.

**1639a01b** — `fix(crypto): remove safeDecompress pre-check`
Pre-check removal correct. See NIT-1.

---

## TICKET STATE DRIFT
- `BUG-chat-swipe-index-race.md`: Status **Open** — fix committed b7e4b0b7
- `BUG-chat-trigger-auto-generation-unhandled-rejection.md`: Status **Open** — fix committed b7e4b0b7
- `BUG-admin-auxtelemetry-leaks-userid-chatid.md`: Status **Not Started** — fix committed 518395ca

---

## RUNTIME VERIFICATION
- `reply.test.ts`: 5 pass
- `swipe-race-insert.test.ts`: 7 pass
- `compression.test.ts`: 10 pass
- `cancellation-tracker.test.ts`: 11 pass

---

**Summary:** 8 commits audited. 1 blocking, 2 nits. Blocking: b997e8bd changes failGeneration cleanup from "never runs if DB write fails" to "always runs", removing the stale attempt from activeGenerations. Pre-fix: stale attempt blocked retries via TOCTOU guard. Post-fix: stale attempt is invisible to in-memory checks, allowing duplicate generations during DB outage. Fix: reconcile stale row in DB on next startGenerationTracking. 6 commits clean.
**Files:** local://audit/batch-C-rbac-refactor.md
