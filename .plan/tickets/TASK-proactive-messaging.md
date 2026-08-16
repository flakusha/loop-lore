<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Proactive Messaging

**Status:** Not Started
**Priority:** Medium
**Effort:** Medium
**Created:** 2026-08-14
**Source:** Platform research deep-dive (Nomi.ai, Kindroid)

## Description

Implement proactive messaging system where the assistant can message the user proactively based on context, not just respond to prompts. Inspired by Nomi.ai's 4-frequency-level system and Kindroid's Away Proactive feature.

## Requirements

1. **Frequency Levels**: configurable how often assistant proactively messages (Very Frequent ~1hr, Frequent ~3hr, Normal ~1/day, Infrequent ~4 days)
2. **Context-Aware**: assistant decides when to message based on conversation context, not just timers
3. **Anti-Spam Brake**: exponential backoff if user doesn't respond (double wait time each message)
4. **Quiet Hours**: configurable do-not-disturb windows (default 10PM-8AM)
5. **Per-Character Customization**: different proactive settings per character
6. **Push Notifications**: notify user when assistant messages (device-specific)

## Mapping

- **Platform Candidate**: E8 (Proactive/ambient memory injection)
- **Epic**: Platform Research (#20)
- **Integration**: notifications epic, assistant system, group-chat

## Acceptance Criteria

- [ ] Assistant can proactively send messages when user is away
- [ ] Frequency levels configurable per character
- [ ] Quiet hours prevent messages during configured windows
- [ ] Anti-spam brake prevents message flooding
- [ ] Push notifications work on web/mobile

## References

- Nomi.ai proactive messaging: https://nomi.ai/nomi-knowledge/proactive-messaging-when-your-nomi-messages-you-first/
- Kindroid Away Proactive: https://kindroid.ai/docs/article/memory/
