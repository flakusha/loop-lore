<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: LLM tool calls persist in `messages.tool_calls` (migration 037) but no `MessageContentType.ToolResult` exists and no frontend bubble renders them — tool calls appear as raw JSON text in chat

**Status:** Not Started
**Severity:** medium
**Priority:** medium
**Effort:** medium
**Type:** BUG
**Epic:** epic-assistant-gm-flows, epic-chat-lifecycle-moderation
**Files:** src/db/enums-core/messages.ts:18-26 (MessageContentType enum); src/db/migrations/037_message_tool_calls.ts; src/views/chat-render.ts (or equivalent); src/frontend/alpine/chat-bubble.ts

## Issue

`messages.tool_calls` JSON column was added in migration 037 to record assistant tool calls. But:

1. `MessageContentType` enum (`src/db/enums-core/messages.ts:18-26`) has `{Text, Action, Narration, ...}` but **no `ToolResult` member**. The schema can't represent "this message is a tool result" — every tool-result message is shoehorned into `Text` (or `Action`).
2. grep across `src/frontend/` returns no matches for `tool_call_id`, `role: "tool"`, or `toolMessage` — the frontend chat bubble has no special rendering for tool calls. Tool calls appear either as raw JSON dump or get silently dropped.

Result: when an LLM uses tools (`createCharacterTool`, `writeMemoryNoteTool`, etc.), the chat history shows nothing distinguishable from regular AI text. Users see "I've created a new character" but not the structured tool invocation. For failed tools, the error is buried in plain text.

## Why it matters

UX / observability. Tool calling is a primary UX surface for the assistant (per `epic-assistant-gm-flows.md`, `epic-assistant-generation-extensions.md`). Without proper rendering:
- Users can't distinguish "the AI said it created a character" from "the AI used the createCharacterTool and got result X".
- Tool errors appear as ordinary text — debugging is hard.
- The structured `tool_calls` JSON column is dead data — written on assistant generation, never read.

## Evidence

- `src/db/enums-core/messages.ts:18-26` — `MessageContentType` lacks `ToolResult`/`ToolCall` variant.
- `src/db/migrations/037_message_tool_calls.ts` — `messages.tool_calls` column added.
- grep `tool_call_id|role: ['"]tool['"]` in `src/frontend/` — no matches.

## Concrete fix

1. Extend `MessageContentType` enum: `ToolCall: "tool_call"`, `ToolResult: "tool_result"`. Add a migration to widen the CHECK constraint if needed.
2. Update `executeToolCalls` (`src/generation/generate-route/tool-execution.ts:56-93`) — for each `tool_call_id`, when the handler returns, write a separate `messages` row with `MessageContentType = ToolResult` and `tool_call_id` linked back to the assistant's tool-call row.
3. Frontend: add a `<tool-call-bubble>` Alpine component that:
   - Renders the tool name as a header (`icon + "create_character"`).
   - Collapses the args JSON into a `<details>` block by default.
   - Shows the tool result (success or error) inline.
4. Update `views/chat-render.ts` (or the equivalent chat-bubble partial) to dispatch on `MessageContentType` and render the right component.
5. Tests:
   - LLM emits a tool call → row with `MessageContentType = ToolCall` is created with `tool_calls` populated.
   - Tool handler runs → row with `MessageContentType = ToolResult` is created linked by `tool_call_id`.
   - Frontend renders the tool-call bubble when given `MessageContentType = ToolCall`.
   - Failed tool call (handler throws) → ToolResult row has `error` content + status indicator.

## Tests

- `bun test src/generation/generate-route/tool-execution.test.ts` — verify two messages written per round.
- `bun test src/db/enums-core/messages.test.ts` — extend with `ToolCall`/`ToolResult` cases.
- Frontend snapshot test for the tool-call bubble component.

## Related

- `BUG-tool-call-arg-parse-silent-fallback` (sibling — tool-call input handling).
- `TASK-tool-call-user-text-sanitization` (sibling).
- `epic-assistant-gm-flows.md`, `epic-chat-lifecycle-moderation.md`.

## Notes

PROGRESS 2026-09-08: frontend half landed (message-list.html renders msg.tool_calls as collapsible blocks; chat-panels.ts surfaces calls). Remaining backend half (MessageContentType ToolCall/ToolResult enum + ToolResult message rows in executeToolCalls) requires a migration — pending user's append-vs-fold migration strategy decision per AGENTS.md.
