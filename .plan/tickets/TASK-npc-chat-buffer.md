<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Npc Chat Buffer

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Summary:** Chat cooldown + buffer management over `actor_chat_buffers` (migration 011, shipped): per-partner cooldown, max consecutive chats before forced break, topic-repetition break detection.

**Context:** Buffer rows exist; `enforceChatBuffer` runs in `src/services/agency/bdi-nightly.ts`. Remaining work is the live enforcement gate consulted before autonomous initiation (used by `TASK-npc-social-conversation.md`).

**Acceptance Criteria:**

- [ ] Live gate denies initiation during cooldown / after max consecutive (test).
- [ ] Limits vary by autonomy preference (loner stricter than social).
- [ ] `bun run check` green.
