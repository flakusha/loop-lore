<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: typed userId accessor replacing the (ctx as any).userId cluster

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Replace the repeated `(ctx as any).userId as string | null ?? null` double-cast cluster with a single typed userId accessor; silent degradation to anonymous becomes a compile error.

**Files:**

- src/assets/controller.ts:156-157, 179-180, 251-252, 294-295, 307-308, 320-321, 332-333, 348-349
- src/routes/http-utils/status.ts:15-16
- src/routes/http-utils/errors.ts:163-165
- src/routes/api-keys.ts:76, 95, 137
- src/routes/users/me.ts:61, 112
- src/routes/messages/translations.ts:107, 161 (`ctx: any` handlers)

**Evidence:**

- Repeated `(ctx as any).userId as string | null ?? null` double-casts read auth off the Elysia context untyped. If the auth middleware ever stops populating the key (rename, plugin-type friction — the stated reason for the casts), these routes silently run as anonymous: private/shared assets 404 instead of 401, ownership checks compare against `null`. Access stays fail-closed for data, but the failure is invisible (no compile error, no log). A single typed accessor at the middleware boundary would turn drift into a compile error (review-core.md F-6).

**Fix:**

Introduce a typed userId accessor (typed derive/field on the context) and replace every `(ctx as any).userId` call site with it; drop the `ctx: any` handler annotations where feasible.

**Related:** e73cbde (story-state/quest handlers read ctx.userId directly — same cluster, narrower instance).

**Review:** .tmp/reviews/2026-10-25/ (2026-10-25 round) — review-core.md F-6.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
