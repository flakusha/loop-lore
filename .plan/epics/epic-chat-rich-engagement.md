<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Chat Rich Engagement (draft for new worktree)

**Effort:** Medium
**Type:** epic
**Overview:** (see sections below)


**Status:** Proposed
**Priority:** Medium — messenger/AI parity gap
**Tags:** chat, polls, link-preview, voice-notes, ai-utilities

## Why

Polls, link unfurl, and voice notes all grep-clean (zero implementation).
AI message utilities (summarize/translate/explain) are spec'd P2 in
`docs/frontend/chat/message-actions.md` but translate never calls the LLM
(BUG-assistant-improve-translate-rewrite-never-call-llm). No overlap with
active worktrees or existing TASK-chat-feature-* (closest is
TASK-chat-feature-chat-artifacts / scene-art-generation — media creation,
not message engagement).

## Scope

- Native polls/votes in-chat (single/multi, close, RPG party-vote reuse).
- Generic link previews (OpenGraph unfurl; music-links stays specialized).
- Voice notes (record/upload/playback; reuse asset pipeline).
- AI utilities on selection: translate / summarize / explain (LLM-wired).

## Non-goals

- Scene-art generation, artifacts system (existing tickets).
- TTS/STT provider work (epic-audio-video-sound).
- Group-chat turn orchestration (TASK-group-chat-turn-orchestration).

## Tickets

- TASK-message-polls-votes.md
- TASK-link-previews-unfurl.md
- TASK-voice-notes-playback.md
- TASK-ai-message-utilities.md

## Anchors

- `src/db/migrations/parts/006_chat.ts` — message_reactions pattern for polls.
- `src/chat/music-links/url.ts` — URL extraction pattern (do not generalize it).
- `src/assets/` — voice-note storage seam.
- `src/assistant/` + `src/aux-pipeline/` — AI utility LLM seam.
- `docs/frontend/chat/message-actions.md` — P2 action contract.

## Acceptance

- Poll vote round-trip without full re-render; preview cached, XSS-safe;
  voice note plays inline; translate/summarize hit LLM (no stub).
