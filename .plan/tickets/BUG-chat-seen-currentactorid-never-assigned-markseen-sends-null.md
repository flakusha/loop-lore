<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: chat-seen-currentActorId-never-assigned-markSeen-sends-null

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

## Summary

Frontend \`markSeen\` POSTs \`actorId: this.currentActorId\` (always null) — root cause: field declared in ChatCoreState but never assigned anywhere. Trust boundary inverted: POST handler in src/routes/message-seen.ts reads actorId from client body instead of ctx.userId like the DELETE branch already does. Fix per investigation 2026-09-08 (Option A): derive actorId from requireActorFromSession on the server; drop currentActorId from ChatCoreState entirely. 1:1 user→actor mapping (idx_actors_user_id) makes userId ≡ actorId. Files: src/routes/message-seen.ts (POST handler), src/frontend/alpine/chat-seen.ts (drop actorId from body), src/frontend/alpine/chat-types/core.ts (drop unused field).

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
