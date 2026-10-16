<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: ComfyUI lifecycle client — queue, history, and `extra_pnginfo` embedding (native, no sidecar)

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** `epic-reference-conditioned-generation`
**Related:** `TASK-comfyui-graph-builder-ts-port.md`, `TASK-comfyui-ws-client-id-progress-reference-generation.md`, `TASK-comfyui-first-class-image-generation-queue-honors-comfyui-ba.md`
**Summary:** See ## Summary below.
**Context:** See ## Context below.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Summary

Build the **generic ComfyUI job lifecycle** — submit → queue → history → result —
natively in `src/generation/image-engine/comfyui.ts`, plus the queue-progress and
job-timing derivation. Its subject is the lifecycle every workflow family needs,
not MiniMax H3 stills: `/queue` and `/history/{id}` reads, `extra_pnginfo`
embedding, and per-node progress. The Python sidecar is **reference evidence
only** — nothing here depends on its `/h3-stills/*` HTTP contract.

## Context

Source artifact: a Python ComfyUI HTTP-route extension (its `studio_stills.py` and
`web/*.mjs`), handed over **2026-09-30** by an external acquaintance of the repo owner
and vendored **only** under `.tmp/H3_Stills_5080_Handoff_20260930/ComfyUI-H3-Stills-Only/`.
That directory is scratch, gitignored, and was **never committed**. It was pruned before
implementation — which is why this ticket was first written as an unverified claim — and
it **has since been re-acquired and was functionally reviewed on 2026-10-16 by reading
the on-disk source.** It is a **review-only reference artifact**: never committed,
`.tmp/` only, never an import target, and nothing in `src/` may reference it. Per the
separate-plugin-repo decision the custom-node half goes to its own plugin repository;
loop-lore consumes the documented ComfyUI REST contract only.

Every route count, module boundary, line number, and cap below is verified against that
read. What is **not** verified is anything that needs a live ComfyUI — real `/queue`,
`/history`, and `/prompt` payloads, and whether a run actually completes. The three
reusable `.mjs` modules below are named by behavior, not just by path; where a claim needs
a live run to confirm, the last AC records it.

**Reference evidence.** The sidecar splits its lifecycle across **nine**
`/h3-stills/api/*` routes and five native ComfyUI endpoints. Only the custom routes
are sidecar-specific and out of scope; the native endpoints are the ones loop-lore
already speaks — and they are this ticket's whole subject. The sidecar is read here
for what a working lifecycle looks like, not as something to call or to absorb
further. (The package registers 11 routes in total — `__init__.py:21`
— those nine API routes plus the `/h3-stills` entry redirect, `:56`, and the
`/h3-stills/{filename}` page server, `:62`. The SPA uses all nine API routes and no
others: `stills.mjs:169,174,177,188,233,260,273,293,306,337,342,385`.)

| Sidecar call | Native equivalent | loop-lore status |
| --- | --- | --- |
| `POST /h3-stills/api/stills/prepare` | build graph → `POST /prompt` | `submitWorkflow` exists; graph building is `TASK-comfyui-graph-builder-ts-port.md` |
| `POST /prompt` with `extra_data.extra_pnginfo.workflow` (`web/stills.mjs:174-175`) | same | **not implemented** — `submitWorkflow` sends `{prompt}` only |
| `POST /h3-stills/api/stills/register` (`studio_stills.py:324-332`) | `GET /history/{prompt_id}` | `pollResult` exists; there is no register step because there is no record store |
| `GET /history/{prompt_id}` (`web/stills.mjs:260`) | same | exists |
| `GET /queue` + `GET /h3-stills/api/queue-progress` (`web/stills.mjs:273`) | `GET /queue` + progress over `/ws` | `ComfyUIClient` has no queue read. The sidecar bridges `comfy_execution.progress` (imported in-process at `__init__.py:177`) to HTTP at its own route (`__init__.py:174-188`) — that route is sidecar-specific, but the per-node progress it exposes is ComfyUI's own in-process state, which loop-lore can read the same way or over `/ws` |
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
`web/queue_progress.mjs:1-20` (`queueStage` class_type regex → human stage, with a
`prompt_id` mismatch guard at `:13` and `value`/`max` clamp at `:16,18-19`),
`web/job_timing.mjs:1-39` (`timingFromMessages` takes duration from `execution_start`
(`:15`) vs the latest of `execution_success`/`execution_error`/`execution_interrupted`
(`:16-17`) and returns `durationMs: null` when a run never started, `:18`), and
`web/stills_gallery_status.mjs:1-13` (`stillQueueState` →
`{phase, stage, value, max, position}`, importing only `queue_progress.mjs`). Port
those; skip `stills.html` and the model-specific half of `stills.mjs`.

`web/stills_import.mjs:6-36` — `pngFields`, a PNG `tEXt`/`iTXt` chunk reader that
never decodes pixels, rejects compressed iTXt (`:23-24`), and caps each chunk read
at 4 MiB (`:16`) — plus the 128 MiB whole-file cap in `readWorkflowFile` (`:44`),
is also worth porting, for the import-validation policy's PNG-`prompt` comparison.
It reads only the `workflow` and `prompt` keys (`:20`).

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
- [ ] **Provenance recorded.** Every sidecar-derived claim this ticket relies on is
      now **verified by source read** (2026-10-16,
      `.tmp/H3_Stills_5080_Handoff_20260930/ComfyUI-H3-Stills-Only/`): the route split
      — nine `/h3-stills/api/*` routes plus the entry and page routes, 11 total
      (`__init__.py:56,62,70,92,107,118,140,153,163,174,191`) against five native
      endpoints used by the SPA (`stills.mjs:53,174,260,273,293`); the
      `extra_pnginfo.workflow` single key with `client_id` on `POST /prompt`
      (`stills.mjs:174-175`); the queue-progress stage mapping
      (`queue_progress.mjs:1-20`, `prompt_id` guard `:13`, clamp `:16`); the
      job-timing boundaries (`job_timing.mjs:11-19`); `stillQueueState`'s shape
      (`stills_gallery_status.mjs:3-12`); and the PNG chunk reader's 128 MiB
      whole-file cap with the 4 MiB per-chunk cap
      (`stills_import.mjs:44` and `:16-24`). Still **not** verified, and to be
      recorded as such rather than as confirmed: (a) the real `/queue`, `/history`,
      and `/prompt` payload shapes against a live ComfyUI, (b) a run that actually
      completes end-to-end here. For each, the ticket records the evidence — an
      executed test, an observed `/history` or `/queue` payload **with its date**,
      or a written answer from the upstream author — and a claim with no provenance
      is not used as if confirmed
- [ ] `bun run check` green
