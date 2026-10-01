<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: Image-edit derivative link files an asset id under entity_type=actor, hiding it from derivative GC

**Status:** Not Started
**Priority:** medium
**Effort:** Small
**Epic:** epic-asset-platform-capabilities

**Summary:**

src/generation/image-edit-service/apply.ts:210-218 links the new derivative with entityType AssetLinkEntity.Actor while entityId carries opts.sourceAssetId, which is an assets.id. Verified 2026-10-01: the resulting asset_links row has entity_id === asset_id === the asset's own id, stored under entity_type=actor.

deleteAsset's derivative GC queries entity_type='asset' (src/assets/service/delete.ts:48-53), so it never sees these rows — confirmed 0 matching rows. Deleting the source asset orphans the edit derivative and its file on disk. The correct shape already exists in src/generation/matting/service.ts:196-204, which uses AssetLinkEntity.Asset with the source asset id.

Reachability: src/generation/image-edit-service/ currently has no external importer — grep for 'from "../image-edit-service"', '.editImage(' and 'ImageEditService' outside that directory returns nothing. The live edit path is src/image-edit/ (routes.ts + providers/), wired at src/routes/v1/content-surface.ts:49. So this is latent, not user-facing today, but the module is exported and would break the moment it is wired.

Acceptance: the derivative link uses AssetLinkEntity.Asset; deleting the source asset removes the derivative row and its file; matting and image-edit use one shared derivative-link shape.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
