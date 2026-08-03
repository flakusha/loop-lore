# BUG-2026-001: GM Notes GET endpoints return 500 `near "from": syntax error`

**Status**: closed
**Priority**: high
**Labels**: bug, gm-notes, sqlite, kysely
**Assignee**: (next session)
**Epic**: epic-gm-shadow-notes
**Related**: TASK-gm-shadow-notes.md, TASK-gm-whitenotes.md

## Description

Every `GET` on the GM notes routes returns HTTP 500 with body `near "from": syntax error` when the requester is authenticated as the chat owner (or any authed user):

- `GET /api/chats/:id/whitenotes`
- `GET /api/chats/:id/shadow-notes`

Repro (see `src/routes/gm-notes.test.ts` — tests `shadow note create → list → reveal → delete lifecycle` and `whitenote create with priority + list ordering` fail at the GET step):

1. `createTestDb()` (bun:sqlite via Kysely), insert user → world → chat (uuid chat id) → one whitenote
2. `new Elysia().derive(() => ({ userId: "owner-1" })).use(gmNotesRoutes({ database: db, config: {} }))`
3. `app.handle(GET /api/chats/<uuid>/whitenotes)` → `500 near "from": syntax error`

Also confirmed via `/tmp` debug tests (gm-debug4, gm-debug5).

## What has been eliminated (do NOT re-trace these)

- **Params validation**: uuid chat id required (`ChatIdParams` → 422 otherwise); repro uses valid uuid — passes.
- **Authz**: unauthed GET → 401 (correct); non-member → 403 (correct). 500 only occurs after authz passes.
- **Promise.all on single sqlite connection**: `Promise.all([select, countAll])` on one Kysely connection DOES produce this exact error (debug4 reproduced). Both GET handlers in `src/routes/gm-notes.ts` were changed to sequential awaits — **error persists**, so concurrent statements were NOT the (only) cause.
- **The queries themselves**: standalone `selectFrom("whitenotes").where(...).orderBy("priority","desc").orderBy("created_at","desc")` and `countAll().as("total")` both execute fine in isolation (debug2). No SQL syntax error in the generated SQL.
- **Note the route's `page`/`pageSize` cast**: `(ctx.query.page as number) ?? 1` with `PaginationQuery` schema — inspect whether `t.Numeric`/absent query params produce a weird value (e.g. NaN → invalid LIMIT/OFFSET, but that yields a different error, not "near from").

## Likely next probes (unverified)

- Diff the SQL executed in the failing route vs the standalone queries — log `sql` via Kysely `.compile()` on the exact route query chain, including `checkChatAccess` preceding it. The "near from" points at a malformed `FROM` clause — suspect a table reference or alias only present in the route path (e.g. `checkChatAccess` query shape, or `countAll` + `.as("total")` combined with `.where` on a fresh connection state).
- Try reproducing with the exact route file's imports/order — possibly an issue with how `opts.database` (the Kysely instance) is passed vs the dialect's connection pooling (`createTestDb` uses what dialect?).
- Check whether ANY other route in `src/routes/` does the same GET pattern and works (e.g. `messages.ts` list) — if so, diff the difference.

## Acceptance Criteria

- [ ] `bun test src/routes/gm-notes.test.ts` → 7 pass / 0 fail
- [ ] Both GET endpoints return `{ items, total, page, pageSize }` 200 with data
- [ ] Root cause documented in this ticket or commit message

## Notes

- Test file already written and green except these 2 GET failures (5/7 pass). Fixes applied in this session: uuid chat ids in tests, 400→422 validation expectations, sequential awaits in both GET handlers (kept — harmless, good practice).
- Keep the sequential-await pattern regardless of root cause — single-connection sqlite cannot interleave in-flight statements.
- Full `bun run check` times out (~300s); use `bun run typecheck` + targeted `bun test` for verification.

## Resolution (2026-08-01)

**Root cause**: Both GET handlers omitted `.select()`/`.selectAll()` on the items query. Kysely 0.29.4 emits an **empty select list** (`select from "whitenotes" ...`) when no `.select()` is given — it does NOT default to `select *`. SQLite rejects that with `near "from": syntax error`. Every working query in the file (count, checkChatAccess, post/delete) had an explicit `.select()`/`.selectAll()`; the two items queries were the only ones relying on implicit select-all.

**The Promise.all hypothesis was a red herring** — debug10 proved `Promise.all` + `selectAll()` runs fine on the same connection. The sequential-await change was kept (harmless, single-connection safety) but the comment was corrected.

**Fix**: added `.selectAll()` to both items queries. `bun test src/routes/gm-notes.test.ts` → 7/7 pass; `bun test src/assistant/` → 74/74 pass.

**Repo-wide implication**: every Kysely query in loop-lore must have an explicit `.select()`/`.selectAll()` — implicit select-all is silently broken on 0.29. Search for `selectFrom(...)` chains missing `.select` when auditing other routes.
