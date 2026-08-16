<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Quiet Hours / Do-Not-Disturb

**Status:** Not Started
**Priority:** Low
**Effort:** Low
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

- [ ] Quiet hours configurable per character
- [ ] Default 10PM-8AM applied if not configured
- [ ] Proactive messages suppressed during quiet hours
- [ ] Timezone-aware

## References

- Nomi.ai proactive messaging: https://nomi.ai/nomi-knowledge/proactive-messaging-when-your-nomi-messages-you-first/
