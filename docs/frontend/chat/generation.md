<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Chat: Generation, Streaming & Error Handling

This file covers: typing indicator, streaming behavior, generation status messages, thinking process logging during generation, and the 3-tier error handling system.

---

## Generation Status Display

When the LLM (or image generation) is running, the UI communicates progress. Two display modes, controlled by the same **message detail mode** setting (Immersion / Basic / Detailed):

### Mode: Immersion

- A minimal three-dot typing indicator pulses in a message slot on the character side
- No additional text or detail
- The slot is not yet a "message" — it's a placeholder that resolves into the final message or a failure state

### Mode: Basic

- A message slot placeholder appears on the character side with:
  - Three-dot typing indicator
  - Label: "[Character/Assistant name] is responding..."
  - If the LLM exposes a thinking/reasoning state: a "💭" indicator appears alongside, indicating chain-of-thought is in progress (but not showing the content)
- For image generation: label changes to "Generating image..."
- For narration/analysis: label changes to "Analyzing..." or "Narrating..."

### Mode: Detailed

- Same placeholder as Basic, PLUS:
- A collapsible log strip at the bottom of the placeholder, showing:
  - Which model is being called (e.g., "claude-sonnet-4")
  - Step tracking (e.g., "Thinking... → Generating... → Done")
  - Timing for each step
  - Token count as they stream in (if streaming is enabled)
- The log strip is collapsed by default; click to expand

---

## Streaming

v1 supports **non-streaming mode** (full response delivered at once) as the default. Streaming is optional and can be enabled in settings.

**Streaming behavior when enabled**:

- The message slot shows text appearing character by character or word by word
- The typing indicator animates while streaming
- The message slot is NOT scrollable during streaming — once the response is complete, the full rendered markdown replaces the streaming content
- Cancellation: if the user sends a new message while streaming, the current stream is aborted server-side and the placeholder is replaced with the new user's message
- Image/analysis generation does not stream — the placeholder shows progress, then the result appears at once

### Chat-Switch Guard During Generation

Prevents the common SillyTavern bug where switching chats mid-generation appends the response to the wrong conversation.

- Server records `generationChatId` at generation start
- If the user navigates to a different chat while generation is active, the response is still delivered to the **original** `generationChatId`
- The switched-to chat's message list and input remain fully functional and independent
- When the user returns to the original chat, they see a subtle indicator: "[Character] responded" above the new message
- Sending a message in the switched-to chat does NOT cancel the in-progress generation for the original chat — they are independent operations
- On generation completion, if the original chat is not currently visible, a notification badge appears on that chat's sidebar entry

---

## Thinking Process Logging (During Generation)

If the LLM exposes its thinking/reasoning process:

