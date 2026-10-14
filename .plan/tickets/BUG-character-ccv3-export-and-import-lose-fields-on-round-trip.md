<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: Character CCv3 export and import lose fields on round-trip

**Status:** Not Started
**Priority:** Medium
**Effort:** Medium

**Summary:**

The canonical-to-CCv3 mapping is incomplete in both directions, so a card exported and re-imported silently loses data.

Evidence read on dev:

- src/characters/exporters/shared.ts:48 — exportBaseFields emits character.creator but never character.creator_notes. The TOML (toml.ts:33) and YAML (yaml.ts:56) exporters carry it separately, but ccv2.ts:19 is built only from exportBaseFields, so creator_notes is dropped on every CCv2 and CCv3 export.
- src/characters/normalizers/ccv3.ts:27-28 — CCv3Data declares creation_date and modification_date, but normalizeCcV3 (lines 43-67) never maps either into the output. exporters/ccv3.ts:25-26 hardcodes Date.now() on the way back out, so the original dates are lost permanently. CanonicalCharacter (spec/character.ts:192-229) has no timestamp field to carry them.
- src/characters/exporters/character-systems.ts:87 — const locationTraits: Record<string, unknown>[] = [] is hardcoded empty and emitted unconditionally at :93 whenever permanent or world traits exist, so location-scoped traits can never survive an export.
- src/characters/importers/character-systems/world-setup.ts:33 — importWorldSetup uses the caller's worldId and never checks it against the payload's source world; the CharacterSystemsExport interface at :48-55 has no worldId field to check against, so a bundle silently lands in the wrong row.
- src/characters/exporters/character-systems.ts:44 — worldConfigs is declared on the export interface and written nowhere in src/characters.

Source: .tmp/longcat/review-characters.md C2, H6, H7, H8, M14.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
