<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: Notification participant helpers write actor_id into the users foreign key

**Status:** Not Started
**Priority:** Medium
**Effort:** Medium

**Summary:**

participantActorIds and worldParticipantActorIds return raw chat_participants.actor_id values with no actor_type filter, and the callers pass them straight into notification creation as userId. When the participant is a character rather than a user, the insert violates notifications.user_id REFERENCES users.id and the notification is never created.

Evidence read on dev:

- src/notifications/service/triggers.ts:13-21 — participantActorIds selects actor_id with no actor_type predicate.
- src/notifications/service/triggers.ts:27-36 — worldParticipantActorIds, same shape.
- src/notifications/service/triggers.ts:121 and :145 — both id lists feed svc.create({ userId: ... }).

Fix: filter to user-type actors (or resolve actor_id to its owning user_id) before building the notification audience.

Source: .tmp/longcat/review-misc-services.md M2.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
