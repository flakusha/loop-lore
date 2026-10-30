---
title: "FEAT-062: Generation quality metrics"
status: Done
**Scope:** FEAT-062 generation quality metrics: record per-generation quality signals and expose GET /api/analytics/quality (source: generation_attempts, no DB migration)
priority: medium
labels: [feature, generation, quality]
epic: epic-analytics-observability
related: [FEAT-059, FEAT-060, FEAT-066]
---

<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

**Status:** Done
**Priority:** medium
**Effort:** Medium
**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)

<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# FEAT-062: Generation quality metrics

## What

Per-generation scoring system tracking latency, token efficiency, repetition rate, and response quality indicators with trend visualization.

## Why

Users need objective metrics to evaluate generation quality over time. Is the model getting slower? Are responses becoming more repetitive? Is the chosen model efficient with tokens? These metrics help users make informed decisions about model selection and parameter tuning.

## Current State

- `src/chat/context-stats.ts` — per-message token stats
- `src/telemetry/` — basic telemetry tracking
- `src/frontend/alpine/context-window.ts` — real-time token display
- No generation-specific quality metrics exist

## Acceptance Criteria

- [x] **Per-generation metrics** — record: `latency_ms`, `prompt_tokens`, `completion_tokens`, `total_tokens`, `repetition_score`, `finish_reason`
- [x] **Repetition detection** — n-gram repetition rate in generated text (trigrams repeated >2 times)
- [x] **`/api/analytics/quality`** — aggregated quality metrics with optional model/chat/date filters
- [x] **Quality trends** — line charts showing latency, token efficiency, repetition rate over time
- [x] **Model comparison** — quality metrics compared across configured models
- [ ] **Alerts** — optional: notify when latency spikes >2x baseline or repetition rate exceeds threshold
- [x] Unit tests for repetition scoring and metric aggregation

## Implementation Notes

- Hook into generation pipeline — record metrics after each LLM call
- Repetition: tokenize response into trigrams, count duplicates, score = repeated_trigrams / total_trigrams
- Storage: extend `generation_logs` table or new `generation_metrics` table
- Trends: pre-aggregate by day for chart performance (don't query raw logs for dashboards)
- Quality file: `src/generation/quality-metrics.ts` (<200L)
- Size gate: quality metric files <250L each


## Implementation Record (2026-10-30)

**No DB migration.** `src/db/migrations/` is untouched. The endpoint reads the `messages` table, whose `generation_time_ms` / `tokens_per_second` / token-count columns already existed and were simply never written.

**Where each metric lives**

| Metric | Storage | Written by |
| --- | --- | --- |
| `latency_ms` | `messages.generation_time_ms` (integer ms) | `src/generation/auto-gen/store-message.ts`, `src/generation/generate-route/persist.ts` |
| token efficiency | `messages.tokens_per_second` (real) | same two write paths |
| `prompt_tokens` / `completion_tokens` / `total_tokens` | `messages.token_count_prompt` / `_completion` / `_total` | already written by both paths (pre-existing) |
| `repetition_score` | `messages.metadata.quality.repetitionRate` (JSON) | both write paths, via `src/generation/quality/repetition-rate.ts` |
| `finish_reason` | `messages.metadata.quality.finishReason` (JSON) | both write paths |

`generation_attempts.repetition_score` is deliberately NOT reused: that column already carries the streaming cancellation detector's similarity score, and overwriting it would corrupt the repetition-cancel semantics.

`finish_reason` has no dedicated column; the provider's raw `finishReason` (`stop` / `length` / `error` / `cancelled`) is stored in the same JSON blob, so it is available without a migration and without depending on telemetry (which is off by default in many configs and stores hashed ids).

**Modules**

- `src/generation/quality/repetition-rate.ts` — pure trigram scorer (`repetitionRate` / `repetitionStats` / `tokenize` / `trigramCounts`); a trigram type is "repeated" when it occurs MORE THAN twice; rate = repeated occurrences / total trigram occurrences.
- `src/generation/quality/aggregate.ts` — pure folding of grouped rows into `{ totals, byModel, trend, finishReasons }`; averages are weighted by the number of generations that actually carried the metric, so a bucket with no recorded latency never dilutes the average of the buckets that have one.
- `src/generation/quality/metadata.ts` — the `metadata.quality` blob helper.
- `src/routes/analytics/quality.ts` — `GET /api/analytics/quality`.

**Ownership.** The handler inner-joins `chats` and filters on `chats.created_by = userId`, so a caller only ever sees their own chats' data. A `chatId` filter naming a chat the caller does not own is answered 404, never 403, so the endpoint cannot be used to probe for the existence of a foreign chat.

**Scope: completed generations only.** Metrics are recorded for completed generations — that is, for the assistant message row the write path persists. An exception-cancel or an error that never produces a message row (`auto-generation.ts` routes the throw to `handle-generation-error`, and the stream-to-client path only cleans up the attempt) writes no row, so it is absent from the totals and from the finish-reason histogram: the histogram covers graceful completions only.

**Filters.** `model`, `chatId`, `from`, `to` — `from`/`to` follow the `parseExpiryMs` / `toDate` convention of `src/routes/analytics/chats.ts`; `to` is exclusive. The comparison normalises both sides with SQLite's `datetime()`, because `messages.created_at` is stored in SQLite datetime text (`"2026-01-02 10:00:00"`) while the parsed bound is ISO (`"2026-01-02T00:00:00.000Z"`) — raw string comparison mis-orders the two formats and shifts both boundaries by a day.

**Quality trends (AC4).** Rendered as CSS bars in the admin analytics panel, not a chart library: FEAT-059 deliberately ships CSS/SVG bars and Chart.js is not a dependency. The widget charts the daily trend (latency, tokens/sec, repetition rate) and a per-model comparison table.

**Alerts (AC6) not implemented** — the criterion is marked optional and the repo has no threshold/notification surface to hang it on.

## Dependencies

- Blocked by: FEAT-059 (analytics dashboard provides the UI framework)
- Blocks: nothing

**Resolved:** 2026-10-30 registry-driven close: git issue 6a79bb2 (registry tip: bcd6ddfda Konstantin Fedotov Close issue)
