<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# FEAT: Group/blog access control for generated assets

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-comfyui-first-class-citizen

**Summary:**

Generated images are owner-only at creation (create.ts:103 hardcodes visibility=Private). No concept of 'available to group chat X' or 'available on blog Y' — only per-user shares via asset_shares. The visibility model is: Private (owner only), Shared (owner + explicitly shared users), Public (anyone). Fix: design a group-share or entity-share mechanism, or extend the visibility model to support entity-based access control.

**Context:**

Generated images are owner-only at creation (`create.ts` hardcodes `visibility=Private`). The only access extension is per-user shares via `asset_shares`. No concept of "available to group chat X" or "available on blog Y".

**Design:** Extend `canAccessAsset` and `visibleAssetFilter` to honor `asset_links` — an asset linked to a chat is accessible to all participants of that chat; an asset linked to a public blog post is accessible to anyone who can read the post. No new tables, no new share rows, no new API. The link already exists (image-gen-route links to chatId); the access check just needs to honor it.

**Alternatives considered:**

1. **New `asset_entity_shares` table** — explicit share grants per entity. Rejected: over-engineered; duplicates information already in `asset_links`.
2. **Extend `asset_shares` with entity columns** — add `shared_with_entity_type`/`shared_with_entity_id`. Rejected: adds a second share path when `asset_links` already carries the relationship.
3. **Honor `asset_links` in access check** (chosen) — minimal change, reuses existing data, no new API surface.

**Acceptance Criteria:**

- [ ] `canAccessAsset` returns true for chat participants when the asset is linked to that chat
- [ ] `canAccessAsset` returns true for public blog post readers when the asset is linked to that post
- [ ] `visibleAssetFilter` / `visibleGalleryAssetFilter` include the same branches
- [ ] Tests: cross-user chat participant can access, non-participant cannot, public blog post reader can
- [ ] Documentation updated
