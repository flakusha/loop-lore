<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# WIRE: character creation missing avatar asset linking

**Status:** Open
**Priority:** high
**Effort:** Medium
**Area:** characters
**Source:** reconcile review (Scout Batch C — CHAR-1)

## Evidence

`src/routes/characters/create.ts` — `createRoutes` inserts the actor via `.values({...})`. No `asset_id` is set, no `linkAsset` call is made. The character creation flow does not link the uploaded avatar asset to the new actor.

Avatar upload flow: user uploads in creation wizard → `asset_id` returned to FE → character is created → no linking call made.

## Impact

Avatar appears uploaded but character is created without avatar; avatar asset is orphaned or linked to nothing.

## Fix

After actor insert, call `linkAsset`:

```ts
const newActor = await db.insertInto("actors").values({...}).returning("id").executeTakeFirst();
if (assetId) {
  await linkAsset(db, { assetId, entityType: "actor", entityId: newActor.id, label: "avatar" });
}
return jsonResponse({ actor: newActor });
```

## Verification

- E2E: create character with avatar upload → GET character → avatar asset present in response.
- Add unit test: mock `linkAsset` → assert called with correct `entityType: "actor"`.

## Acceptance Criteria

- [ ] Actor record linked to avatar asset after creation
- [ ] GET /characters/:id includes avatar asset in response
- [ ] E2E avatar-through-creation passes
