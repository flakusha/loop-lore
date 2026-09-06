<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# FEAT: Expose full VN settings from spec

**Status:** ✅ Resolved (already on dev, 2026-09-06)
**Priority:** medium
**Effort:** Medium

## Summary

The visual-novel-mode.md and docs/frontend/chat/visual-novel-mode.md spec defines more VN settings fields than currently persisted in gm_config: imageScaling, autoAdvanceDelay, dialogueBoxOpacity, portraitSize, splitRatio. The GmSettingsFields interface (src/frontend/alpine/chat-settings/gm-config.ts) only has vnLayout, vnTypewriter, vnTransition, vnAutoAdvance. Need to add the missing fields to the schema, gm_config, and frontend state.

## Resolution

Already fixed in dev (commit `a16490a7`, VN cycle 3). Verified 2026-09-06 against current `dev` (`06127fe5`):

- `src/frontend/alpine/chat-settings/gm-config.ts:26-30` — `GmSettingsFields` carries all 5 fields (`imageScaling`, `autoAdvanceDelay`, `dialogueBoxOpacity`, `portraitSize`, `splitRatio`)
- `src/frontend/alpine/chat-settings/gm-config.ts:59-63` — defaults wired (`"auto"`, `5`, `0.75`, `35`, `40`)
- `src/frontend/alpine/chat-settings/gm-config.ts:93` — `renderingOverride` persisted from `vnEnabled`
- Cross-references: umbrella `TASK-validate-and-fix-fe-be-db-gaps-for-chat-vn-settings.md` is also ✅ Resolved.

No code change required.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
