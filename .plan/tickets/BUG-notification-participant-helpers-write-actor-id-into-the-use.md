<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Notification participant helpers write actor_id into the users foreign key

**Status:** Done
**Priority:** Medium
**Effort:** Medium
**Caveats:** authorization — the notification recipient is the actor's owning user id, never the actor id, since notifications.user_id references users(id); partial failure — a recipient whose insert fails is logged and skipped while the remaining recipients are still notified; idempotency — a mentioned AI character resolves to no recipient and is dropped from the fan-out, so the notified count is lower than the mention count and callers must not treat it as an error

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

**Resolved:** 2026-10-22 registry-driven close: git issue d807ef6 (registry tip: 1ee645c9e Konstantin Fedotov Auto-closed: appended .md marker marks BUG-NOTIFICATION-PARTICIPANT-HEL)
