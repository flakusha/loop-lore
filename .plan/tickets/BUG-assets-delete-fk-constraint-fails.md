<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Assets DELETE /api/assets/:id returns 500 (FOREIGN KEY constraint failed)

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** done
**Priority:** medium
**Effort:** Small

## Summary

`tests/e2e/flows/assets.test.ts:128 DELETE /api/assets/:id deletes asset` fails with 500 in
`deleteAsset` (`src/assets/service/delete.ts:65`). The handler reaches
`database.deleteFrom("asset_links")` and SQLite throws FOREIGN KEY constraint failed —
some dependent rows still reference the `asset_links` row at the moment of delete.

Pre-existing on dev. Reproduces on dev HEAD `4f9b1f1e6` and on the authz-bug-cluster
branch before merge. Not introduced by either branch — both inherit the same broken
delete ordering.

## Reproduction

```bash
cd /home/flak/git-ai/loop-lore
E2E_SAFEGUARD=1 bun test tests/e2e/flows/assets.test.ts -t "deletes asset"
# Expected: 6 pass, 0 fail
# Actual:   5 pass, 1 fail (HTTP 500 from server)
```

Direct probe (`bun -e`):
- Upload succeeds (`storage_path = raw/2d/d7/<uuid>.png`, `owner_id = SEED.user.id`)
- DELETE /api/assets/:id returns 500 with body `{"error":"Internal server error","code":"SERVER_ERROR"}`
- Calling `deleteAsset()` directly with the same args throws:

  ```
  SQLiteError: FOREIGN KEY constraint failed
      at deleteAsset (src/assets/service/delete.ts:65)
  ```

The handler at `src/assets/controller.ts:237-253` has no try/catch — Elysia's default
error handler converts the SQLite throw to a generic 500.

## Stack trace (current behavior)

```
SQLiteError: FOREIGN KEY constraint failed
  at run (bun:sqlite)
  at executeQuery (kysely sqlite driver)
  at deleteQuery-builder execute
  at deleteAsset (src/assets/service/delete.ts:65:67)
```

Line 65 is `await database.deleteFrom("asset_links").where("asset_id", "=", assetId).execute()`.

## Likely root cause

`deleteAsset` deletes in this order:
1. `deleteFile(uploadDir, asset.storage_path)`
2. `database.deleteFrom("asset_links").where("asset_id", "=", assetId)` — fails here
3. `deleteAssetTags(database, assetId)`
4. `database.deleteFrom("assets").where("id", "=", assetId)`

Some FK-protected table still references `asset_links` (likely a tag-relation,
an audit log row, or the cascade FK from `asset_tag_dismissals` → `asset_tags` →
`asset_links`). The fix is either:
- Reorder: delete dependent rows first, OR
- Wrap the whole `deleteAsset` in a transaction and add the missing cascade deletes
  for the FK-referencing tables, OR
- Inspect `src/db/migrations/parts/*assets*` for missing `onDelete: "cascade"`
  on the `asset_links` foreign keys.

## Acceptance Criteria

- [x] `bun test tests/e2e/flows/assets.test.ts` passes
- [x] `deleteAsset` wraps in a transaction (or has correct FK cascade ordering)
- [x] No new FK violations introduced on adjacent delete paths
  (`asset_links/:linkId`, `asset_links` delete via unlink, etc.)

## Resolution

Root cause was NOT the `asset_links` delete (the stack line above was the
delete of `assets` itself). Runtime PRAGMA + row-count probes proved the
violating child rows were:

- `asset_transforms` — one row per fresh image, seeded by `createAsset` →
  `seedBaseTransform` (`src/assets/service/transforms.ts`), never cleaned up
- `asset_shares` — FK to `assets.id` with no DB-level action
- `actors` / `characters` / `personas` `avatar_asset_id` — nullable NO ACTION
  FKs; deleting an in-use avatar asset 500'd the same way (reproduced with a
  persona avatar before the fix, returns 204 after)

Fix (`src/assets/service/delete.ts`): child deletes + avatar-reference
clearing + tag cleanup all run inside one transaction so a failure cannot
leave partial state. Tables with a DB-level action (`character_avatars`
CASCADE, `chat_backgrounds` SET NULL) are left to SQLite.

Verified: assets e2e green, assets unit suite green, backend typecheck clean.
Follow-up dedup candidate found during review: `src/assets/controller/routes.ts`
and `src/assets/controller/handlers.ts` are a dead duplicate of the live inline
routes in `src/assets/controller.ts` (imported only by each other and
`handlers.test.ts`) — no runtime shadowing since only one copy registers.

Re-verified 2026-09-24 (bug-batch-2026-09-24b): the transactional fix above is
present in this worktree's `src/assets/service/delete.ts`. FK audit: every
inbound FK on `assets.id` is accounted for — `asset_links`/`asset_transforms`/
`asset_shares` deleted and `actors`/`characters`/`personas.avatar_asset_id`
cleared in-transaction; `asset_tags`/`asset_tag_dismissals` via
`deleteAssetTags`; `character_avatars` (CASCADE) and `chat_backgrounds.asset_id`
(SET NULL) left to SQLite; no table references `asset_links`. New service
regression test ("removes every FK-dependent row: links, transforms, shares,
avatar back-refs") fails on the pre-fix ordering with the ticket's exact
`SQLiteError: FOREIGN KEY constraint failed` at the assets delete, and asserts
the link rows are gone. Route-level 204 on delete + 404 for unknown id covered
by `controller.routes.test.ts` ("owner deletes; second delete 404s"). Scoped
suites: 54 pass, 0 fail across metadata/delete/controller route tests.

## Related

- `tests/e2e/flows/assets.test.ts:128` — failing test
- `src/assets/service/delete.ts:65` — failing line
- `src/assets/controller.ts:237` — handler without try/catch (consider adding for
  better error envelopes; out-of-scope for the FK fix itself)
