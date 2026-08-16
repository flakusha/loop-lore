---
title: "FEAT-062: Generation quality metrics"
status: open
priority: medium
labels: [feature, generation, quality]
epic: epic-analytics-observability
related: [FEAT-059, FEAT-060, FEAT-066]
---

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

- [ ] **Per-generation metrics** — record: `latency_ms`, `prompt_tokens`, `completion_tokens`, `total_tokens`, `repetition_score`, `finish_reason`
- [ ] **Repetition detection** — n-gram repetition rate in generated text (trigrams repeated >2 times)
- [ ] **`/api/analytics/quality`** — aggregated quality metrics with optional model/chat/date filters
- [ ] **Quality trends** — line charts showing latency, token efficiency, repetition rate over time
- [ ] **Model comparison** — quality metrics compared across configured models
- [ ] **Alerts** — optional: notify when latency spikes >2x baseline or repetition rate exceeds threshold
- [ ] Unit tests for repetition scoring and metric aggregation

## Implementation Notes

- Hook into generation pipeline — record metrics after each LLM call
- Repetition: tokenize response into trigrams, count duplicates, score = repeated_trigrams / total_trigrams
- Storage: extend `generation_logs` table or new `generation_metrics` table
- Trends: pre-aggregate by day for chart performance (don't query raw logs for dashboards)
- Quality file: `src/generation/quality-metrics.ts` (<200L)
- Size gate: quality metric files <250L each

## Dependencies

- Blocked by: FEAT-059 (analytics dashboard provides the UI framework)
- Blocks: nothing
