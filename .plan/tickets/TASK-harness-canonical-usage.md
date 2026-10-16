<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: CanonicalUsage record (cache + reasoning counters)

**Status:** Not Started
**Priority:** medium
**Effort:** Small
**Epic:** `epic-harness-integration`
**Related:** docs/meta/research/harness-hook-schema-absorption.md, TASK-harness-stats-dashboard.md

**Summary:**

One usage shape everywhere: `CanonicalUsage {input, output, cacheRead, cacheWrite, reasoning, requestCount}` fills from the openai-compatible and anthropic parsers, replaces the narrowed `ExecUsage {promptTokens, completionTokens}` at `src/harness/exec-recorder.ts:14-18`, and the run record + wire gain the extra counters. Unblocks per-request cost attribution and cache-hit-rate measurement.

**Context:**

Anthropic already parses `cache_creation_input_tokens`/`cache_read_input_tokens` (`src/generation/providers/anthropic/types.ts:45-50`) but the mapping drops them; `costUsd` is nullable on the run record and must never sum an unknown price as free. hermes ships the same shape (`estimated_cost_usd` in `aux_accounting.py`) and omp carries per-message `usage.cost{...}` — this is validated parity, not invention.

**Acceptance Criteria:**

- [ ] `CanonicalUsage` defined once in `src/generation/providers/types.ts`; `ExecUsage` replaced; run record + wire types gain `cacheRead/cacheWrite/reasoning/requestCount`
- [ ] openai-compatible + anthropic parser mappers fill it; absent fields default 0, never NaN
- [ ] `costUsd` stays nullable and is never summed as 0 for unknown prices
- [ ] Unit tests: anthropic cache fields survive mapping; `requestCount` sums across a batch; `src/harness/stats.ts` rollup exposes cacheRead totals
- [ ] `bun run check` green

## Technical Notes

- `reasoning` stays a reserved 0 slot until a provider parser reports a separate count — no fake data.


git issue: 638ec20
