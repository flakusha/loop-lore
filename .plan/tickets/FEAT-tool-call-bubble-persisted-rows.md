<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# FEAT: Persisted tool-call bubble for ToolCall/ToolResult rows

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-assistant-gm-flows, epic-chat-lifecycle-moderation

## Summary

Backend persistence half is done (BUG-tool-call-result-no-frontend-rendering,
closed 2026-09-15): `executeToolCalls` writes one `messages` row per tool
result with `content_type = ToolResult` + `metadata.tool_call_id` linkage.
Live streaming already renders tool calls via the SSE path
(`src/frontend/alpine/chat-panels.ts`, `chat-generations.ts`). What is missing:
a dedicated bubble for *persisted* rows when chat history reloads — no
`<tool-call-bubble>` component and no `MessageContentType` dispatch in the
chat-render partial exist.

## Scope

1. `<tool-call-bubble>` Alpine component: tool name header
   (`icon + create_character`), args JSON in collapsed `<details>`, inline
   success/error result.
2. Dispatch on `MessageContentType` in `views/chat-render.ts` (or equivalent
   chat-bubble partial) to render the component for `ToolCall`/`ToolResult`.
3. Tests: tool-call bubble snapshot; ToolResult error row renders status
   indicator; existing chat rendering unchanged.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
