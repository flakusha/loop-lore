<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Per-model/per-provider cost attribution for LLM execution stats

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-analytics-observability
**Summary:** Replace the single flat `$0.002`/1K rate with per-model pricing so admin cost dashboards attribute spend by model and provider.
**Context:** Found 2026-09-27 during LLM execution-stats analysis. Token counts are emitted on all completed paths; only the price map is missing.
**Acceptance Criteria:** See ## Acceptance Criteria below.
**Related:** TASK-autonomy-rate-governor, TASK-platform-health-discovery-cost-display, FEAT-per-agent-user-cost-governance, src/routes/analytics.ts, src/routes/generation/compare.ts, src/admin/model-capabilities.ts

## Summary

Every `generation.completed` event records `promptTokens`/`completionTokens`/`totalTokens` plus `model` + `provider`, but both cost consumers multiply by a hardcoded flat rate: `src/routes/analytics.ts:17` (`COST_PER_1K_TOKENS = 0.002`) and `src/routes/generation/compare.ts:33` (same constant, comment promises "replaced by model_capabilities pricing when seeded" — never seeded). A cheap local model and an expensive frontier model report identical spend, so the per-chat cost dashboard (FEA-2026-056) and the E15 cost-governance remainder cannot be trusted.

## What

- Cost sites: `src/routes/analytics.ts:94,158` (per-chat + overview `costEstimate`); `src/routes/generation/compare.ts:177` (per-model compare cost).
- Pricing store: none. `model_capabilities` table (`src/db/migrations/001_init.ts:82-100`) has context/max_output/flags but no price columns; `src/admin/model-capabilities.ts` manages the registry without pricing.
- Governor consumer: `TASK-autonomy-rate-governor` budgets action counts, not spend — once per-model cost exists, the governor can graduate to spend caps (E15 full scope).
- Frontend hint: `TASK-platform-health-discovery-cost-display` already wants per-model price labels in the picker — same price map serves both.

## Why

Flat-rate cost is worse than no cost: it presents as accounting while misattributing by orders of magnitude across local vs frontier models. Per-model pricing turns the existing token telemetry into trustworthy spend data with one lookup table.

## Scope

- Add `input_price_per_1k` / `output_price_per_1k` (naming per implementer) to `model_capabilities` via a new forward migration (append-only policy; see `src/db/migrations/README.md`), regenerate schemas.
- Seed/override path: admin override surface (extend `src/admin/model-capabilities.ts` or model-roles) + documented default table for known models; unknown models fall back to the current flat rate with an explicit `estimated: true` flag on the response.
- Wire both cost sites (`analytics.ts`, `compare.ts`) to the lookup; split prompt vs completion pricing where the event carries the split.
- Unit tests: known model prices correctly; unknown model falls back with `estimated: true`; prompt/completion split applied.
- Out of scope: budget-cap enforcement (governor ticket), latency fix (sibling BUG), percentile dashboards (E10).

## Acceptance Criteria

- [ ] `model_capabilities` carries per-model input/output pricing via forward migration
- [ ] Analytics `costEstimate` uses looked-up pricing; unknown models flagged estimated
- [ ] Compare-route cost uses the same lookup (single source of truth)
- [ ] `bun run check` + `bun test src/routes/analytics.test.ts src/routes/generation/` green
