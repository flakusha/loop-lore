<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Assistant Personality Continuity Across Chats

**Status:** ⬜ Not Started
**Priority:** low
**Effort:** Medium
**Epic:** epic-character-multi-personality
**Tags:** assistant, personality, continuity

**Summary:**
Per-user default assistant personality that persists across new chats unless explicitly overridden.

**Context:**
Most users will pick one personality and stick with it; only power users override per chat. Persist the choice per user_id with optional chat_id override (per-chat wins).

**Acceptance Criteria:**
- New table `user_assistant_personality(user_id, default_source_json, last_updated_at)`.
- Read fallback chain: `chat -> user default -> server default`.
- Reset-to-default command (clears user default).
- Same composer integration as the per-chat ticket.
- Tests: new chat inherits default; per-chat override beats default; reset works.
