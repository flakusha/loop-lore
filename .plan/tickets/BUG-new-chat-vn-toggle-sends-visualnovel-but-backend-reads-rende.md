<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: New-chat VN toggle sends visualNovel but backend reads renderingOverride

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

collectNewChatPayload sends fineTunePayload.visualNovel (boolean), but ChatCreateBody no longer has a visualNovel field — it was replaced by renderingOverride. The #chat-visual-novel checkbox toggle is now dead: toggling it has no effect on chat rendering. Fix: map checkbox to renderingOverride: checked ? 'visual_novel' : null in submit.ts.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
