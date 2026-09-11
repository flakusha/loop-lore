# BUG: Assets DELETE /api/assets/:id returns 500 (FOREIGN KEY constraint failed)

**Status:** ⬜ Not Started
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

- [ ] `bun test tests/e2e/flows/assets.test.ts` passes (6/6)
- [ ] `deleteAsset` wraps in a transaction (or has correct FK cascade ordering)
- [ ] No new FK violations introduced on adjacent delete paths
  (`asset_links/:linkId`, `asset_links` delete via unlink, etc.)

## Related

- `tests/e2e/flows/assets.test.ts:128` — failing test
- `src/assets/service/delete.ts:65` — failing line
- `src/assets/controller.ts:237` — handler without try/catch (consider adding for
  better error envelopes; out-of-scope for the FK fix itself)
