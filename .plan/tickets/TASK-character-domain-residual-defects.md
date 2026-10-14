<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Character domain residual defects

**Status:** Not Started
**Priority:** Medium
**Effort:** Medium

**Summary:**

Sixteen verified low- and medium-severity defects in the character domain, none of which is a security boundary.

- src/characters/services/personality-service/resolve.ts:89 — const resolved = { ...permanent, ...world, ...location } lets world and location traits override immutable permanent traits; the check at :93-98 records a violation but does not prevent the override.
- src/characters/services/personality-service/resolve.ts:83-85 — location traits are merged without checkPersonalityIntegrity, unlike the world and permanent layers.
- src/characters/services/personality-service/resolve.ts:93-98 — the violation loop runs on every resolve, so a character with ten immutable traits emits ten violations per call.
- src/characters/world-setup/crud.ts:96-100 — upsertWorldSetup returns the merged ?? getWorldSetup(...) fallback cast to CharacterWorldSetupRow. getWorldSetup itself returns undefined when the row is genuinely gone, and the cast launders that undefined into a value typed as a row, so a caller destructuring the result gets undefined fields rather than an error. Narrow the fallback instead of casting it.
- src/characters/world-setup/crud.ts:60-83 — SELECT-then-INSERT; the unique constraint uq_character_world_setup_actor_world (migrations/001_init.ts:1456) exists but only rejects the loser after both callers pass the SELECT. Use INSERT ... ON CONFLICT DO UPDATE.
- src/characters/services/avatar-service/selection.ts:15-18 — ALL_TAG_TYPES and DEFAULT_FALLBACK_CHAIN are two separate literals with identical contents.
- src/validation/schemas/character-systems.ts:117-121 declares category on LocationTraitCreateInput, but src/characters/services/character-systems/location.ts:103-114 never inserts it and the table has no trait_category column.
- src/validation/schemas/character-systems.ts:97 — TraitUpdateInput requires both name and value, so a partial trait update is impossible.
- src/characters/importers/character-systems/availability.ts:36,47 — data.status as any with no LicenseType narrowing.
- src/characters/importers/character-systems/licensing.ts:39,53 — (data.allowDerivatives as number) ?? 1 defaults to permitted when the field is absent.
- src/characters/importers/character-systems/templates.ts:247 — linkTemplateAvatar hardcodes label 'default' and isPrimary true; the dedupe at :76-89 checks display_name only and never enforces (actor_id, asset_id).
- src/characters/seed/avatar.ts:76-93 — ensureSystemUser is check-then-insert with no ON CONFLICT DO NOTHING.
- src/characters/exporters/character-systems.ts:197 — exportCharacterSystemsJson returns the literal '{}' string on serialization failure.

Two review claims that did not survive verification and need no work: the ccv2 exporter does not share the '{}' fallback (ccv2.ts:41 returns the stringified CCv2 object), and compactEnvelope does not exist anywhere in src/characters (the data ?? data heuristic lives as extractEnvelope in exporters/shared.ts:24-28).

Source: .tmp/longcat/review-characters.md M1-M15, L9, L10, L4.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
