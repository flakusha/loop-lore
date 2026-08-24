<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: `src/middleware/elysia-auth.ts` is a dead shim with divergent failure-path logic

**Status:** 🔴 Open
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

- [ ] Decide: either delete `elysia-auth.ts` (preferred) or make it a thin re-export of the `elysia-app.ts` derive logic with identical failure-path behavior.
- [ ] If deleted: migrate/remove any remaining importers + update/keep only the unit test that legitimately covers the shared `authenticate()` function.
- [ ] If kept: align `authGuard()` failure path to also populate `i18n` context, and add a test asserting parity with `elysia-app.ts`.
- [ ] No duplicate auth-derivation logic remains.

## Notes

- The production wiring is correctly in `elysia-app.ts`; this shim is technical debt, not a live regression in the running app (unless a route mounts `authGuard()`).
- Verify no route/plugin currently calls `authGuard()` before deleting.
