<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: detectAvatarChangeIntent runs on user messages, not assistant responses

**Status:** [OK] Resolved (Option B applied: prompt-injection call site removed; emotionAvatar section fires via prompt-assembler default on persisted character mood)
**Priority:** P2
**Epic:** epic-emotion-avatar-message-binding
**Labels:** emotion-avatar, intent-detection, prompt-injection, wrong-direction
**Related:** TASK-aux-emotion-avatar.md (line 152 says "dead code" — wrong; this ticket is the real defect), src/generation/auto-gen/prepare-generation.ts:84-92, src/assistant/intent.ts

## Summary

`TASK-aux-emotion-avatar.md:152` and similar callouts claim
`detectAvatarChangeIntent()` is "dead code — zero consumers". That is
**factually wrong**: `src/generation/auto-gen/prepare-generation.ts:91`
consumes it on every auto-generation to inject
`params.emotion` into the prompt, which feeds the `emotionAvatar` section.

The real defect is that it runs on **`userMessage`** (line 90 reads
"the user's latest message"), not on the assistant response. So the
detected emotion reflects how the *user* feels about the character, not
how the *character* is reacting — exactly the opposite of what the
emotion avatar should display.

## Context

- `src/generation/auto-gen/prepare-generation.ts:84-92`:

  ```ts
  // Wire the config-driven avatar-change intent detector: when the user's
  // latest message matches a pattern in config.templates.avatar.intentPatterns,
  // the resolved emotion is injected as params.emotion so the emotionAvatar
  // section fires (and the generation provider picks the matching emotion
  // modifier). No match → undefined → the assembler falls back to the
  // actor's persisted mood.
  const detectedEmotion = userMessage && config.templates.avatar
    ? detectAvatarChangeIntent(userMessage, config.templates.avatar,) ?? undefined
    : undefined;
  ```

  `userMessage` is the **latest user message** (not the assistant reply).
- `src/assistant/intent.ts:28-46` (`detectAvatarChangeIntent`) — regex
  match against `input.toLowerCase()` against
  `avatarConfig.emotions[*].intentPatterns`. Returns the emotion name
  (e.g. `"happy"`) or null.
- The intent here was "if the user just typed a happy message, prime the
  assistant's generation context with happy emotion." But the comment on
  line 86 — "the generation provider picks the matching emotion modifier"
  — implies the assistant is being told to respond happy. That's a prompt
  bias, not avatar binding.
- The per-message avatar binding (`emotionForMessage`) wants the emotion
  of the **assistant's reply**, which is what the keyword `EmotionHook`
  detects (running on the LLM-generated content in `content-hooks.ts`).
- `TASK-aux-emotion-avatar.md:152` lists `detectAvatarChangeIntent()` as
  **dead code** — incorrect. It has 1 consumer
  (`prepare-generation.ts:91`). The audit-trail context said "zero
  consumers" because the previous reader didn't grep; this ticket is the
  correction.

## Impact

- The `emotionAvatar` prompt section fires on every user message that
  contains a smile/laugh keyword. The LLM is told "the character is
  happy", biases the next reply toward happy expressions — which is the
  opposite of how this feature should work (the avatar should reflect
  the assistant's actual response, not the user's input).
- `messages.emotion` is set from `EmotionHook` (correctly, on the
  assistant response) — so per-message avatar binding works for the
  avatar *display*, but the prompt *injection* nudges the LLM toward
  the user's mood. Net effect: the LLM over-emotes matching the user's
  typing.
- The conflated "dead code" claim in `TASK-aux-emotion-avatar.md:152`
  misleads future maintainers — the function is alive and consumed.

## Fix

Decide on one of two outcomes:

**Option A (preferred — keep detection, narrow the trigger)** —
`detectAvatarChangeIntent()` is conceptually valid for *one* use case:
priming the assistant's tone from a user cue. But the wiring should:

1. Either run on the assistant's **previous** message (most recent
   assistant reply in the chat), or
2. Be removed entirely if the keyword `EmotionHook` already covers the
   signal at content-hook time.

**Option B (drop the prompt-injection call site)** — remove lines 84-92
of `prepare-generation.ts`. Rely on `EmotionHook` (in
`content-hooks.ts`) to set `messages.emotion` and the prompt-assembler's
default `params.emotion = character_mood.current_mood` (already wired
in `prompt-assembler.ts:104-108`).

Recommendation: **Option B** — the prompt-assembler default already
covers the use case, and the user-message scan is the wrong direction
for avatar binding.

After the fix, update `TASK-aux-emotion-avatar.md:152` to reflect the
actual consumer and the wrong-direction defect.

## Evidence

- prepare-generation.ts no longer imports or calls detectAvatarChangeIntent; the file docstring (lines 4-17) documents the removal rationale (prompt bias, wrong direction, EmotionHook already covers the assistant-response signal).
- bun test src/generation/: 494 pass / 0 fail
- bun test src/assistant/: 177 pass / 0 fail
- bunx tsc --noEmit -p tsconfig.backend.json: exit 0

## Acceptance Criteria

- [x] Decision made: B (recommended) — call site removed
- [x] `emotionAvatarSection` still fires via `prompt-assembler.ts:104-108` default on persisted `character_mood.current_mood`
- [x] Tests passing
- [x] Typecheck passing