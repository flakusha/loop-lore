# BUG: Asset link/share JSON routes 500 "Body already used" — Elysia sucrose body inference

**Status:** ✅ Resolved (2026-08-06)
**Priority:** high
**Effort:** Small
**Labels:** backend, assets, elysia, e2e
**Regression introduced by:** c78e5466 (`fix(auth): close remaining access-control gaps in admin, assets, chat, world routes`)

## Summary

`POST /api/assets/:id/links` (and every other JSON-body route in `src/assets/controller.ts`
that guards with `requireUserId(ctx)`) returns **500 `{"error":"Body already used","code":"SERVER_ERROR"}`**
for an authenticated owner. E2E fails in `tests/e2e/flows/assets.test.ts` ("links asset to chat")
and `tests/e2e/flows/chat-full.test.ts` ("uploads asset and links it to chat"). Pre-existing on dev
HEAD; reproduced on plain dev before any local merge. NOT caused by the CSS/HTML/docs work that was
finalized with `--force`.

## Root cause (verified, not inferred)

Elysia 1.4.29's `sucrose` type-inference (`node_modules/elysia/dist/sucrose.mjs`, consumed at
`compose.mjs:257`) sets `inference.body = true` for a handler **whenever the handler passes its
context object `ctx` to any helper function** (e.g. `requireUserId(ctx)`). When `inference.body` is
true, Elysia's compiled handler eagerly parses the request body into `ctx.body`, **consuming the raw
`Request` stream before the handler runs**. The handler's own `await ctx.request.json()` then throws
the native `TypeError: Body already used` → 500 via Elysia's default onError.

Isolation via direct `sucrose(handler)` calls (scratch script, Elysia 1.4.29):

| Handler shape | `inference.body` |
|---|---|
| `const body = await ctx.request.json()` (bare) | **false** → works |
| `ctx.request.json()` + `as` cast | false → works |
| `requireUserId(ctx)` then `ctx.request.json()` | **true** → 500 |
| `requireUserId(ctx)` only (no body read) | **true** |
| `noop(ctx)` then `ctx.request.json()` | **true** |
| `await someHelper(ctx.params.id)` then `ctx.request.json()` | false → works |
| `const userId = ctx.userId` (direct read) then `ctx.request.json()` | false → works |
| `requireUserId(ctx)` then use `ctx.body` | true, but **works** (body already parsed) |

Mechanism confirmed at runtime: with a `bodyUsed` probe inside the handler, `ctx.request.bodyUsed`
was already `true` at handler entry on the failing routes and `false` on the working bare route.
Instrumenting `compose.mjs` showed `inf.body=true` exactly for the failing routes.

## Timeline / regression boundary

- `7dc68be7` (parent of c78e5466): `POST /api/assets/:id/links` was a bare `ctx.request.json()`
  handler → passed. **`POST /api/assets/:id/share` was already broken** (500, same cause — it had
  `requireUserId(ctx)` since before this commit).
- `c78e5466`: added `requireUserId(ctx)` (and `requireAssetOwner`) prologue to the links routes →
  links POST flipped from working to 500. e2e tests were not updated, hence the regression surfacing
  now. Verified by running `tests/e2e/flows/assets.test.ts` at both commits in a scratch worktree.

## Affected routes (all in `src/assets/controller.ts`)

Handlers that pass `ctx` to a helper AND read the raw body via `ctx.request.json()`:

1. `PATCH /api/assets/:id` — `requireUserId(ctx)` + `request.json()` → 500 (was it broken before
   c78e5466? check; the diff did not touch PATCH — pre-existing pattern)
2. `POST /api/assets/:id/links` — **the e2e-failing route** (broken by c78e5466)
3. `DELETE /api/assets/:id/links/:linkId` — broken by c78e5466
4. `POST /api/assets/:id/share` — **pre-existing** (broken before c78e5466)
5. `DELETE /api/assets/:id/share` — broken by c78e5466

