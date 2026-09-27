<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: music links panel stale after in-page chat switch

**Status:** Not Started
**Priority:** medium
**Effort:** Medium

**Summary:** world.ts _selectChatInner (src/frontend/alpine/chat/world.ts:83+) dismisses sibling panels (showChatList/showGallery/showCharacterInfo) and resets per-chat state but not showMusicLinksPanel/_musicLinks; loadMusicLinks only runs on toggle, so after switching chats the panel shows chat A links while activeChat is B; Add posts to B while list shows A; Delete removes wrong context rows. Fix: dismiss/reset the panel (and reload if open) in _selectChatInner alongside sibling panels. Verify: open panel on chat A, switch to chat B in-page, observe stale list.
**Context:** Found 2026-09-26 during orchestrated strict review of dev commits 2026-09-19..26; finding verified directly in code before filing.
**Acceptance Criteria:**
- [ ] Implementation complete
- [ ] Tests passing
- [ ] Verification command from ticket executed green
