<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: advertised /sfx /music /video commands are stubs

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Small

## Summary

src/assistant/commands/sfx.ts:25 (TODO audio provider), music.ts:41-44, video.ts:23-26 return 'queued'+action, but src/frontend/alpine/chat-actions/dispatch.ts:35-43 toasts 'not implemented' for all three; commands stay advertised via GET /api/commands. Fix: implement or de-advertise + remove dead mock src/assistant/sd.ts:77 (no production callers).

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
