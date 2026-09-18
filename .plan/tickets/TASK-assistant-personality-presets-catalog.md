<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Assistant Personality Presets Catalog

**Status:** ⬜ Not Started
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
