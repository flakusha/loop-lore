<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Scene-asset precedence rule — world vs location

**Status:** ⬜ Not Started
**Priority:** low
**Effort:** Small
**Summary:** Define + implement resolution precedence when world-level and location-level scene assets both exist
**Context:** Found 2026-09-19 docs-gap sweep; source docs/guide/gallery.md (documents location-over-world expectation); no .plan artifact (asset precedence / scene asset → 0 hits)
**Acceptance Criteria:** See ## Acceptance Criteria below.
**Epic:** epic-worlds-extension
**Tags:** assets, worlds, locations, vn

## Summary

docs/guide/gallery.md describes scene assets linkable at world and location level with location overriding world, but the precedence rule is tracked nowhere in `.plan/` and the asset-linking epics do not specify resolution order. Spec + implement: scene/background resolution walks location → world (explicit override) → renderer default.

## Acceptance Criteria

- [ ] Precedence rule recorded in the owning epic's Integration Points (location > world > renderer default)
- [ ] Scene renderer resolves background via the precedence chain
- [ ] Unit test: location asset wins over world asset; world asset wins over default
- [ ] Guide text matches implemented order
