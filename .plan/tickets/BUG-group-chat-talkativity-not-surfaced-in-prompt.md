<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: talkativity selection-rate is consumed by TurnManager but never surfaced to the LLM as group-chat context

**Status:** Not Started
**Severity:** low
**Priority:** low
**Effort:** small
**Type:** BUG
**Epic:** epic-chat-context-optimization
**Files:** src/assistant/prompt/sections/group-participants.ts; src/assistant/prompt/sections/registry.ts (PROMPT_SECTIONS); src/group-chat/turn-selector.ts:73

## Issue

Per the spec (`docs/frontend/chat/group-chat.md` lines 25-30) and migration `003_group_chat.ts:7-9`, `chat_participants.talkativity` is a **1–10 per-chat participation weight that biases how often the actor is selected to speak** (initiative strategy computes `talkativity * 2 + initiative_points`).

The score IS consumed by `selectNextGroupActor` (`turn-selector.ts:73`) and passed through `GroupTurnContext` → `TurnManager.selectNextActor` for selection weight. **The score is never emitted into the per-actor system prompt** that the LLM sees.

`src/assistant/prompt/sections/` has no `groupTalkativity` (or equivalent) section. `group-participants.ts` exists but only lists participant names + roles — no scores.

The LLM therefore has no in-prompt awareness of which actors in the group are loud vs quiet. Models default to roughly equal verbosity across all actors. The selection-frequency bias works (TurnManager); prompt-context for it does not.

> **Scope note**: this ticket is strictly about surfacing the selection-rate score in the LLM prompt. Whether talkativity should *also* influence response verbosity / length is a separate design question — see `TASK-talkativity-influence-response-verbosity.md`.

## Why it matters

UX / coherence. The LLM currently cannot distinguish "this group has one quiet character + two chatty ones" from "this group has three equally talky characters." It produces uniformly-sized responses for all participants. Surfacing the score lets the model write shorter responses for low-talkativity actors and longer ones for high-talkativity ones (intuitively; that's the natural model behavior — not a forced length bias).

## Evidence

- `src/db/migrations/003_group_chat.ts:7-9` — comment: `talkativity on chat_participants: per-chat participation weight (1-10)`.
- `docs/frontend/chat/group-chat.md:25-30` — spec: "Each participant has a talkativity score that biases how often it speaks."
- `src/group-chat/turn-selector.ts:73` — talkativity read into participant shape.
- `src/generation/auto-gen/group-cascade.ts:48-87` — passes talkativity implicitly via TurnManager, never into LLM prompt.
- `src/assistant/prompt/sections/` — no `groupTalkativity` section.

## Concrete fix

1. Extend `src/assistant/prompt/sections/group-participants.ts` to render a `groupTalkativity` block when the chat is a group chat:

   ```typescript
   render(ctx) => ctx.groupParticipants?.length
     ? `Group chat participants and their talkativity scores (1–10, higher = more frequent speaker):
        ${ctx.groupParticipants.map(p => `${p.displayName} (${p.talkativity})`).join(', ')}.
        You are currently ${ctx.activeDisplayName} (talkativity ${ctx.activeTalkativity}).`
     : ""
   ```

2. Add `groupTalkativity` to `PROMPT_SECTIONS` registry with appropriate `order` (after `group-participants`).
3. In `assistant/prompt-assembler.ts`, when assembling for a group chat, populate `groupParticipants`, `activeDisplayName`, and `activeTalkativity` context fields from the chat participants query.
4. Tests:
   - Group chat with active talkativity=8 → emitted section says "You are currently Alice (talkativity 8)".
   - Direct chat (no groupParticipants) → section returns "".
   - Multi-actor group → emitted section lists all participants with their integer scores.

## Tests

- `bun test src/assistant/prompt/sections/group-participants.test.ts` — 3 cases above.
- `bun test src/generation/auto-gen-cascade.test.ts` — group chat generation: emitted system prompt contains the active speaker's talkativity score.

## Related

- `TASK-talkativity-influence-response-verbosity.md` — separate design proposal for length-bias.
- `epic-chat-context-optimization.md` (per-actor prompt shaping).
- `TASK-prompt-feature-flags-conditional-injection.md` (related prompt-injection work).
