<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Item asset/avatar display in inventory, trading, and provisioning views

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

Epic: epic-inventory-ui, epic-item-systems-unification. DB supports item pictures: AssetLinkEntity includes item (src/db/enums-content.ts) with linkAsset/unlinkAsset service (src/assets/service/links.ts) over asset_links. Gap: zero asset integration in item flows — src/routes/story-items has no linkAsset calls; item create/edit forms have no picker (covered by TASK-gallery-asset-reuse-picker-for-world-location-item-creation for the link side); no view renders the linked asset as the item picture. Work: item card/details/provisioning/NPC-inventory/trade-window components resolve asset_links (entity_type=item, entityId=itemId) and render thumbnail with placeholder fallback; ownership/visibility-gated (reuse asset NSFW/ownership gates); cover character avatar + gallery image + item picture side by side in trade window. Pairs with TASK-item-details.md, TASK-inventory-grid.md, TASK-trading-interface.md, TASK-item-provisioning-dashboard.md. Acceptance: items with linked assets show pictures in grid/list/details/trade/provisioning; unlinked items show fallback; no N+1 (batch link lookup); bun test src/ + bun run check green.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
