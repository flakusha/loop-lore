<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: `src/middleware/elysia-auth.ts` is a dead shim with divergent failure-path logic

**Status:** done
**Priority:** medium
**Effort:** Small
**Epic:** epic-architecture
**Related:** `src/middleware/elysia-auth.ts`, `src/elysia-app.ts`, `src/middleware/auth/`

## Summary

`src/middleware/elysia-auth.ts` exports `authGuard()` — an Elysia plugin that
duplicates the auth `.derive()` logic that was moved inline into
`src/elysia-app.ts` (per its own doc comment: "Auth logic moved inline to
elysia-app.ts ... kept for backward compatibility and unit tests").

The two code paths have **divergent behavior on auth failure**:

- `elysia-app.ts` derive: on auth failure it still detects locale + builds
  `i18n` context (`{ userId: null, ..., ...i18n }`).
- `authGuard()` in `elysia-auth.ts`: on auth failure returns
  `{ userId: null, userRole: null, sessionId: null }` with **no `i18n`** context.

This is a latent inconsistency: any route still using `authGuard()` would get a
different (i18n-less) context than the production path, and the duplicated logic
will drift further over time.

## Acceptance Criteria

- [x] Delete `elysia-auth.ts` (preferred path chosen).
- [x] Verified no route/plugin imports `authGuard()` (`grep` confirmed only the trivial-shape test referenced it; deleted with the file).
- [x] No duplicate auth-derivation logic remains. The shared `authenticate()` function in `src/middleware/auth/authenticate.ts` is exercised by `bun run test:e2e` and the existing `src/middleware/auth.test.ts` covers its token-resolution helpers; no new unit test was added because no behavior was lost — the deleted test was purely a "is a function, returns plugin" smoke check.

## Notes

- The production wiring is correctly in `elysia-app.ts`; this shim is technical debt, not a live regression in the running app (unless a route mounts `authGuard()`).

## Resolution

Deleted `src/middleware/elysia-auth.ts` and `src/middleware/elysia-auth.test.ts`; updated cross-references in `docs/spec/auth-middleware.md`, `.plan/epics/epic-architecture.md`, `.plan/backlog/security-review-2026-08-25.md`, and `.plan/tickets/TASK-jwt-header-alg-kid-never-asserted-fail-open-route-guard-patt.md` to point at the deletion.
