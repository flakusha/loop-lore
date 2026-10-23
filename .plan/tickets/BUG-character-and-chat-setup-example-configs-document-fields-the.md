<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: Character and chat-setup example configs document fields the code drops

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-character-world-setup

**Summary:**

Three example configs promise behaviour that does not exist. (1) configs/templates/character.example.yaml:126-139 claims loadouts[] is 'read by the wardrobe service today and applied when the loadout-bridge flag is enabled' — no consumer exists (item_match appears only in loader types/schema/defaults; the bridge reads actor_wardrobe rows; see FEAT-seed-character-loadouts-into-the-wardrobe-bridge). (2) character.example.yaml:141-162 instructs switching merge: extend -> override so wardrobe fields 'now actually applied' — but mergeCharacterConfig merges against an empty base (sections/templates.ts:259-262) and the effective merge is unconditionally user-wins-by-name (characters/seed/merge.ts:27-29), so the switch changes nothing. (3) chat-setup.example.yaml:21 documents worldId and gmConfig.assistantRole; toTemplateDefault (src/chat/service/templates.ts:104-122) reads neither — worldId is dropped and gmConfig is hardcoded from visualNovel alone (:117). Fix: correct the example text so it matches the code; where the field should work, reference the implementing ticket instead of re-documenting a promise. Evidence: .plan/configs-templates-wiring-audit.md §3.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
