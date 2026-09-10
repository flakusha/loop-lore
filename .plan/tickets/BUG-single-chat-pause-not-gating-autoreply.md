# BUG: Single-chat auto-reply ignores story pause

**Epic:** epic-generation-flow-control.md
**Status:** Not Started
**Priority:** Medium

## Problem

`story_state.isPaused` gates only the group cascade
(`src/generation/auto-gen/group-cascade.ts:130-137` pre-check and `:216-227`
post-flight re-check). `maybeAutoReply` (`src/routes/messages/reply.ts:57-96`)
calls `triggerAutoGeneration` without a pause check, so a paused single chat
still auto-generates replies — contradicting the settings modal copy
("When paused, only user messages are allowed").

## Fix

Check `story_state.isPaused` in `maybeAutoReply` (and any single-chat
auto-gen scheduler) before dispatching; reuse the cascade's pre/post-flight
pattern. Fold into `FEAT-unified-hold-semantics-per-chat-pause-gates-primary-generate.md`.

## Acceptance

- Test: paused chat + user message → no auto-generation; unpause → resumes.
