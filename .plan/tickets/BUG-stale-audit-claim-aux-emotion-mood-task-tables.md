<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Stale audit rows in TASK-aux-emotion-avatar.md + TASK-aux-mood-classification.md contradict current wiring

**Status:** ✅ Resolved (2026-08-24, fix-aux-emotion-mood-task-tables-docs-sync)
**Priority:** P3
**Effort:** Trivial
**Epic:** epic-aux-enrichment-pipeline
**Related:** TASK-aux-emotion-avatar.md, TASK-aux-mood-classification.md, TASK-emotion-avatar-message-binding.md, src/generation/auto-gen/content-hooks.ts, src/generation/auto-gen/auto-generation.ts, src/generation/auto-gen/post-store.ts, src/generation/auto-gen/store-message.ts, src/generation/auto-gen/story-mode.ts

## Summary

The "Current State" tables in two long-running AUX tasks claim
`data.dominantEmotion` and `data.dominantMood`/`delta` are "never read" by
production code. **Both claims are stale** as of the
`TASK-emotion-avatar-message-binding` work (committed 2026-08-02), which
wired both fields into per-message storage and mood persistence. The stale
audit rows mislead downstream implementers and contradict the "pipeline is
dead end" framing later in the same tickets.

## Context

`TASK-aux-emotion-avatar.md:147-160` (Current State table + key finding):

```md
| Hook event consumption               | ❌ `data.dominantEmotion` never read — `auto-gen.ts` consumes only `hookResult.allowed` | `generation/auto-gen.ts:412-431`                |
| Auto-trigger on response             | ❌ manual API call only                                                                 | —                                               |
...
Key finding: the emotion → avatar pipeline is a **dead end**. The
`emotion_change` event fires (keyword match) but nothing reads its `data`;
the only avatar selection path is the explicit HTTP route with
user-supplied `emotion`/`mood` context.
```

`TASK-aux-mood-classification.md:78-86`:

```md
| Hook event consumption               | ❌ `data.dominantMood`/`delta` never read — `auto-gen.ts` consumes only `hookResult.allowed`          | `generation/auto-gen.ts:412-431` |
...
Key finding: `mood_shift` events fire but nothing applies them —
no `character_mood` write, no expression modifier, no avatar context.
```

**Both claims are factually wrong today.** The wiring landed in the
emotion-avatar-message-binding epic and is observable in:

| File | Line(s) | What it does |
| --- | --- | --- |
| `src/generation/auto-gen/content-hooks.ts` | 122-132 | Extracts `dominantEmotion` (line 124) and `moodShiftDelta` (line 131) from `hookResult.events` |
| `src/generation/auto-gen/auto-generation.ts` | 183, 201 | Threads both into `store-message.ts` opts and `post-store.ts` opts |
| `src/generation/auto-gen/store-message.ts` | 137 | Persists `emotion: dominantEmotion ?? null` into `messages.emotion` |
| `src/generation/auto-gen/post-store.ts` | 85-91 | If `moodShiftDelta != null`, calls `MoodService(database,).applyHappinessDelta(actorId, worldId ?? undefined, moodShiftDelta)` |
| `src/generation/auto-gen/story-mode.ts` | 185-188 | Mirrors the same extraction in the story-mode hook chain |

Even the followup bullets in TASK-aux-emotion-avatar.md:164-167 acknowledge
the wiring:

> 1. **Consume the emotion hook per message** (done 2026-08-02): in `auto-gen.ts`
>    post-hook, read `events` for `emotion_change`, extract `data.dominantEmotion`,
>    and persist it to `messages.emotion` (new column).

…which makes the "never read" + "dead end" audit rows immediately above it
self-contradictory in the same file.

## Impact

- New contributors / reviewers read the audit table, conclude the wiring is
  missing, and either re-implement it (duplicate work) or assume the task is
  more open than it is.
- The downstream "Next Actionable Items" sections in both tickets are also
  stale: TASK-aux-mood-classification.md:90-92 still asks for the
  `character_mood` write that post-store.ts performs.

## Fix

1. In `TASK-aux-emotion-avatar.md`, replace the rows + key finding with:
   ```md
   | Hook event consumption               | ✅ `content-hooks.ts:122-124` extracts `data.dominantEmotion`; `auto-generation.ts:183` passes to `store-message.ts:137` which persists `messages.emotion`. | `generation/auto-gen/content-hooks.ts:122-124`, `auto-generation.ts:183`, `store-message.ts:137` |
   | Auto-trigger on response             | ✅ fires inside `auto-generation.ts` hook chain; per-message binding wired (2026-08-02, see `TASK-emotion-avatar-message-binding`) | `auto-generation.ts` |
   ```
2. Delete or rewrite the "Key finding: … dead end …" paragraph.
3. In `TASK-aux-mood-classification.md`, replace the row:
   ```md
   | Hook event consumption               | ✅ `content-hooks.ts:127-132` extracts `moodShiftDelta`; `post-store.ts:85-91` calls `MoodService.applyHappinessDelta(actorId, worldId, delta)`. | `auto-gen/content-hooks.ts:127-132`, `auto-gen/post-store.ts:85-91` |
   ```
4. Rewrite the "Key finding: … no `character_mood` write …" line — it is now
   "wiring exists; follow-ups are LLM classification to replace keyword
   detection, not persistence."
5. Optional: also fix the row "Mood → expression modifier injection | ❌ not
   wired from hook `data`" — if/when expression modifiers consume
   `dominantMood`, mark accordingly.

## Acceptance Criteria

- [ ] Audit rows in both tickets reflect the post-`TASK-emotion-avatar-message-binding`
      reality (✅ for hook data consumption, ✅ for mood persistence).
- [ ] "Key finding" paragraphs in both files no longer claim the pipeline is
      unwired or `data` is unread.
- [ ] "Next Actionable Items" in `TASK-aux-mood-classification.md` reflect
      actual gaps (LLM classifier replacement is the main one, not persistence).
- [ ] No new code changes — docs only.