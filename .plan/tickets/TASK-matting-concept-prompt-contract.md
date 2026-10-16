<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Matting concept prompt contract

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** sam3-segmentation-integration
**Tags:** matting, segmentation
**Depends on:** —
**Blocks:** `TASK-comfyui-sam3-concept-mask-template`, `TASK-sam3-direct-provider-via-meta-model-api`, `TASK-sam3-concept-cutout-wiring-sprites-avatar-matting-vn-alpha`, `TASK-sam3-mask-cache-and-reuse`
**Related:** TASK-matting-fallback-aux-pipeline-job.md

**Summary:**

Add an optional concept prompt to the matting provider + job contract so background removal targets a named subject ("the character") instead of whatever the heuristic picks.

**Context:**

`MattingProvider.removeBackground(buffer)` (`src/generation/matting/types.ts`) is promptless — rembg-class models decide the subject themselves. SAM3 matting needs a target concept. Keep the change additive: providers that ignore the prompt behave exactly as today and rembg stays the default.

**Acceptance Criteria:**

- [ ] `removeBackground(buffer, opts?)` gains optional `{ concept?: string; exemplar?: Buffer; maxMatches?: number }`; `MattingProviderConfig` gains `concepts?: string[]` + `defaultConcept`
- [ ] `MattingJob` + `job-store.ts` record the concept used; the job status surface exposes it
- [ ] `enqueueAutoMatting` passes a concept from config; empty concept = today's behavior, unchanged
- [ ] Config section for matting providers gains the fields with defaults that preserve current behavior
- [ ] Unit tests: concept recorded on the job; provider receives the concept; a prompt-ignoring provider stays interchangeable; missing concept falls back to the current heuristic
- [ ] `bun run check` green; no caller outside `src/generation/matting/` changes here

## Technical Notes

- Files: `src/generation/matting/{types.ts,service.ts,job-store.ts,auto-matte.ts,factory.ts}` + the matting config schema.
- Concept strings are user-authored — validate length/charset at the config boundary (trust boundary), do not interpolate into prompts unchecked.
