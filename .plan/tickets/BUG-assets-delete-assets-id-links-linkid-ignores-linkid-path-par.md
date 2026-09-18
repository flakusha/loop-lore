<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: assets DELETE /assets/:id/links/:linkId ignores linkId path parameter

**Status:** ✅ Resolved (p3-bugfix-batch, 2026-09-18)
**Priority:** high
**Effort:** Medium
**Summary:** (see ## Summary)
**Context:** (see ## Observed / ## Evidence)
**Acceptance Criteria:** (see ## Acceptance Criteria)

## Summary

## Observed

DELETE /assets/:id/links/:linkId captures linkId in the route URL but never uses it. Instead, the handler reads `{entityType, entityId}` from the request body and passes them to unlinkAsset (controller.ts:343-358). A caller intending to delete a specific link by ID will silently delete a different link (one matching the body's entity pair) or no link at all — depending on what matches.

## Expected

The :linkId path parameter should be the canonical identifier for the link to delete. Either delete by linkId directly (DELETE FROM asset_links WHERE id = linkId AND asset_id = assetId), or remove :linkId from the URL and rely on the body tuple.

## Evidence

- src/assets/controller.ts:343-358 — route captures linkId in path, never references ctx.params.linkId, passes body.entityType + body.entityId to unlinkAsset.
- src/assets/service/links.ts — unlinkAsset deletes by composite (entityType, entityId), not linkId.
- reproduction: create two links on an asset. Call DELETE /assets/ID/links/link1 with body {entityType:'asset', entityId:'2'}. Either link2 is deleted (if it matches body pair) or nothing matches. link1 is unaffected.

## Severity

high

## Fix direction

Either (a) replace the unlinkAsset call with a direct delete by linkId: `await db.deleteFrom('asset_links').where('id', '=', linkId).where('asset_id', '=', ctx.params.id).execute();`. Or (b) change the URL to drop linkId and document that body parameters are required. Add a regression test for the path-param case.


## Resolution

Fixed in dev by `f4c5ff5d0` (fix(assets): honor linkId param on link delete). Verified 2026-09-18 against current `dev`:

- `src/assets/controller.ts` — DELETE handler passes `ctx.params.linkId` to new `deleteAssetLink()`; body tuple no longer read.
- `src/assets/service/links.ts` — `deleteAssetLink()` deletes `WHERE asset_id = :id AND entity_id = :linkId`, returns whether a row was deleted (404 on no match).
- Regression tests: `src/assets/service/links.test.ts` (sibling link survives, unknown id false, cross-asset isolation), `src/assets/controller.routes.test.ts` (path-id delete, repeat-delete 404, non-owner 404).

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated (`docs/spec/api-routes.md` DELETE row documents `:linkId`)

## Acceptance Criteria (original)

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
