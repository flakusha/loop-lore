<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: Plugin route registry lacks ownership enforcement (IDOR)

**Status:** Not Started
**Priority:** critical
**Epic:** epic-security-sandboxing
**Effort:** Medium

**Summary:**

**Problem.** `RouteDefinition.requiresAuth` / `.permissions` decide only whether a request *reaches* a handler; they scope nothing the handler returns. There is no shared helper for the row-level ownership check the type explicitly demands of plugin authors, so a `requiresAuth: true` route with no ownership check served another user's record to an authenticated caller. Reproduced during review of the plugin route work.

**Evidence.**
- `src/plugins/types.ts:154-158` — the type's own caveat: "ACCESS CONTROL IS ROUTE-LEVEL, NOT ROW-LEVEL. `requiresAuth` and `permissions` only decide whether the request reaches `handler` at all. They do NOT scope the data a handler reads or returns: a route guarded only by `requiresAuth` will happily hand any authenticated user another user's row unless the handler performs its own ownership check. Always pass `caller` into the handler and scope queries by `caller.userId`."
- `src/plugins/types.ts:167-181` — `RouteDefinition`; `handler: (request, caller?: PluginCaller)` at `:175`, `requiresAuth?: boolean` at `:178`, `permissions?: string[]` at `:180`.
- `src/plugins/types.ts:143-148` — `PluginCaller` (`userId`, `userRole`) is handed to handlers, but nothing enforces that it is used.
- `src/plugins/loader.ts:241` — `checkRouteAccess({ route, request, caller, t })` is the only gate. It is a pre-handler admission check, not authorization over the rows the handler returns.
- `grep -rn 'ownership|ownerId|assertOwn|requireOwner' src/plugins/ plugins/` returns exactly one hit — the doc comment at `types.ts:158`. No assertion helper exists.

**Impact.** Any shipped plugin route that reads a row by id is an IDOR until its author hand-rolls a check. The gap is invisible at the type level: the declaration compiles, the route dispatches, and the gate passes. Documentation without a primitive is not enforcement.

**Fix direction.** Ship one shared ownership-assertion helper under `src/plugins/` that plugin route handlers call (assert `caller.userId` owns the target row; return 404/403 through the existing `forbiddenResponse`/`unauthorizedResponse` helpers rather than inventing new ones). Then apply it to the shipped plugin routes under `plugins/` that read user-scoped rows, and document the pattern at those call sites so the `types.ts:154-158` caveat has a copy-paste answer.

**Verification.** A regression test that drives two distinct users through the same plugin route and asserts user B cannot read user A's row via a direct id.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
