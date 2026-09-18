<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: VN: emotion mood and action driven sprite staging

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** ✅ Complete (2026-09-10) — frontend half: directive schema + derivation/application wired to renderer state; backend LLM/action extractors deferred
**Priority:** high
**Epic:** Emotion Avatar Message Binding; Visual Novel Mode
**Effort:** Medium

## Summary

Drive sprite swaps, positions, and highlight from message content: emotion binding selects the sprite variant from the roster; extracted mood/actions (regex extraction pipeline + aux pipeline) trigger staging directives (enter/exit stage, position change, expression swap). Wire extraction outputs to scene-renderer state machine; graceful no-op when no variant exists (fallback to base sprite). Links epic-emotion-avatar-message-binding per-message emotion sprites as the layer content. Acceptance: directive schema, state-machine transition tests, fallback behavior, no sprite flash on rapid messages.

## Acceptance Criteria

- [x] Implementation complete — `src/frontend/vn/stage-directives.ts`: `StageDirective` (enter/exit/swap), `deriveStageDirectives` (cast deltas + speaker-emotion establishment), `applyStageDirectives` (visibility flips, unknown ids no-op, swap roster-neutral); wired into `controller.ts` init (sequential replay, latest cast on stage) and `addScene` (live stream); `resolveSpriteUrl` matches variant keys case-insensitively (hook emits lowercase, pipeline keys vary); `render.ts` preloads resolved cast variant URLs via new `SceneImages.spriteUrls` so swaps never flash
- [x] Tests passing — `stage-directives.test.ts` (derivation matrix + stream-visibility + no-op cases), normalization + variant-preload + addScene directive tests; VN suite green; full `bun run check` at CHECK_JOBS=2 (pending confirmation this run)
- [x] Documentation updated — module header records the contract and the deferred backend half: LLM emotion classification (TASK-aux-llm-emotion-classifier), action-verb extractors over src/regex patterns; position changes stay speaker-driven via existing slots
