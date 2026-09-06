<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Validate and fix FE/BE/DB gaps for chat/VN settings

**Status:** ✅ Resolved (already on dev, 2026-09-06)
**Priority:** high
**Effort:** Medium

## Summary

Acceptance criteria: (1) visualNovel type consistent across API schema (Boolean) and DB schema (Number) — add conversion layer or unify type; (2) visualNovel removed from KEY_MECHANIC_PARAMS or allowed to change via explicit migration-free path; (3) saveChatSettings() sends gmConfig for online chats too, or add separate endpoint for VN settings; (4) checkChatAccess() requires Master/GM role for settings changes per chat-privacy.md; (5) eliminate redundant visual_novel column by using gm_config.visualNovel as single source of truth; (6) add missing VN fields (imageScaling, autoAdvanceDelay, dialogueBoxOpacity, portraitSize, splitRatio) to gm_config. Attached to epics: epic-assistant-gm-flows, epic-chat-lifecycle-moderation.

## Resolution

All 6 gaps closed on dev across VN cycles 2–3. Verified 2026-09-06 against current `dev` (`06127fe5`):

- (1) Type unity — `1b9b0cdf`: `gm_config.renderingOverride` typed enum (`src/validation/schemas/chat.ts:33`, `src/db/enums-core/chat.ts:24-33`) replaces the Boolean/Number split
- (2) Mode lock — `1b9b0cdf` + `e14d3aaa`: `visualNovel` moved to mutable `GM_CONFIG_PRESENTATION_KEYS` (`src/chat/service/access.ts:51-66`); `KEY_MECHANIC_PARAMS` no longer lists it
- (3) Online save — `a16490a7`: `saveChatSettings()` sends `gmConfig` for online chats
- (4) Role gate — `e14d3aaa`: `checkChatAccess()` requires Master/GM for settings changes
- (5) Single source — `1b9b0cdf` + `017_drop_template_visual_novel.ts:63-76`: template `visual_novel` column dropped with backfill to `renderingOverride`; no integer column on `chats`
- (6) VN fields — `a16490a7`: 5 fields in `GmSettingsFields` (`src/frontend/alpine/chat-settings/gm-config.ts:26-30`)
- Cross-references: all 6 child tickets ✅ Resolved (`BUG-vn-mode-locked-*`, `BUG-settings-save-omits-*`, `BUG-no-role-restriction-*`, `BUG-visualnovel-type-mismatch-*`, `BUG-redundant-vn-state-*`, `FEAT-expose-full-vn-settings-*`).

No code change required.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
