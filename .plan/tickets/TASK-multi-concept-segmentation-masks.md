<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Multi concept segmentation masks

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** derived-map-generation
**Tags:** segmentation, matting, assets
**Depends on:** `TASK-matting-concept-prompt-contract`
**Related:** TASK-sam3-concept-cutout-wiring-sprites-avatar-matting-vn-alpha.md, TASK-sam3-mask-cache-and-reuse.md

**Summary:**

Let one concept prompt yield N instance masks — "both characters" returns both cutouts — with N derivatives and list-shaped reads, instead of a single mask.

**Context:**

`MattingProvider.removeBackground` returns one `Buffer` (`src/generation/matting/types.ts:37`); `#storeDerivative` creates exactly one derivative (`src/generation/matting/service.ts:190-219`); `findMattedDerivative` returns the newest single row. The asset model already allows N derivatives per source (`asset_links` PK is `(asset_id, entity_type, entity_id)`; matting already creates rows with `dedupe: false`), so this is a contract + read-shape change, not a schema change.

**Acceptance Criteria:**

- [ ] Concept prompt gains an optional `max_matches` bound; provider returns masks ordered by area descending; contract extends without breaking single-mask callers (single result stays one `Buffer`-shaped path or an explicit list wrapper — decide and record)
- [ ] `#storeDerivative` loops over masks: one derivative + one `matting-source`/mask link each; no dedup collapse between masks of different instances
- [ ] Reads return lists: `findMattedDerivative` (newest-single) replaced by or complemented with a list finder used by the sprite/VN consumers
- [ ] `concept` and `max_matches` validated at the boundary by a reused schema (bounded length/charset, int range) — fast-failing 400 before any provider call or asset write
- [ ] Test: fixture provider returns two masks for one concept; two derivatives land, links resolve per instance; a consumer reading the list gets both
- [ ] `bun run check` green

## Technical Notes

- `TemplateParamType` has no list/array (`src/image-edit/types.ts:30-36`); `max_matches` is a bounded int param, not a list — no param-type change needed.
- Mask cache key gains the match index (`TASK-sam3-mask-cache-and-reuse`) so instances stay addressable.
- Sprite compositor and VN consumers keep working unchanged against the newest mask while the list read ships.

git issue: ece68d9
