<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Version resolver middleware built but never wired

**Status:** 🔴 Open
**Priority:** high
**Effort:** Small
**Epic:** epic-api-versioning
**Related:** `src/routes/middleware/version-resolver.ts`, `src/elysia-app.ts`, `epic-api-versioning.md` (line 92)

## Summary

`versionResolver()` Elysia plugin (`src/routes/middleware/version-resolver.ts`)
is fully implemented and sets `ctx.apiVersion` via a global `.derive()`. However
`src/elysia-app.ts` never calls `versionResolver()` — it only imports and uses
`versionRedirect`. As a result `ctx.apiVersion` is never populated for any
request, and the epic's checkbox "[ ] Version resolver middleware sets
`ctx.apiVersion`; plugins read it" is misleading (resolver exists but is dead
code).

## Acceptance Criteria

- [ ] `elysia-app.ts` calls `versionResolver()` (or an equivalent `.derive()`) so `ctx.apiVersion` is populated on every request.
- [ ] At least one consumer (route or plugin) reads `ctx.apiVersion` and is covered by a test.
- [ ] `epic-api-versioning.md` line 92 checkbox reflects the wired state.
- [ ] Unit/integration test asserts `ctx.apiVersion === "1"` for `/api/v1/*` and legacy `/api/*` paths.

## Notes

- `versionRedirect` (308 legacy redirect) IS wired and works; only the resolver is unwired.
- `resolveVersion()` helper already handles URL-path + Accept-header negotiation; the plugin wrapper just isn't mounted.
- Low risk: adding the `.use(versionResolver())` to the root Elysia app in `elysia-app.ts` is the minimal fix.
