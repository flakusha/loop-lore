<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-matrix-cross-mech-g23: Dynamic memory writes — assistant mid-response memory notes (multi-message)

**Status:** Not Started
**Priority:** low
**Effort:** Small
**Type:** Task
**Summary:** Extend the shipped tool-call SSE so assistants can write durable in-chat memory notes mid-response (multi-message writes allowed, ordered). 0.1.0 quick-win candidate per the matrix.
**Context:** `matrix-cross-mech.md` G23 is 🟢 Low and an explicit 0.1.0 quick-win. Inspiration: RisuAI dynamic-messages. The matrix says "extend the shipped tool-call SSE toward durable in-chat memory writes — 0.1.0 quick-win candidate." Touches CharCore, Memory, Narrative.

## Current state

- Tool-call SSE exists for assistant actions.
- Memory writes happen via the post-response persistence path, not mid-response.
- No way for an assistant turn to leave a memory note for a later turn within the same conversation (vs across conversations).

**Acceptance Criteria:**

- [ ] New SSE event kind `memory.write` emitted by the assistant, handled by the memory service.
- [ ] Multi-message writes allowed in a single turn; ordered; idempotent on `(chat_id, sequence_no)`.
- [ ] CharCore (character profile deltas), Memory (general notes), Narrative (beat markers) all share the same write path with a `kind` discriminator.
- [ ] Tests in `src/memory/dynamic-writes.test.ts` cover ordering, idempotency, and the three kinds.
- [ ] `bun run check` green.

**Tags:** memory, dynamic, mid-response, sse, 0.1.0-quick-win, low-severity
**Related:** src/memory/, src/chat/service/, src/sse/, .plan/matrix-cross-mechanics.md (G23 row), epic-character-core.md

git issue: bc6beae
