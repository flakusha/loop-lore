<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Comparison metric collection and line-chart rendering

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-technical-comparison-charts
**Related:** `TASK-comparison-fan-out-engine.md`, `TASK-comparison-parameter-sweep-axis.md`, `TASK-comparison-chart-export-png-svg-csv.md`
**Summary:** See ## Summary below.
**Context:** See ## Context below.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Summary

Record per-variant scalar metrics and render them as a line chart against a swept parameter — the
chart form of a technical comparison.

## Context

`comparison_variant_metrics(variant_id, metric_key, metric_value)` does **not** exist yet: it is a
to-be-created table owned by `TASK-comparison-set-variant-data-model.md` (Not Started). This ticket
depends on that migration landing, and writes the first rows into it.

What each metric can honestly be in v1:

- **latency_ms** — fully measurable, and the **fan-out engine this ticket depends on is the thing
  that times it**: `src/comparisons/fan-out.ts` does not exist today
  (`TASK-comparison-fan-out-engine.md`, Not Started). When it lands it must record
  `completed_at - started_at` per variant, and this ticket reads those columns — it does not introduce
  a second clock. The ComfyUI client also exposes
  execution progress (`ComfyUIExecutionStatus.progress`, `src/generation/providers/comfyui.ts:38`), which
  is time-to-step, not total — do not conflate the two.
- **cost_usd** — only where a price is known. Do **not** invent a price: a null cost must stay null and
  be excluded from aggregates, exactly as the harness does it
  (`src/harness/stats.ts:103` — `if (record.costUsd !== null) totals.costUsd += record.costUsd`). The
  existing `COST_PER_1K_TOKENS` estimate (`src/routes/analytics/overview.ts:12`, consumed at `:127`) is
  a **LLM token** estimate and does not apply to image generation; do not reuse it for image variants.
- **vram_peak_mb** — only when the backend actually reports it. Neither the ComfyUI client nor the
  sd.cpp engine currently surfaces VRAM (`src/generation/providers/comfyui.ts`,
  `src/generation/image-engine/sdcpp.ts`), so this metric is **optional** and stays absent rather than
  estimated. **No provider read is in scope for this epic**: adding a VRAM probe would mean inventing
  a field that no backend returns today, and a client-side guess is worse than a missing series. If a
  backend later exposes a real VRAM field, that probe needs its own ticket; until then the metric key
  is reserved and simply stays absent.
- **clip_score / aesthetic_score** — only when an **image** scorer is configured. A scorer registry does
  exist in `src/` — `SCORERS` at `src/story/quality/registry.ts:13` — but every entry is a text/prose
  scorer (`CharacterVoice`, `PlotCoherence`, `LoreConsistency`, `NarrativeQuality`, `QuestRelevance`,
  `Creativity`); none scores an image. The metric key is therefore reserved and the chart shows "no
  scorer configured" rather than an empty axis. Ship the measurable ones; leave the keys reserved.

A null metric is never coerced to 0 — the same reasoning the harness records explicitly at
`src/harness/types-wire.ts:151` ("null/absent cost stays null — a 0 here would claim the call was free").
(`src/harness/types.ts` is only 127 lines and does not contain this comment.)

Chart rendering: the chart is client-side SVG, no charting dependency. Series = swept parameter values
from `TASK-comparison-parameter-sweep-axis.md`; y = the chosen metric; non-comparable points are drawn
hollow, not dropped silently. Emit the chart as a DOM `<svg>` element so
`TASK-comparison-chart-export-png-svg-csv.md` can serialize it without a second renderer.

Non-comparable cells must be excluded from aggregates unless the user overrides — see
`TASK-comparison-comparability-validation.md`.

**Ownership boundary with `TASK-cross-model-comparison-run-data-side.md`** (that ticket,
`epic-reference-conditioned-generation`, is also Not Started). Per-variant `latency_ms` and any
`vram_peak_mb` for **comparison-set variants** are recorded into `comparison_variant_metrics` by this
ticket's dependency (`TASK-comparison-fan-out-engine.md`) and charted here. Per-model latency and VRAM
for a **cross-model reference run** are captured on that ticket's own per-model result row. Same
honesty rules apply on both sides — an unreported metric stays absent with a recorded reason, never
either estimated or zeroed — but they are two tables and two write paths, not one.

## Acceptance Criteria

- [ ] `latency_ms` is written per variant by the fan-out engine and is readable back per variant
- [ ] A null `cost_usd` (no configured price) stays null, is excluded from the chart's aggregate, and does not render as 0
- [ ] `vram_peak_mb` is absent (not zero, not estimated) when the backend does not report it, and the chart says so
- [ ] `clip_score` renders "no scorer configured" rather than an empty or zeroed axis
- [ ] A line chart renders metric-vs-swept-parameter with one series per axis value, and non-comparable points render hollow
- [ ] The chart is a DOM `<svg>` element with axis labels and a legend; no new runtime charting dependency is added to `package.json`
- [ ] `src/comparisons/metrics.test.ts` covers latency recording, the null-cost exclusion, the absent-VRAM case, and the non-comparable-point rendering path
