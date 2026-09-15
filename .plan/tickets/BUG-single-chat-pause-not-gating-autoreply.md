# BUG: Single-chat auto-reply ignores story pause

**Epic:** epic-generation-flow-control.md
**Status:** ✅ Resolved (67c170fc3) — closed 2026-09-15
**Priority:** Medium

## Problem

`story_state.isPaused` gates only the group cascade
(`src/generation/auto-gen/group-cascade.ts:130-137` pre-check and `:216-227`
post-flight re-check). `maybeAutoReply` (`src/routes/messages/reply.ts:57-96`)
calls `triggerAutoGeneration` without a pause check, so a paused single chat
still auto-generates replies — contradicting the settings modal copy
("When paused, only user messages are allowed").

## Resolution

Resolved by commit `67c170fc3 feat(chat): composer batch — complete, preview, titles, link, pause`. `src/routes/messages/reply.ts:70-82` (`maybeAutoReply`) now reads `story_state` from the chat row and short-circuits via `checkPaused(...)` before the request tracker / `triggerAutoGeneration` calls, mirroring the group-cascade pre-flight check (`src/generation/auto-gen/group-cascade.ts:130-137`). The fix follows the same pattern the ticket prescribed.

Regression-protected by `src/routes/messages/reply.test.ts:642-645` which sets `story_state = '{"isPaused":true}'` on a chat and asserts `maybeAutoReply` does not enqueue generation. Group cascade pause tests live in `src/generation/auto-gen-cascade.test.ts:444-449` ("chat paused: cascade stops when story_state.isPaused=true"). Original ticket suggested folding into `FEAT-unified-hold-semantics-per-chat-pause-gates-primary-generate.md` (`TASK-unified-hold-semantics-...`); on inspection that FEAT targets `POST /api/generation/generate` + aux-pipeline + step-pipeline, which is a different code path from `maybeAutoReply`. The two are orthogonal; the FEAT remains open (index status `open`, target scope unchanged). This ticket should be closed independently — its gate is live at `reply.ts:70-82` and is regression-protected.

## Fix

Check `story_state.isPaused` in `maybeAutoReply` (and any single-chat
auto-gen scheduler) before dispatching; reuse the cascade's pre/post-flight
pattern. Fold into `FEAT-unified-hold-semantics-per-chat-pause-gates-primary-generate.md`.

## Acceptance

- [x] Test: paused chat + user message → no auto-generation; unpause → resumes.
