<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Mid-cascade pause toggle does not abort the in-flight LLM call or stop the chain promptly

**Status:** Not Started
**Severity:** high
**Priority:** high
**Effort:** medium
**Type:** BUG
**Epic:** epic-chat-lifecycle-moderation
**Files:** src/generation/auto-gen/group-cascade.ts:113-119; src/generation/auto-gen/post-store.ts:192-211

## Issue

`triggerGroupCascade` reads `chat.story_state` once at the top and bails if paused. Then it calls `d.triggerAutoGeneration` (via `post-store.ts:197`) which runs to completion, then triggers the next cascade depth.

If the user pauses the chat between depth-1 and depth-2 (during the second LLM call), the chain only checks the paused flag once — at the entry of the **next** cascade call, not inside the running call. The currently-running LLM generation runs to completion, then the next cascade call re-checks and stops.

Two issues:

1. No abort signal threaded through to interrupt an in-flight LLM call when pause is toggled. The generation completes (cost incurred, tokens burned) even though the user has signaled stop.
2. `post-store.ts:207-209` swallows the cascade error silently with an empty catch — a pause-toggled-during-cascade that throws aborts unobservably (no log entry, no telemetry).

## Why it matters

UX / cost. Pause is a user-visible emergency stop; it doesn't actually stop the chain promptly. A user who pauses to fix a typo or cancel a runaway cascade still pays for the in-flight generation. Failed cascades leave no audit trail.

## Evidence

- `src/generation/auto-gen/group-cascade.ts:113-119` — pause check is the entry guard only; no signal passing.
- `src/generation/auto-gen/post-store.ts:192-211` — `try { await triggerGroupCascade(...); } catch { /* silent */ }` (verified via scout output).
- `src/generation/cancellation-manager.ts` — `startGenerationTracking` returns `{ abortSignal }`, but `triggerGroupCascade` does not consume it.

## Concrete fix

1. Thread the chat's cancellation signal (`startGenerationTracking`'s `abortSignal`) through `triggerGroupCascade` → `triggerAutoGeneration` so a pause-toggled abort signal propagates.
2. Re-check `isPaused` (from `chat.story_state`) **after** each `triggerAutoGeneration` returns, before scheduling the next cascade depth.
3. In `post-store.ts:207`, replace the empty catch with `log.warn("cascade generation failed", { error: err.message, chatId, depth });` and emit a telemetry event (`cascade.failed`).
4. Test: pause toggled mid-cascade → next cascade call returns without triggering generation; in-flight generation receives the abort signal and exits early.

## Tests

- `bun test src/generation/auto-gen-cascade.test.ts` — start cascade, toggle pause before second LLM call, verify the abort signal fires and only 1 AI message is stored.
- Audit-log assertion: failed cascades produce a `log.warn` entry.

## Related

- `BUG-group-cascade-max-turns-off-by-one` (same module).
- `epic-chat-lifecycle-moderation.md`.
