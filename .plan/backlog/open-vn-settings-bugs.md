<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Open — VN Mode / Chat Settings Bug Cluster

> **Filed:** 2026-09-03 (git issues `66c4c3d`–`c0c51c2`) from `df576604 docs(plan): file FE/BE/DB chat/VN settings gap tickets`
> **Umbrella ticket:** `66c4c3d` `TASK-validate-and-fix-fe-be-db-gaps-for-chat-vn-settings`
> **Related epics:** `epic-assistant-gm-flows.md`, `epic-chat-lifecycle-moderation.md`

## Summary

Seven interlocking bugs around visual-novel (VN) mode settings exposure, access
restrictions, and availability. Filed together because they share a single
contract: the `visualNovel` field must be (1) type-consistent across API/DB,
(2) toggleable per-chat without forcing a migration, (3) persisted in `gm_config`
and syncable via the settings save path, (4) guarded by Master/GM role on
change, and (5) accompanied by the full set of VN settings fields from spec.

## Issues

| Git issue | Type | Severity | Problem |
| --------- | ---- | -------- | ------- |
| `66c4c3d` | TASK | High | Umbrella: validate + fix all 6 gaps below |
| `c7f002c` | BUG | High | VN mode locked once chat has confirmed messages — `visualNovel` is in `KEY_MECHANIC_PARAMS` (`src/chat/service/access.ts:19`), immutable after first message |
| `e5219e3` | BUG | High | Settings save omits `gmConfig` for online chats — `saveChatSettings()` in `src/frontend/alpine/chat-settings.ts` only sends `gmConfig` when `!this._chatOnline` |
| `90d9e30` | BUG | High | No role restriction for changing chat settings — `checkChatAccess()` allows any participant to modify `visualNovel`, `gmConfig`, `mode` |
| `c0c51c2` | BUG | Medium | `visualNovel` type mismatch — API schema validates Boolean, DB stores Number (0/1); no conversion layer |
| `9db5fef` | BUG | Medium | Redundant VN state in two locations — `chats.visual_novel` (int) + `chats.gm_config.visualNovel` (Boolean), no sync |
| `8a1613e` | FEAT | Medium | Expose full VN settings from spec — 5 missing fields: `imageScaling`, `autoAdvanceDelay`, `dialogueBoxOpacity`, `portraitSize`, `splitRatio` |

## Acceptance Criteria (composite)

1. `visualNovel` type consistent across API and DB layers (Boolean everywhere, or explicit conversion)
2. `visualNovel` removed from `KEY_MECHANIC_PARAMS` or allowed to change via explicit migration-free path
3. `saveChatSettings()` sends `gmConfig` for online chats (or separate endpoint for VN settings)
4. `checkChatAccess()` requires Master/GM role for settings changes per `chat-privacy.md`
5. `chats.visual_novel` redundant column eliminated — `gm_config.visualNovel` as single source of truth
6. Missing VN fields added to `GmSettingsFields` + schema + frontend state

## Files
- `src/validation/schemas.ts` — API schema (ChatUpdateBody, GmConfig)
- `src/validation/db-schemas.ts` — DB schema
- `src/chat/service/access.ts` — `KEY_MECHANIC_PARAMS`, `checkChatAccess`
- `src/frontend/alpine/chat-settings.ts` — `saveChatSettings`, `_chatSettingsMode`
- `src/components/chat/chat-settings-modal.html` — settings UI
- `src/db/migrations/` — any migration for column consolidation
- `docs/frontend/chat/visual-novel-mode.md` — spec for missing fields
