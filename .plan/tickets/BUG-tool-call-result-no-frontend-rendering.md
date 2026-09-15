<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: LLM tool calls persist in `messages.tool_calls` (migration 037) but no `MessageContentType.ToolResult` exists and no frontend bubble renders them — tool calls appear as raw JSON text in chat

**Status:** [OK] Done
 **Severity:** medium
 **Priority:** medium
 **Effort:** medium
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

## Resolution

Closed by inline tool-result persistence in `executeToolCalls`
(`src/generation/generate-route/tool-execution.ts:201-203`, helper at
`src/generation/generate-route/tool-execution.ts:93-133`).

**Scope correction against the original ticket text:**

- `MessageContentType.ToolResult: "tool_result"` is **already** present at
  `src/db/enums-core/messages.ts:26`. No enum extension needed.
- `messages.content_type` is a free-text column with no CHECK constraint
  (see `src/db/migrations/parts/006_chat.ts:230` and surrounding columns).
  No migration is required — `tool_result` is accepted as-is.
- `messages.tool_call_id` is **not** a real schema column. The existing
  `tool_calls` JSON column on the assistant row (`006_chat.ts:257`) plus
  `metadata.tool_call_id` on the result row is the established linkage.

**What this commit actually does:**

1. Adds a private `persistToolResults(ctx, results)` helper inside
   `tool-execution.ts:93-133`. For each tool result it:
   - Encrypts content through the existing `encryptStoredContent` path
     (already used by `storeToolResultRows`).
   - Inserts a `messages` row with `content_type = ToolResult`,
     `metadata = JSON.stringify({ tool_call_id })`, and `parent_id = null`.
     The assistant message id is not known at this point in the generation
     loop; correlation is preserved through `metadata.tool_call_id`.
2. Calls the helper from `executeToolCalls` after the per-call loop
   (`tool-execution.ts:201-203`) when `ctx?.db` exposes `insertInto` —
   defensive guard preserves the legacy mock-ctx behavior in existing tests.
   Failure paths (handler throws, registry miss, argument-shape mismatch)
   all leave a `tool_result` row so the chat history never silently loses a
   tool invocation.
3. Removes the now-redundant post-loop `storeToolResultRows` batched
   persist from `src/generation/generate-route/non-stream.ts:154` and
   `src/generation/generate-route/stream-to-client.ts:204`. Inline writes
   cover the same surface; the FK back to the assistant message is replaced
   by `metadata.tool_call_id` correlation. The previous batched path
   required the assistant row to land first; the inline path is symmetric
   across rounds and removes that ordering coupling.
4. Updates `stream-to-client.coverage.test.ts:359-364` — the mock counter
   for `storeToolResultRows` now stays at zero because the inline path in
   the (mocked) `executeToolCalls` does the work.

**Acceptance — new tests in `tool-execution.test.ts:213-388`:**

- "persists one tool_result row per call linked via metadata.tool_call_id"
  — happy-path insert; verifies row count, `parent_id IS NULL`, and
  `metadata.tool_call_id` matches the assistant `tool_calls.id`.
- "persists a row with error content when the handler throws" — defensive:
  the handler throwing must still produce a chat-visible record.
- "persists a row when the tool is not in the registry" — defensive: the
  unknown-tool error path must also leave a row.
- "skips persist when ctx.db is absent; in-memory return unchanged" —
  preserves the legacy pure-function contract for callers without a DB
  context (no throw, in-memory `GenerationMessage[]` returned as before).

All 12 tests in `tool-execution.test.ts` pass locally.
All 11 tests in `persist.test.ts` (existing `storeToolResultRows` unit
tests) continue to pass — the function is unchanged on `dev`.
