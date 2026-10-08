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

## Assessment 2026-10-08 — NOT resolved by the landed route-access work

Commit `09039a8a3` (`feat(plugins): enforce declared access control on plugin
routes`, module `src/plugins/route-access.ts`) is adjacent but does NOT close
this ticket. It makes `requiresAuth` / `permissions` load-bearing at
`route-access.ts:74-93` — a pre-handler admission check. This ticket is
explicitly about the *row-level* check that module's own doc declines to do
(`route-access.ts:35-37`: "They do NOT answer 'may this caller see this row?' —
that is the handler's job"). The ticket's own Evidence already flagged
`checkRouteAccess` as "a pre-handler admission check, not authorization over the
rows the handler returns", so the two concerns never overlapped.

**Still missing:**

1. No shared ownership-assertion helper exists. `grep -rn 'ownership|ownerId|assertOwn|requireOwner' src/plugins/ plugins/` still returns only the
   doc comment at `types.ts:158`. The Fix direction's first deliverable — a
   primitive under `src/plugins/` returning `forbiddenResponse`/`unauthorizedResponse` — is unshipped.
2. No cross-user regression test. The ticket asks for two distinct users
   driven through one plugin route with user B refused user A's row by direct
   id. `src/plugins/route-access.test.ts` covers 401/403 admission only;
   `loader-dispatch.test.ts` covers matching and provenance only.
3. No shipped plugin route reads a user-scoped row, so the "apply it to the
   shipped routes" step has no current call site. `grep -rn 'userId|caller|selectFrom|database' plugins/` returns zero hits —
   every shipped route handler (`plugins/core/{card-battle,rps,dice-roller,native-blake3}`,
   `plugins/community/{trivia,nsfw-cards}`) is stateless. This lowers urgency,
   not the ticket: the gap is that the next plugin author has no copy-paste
   answer, which is exactly what the Fix direction asks for.

**On the solo-mode caveat in `route-access.ts:18-33`:** that documented
non-change is NOT this ticket's IDOR claim. Solo mode makes the route-level
fields inert (every request resolves to one super-user holding `*`); the IDOR
here is a multi-user deployment where an authenticated caller reads another
user's row through a handler that never scoped by `caller.userId`. They are
independent, so the solo-mode warning neither satisfies nor excuses this gap.

Status left `Not Started`. No code changed by this assessment.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
