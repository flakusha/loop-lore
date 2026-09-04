<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: gm-guidance route uses broad checkChatAccess, allows non-owner to steer story

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

PUT /api/v1/chats/:id/gm-guidance gates on checkChatAccess (any participant) but updateGmGuidance patches gm_config.storyMode/gmGuidance — GM narrative steering that should be restricted to creator/owner/admin like other settings. Inconsistent with checkChatSettingsAccess applied to the sibling migrate/update/rename routes in e14d3aaa. Fix: use checkChatSettingsAccess in gm-guidance.ts route.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
