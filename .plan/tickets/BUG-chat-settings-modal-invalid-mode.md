# BUG: Chat Settings Modal Sends Invalid Mode Values

**Status**: done
**Priority**: high
**Labels**: chat, bug, mode, validation
**Assignee**:
**Epic**: epic-story-mode-ui
**Related**: IDEA-chat-setup-templates

### Description

`src/components/chat/chat-settings-modal.html` emitted invalid Mode `<option>` values
(`value="chat"`, `value="roleplay"`) and `src/frontend/alpine/chat-settings.ts` defaulted
`_chatSettingsMode` to `"chat"`. Backend `ChatUpdateBody.mode` (`src/validation/schemas.ts:171`)
only accepts `direct|group|story`, so saving chat settings sent an invalid value → Elysia
validation reject / silent data corruption.

Originally flagged as a live bug in `.plan/design/chat-mode-reconciliation.md:32`.

### Root Cause

UI mode options were literal English labels (`Chat` / `Roleplay`) mismatched from the
backend enum. The state default (`"chat"`) and load fallback (`?? "chat"`) were never valid
DB values.

### Fix (2026-08-01)

- `src/components/chat/chat-settings-modal.html`: options → `value="direct"` / `value="group"`
  / `value="story"`.
- `src/frontend/alpine/chat-settings.ts`:
  - `_chatSettingsMode` default `"chat"` → `"story"`.
  - `openChatSettings` load fallback `?? "chat"` → `?? "story"`.

Verified: `bun run typecheck` exit 0. Grep confirmed no other invalid-mode emit site
(`admin.html` `value="chat"` are unrelated admin user-role options; `new-chat.html` already
emits valid values).

### Acceptance Criteria

- [x] Settings modal emits only backend-valid `mode` values
- [x] Default + load fallback are valid (`story`)
- [x] Typecheck passes

### Notes

- Deliberately left as the minimal fix (backend-valid `direct|group|story` set).
- The 3-axis split (`ChatType` / `ChatMode` including `battle|question|inventory` /
  `ResponseStyle`) from `chat-mode-reconciliation.md` is a separate schema+migration task,
  not covered by this minimal fix. Battle mode switch is separately tracked in
  `TASK-chat-battle-mode-switch.md`.
- Settings modal remains hardcoded English (consistent with the rest of the file); dead
  locale keys `modeChat`/`modeRoleplay` are pre-existing orphanage, not introduced here.
