<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Assistant Personality Presets Catalog

**Status:** In Progress
**Status Note:** In Progress (verified 2026-10-18 against `dev` at `08ef7efe7`). The presets catalog itself is COMPLETE and live, but two acceptance criteria are not met as written, so this ticket is not Done. Met: `src/assistant/personality/presets.ts:15` exports `PERSONALITY_PRESETS` covering all ten canonical keys (pinned key-by-key at `src/assistant/personality/composer.test.ts:115`); every preset carries `key`, `displayName`, `voice`, `scenarioSeeds[]`, `promptBlocks[]`, `defaultMood` (`presets.ts:16-30`, asserted non-empty at `composer.test.ts:131`); `key` uniqueness is enforced by the lookup helpers `findPersonalityPreset` (`presets.ts:173`) and `isPersonalityPresetKey` (`presets.ts:182`); no new dependencies were added. NOT MET: (a) "Catalog loaded at startup" — the catalog is a module-level constant imported on demand by `src/assistant/personality/composer.ts:137`, not registered through any startup loader, so there is no startup-load step to point at; (b) "unit-tested snapshot" — the tests are explicit assertions over the catalog (`composer.test.ts:114-147`), there is no snapshot fixture anywhere in `src/assistant/personality/`. Remaining: the startup registration (or an explicit decision to drop that criterion) and a real snapshot test.
**Priority:** high
**Effort:** Medium
**Epic:** epic-character-multi-personality
**Tags:** assistant, personality, presets

**Summary:**
Define canonical personality presets (serious / helpful / quirky / fun / melancholic / snarky / nurturing / horror / stoic / ecstatic) with voice metadata and prompt blocks.

**Context:**
The assistant/GM currently inherits a fixed server-default system prompt with no UI to change its tone. The world-RPG epic batch calls for picking from preset voices OR attaching an existing character as the GM. This ticket seeds the presets catalog and registers them.

**Acceptance Criteria:**
- New file `src/assistant/personality/presets.ts` exporting `PERSONALITY_PRESETS: PersonalityPreset[]` covering the 10 canonical keys.
- Each preset: `key`, `displayName`, `voice`, `scenarioSeeds[]`, `promptBlocks[]`, `defaultMood`.
- Catalog loaded at startup; unit-tested snapshot.
- Validation: `key` is unique; `promptBlocks` non-empty.
- Reuses existing styleguide (no new dependencies).