- **Immersion**: hidden entirely. Thinking may happen server-side but the user never sees it.
- **Basic**: a "💭" indicator on the placeholder. Once the response completes, the thinking is optionally available as a collapsed section on the final message (see [messages.md](./messages.md#thinking-process-display)).
- **Detailed**: a live-updating thinking log in the placeholder's expandable strip. Shows the thinking text as it's generated. After completion, the thinking remains available on the final message.

For multi-step generation (e.g., think → generate text → generate image → caption image):

- **Basic**: shows step labels as they complete: "Thinking... ✓ → Writing... ✓ → Generating image... ◌"
- **Detailed**: shows each step with timing and model info

---

## Error Handling (3-Tier)

Generation failures cover: LLM API failures (down, auth expired, rate limited), image generation failures (unsafe content filter, model crash), vision analysis failures (timeout, corrupted image), and any server-side processing error.

The user's **error feedback mode** (configurable in settings) controls how failures are surfaced. Three tiers:

| Mode          | What the user sees                                                                                                                                                                                                                                                 | Best for                            |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------- |
| 1 — Immersion | Nothing but a regenerate button. The failed message placeholder shows a small faded regenerate icon (cycle arrow). No error text, no technical detail. Hover makes it slightly more visible.                                                                       | Roleplay, demos, uninterrupted flow |
| 2 — Balanced  | A one-line failure message inside the bubble: "Generation failed — [short reason]" in italic with subtle red tint. Regenerate button below. Subtle "Details" link shows simplified cause (e.g., "API returned an error", "Request timed out", "Content filtered"). | Everyday use, most users            |
| 3 — Nerd      | Full expandable error panel. Collapsed: shows status code + provider. Expanded: HTTP status, provider name, model name, raw API error message, duration before failure, token count if relevant. "Copy error" button for bug reports.                              | Power users, debugging              |

**Visual behavior** (all modes):

- Failed generation occupies a **message slot** in the chat — NOT a floating toast
- The conversation timeline is preserved (the user sent a message, the AI failed — that gap is marked)
- Regenerate and error controls are physically in the chat, positioned where the response would have been

**Regenerate behavior** (identical across all modes):

- Clicking regenerate sends a new generation request for the same user message
- The failed slot is REPLACED by the new attempt (no stacking of failures)
- If the new generation also fails, the new error replaces the old one (still one slot)
- Swipe is not available on failed messages (nothing to swipe through)

**Retry-from-point behavior** (multi-step operations, see [Idempotent Retries](#idempotent-retries)):

- Clicks "Retry" on a failed multi-step operation resumes from the last successful step
- The generation slot shows reprocessing starting from the failed step
- If the operation was single-step, retry-from-point is identical to regenerate

**User message in a failed turn**: the user's message that triggered the failed generation remains visible as a normal bubble above the failed slot. It is NOT modified or highlighted. The user can edit their message and the next send will retry.

**Dismiss behavior**:

- Balanced and Nerd modes: a "Dismiss" button removes the failed message slot entirely, collapsing the gap in the timeline
- Immersion mode: no dismiss — just regenerate or leave it (there's nothing visible to dismiss)

### Continue Generation (Cut-off / Cancelled Messages)

**Continue** = resume a truncated, cancelled, or cut-off AI message from where it stopped. The partial content is preserved and the AI appends new content.

**When continue is available**:

- A message was cut off by the **token limit** and did not reach a natural stopping point
- A message was **cancelled mid-generation** by the user
- A message was **truncated client-side** due to display limits
- A message ended with an **incomplete sentence** (heuristic: no period/question mark/exclamation at end)

**Continue behavior**:

- The **original partial message remains in the timeline** — it is NOT replaced
- A "Continue" button appears on the partial/cancelled message (hover toolbar for finished-but-truncated messages; inline on cancelled placeholders)
- Clicking Continue sends a new generation request that receives:
  - The same prompt context as the original generation
  - **Plus** the partial content as a prefix (the AI sees it as already written)
  - A system instruction: "Continue the response naturally from where it left off. Do not repeat the existing content."
- The continued output appears as a **new child message** of the partial message, NOT a replacement
- The child message is visually connected: the partial message shows a subtle "↳ continued below" link, and the child shows "↳ continued from above"

**Visual indicators**:

| Mode      | Partial message                                               | Continued child                                                      |
| --------- | ------------------------------------------------------------- | -------------------------------------------------------------------- |
| Immersion | Faded "↳ Continue" button at bottom, no other detail          | Same as normal message, no decoration                                |
| Basic     | "(cut off)" label in meta line, "↳ Continue" button in footer | Small "continued from [time]" label in meta line                     |
| Detailed  | Token count with "(limit reached)" annotation, Continue link  | "Continued — {n} tokens" label, collapsible join context from parent |

**Cancelled mid-generation**:

- If the user cancels mid-stream, the partial content is saved as a placeholder message with status `cancelled`
- The placeholder shows whatever content streamed in before cancellation
- A "Continue" button is prominently displayed (not hidden in hover)
- The user can also "Regenerate" (discard partial content and start fresh) or "Continue" (append to partial content)

**Multi-continue**: the user can continue a message multiple times. Each continue creates a new child. This creates a chain: `Message A → Continue B → Continue C`. Each continuation node shows the "↳" connector.

### Idempotent Retries

A retry on a failed operation must not create duplicate resources (images, messages, captions) or orphaned partial state. The model differs by operation type:

**Text / caption generation** (deterministic: same input → same logical output):

- Idempotency key = SHA256 hash of `(chat_id, parent_message_id, operation_type, llm_model, generation_preset)`
- If a request with the same key completed successfully, the existing result is returned (no duplicate generation)
- If a request with the same key is in-flight, the duplicate is rejected with "409 Conflict — already generating"
- If a request with the same key failed, the new request replaces the failed slot (the previous partial state is discarded)
- The message slot model naturally prevents duplicates — there is exactly one slot per turn, and retry replaces it

**Image generation** (non-deterministic: same prompt → different image each time):

- Idempotency key = client-generated UUID per user-initiated attempt (not derived from the prompt)
- Retrying with the same UUID returns the already-generated image (no duplicate generation)
- Requesting a new image with the same prompt uses a new UUID → new generation
- Partial / failed image files are cleaned up server-side on retry (temporary file removed)
- The user always sees exactly one image slot per attempt — no orphaned images in the gallery

**Multi-step operations** (generate → caption → attach):

- Each step has its own idempotency key chained from the parent step's key
- If the pipeline fails at step 2 (caption), retrying resumes from step 2 — it does NOT re-generate the image
- If the pipeline fails at step 1 (generation), retrying restarts from step 1, and the partial image from the first attempt is cleaned up
- **Retry-from-point endpoint** (`POST /api/generation/retry`) receives `{ chatId, step?: number }`:
  - If `step` is specified, resume from that step index — completed steps are not re-executed
  - If `step` is omitted, retry from step 0 (full regenerate)
- The response includes a `resumeFromStep` field so the frontend knows which step to restart

**Continue generation idempotency**:

- Each "Continue" on a message creates a new generation attempt with its own idempotency key
- The idempotency key for a continue is derived from: `(sha256(original_message_id + "continue" + continuation_count))`
- This prevents duplicate continues if the request is retried (network issues)
- The `generation_attempts` table tracks the `parent_attempt_id` to link continuations to their source generation

**Server-side implementation**:

- A `generation_attempts` table tracks: `(idempotency_key, chat_id, status, created_at, result_reference, parent_attempt_id, step_index, total_steps)`
- Status values: `pending → processing → completed | failed | cancelled`
- Additional status for multi-step: `step_completed` — marks individual pipeline step completion within an attempt
- TTL: entries older than 1 hour are eligible for garbage collection
- On retry of a `failed` entry: status reset to `pending`, new processing starts, old partial results cleaned up. If `step_index > 0`, resume from that step without resetting earlier steps.

---

## Error Loading Messages (Non-generation errors)

For errors that occur when fetching existing messages (HTTP/network level):

- Inline banner at the top of the message list (does NOT replace the message area)
- Red-tinted background
- "Failed to load messages."
- Retry button (click triggers htmx re-fetch)
- If there were previously cached/loaded messages, they remain visible below the banner

---

## Loading State (Fetching Messages)

Three skeleton placeholder bubbles — two right-aligned (user), one left-aligned (character) — with shimmer animation. No text content in the skeletons. The sidebar and chat list load independently (separate htmx requests) so the user sees navigation immediately.
