<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Cross-model comparison run — data and asset side

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** `epic-reference-conditioned-generation`
**Related:** `TASK-reference-capability-matrix-data-model.md`, `TASK-comfyui-ws-client-id-progress-reference-generation.md`, `TASK-sd-cpp-reference-edit-parity.md`, `epic-gallery-batch-operations.md`
**Summary:** See ## Summary below.
**Context:** See ## Context below.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Summary

One prompt, N model families, one comparable result set: the run record, per-model
result rows, and the shared identity that makes two images actually comparable.
This ticket owns the data. The chart/gallery rendering belongs to another worker.

## Context

The four target families have no shared vocabulary, no shared cost model, and no
place to compare outcomes. Today "which model should I use for this?" is answered
by re-reading two prose tables in two epics, both frozen at 2026-07-28 and
written on one GPU.

A comparison is only meaningful if the *inputs* are pinned. Concretely, that means:

- the same prompt, and the same reference set, in the same order and roles
- each family rendered through its own template with its own prompt-format rule
  (the capability matrix owns the format; the sidecar's H3 prompt format and sigma
  shifts are family data, not universal ones)
- the seed, where the family supports seeding
- **per-model latency and VRAM captured**, because "Krea 3 is better" is
  uninteresting next to "Krea 3 took 4 minutes and 28GB"

This is the natural consumer of `TASK-reference-capability-probe-runtime.md` — the
probe measures one run; a comparison run is the same machinery pointed at N
families at once and persisted.

### Storage: reuse, do not add a table

The `assets` / `asset_links` model already carries this. The matting service writes
N derivatives per source with `dedupe: false` (see
`TASK-multi-concept-segmentation-masks.md`), and the image-edit provider links a
result to its chat and message (`comfyui-provider.ts:185-197`). A comparison run is
another link target: a run entity, with each model's output linked to it.

`epic-gallery-batch-operations.md` owns selection/batch-action UI over the gallery.
Coordinate there rather than building a parallel browser.

### Scope boundary

This ticket is the **data and asset side**: run creation, fan-out, result rows,
latency/VRAM capture, and reads that hand a renderer everything it needs
side-by-side. Rendering, layout, and chart visuals are explicitly **not** in scope
and are another worker's — do not add a view here.


`epic-technical-comparison-charts.md` (Not Started, filed 2026-10-16) owns the
comparison **surface** — comparison sets, cells, grid rendering, charts, PNG/SVG/CSV
export, and its own fan-out and comparability tickets. Read it before starting; this
ticket must not create a second comparison-set model. The join between the two is
the same-prompt identity plus the per-model result row this ticket produces.

The boundary is symmetric, and the other side says so too. Three things are owned on
both sides, and each has exactly one owner:

| Concern | Owner here (cross-model reference run) | Owner there (comparison set) |
| --- | --- | --- |
| Fan-out | this ticket, across the four target model families, skipping families with no capability row, attributed per `prompt_id` | `TASK-comparison-fan-out-engine.md`, over `comparison_set_variants` rows in `src/comparisons/fan-out.ts` |
| Run identity | this ticket's run record + per-model result rows, keyed on the shared prompt/reference/seed | `TASK-comparison-seed-parameter-lock-and-rerun.md`, the `comparison_set_runs` row, the per-variant snapshot and the `reproducible` verdict |
| Latency / VRAM | this ticket, captured on the per-model result row with a recorded reason when absent | `TASK-comparison-metric-collection-and-charts.md`, into `comparison_variant_metrics`, absent rather than estimated when the backend does not report it |

Two separate engines, two sets of rows, no shared fan-out module — and the same
honesty rules on both sides (an unreported metric stays absent with a reason, never
estimated or zeroed). Whichever lands first, the second reads it rather than
forking it.

## Acceptance Criteria

- [ ] A comparison run records: the prompt, the ordered reference set, the seed,
      the participating family ids, and each family's resolved template + resolved
      parameters — so a row can be reproduced, not just re-viewed
- [ ] Each family's output lands as a loop-lore asset linked to the run (and
      optionally to the chat/message), through the existing
      `createAsset`/`linkAsset` contract
- [ ] Per-model latency and VRAM are captured on the row. A model that did not run
      records *why* (missing nodes, below VRAM floor, timeout) — not a blank
- [ ] A read returns the run with all rows in a stable order plus the prompt,
      references, and seed, so a renderer needs no second query to lay out a grid
- [ ] Fan-out respects the ComfyUI queue rather than firing N simultaneous submits;
      concurrency is bounded and attributed per `prompt_id`
      (`TASK-comfyui-ws-client-id-progress-reference-generation.md`)
- [ ] Families without a template or a capability row are reported as skipped with
      a reason, never silently omitted from the result count
- [ ] Storage reuses the existing asset model — no new table
- [ ] Test: a 3-family run produces 3 rows sharing one prompt identity; a family
      excluded by its capability row yields a skipped row with the reason, and the
      result count reflects the decision
- [ ] `bun run check` green
