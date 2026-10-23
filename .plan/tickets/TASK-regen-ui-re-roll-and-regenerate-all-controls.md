<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Regen UI re-roll and regenerate-all controls

**Summary:** The character edit page's emotion-avatar panel now re-rolls emotion slots (regenerate all / regenerate selected / per-variant re-roll) and can pin or reuse the recorded base seed.
**Context:** `POST /actors/:actorId/emotion-avatars/regenerate` already re-rolled a slot (`replace: "slot"`), but the panel offered no way to reach it, listed only five hard-coded emotions and never showed the actor's current variants. The actor-level batch endpoint ignored `seed`/`seedStrategy`, and an empty `emotions` list ran a zero-slot batch that reported `completed` without producing an avatar.
**Acceptance Criteria:**

- [x] The panel lists every `EmotionType` (the hard-coded five are gone).
- [x] "Regenerate all" re-rolls every base emotion slot, "Regenerate selected" the picked subset, a per-variant "Re-roll" one emotion — all through the existing regenerate endpoint with `replace: "slot"`.
- [x] The panel can pin an explicit base seed or reuse the seed recorded for the actor (reuse wins, the field is disabled while reuse is on).
- [x] The actor-level batch endpoint accepts `seed` and `seedStrategy`.
- [x] An empty `emotions` list falls back to the default emotion set (emotion-avatar service + wardrobe batch endpoint).
- [x] The panel lists the actor's current emotion variants.
- [x] Tests passing (unit + browser e2e).
- [x] Documentation updated (`docs/spec/emotion-avatars.md` §9, CHANGELOG).


**Status:** Done
**Scope:** Emotion-avatar re-roll + regenerate-all UI controls
**Priority:** medium
**Effort:** Medium
**Epic:** epic-avatar-regeneration-control

## Summary

Per-avatar re-roll on emotion grid + regenerate-all + progress (job store backed). Part of epic Emotion Avatar Regeneration Control.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-23 registry-driven close: git issue ff8f765 (registry tip: 4da2f4695 Konstantin Fedotov Close issue)
