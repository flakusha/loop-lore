<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: IVSS shot grammar assembler

**Status:** In Progress
**Priority:** medium
**Effort:** Medium
**Epic:** epic-image-video-scenario-studio
**Related:** `TASK-ivss-scenario-schema.md`, `FEAT-DIRECTOR-TIMELINE-SCENE-MAPPING.md`, `TASK-ivss-video-run-pipeline.md`, `TASK-video-provider-minimax-h3.md`
**Tags:** ivss, prompts, assembler
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**
Pure compiler from a persisted IVSS scene + its shots into a byte-stable
`[Shot N]` prompt with absolute timestamps, soundscape/music sections, and the
`prompt` / `timeline_data` / `builder_state` variable map consumed by the pinned
ComfyUI workflow. Assembly is budgeted with the shared token estimator and
reports every dropped section; it never silently loses content or depends on a
particular MiniMax H3 Director node pack.

**Context:**
The 2026-11-19 full-cycle-director review (`.tmp/research/full-cycle-director-review-2026-11-19.md`
§3, step 3) makes this the slice between the fragment schema and the run
pipeline. The shipped fixture `v-0010-dasiwa-minimax.json` shows the target
widget shape: `builder_state` is a JSON string whose `ref.detailed_description`
carries `[Shot N]` blocks and `At 00:03.000` absolute timestamps, with
`soundscape` and `music` alongside them. Reuse `estimateTokens`
(`src/chat/token-utils.ts`) and the existing `{{var}}` substitution path
(`src/generation/workflow-substitutor.ts`); do not edit `custom_nodes/` or add
a dependency. Seeds stay strings so values above 2^53 survive. Style-bible
ownership (chat context vs world/location) is still an operator question, so
style is an optional input section, not a required field.

**Acceptance Criteria:**

- [x] Byte-stable output for fixed inputs: shots sorted by `sort_order`, then
      `start_ms`, then id; absolute `mm:ss.mmm` timestamps
- [x] Workflow variable map contains `prompt`, `timeline_data` and
      `builder_state` as JSON-string-ready primitives plus a string seed; the
      shipped substitution path resolves every placeholder
- [x] Over-budget assembly drops sections in a documented order (style →
      music → soundscape → tail shots) and returns the dropped list; first shot
      is never dropped silently
- [x] Tests cover byte-stability, timestamp formatting, over-budget reporting,
      empty-shot rejection, big-seed preservation and workflow substitution
- [x] Targeted tests and gates green
