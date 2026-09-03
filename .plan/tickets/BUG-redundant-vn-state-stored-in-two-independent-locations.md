<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Redundant VN state stored in two independent locations

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

VN state is stored in two places with no synchronization guarantee: chats.visual_novel (integer 0/1, set via visualNovel param in updateChat:131) and chats.gm_config.visualNovel (Boolean, set via gmConfig JSON). When the frontend saves settings it only updates gm_config but never syncs visual_novel, and vice versa. These can diverge silently.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
