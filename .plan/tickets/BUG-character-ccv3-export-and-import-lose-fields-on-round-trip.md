<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Character CCv3 export and import lose fields on round-trip

**Status:** In Progress
**Status Note:** [2026-10-26 finalpass] All 5 sub-defects fixed. (1) `exportBaseFields` now emits `creator_notes` (src/characters/exporters/shared.ts:47-51), so CCv2/CCv3 stop dropping it. (2) The canonical card carries `creation_date`/`modification_date` (src/characters/spec/character.ts:212-219), `normalizeCcV3` maps them (src/characters/normalizers/ccv3.ts:64-65) and `exportToCcV3` preserves them, falling back to `Date.now()` only for a card that has none (src/characters/exporters/ccv3.ts:24-27). (3) Location-scoped traits are exported (world-scoped via a `locations` join) with their `locationId` instead of a hardcoded empty array (src/characters/exporters/character-systems.ts:81-120) and imported back keyed by that location (src/characters/importers/character-systems/traits.ts:15-88; `effects` is parsed before the service re-stringifies it, avoiding double encoding). (4) `worldSetup.worldId` names the source world (src/characters/exporters/character-systems.ts:53-58,217) and `importWorldSetup` refuses a bundle from a different world with a reported error instead of writing it (src/characters/importers/character-systems/world-setup.ts:35-45). (5) `avatars.worldConfigs` is populated from `world_avatar_config` (src/characters/exporters/character-systems.ts:140-163) and re-imported through `upsertWorldAvatarConfig`, with `worldId` threaded into `importAvatars` (src/characters/importers/character-systems/avatars.ts:21-31,66-96; index.ts:52). Tests: new src/characters/exporters/character-systems.test.ts (export + round-trip + wrong-world refusal), plus metadata cases in src/characters/exporters.test.ts and timestamp cases in src/characters/normalizers/ccv3.test.ts — 39 pass. `tsc --noEmit` clean.

**Status Note:** [2026-10-26 sweep-A verify] NOT-FIXED (issue 08f7eae): All 5 sub-defects verified present: exporters/shared.ts:47-49 omits creator_notes; normalizers/ccv3.ts:60-66 never maps creation/modification_date and exporters/ccv3.ts:25-26 hardcodes Date.now(); exporters/character-systems.ts:87,93 locationTraits hardcoded empty; importers/character-systems/world-setup.ts:33 uses caller worldId with no payload check; character-systems.ts:44 worldConfigs declared but written nowhere in src.
**Priority:** Critical
**Effort:** Medium
**Epic:** epic-import-export-io

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

**Resolved:** 2026-10-26 registry-driven close: git issue 08f7eae (registry tip: 234539349 Konstantin Fedotov Close issue)
