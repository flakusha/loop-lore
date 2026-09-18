<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Character As Assistant Pick Character As GM

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-character-multi-personality
**Tags:** assistant, character, gm

**Summary:**
Pick an existing character card to act as the assistant/GM voice for a chat or world.

**Context:**
The character-as-assistant scenario: instead of a preset tone, the GM is a fully fledged character with traits, lore, and voice. This ticket wires character -> assistant with the same composer path as the in-chat character.

**Acceptance Criteria:**
- Picker (companion to `assistant-personality-selector-ui`) lists user-owned characters plus system characters flagged as GM-eligible.
- Composer emits full character persona block (same code-path as `TASK-character-internal-traits` injection) when source is `character`.
- `Personality -> Character` conversion reuses `convertToCharacter`; `Character -> Personality` for migration path.
- Tests: pick character, assistant prompt changes; pick another, prompt reverts cleanly.
