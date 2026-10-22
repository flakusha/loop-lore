<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Quest update notifications ignore the muted world scope

**Status:** Done
**Status Note:** `notifyQuestUpdate` now passes the top-level `worldId` to `NotificationService.create`, so the muted-world filter in `src/notifications/service/crud.ts` applies to quest_update notifications.
**Priority:** medium
**Effort:** Medium
**Caveats:** stale state — the mute list is read when the notification is created, so a world muted after the notification row exists is not retroactively suppressed; observability — a notification suppressed by the mute returns early without a log line, so it is indistinguishable from a delivered one

**Summary:**

notifyQuestUpdate created the quest_update notification without the top-level world scope, so a user who muted a world still received quest_update notifications for it.

Location: src/notifications/service/triggers.ts, notifyQuestUpdate - the create call passed no worldId, so the muted-world filter in src/notifications/service/crud.ts never matched.

Evidence: the create call passed only type, title, link and data; the world id existed on opts but was copied into data alone. src/notifications/service/crud.ts reads the scope from the top-level worldId field of the create input, so a muted world still produced a quest_update notification.

Impact: the muted-world preference was ignored for quest updates, so notifications the user explicitly silenced were still delivered.

Fix: notifyQuestUpdate now passes the top-level worldId to the create call, so the existing muted-world filter applies.

Fixed by: bugfix-small-batch

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated
