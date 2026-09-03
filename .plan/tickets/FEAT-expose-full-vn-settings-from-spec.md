<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# FEAT: Expose full VN settings from spec

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

The visual-novel-mode.md and docs/frontend/chat/visual-novel-mode.md spec defines more VN settings fields than currently persisted in gm_config: imageScaling, autoAdvanceDelay, dialogueBoxOpacity, portraitSize, splitRatio. The GmSettingsFields interface (src/frontend/alpine/chat-settings/gm-config.ts) only has vnLayout, vnTypewriter, vnTransition, vnAutoAdvance. Need to add the missing fields to the schema, gm_config, and frontend state.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
