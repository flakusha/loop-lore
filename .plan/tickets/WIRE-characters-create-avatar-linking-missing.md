<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->
# WIRE: character creation missing avatar asset linking
**Priority Tier:** P2
**Effort:** Medium
**Source:** reconcile review (Scout Batch C — CHAR-1)
`src/routes/characters/create.ts` — `createRoutes` inserts the actor via `.values({...})`. No `asset_id` is set, no `linkAsset` call is made. The character creation flow does not link the uploaded avatar asset to the new actor.
Avatar upload flow: user uploads in creation wizard → `asset_id` returned to FE → character is created → no linking call made.
Avatar appears uploaded but character is created without avatar; avatar asset is orphaned or linked to nothing.
After actor insert, call `linkAsset`:
```ts
const newActor = await db.insertInto("actors").values({...}).returning("id").executeTakeFirst();
if (assetId) {
  await linkAsset(db, { assetId, entityType: "actor", entityId: newActor.id, label: "avatar" });
}
return jsonResponse({ actor: newActor });
```
- E2E: create character with avatar upload → GET character → avatar asset present in response.
- Add unit test: mock `linkAsset` → assert called with correct `entityType: "actor"`.
## Acceptance Criteria
- [ ] Actor record linked to avatar asset after creation
- [ ] GET /characters/:id includes avatar asset in response
- [ ] E2E avatar-through-creation passes

## Resolution

Fixed in commit `2ac5cf29` (fix(wire): 3 P2-Reconcile tickets): the same commit also wrapped /views/nsfw-moderation in `requirePermission('admin.system')` guard, added the impersonate dispatch in `command-buttons.runCommand`, and added the linkAsset() call in `src/routes/characters/create.ts` after actor insert.