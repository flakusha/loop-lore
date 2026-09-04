<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: gm-guidance route uses broad checkChatAccess, allows non-owner to steer story

**Status:** ✅ Resolved (4835dcaf, 2026-09-04)
**Priority:** medium
**Effort:** Medium

## Summary

PUT /api/v1/chats/:id/gm-guidance gates on checkChatAccess (any participant) but updateGmGuidance patches gm_config.storyMode/gmGuidance — GM narrative steering that should be restricted to creator/owner/admin like other settings. Inconsistent with checkChatSettingsAccess applied to the sibling migrate/update/rename routes in e14d3aaa. Fix: use checkChatSettingsAccess in gm-guidance.ts route.

## Resolution

Fixed by `4835dcaf`. `gmGuidanceRoutes` now gates on `checkChatSettingsAccess` (admin / creator / `role_in_chat = "owner"`) instead of the broad `checkChatAccess`, matching the sibling `manage.ts` migrate/update/rename routes. Import updated accordingly.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
