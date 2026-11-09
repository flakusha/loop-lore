<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Quiet Hours / Do-Not-Disturb

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** Done
**Status Note:** 2026-11-09 reconcile: enforcement + config UI shipped on dev — `isInQuietHours`/`msUntilQuietHoursEnd` (`src/chat/proactive/timing.ts:30,71`), enforced in `src/chat/proactive/index.ts:109-114` and `src/chat/scheduled/dispatcher.ts:57-68`, columns `quiet_hours_start/end` (migration `001_init.ts:1925`), per-character config UI (`src/frontend/pages/characters-proactive.ts:41-46,60-61`) with tests. Landed-reality deltas: no 10PM-8AM default (null = no suppression); server-local time, not per-user timezone.
**Priority:** Low
**Effort:** Low
**Epic:** epic-frontend-notifications
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability
**Created:** 2026-08-14
**Source:** Platform research deep-dive (Nomi.ai)

## Description

Implement configurable quiet hours system to prevent assistant from proactively messaging during specified time windows. Inspired by Nomi.ai's 10PM-8AM default quiet hours.

## Requirements

1. **Configurable Time Windows**: user sets start/end time for quiet hours
2. **Default Quiet Hours**: 10PM-8AM local time (can be overridden)
3. **Per-Character Override**: different quiet hours per character
4. **Emergency Override**: urgent messages can bypass quiet hours (configurable)
5. **Timezone Awareness**: quiet hours respect user's local timezone

## Mapping

- **Platform Candidate**: Nomi.ai quiet hours
- **Epic**: Platform Research (#26)
- **Integration**: proactive messaging, notifications

## Acceptance Criteria

- [x] Quiet hours configurable per character
- [ ] Default 10PM-8AM applied if not configured — NOT SHIPPED (null disables); carry as refinement
- [x] Proactive messages suppressed during quiet hours
- [ ] Timezone-aware — NOT SHIPPED (server-local `getHours`); carry as refinement

## References

- Nomi.ai proactive messaging: https://nomi.ai/nomi-knowledge/proactive-messaging-when-your-nomi-messages-you-first/
