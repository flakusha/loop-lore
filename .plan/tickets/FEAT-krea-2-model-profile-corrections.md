<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# FEAT: Krea 2 model profile corrections

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-image-prompt-templating

**Summary:**

Split the krea2 profile into turbo/raw; add shift to ModelDefaults; align defaults with upstream Turbo guidance (currently cfgScale 7 / steps 12 — stale); update modelMatching patterns; label shipped values as upstream-default snapshots; SdProfileOverride config stays the operator override path.

**Context:**

The krea2 profile ships stale defaults (cfgScale 7 / steps 12) with no `shift` field and no turbo/raw split, diverging from upstream guidance. Phase 2 of `epic-image-prompt-templating`; the krea-2 YAML preset in `epic-model-family-presets.md` is superseded-in-part by this work (keep both, cross-reference).

**Acceptance Criteria:**

- [ ] `krea2` split into turbo/raw profiles with correct upstream-aligned defaults
- [ ] `shift` added to `ModelDefaults` and flows to providers that support it
- [ ] `modelMatching` patterns extended for the split profiles
- [ ] Shipped values labeled as upstream-default snapshots
- [ ] `SdProfileOverride` config remains the operator override path (overrides win)
- [ ] Registry + admin routes + config overlay all typecheck
- [ ] Tests updated for the new profiles and `shift` plumbing
