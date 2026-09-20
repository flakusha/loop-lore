<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# FEAT: 2D world: pixel-art sprite pipeline (style packs, emotion+status overlays)

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Large
**Epic:** epic-2d-sprite-world
**Summary:** Pixel-art style packs with composable emotion + status overlays; no combinatorial art.
**Context:** Epic epic-2d-sprite-world; reuses avatar tag chain (emotion/mood/action/location/time/outfit) + battle StatusEffect overlays.
**Acceptance Criteria:** World generates pack; actor resolves sprite for emotion+status; static sliding first.

## Summary

Curated style-pack library (fantasy/sci-fi/...) + seeded per-world variants, versioned with world. Sprites compose: base + emotion tags (existing avatar chain emotion/mood/action/location/time/outfit) + battle StatusEffect overlays. No combinatorial art. Static sliding first; walk/fight/idle frames later. AC: world generates pack, actor resolves sprite for emotion+status.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
