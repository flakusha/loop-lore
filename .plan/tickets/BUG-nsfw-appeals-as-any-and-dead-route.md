<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: NSFW appeals service uses `as any` casts and is unwired — either dead code or missing routes

**Status:** Done
**Severity:** Medium
**Priority:** medium
**Effort:** Small
**Area:** moderation, typescript, dead-code, schema
**Epic:** epic-nsfw-moderation-priority
**Tags:** moderation, appeals, typescript, dead-code, schema-drift
**Source:** OpenAgent admin/moderation direct-DB listing review (2026-08-23)
**Related:** `BUG-nsfw-reviewappeal-auto-reverses-actions.md` (appeals service), `TASK-moderation-privacy-first-foundation.md` (privacy posture), `epic-nsfw-moderation-priority.md` (governing epic)

## Summary

`src/nsfw/moderation-service/appeals.ts` (and its sister
`appeals.test.ts`) is implemented but no route under
`src/routes/nsfw-moderation/` invokes it. Every function uses
`"moderation_appeals" as any` to bypass the Kysely type system.
There are two possible interpretations: (a) the routes were never
added and the service is dead code; (b) the routes should exist and
have been forgotten. Either way, the casts hide schema drift and
the test suite has no integration coverage.

## Evidence

| File | Line | Issue |
| --- | --- | --- |
| `src/nsfw/moderation-service/appeals.ts` | 24-31 | `insertInto("moderation_appeals" as any).values({...})` — cast bypasses type checking |
| `src/nsfw/moderation-service/appeals.ts` | 57-71 | `selectFrom("moderation_appeals" as any).selectAll().where("user_id","=",userId,)` — cast |
| `src/nsfw/moderation-service/appeals.ts` | 92-104 | `selectFrom("moderation_appeals" as any).selectAll().where("status","=","pending",)` — cast |
| `src/nsfw/moderation-service/appeals.ts` | 119-122 | `updateTable("moderation_appeals" as any,).set({...}).where("id","=",appealId,)` — cast |
| `src/nsfw/moderation-service/appeals.ts` | 126-129 | `selectFrom("moderation_appeals" as any,).select("action_id",)` — cast |
| `src/nsfw/moderation-service/appeals.ts` | 115-148 | `reviewAppeal` — entire function: defined but never invoked from a route |
| `src/routes/nsfw-moderation/index.ts` | 12-29 | barrel — no `appealsRoutes` member; index wires preferences/actions/flags/audit/overrides only |
| `src/nsfw/moderation-service/appeals.ts` | 19-34 | `submitAppeal` — defined but no route |
| `src/nsfw/moderation-service/appeals.ts` | 42-81 | `getUserAppeals` — defined but no route |
| `src/nsfw/moderation-service/appeals.ts` | 88-104 | `getPendingAppeals` — defined but no route |
| `src/nsfw/moderation-service/appeals.ts` | 1-148 | Whole file uses `as any` casts on `moderation_appeals` |
| `src/nsfw/moderation-service/appeals.test.ts` | 1-10 | Test file references undefined name `ModerationAppeals` in some references; uses `as any` |

Auth: N/A — no route to call. If/when wired, the `submitAppeal`
endpoint must enforce self-only (a user can submit appeals for
their own actions), `getUserAppeals` self-or-admin, and
`reviewAppeal` / `getPendingAppeals` admin-only.

## Impact

- **Type-safety bypass**: Kysely cannot verify the columns
  referenced in `appeals.ts` against the actual schema. If
  migration 021 (`migrations/021_nsfw_appeals.ts`) diverges from
  the TS interface, runtime breakage.
- **Dead code drift**: an unwired service is a maintenance
  liability. New devs may try to use these functions from a
  future route and discover the schema-drift hazard at the worst
  possible time.
- **Test coverage gap**: `appeals.test.ts` exists but no
  integration test exercises it through a route — the type cast
  hides bugs that only surface at integration.
- **No user-facing appeal flow**: if the product intent is that
  users can appeal moderation actions, the absence of routes
  means the feature is silently missing.

## Fix

Pick one:

**Option A — Wire the routes** (if appeals are a product
requirement):

1. Add `src/routes/nsfw-moderation/appeals.ts` exposing:
   - `POST /api/nsfw/moderation/appeals` (self-only) — submit
   - `GET /api/nsfw/moderation/appeals/me` (self-only) — list own
   - `GET /api/nsfw/moderation/appeals/pending` (admin) — pending queue
   - `PUT /api/nsfw/moderation/appeals/:id/review` (admin) — approve/deny
2. Register in `src/routes/nsfw-moderation/index.ts` barrel.
3. Register the `moderation_appeals` table in `src/db/schema.ts`
   (with column types matching migration 021). Remove all `as any`
   casts.
4. Add admin frontend (already partially specced in
   `admin.html` review queue? verify).
5. Add integration tests through the new routes.

**Option B — Remove the dead code** (if appeals are not yet a
product requirement):

1. Delete `src/nsfw/moderation-service/appeals.ts` (and
   `appeals.test.ts`).
2. Delete the `moderation_appeals` migration if no other
   consumer.
3. Move the appeals design intent into a single EPIC ticket
   (e.g. `epic-nsfw-moderation-priority.md` §Appeals) for future
   re-implementation.

The fix should be **option A** unless product confirms otherwise —
the `TASK-moderation-privacy-first-foundation.md` ticket lists
"Appeal mechanism for NSFW content flags" as an open acceptance
criterion for the governing epic.

## Verification

- Type check: `bun run check` passes with no `as any` casts in
  `appeals.ts`.
- Integration: end-to-end flow — admin bans user → user submits
  appeal → admin reviews → admin executes reversal (cross-ticket
  with `BUG-nsfw-reviewappeal-auto-reverses-actions.md`).
- Manual: as user, submit appeal on a mod action; confirm the
  flow works end-to-end.

## Acceptance Criteria

- [ ] (If Option A) `moderation_appeals` table registered in
      `src/db/schema.ts`; all `as any` casts removed
- [ ] (If Option A) `appealsRoutes` registered in the
      `src/routes/nsfw-moderation/index.ts` barrel
- [ ] (If Option A) Four route handlers with appropriate authz
      (self/admin)
- [ ] (If Option A) Admin frontend tab (or extend review queue)
      to surface pending appeals
- [ ] (If Option A) Integration test through routes covers:
      submit → list-pending → review (approve/deny) → execute
      reversal
- [ ] (If Option B) Dead code removed; migration dropped (if
      unreferenced)
- [ ] `bun run check` + relevant tests green