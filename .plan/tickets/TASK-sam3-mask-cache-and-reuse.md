<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: SAM3 mask cache and reuse

**Status:** Not Started
**Priority:** low
**Effort:** Small
**Epic:** epic-sam3-segmentation-integration
**Tags:** assets, cache
**Depends on:** `TASK-matting-concept-prompt-contract`, `TASK-comfyui-sam3-concept-mask-template`
**Related:** epic-asset-platform-capabilities.md

**Summary:**

Cache SAM3 masks keyed by (asset content hash, concept, model/provider id) so edit iterations and avatar re-rolls don't re-segment the same image.

**Context:**

Segmentation is the expensive step and every edit iteration would otherwise re-run it. A mask is a pure function of (image bytes, concept, model) — hash-keyed reuse is safe. Reuse the assets content-hash path (`createAsset` already dedups by hash) rather than a second hash scheme.

**Acceptance Criteria:**

- [ ] Cache key = content hash + concept + provider/model id; a hit returns the existing mask asset with no new segmentation
- [ ] Deleting the source asset purges its masks (asset_links cascade or the asset-platform GC hook)
- [ ] Encryption tier honored: an encrypted source never yields a plaintext cache entry
- [ ] Bounded growth: TTL or cap with eviction; the ceiling is named in a `ponytail:` comment with its upgrade path
- [ ] Tests: same (hash, concept) hits; different concept misses; deleted asset misses; encrypted asset yields no plaintext entry
- [ ] `bun run check` green

## Technical Notes

- `# ponytail:` TTL + simple LRU cap; per-tenant quotas or a size-aware policy only if growth proves it.
