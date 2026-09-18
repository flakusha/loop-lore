<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: FE-BE triage: verify-or-fix remaining harmony findings (personas PUT, story action, movement, plugins POST, review PUTs)

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

After 30→7 reduction, leftovers need per-finding verdicts: (a) FE PUT /api/personas (chat-settings/persona.ts:15) vs BE GET/POST only — FE missing :id or BE missing PUT? (b) FE POST /api/chats/:id/story/:action (story-controls.ts:56) — confirm no BE route exists; (c) FE GET /api/npc-movement/recent/:chatId (chat-movement.ts:17) vs BE /recent/:chatId exists — why still flagged (verify path compare); (d) FE POST /api/plugins (admin-models/plugins.ts:15) vs BE GET — check real mount; (e) FE PUT /api/admin/review/stats + PUT /api/nsfw/moderation/flags (admin-review.ts) vs BE GET/POST — check mounts. File follow-up BUGs for confirmed drift, fix scanner for false positives.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
