<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Proactive Messaging

**Status:** ✅ Done (backend + frontend 2026-08-16)
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

- [x] Assistant can proactively send messages when user is away
- [x] Frequency levels configurable per character
- [x] Quiet hours prevent messages during configured windows
- [x] Anti-spam brake prevents message flooding
- [~] Push notifications work on web/mobile — in-app notification via existing SSE + center; device push deferred (no push infra)

## Implementation Evidence (2026-08-16)

Backend service + CRUD routes already existed (dormant); this session wired the
end-to-end trigger path:

- **Send route** — `POST /api/proactive-messaging/send` (`src/routes/proactive-messaging/index.ts`):
  re-checks `checkShouldMessage`, anchors the proactive message in-thread to the last
  message, calls `triggerAutoGeneration` (reuses the tested generation pipeline), then
  `recordSent` + emits a `system` notification (surfaces via notification SSE/center).
  Returns 409 when not due (quiet hours / frequency / backoff).
- **Backoff route** — `POST /api/proactive-messaging/backoff` (increment).
- **Reset wiring** — `src/routes/messages/create.ts` resets backoff for every enabled
  proactive config in a chat when the user posts a message (user responded).
- **Save path** — `saveProactiveConfig` in `src/frontend/pages/characters-proactive.ts`
  persists the character-edit-form proactive section (frequency/enabled/quiet hours);
  wired into `saveCharacterEdit`.
- **Scheduler** — `src/frontend/alpine/chat-proactive.ts` (`chatProactive`): polls the
  `configs` + `check` endpoints on a 60s interval, sends the first due config once per
  tick (10s min between sends, in-flight guard). Started in `selectChat`, stopped in
  `destroy`.
- **Tests** — `src/routes/proactive-messaging/proactive-messaging.test.ts` (4: 409-no-config,
  backoff increment, send-due records + notifies, 409-not-due) + `src/frontend/alpine/chat-proactive.test.ts`
  (5: send-when-due, skip-not-due, skip-disabled, no-chat, in-flight guard).

## References

- Nomi.ai proactive messaging: https://nomi.ai/nomi-knowledge/proactive-messaging-when-your-nomi-messages-you-first/
- Kindroid Away Proactive: https://kindroid.ai/docs/article/memory/
