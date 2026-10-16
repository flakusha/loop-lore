<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Derived map origin links

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** derived-map-generation
**Tags:** assets, provenance, links
**Related:** BUG-image-edit-derivative-link-files-an-asset-id-under-entity-ty.md, epic-asset-platform-capabilities.md, TASK-matting-concept-prompt-contract.md

**Summary:**

Generalize the matting-only derivative link into a documented `derived-from:<kind>` label scheme with helpers and a read API, so every derived map (mask, depth, texture, controlnet result) carries its source.

**Context:**

asset→asset links exist and work — `MATTING_SOURCE_LABEL` is written at `src/generation/matting/service.ts:211-219` and read by `findMattedDerivative` (`src/assets/matting-routes.ts:63`). But there is no generic role: nothing displays origin anywhere (`src/components/asset-preview-modal.html` has an unpopulated `source` slot), and each new derived-map kind would otherwise invent its own label.

**Acceptance Criteria:**

- [ ] Label scheme documented and centralized (`derived-from:depth`, `derived-from:controlnet`, `derived-from:<map>`, masks keep `matting-source`) — one module of constants + create/read helpers, no inline strings elsewhere
- [ ] Read API returns the source asset for any derivative (single hop), respecting the same visibility model as the gallery (`visibleGalleryAssetFilter` in `src/routes/views/gallery.ts`)
- [ ] No schema change; link writes keep using `linkAsset` with `entityType: Asset`; the derivative-link `entity_type` trap from BUG-image-edit-derivative-link is not reintroduced
- [ ] Test: round-trip create→read for each label kind; a derivative with no origin link returns null, not 500
- [ ] `bun run check` green

## Technical Notes

- Origin is one hop for v1 (image → depth). Chains (image → mask → cutout) stay flat with one link per artifact; don't model a tree.
- Keep `findMattedDerivative` behavior for existing callers; the new helpers are additive until the multi-mask ticket migrates reads.