<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Auth rate-limiter tests seed per-IP buckets via getClientIp internals — no direct bucket isolation

**Status:** Done
**Priority:** low
**Effort:** Medium
**Epic:** epic-api-rate-limiting
**Summary:** Auth rate-limiter bucket tests must spoof XFF to exercise IP bucket isolation, but `trustProxy=false` ignores XFF and routes through the live peer IP — coupling tests to server topology instead of exercising the isolation contract directly.
**Context:** Found 2026-08-25 security review. `src/routes/auth/shared.ts:getClientIp` is the single key function for both `registerLimiter` and `loginLimiter`. `src/routes/auth/get-client-ip.test.ts` already covers the function return values but has no assertions that two distinct IPs get independent budgets.
**Acceptance Criteria:** See ## Acceptance Criteria below.
**Git Issue:** a877274

## What

- `src/routes/auth/shared.ts:136` (`getClientIp`) is the bucket key for `registerLimiter` and `loginLimiter` (both module-level singletons in `src/routes/auth/shared.ts`).
- `src/routes/auth/get-client-ip.test.ts` exercises the function return value logic but never asserts budget isolation: that IP=A and IP=B receive independent rate-limit budgets.
- `src/routes/auth/get-client-ip.test.ts:69` (`distinct peers occupy independent limiter buckets`) asserts the bucket keys differ but does NOT assert budget independence — it resets the limiter in `afterEach` to prevent cross-test pollution, not to verify isolation.

## Why

After `TASK-implement-per-connection-ip-sourcing-for-auth-rate-limiters` (`5353f07`) landed, the bucket key is now connection-derived. Without explicit budget-independence assertions, a future regression could collapse both IPs back into a shared bucket and tests would still pass.

## Scope

- Add one assertion to `src/routes/auth/get-client-ip.test.ts` after the `distinct peers occupy independent limiter buckets` test: exhaust bucket A and assert bucket B is still within budget.
- Out of scope: restructuring the limiter singleton (tracked separately); XFF spoofing for IP isolation (not the fix — the fix is direct bucket-key assertions that don't need headers).

## Acceptance Criteria

- [x] `get-client-ip.test.ts` asserts that exhausting bucket A does not affect bucket B's budget (independent budget test)
- [x] The new assertion does not rely on XFF spoofing — it uses two distinct `peerIp` arguments to `getClientIp` directly
- [x] `bun test src/routes/auth/get-client-ip.test.ts` green
