<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Dynamic Memory Writes via Tool-Call

**Status:** ✅ Complete (23ed39fc, 2026-08-16)
**Priority:** medium
**Effort:** Medium

## Summary

0.1.0 Quick Win item 2 (matrix gap G23, RisuAI dynamic-memory inspiration). Assistant emits durable memory note mid-response via tool call. Build on: tool-call SSE (messages.tool_calls, migration 037), memorySection (1024-token), cross-chat memory (shipped). Scope: (a) tool definition + handler writing actor memory rows (memories/actor_memories) with source_chat_id; (b) tool-call UX surfaces in existing collapsible blocks; (c) tests for handler + persistence. Depends on memory selection UI (item 5, shipped) for UX. Effort Med.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
