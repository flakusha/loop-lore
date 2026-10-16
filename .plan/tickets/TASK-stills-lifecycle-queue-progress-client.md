<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Stills lifecycle + queue-progress client (native, no Python sidecar)

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** `epic-reference-conditioned-generation`
**Related:** `TASK-comfyui-graph-builder-ts-port.md`, `TASK-comfyui-ws-client-id-progress-reference-generation.md`, `TASK-comfyui-first-class-image-generation-queue-honors-comfyui-ba.md`
**Summary:** See ## Summary below.
**Context:** See ## Context below.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Summary

Build the stills job lifecycle — prepare → queue → register → results — natively in
`src/generation/image-engine/comfyui.ts`, plus the queue-progress and job-timing
derivation, without the `/h3-stills/*` HTTP contract.

## Context

Source artifact: `.tmp/H3_Stills_5080_Handoff_20260930/ComfyUI-H3-Stills-Only/`
— **scratch, will be pruned.** Read 2026-10-16.

The sidecar splits its lifecycle across seven custom routes and five native ComfyUI
endpoints. Only the custom ones are sidecar-specific; the native ones loop-lore
already speaks.

| Sidecar call | Native equivalent | loop-lore status |
| --- | --- | --- |
| `POST /h3-stills/api/stills/prepare` | build graph → `POST /prompt` | `submitWorkflow` exists; graph building is `TASK-comfyui-graph-builder-ts-port.md` |
| `POST /prompt` with `extra_data.extra_pnginfo.workflow` (`web/stills.mjs:174-175`) | same | **not implemented** — `submitWorkflow` sends `{prompt}` only |
| `POST /h3-stills/api/stills/register` (`studio_stills.py:324-332`) | `GET /history/{prompt_id}` | `pollResult` exists; there is no register step because there is no record store |
| `GET /history/{prompt_id}` (`web/stills.mjs:260`) | same | exists |
| `GET /queue` + `GET /h3-stills/api/queue-progress` (`web/stills.mjs:273`) | `GET /queue` only | `ComfyUIClient` has no queue read; the progress half wraps `comfy_execution.progress` in-process and is **not reachable over HTTP** |
| `GET /view?filename=&subfolder=&type=` (`web/stills.mjs:53`) | same | `downloadImage` / `downloadFile` exist |
| `POST /upload/image` with `subfolder=h3_studio/still_uploads` (`web/stills.mjs:292-293`) | same | `uploadImage` exists |

Two consequences worth being explicit about:

1. **`extra_pnginfo` is not decoration.** It is how a generated PNG remembers the
   graph that made it, which is what makes an import round-trippable. loop-lore
   currently discards it: `submitWorkflow` sends `{ prompt }` and nothing else.
   Without it, the import-validation policy in
   `TASK-comfyui-graph-builder-ts-port.md` has nothing to compare against.
2. **`GET /queue` is missing from the client entirely.** Queue position is the
   difference between "queued behind 8 jobs" and "hung".
   `epic-comfyui-first-class-image-generation-queue-honors-comfyui-ba.md` covers
   per-`baseUrl` concurrency 1 and `/interrupt`; read it first and do not build a
   second queue concept.

Three small client modules are genuinely reusable and carry **zero** H3 references:
`web/queue_progress.mjs:1-20` (class_type regex → human stage, with `prompt_id`
guard and `value`/`max` clamp), `web/job_timing.mjs:1-39` (duration from
`execution_start` vs `execution_success`/`error`/`interrupted`), and
`web/stills_gallery_status.mjs:1-13` (`stillQueueState` →
`{phase, stage, value, max, position}`). Port those; skip `stills.html` and the
model-specific half of `stills.mjs`.

`web/stills_import.mjs:6-36` — a PNG `tEXt`/`iTXt` chunk reader that never decodes
pixels, rejects compressed iTXt, and caps at 128 MiB — is also worth porting, for
the import-validation policy's PNG-`prompt` comparison.

## Acceptance Criteria

- [ ] `submitWorkflow` accepts an `extra_pnginfo` payload and sends it as
      `extra_data.extra_pnginfo`; the round trip is asserted against a fake ComfyUI
- [ ] A queue read (`GET /queue`) exists on `ComfyUIClient`, returning running /
      pending position, coordinated with (not duplicating)
      `TASK-comfyui-first-class-image-generation-queue-honors-comfyui-ba.md`
- [ ] Job timing is derived from history messages (`execution_start` →
      `execution_success`/`error`/`interrupted`) and exposed on the run outcome;
      a run that never started reports no duration rather than zero
- [ ] A queue-progress state mapper reproduces `stillQueueState`'s
      `{phase, stage, value, max, position}` shape and guards on `prompt_id` so one
      run's events cannot land on another's
- [ ] The PNG `workflow`/`prompt` chunk reader is ported (no pixel decode, rejects
      compressed iTXt, bounded read size) for import validation
- [ ] **No `/h3-stills/*` call exists anywhere in `src/`**, and no code path imports
      from `.tmp/`
- [ ] Test against a fake ComfyUI: submit → history → view returns one result with
      a duration and a correct queue phase; a second concurrent `prompt_id` does not
      receive the first's progress
- [ ] `bun run check` green
