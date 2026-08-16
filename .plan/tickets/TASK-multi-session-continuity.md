<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Cross-Session Continuity & Session Replay

**Priority:** Medium
**Status:** ⬜ Not Started
**Epic:** epic-multi-session
**Tags:** multi-session, continuity, replay, persistence

## Description

Add cross-session continuity and session replay mechanics to the Multi-Session Support epic — characters carry forward state between sessions, and players can replay past sessions. Extends the multi-session system with persistence and recall features.

## How It Extends Existing Work

Builds on the Multi-Session Support epic's session management and character state. Adds cross-session continuity and replay capabilities on top of the existing session infrastructure.

## Acceptance Criteria

- [ ] Cross-session character state carryforward (inventory, relationships, world state)
- [ ] Session replay — watch a past session's chat as a replay
- [ ] Session bookmarks — mark important moments during a session
- [ ] Session summary auto-generation (key events, decisions, outcomes)
- [ ] Cross-character continuity (same character across different worlds/sessions)
- [ ] `GET /api/sessions/:id/replay` route
- [ ] `GET /api/sessions/:id/bookmarks` route
- [ ] Frontend session replay player with timeline
- [ ] Frontend session summary view
- [ ] Frontend bookmark manager

## Technical Notes

- Session replay uses existing chat message storage with timestamp-based scrubbing
- Session summaries generated via LLM extraction of key events
- Cross-session state uses the existing persistence layer (Epic: World Persistence & Sync)
- Bookmarks store message IDs and annotations, not full copies