Not affected (verified): `GET` routes (no body), handlers that read `ctx.body` (Elysia-parsed),
the standalone parent `POST /api/assets` upload route (reads `ctx.userId` directly, no helper call,
`formData()` intact — this is why upload works). `src/routes/export.ts` and
`src/routes/world-import.ts` pass `ctx.request` (property access, not `ctx`) to helpers and wrap
`request.json()` in try/catch — unaffected.

## Validated fix (proof-of-concept in scratch worktree)

Replace `await ctx.request.json()` with `ctx.body` (already Elysia-parsed) in the affected
handlers, e.g.:

```ts
.post("/api/assets/:id/links", async (ctx,) => {
  const userId = requireUserId(ctx,);
  if (typeof userId !== "string") { return userId; }
  const owned = await requireAssetOwner(database, ctx.params.id, userId,);
  if (owned instanceof Response) { return owned; }
  const body = ctx.body as { entityType: AssetLinkEntity; entityId: string; label?: string };
  await linkAsset({ database, assetId: ctx.params.id, link: body, },);
  return jsonCreated({ id: ctx.params.id, },);
},)
```

With this applied to the links route, `E2E_SAFEGUARD=1 bun test tests/e2e/flows/assets.test.ts`
→ **5 pass / 0 fail** at c78e5466-era code.

Alternative (rejected): stopping the `ctx`-passing (e.g. inlining `ctx.userId` reads) would lose
the `requireUserId` 401-response behavior and still leaves `POST /share` broken — `ctx.body` is the
codebase-consistent pattern (`characters.ts`, `chat-backgrounds.ts`, etc. already read `ctx.body`
after `requireUserId`).

## Acceptance Criteria

- [ ] `POST /api/assets/:id/links`, `DELETE /api/assets/:id/links/:linkId`, `POST`/`DELETE /api/assets/:id/share`, `PATCH /api/assets/:id` return 2xx for the owner, 401 unauthed, 404 non-owner (no 500)
- [ ] `E2E_SAFEGUARD=1 bun test tests/e2e/flows/assets.test.ts` → 5 pass / 0 fail
- [ ] `E2E_SAFEGUARD=1 bun test tests/e2e/flows/chat-full.test.ts` → 3 pass / 0 fail
- [ ] `bun test src/assets/` unit tests green
- [ ] Root cause documented here (done) or in commit message

## Notes

- Do NOT "fix" by updating test expectations to accept the 500 — the server regression is real:
  an authenticated owner linking their own asset is a legitimate request.
- The e2e helper's solo-mode auth fallback means an empty/invalid `ll_token` resolves to the
  demo/solo user (`authConfig.required === false` in tests), not 401 — don't misread that as a
  second bug when reproducing.
- Scratch artifacts used for verification: worktree `/tmp/ll-regress` (at c78e5466 / 7dc68be7,
  removed after), `/tmp/repro-*.ts`, `/tmp/sucrose-test.ts`. Elysia dist in `node_modules` was
  temporarily instrumented for `bodyUsed`/`inference` logging and fully restored from backup.

## Resolution (2026-08-06)

**Fix**: replaced `await ctx.request.json()` with `ctx.body` (already Elysia-parsed) in all 5
affected asset routes — `PATCH /:id`, `POST /:id/links`, `DELETE /:id/links/:linkId`,
`POST /:id/share`, `DELETE /:id/share`. Commit `5a647564` (GPG-signed, on `dev`).

**Verification**:
- `E2E_SAFEGUARD=1 bun test tests/e2e/` → **184 pass / 0 fail** (25 files; both previously
  failing suites green: `assets.test.ts` 5/5, `chat-full.test.ts` 3/3).
- `bun test src/assets/` → 19 pass / 0 fail; `bun run typecheck` clean; eslint + dprint clean.
- Direct smoke test (fresh process): owner POST /links 201 (+link row persisted), PATCH 200,
  POST /share 201, DELETE /links/:linkId 204, DELETE /share 204; non-owner POST /links → 404
  NOT_FOUND (no 500).
- Note: the e2e `ApiClient.del()` helper cannot send a body, so DELETE routes are only
  exercisable via raw fetch — the earlier "500 undefined is not an object" readings were a
  bodiless-request artifact identical to pre-fix behavior, not a regression.
