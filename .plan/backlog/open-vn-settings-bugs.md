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

1. `visualNovel` type consistent across API and DB layers — Boolean is the accepted type for the API contract; `gm_config.visualNovel` (JSON column) is the universal state / single source of truth. The legacy `chats.visual_novel` integer column should be eliminated, not converted (see #5)
2. `visualNovel` removed from `KEY_MECHANIC_PARAMS` (`src/chat/service/access.ts:19`) — every new chat may choose VN mode at any time; no hardlocking server-side. Per-chat toggle, not a key mechanic that locks post-confirmation
3. `saveChatSettings()` sends `gmConfig` for online chats — `src/frontend/alpine/chat-settings.ts` must drop the `!this._chatOnline` guard on gmConfig dispatch
4. `checkChatAccess()` requires Master/GM role for settings changes per `chat-privacy.md` — any participant can read, only Master/GM can modify `gmConfig`, `mode`, `visualNovel`, `turnStrategy`
5. **Unification required — single source of truth is mandatory**: `chats.visual_novel` column eliminated; `gm_config.visualNovel` is the sole source. Backend reads and writes must go through `gm_config` via the prompt assembler / VN renderer. A one-time data migration syncs any existing `visual_novel=1` → `gm_config.visualNovel: true`
6. Missing VN fields added to `GmSettingsFields` (`src/frontend/alpine/chat-settings/gm-config.ts`) + DB schema + frontend state: `imageScaling`, `autoAdvanceDelay`, `dialogueBoxOpacity`, `portraitSize`, `splitRatio`

## Files

### Backend endpoints
- `src/validation/schemas.ts` — API schema (ChatUpdateBody, GmConfig) — update ChatUpdateBody to validate `visualNovel` as Boolean; extend GmConfig schema with 5 new VN fields
- `src/validation/db-schemas.ts` — DB schema — remove `visual_novel` column from generated schema; add VN fields to gm_config JSON schema
- `src/chat/service/access.ts` — `KEY_MECHANIC_PARAMS` (remove `visualNovel`), `checkChatAccess` (add Master/GM role gate for settings changes)
- `src/routes/chats.ts` — `PUT /api/v1/chats/:id` route — `saveChatSettings` backend handler must accept `gmConfig` from online chats (drop the `!_chatOnline` guard on the frontend that prevents it)
- `src/db/migrations/` — migration to drop `chats.visual_novel` column + one-time data migration syncing `visual_novel=1` → `gm_config.visualNovel: true`

### Frontend implementation (required alongside backend endpoints)
- `src/frontend/alpine/chat-settings/gm-config.ts` — `GmSettingsFields` interface: add `imageScaling`, `autoAdvanceDelay`, `dialogueBoxOpacity`, `portraitSize`, `splitRatio`; default values per spec
- `src/frontend/alpine/chat-settings.ts` — `saveChatSettings()`: remove `!_chatOnline` guard on gmConfig dispatch; `_chatSettingsMode` defaults to `"story"`; load fallback `?? "story"`
- `src/frontend/alpine/chat-settings.ts` — `openChatSettings()`: load `gm_config.vnSettings` for the 5 new fields from `gmConfig`; emit only backend-valid values
- `src/frontend/alpine/chat.ts` — VN renderer: read per-chat `gm_config.visualNovel` to activate VN scene renderer; remove reliance on `_currentEmotionAvatar` mood-driven global swap
- `src/components/chat/chat-settings-modal.html` — add 5 new VN field inputs (`imageScaling` select, `autoAdvanceDelay` slider, `dialogueBoxOpacity` slider, `portraitSize` select, `splitRatio` slider); add Master/GM-only UI guard for settings changes
- `src/frontend/alpine/chat-messages.ts` — per-message avatar resolution: read `message.emotion` → resolve emotion-tagged avatar variant from actor's avatar set (see `epic-emotion-avatar-message-binding.md`)

### Shared prompt/render pipeline
- `src/assistant/prompt/assembler/prompt-assembler.ts` — read `gm_config.visualNovel` (not `chats.visual_novel`) to activate VN mode in prompt assembly
- `src/frontend/vn/` — VN scene renderer (already shipped) — reads from `gm_config` for all VN field values

### Spec reference
- `docs/frontend/chat/visual-novel-mode.md` — spec for missing fields + VN settings UI
- `docs/frontend/chat/chat-privacy.md` — Master/GM role requirement for settings changes
