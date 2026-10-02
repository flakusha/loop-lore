<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Harness OTEL tracing + deterministic replay

**Status:** Not Started
**Priority:** medium
**Effort:** Large
**Epic:** `.plan/epics/epic-harness-integration.md`
**Summary:** Distributed spans per generation feeding an admin Traces tab + seed/temperature logging for bit-for-bit run replay. Multi-step agent runs are undebuggable black boxes without spans; flaky-behavior triage is impossible without replay.
**Context:** Observability is in-process counters (`api-governance/telemetry/collector.ts`) + an `x-trace` header convention; `opentelemetry|tracestate` zero hits in `src/` + `package.json`. Replay exists only for async-result delivery (`async/store.ts` idempotency) and turn-skip dedup — `seed` grep over generation/llm/assistant finds only DB-fixture seeding in tests. opencode `core/src/observability/otlp.ts` is the layer shape.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Acceptance Criteria

- [ ] OTel spans per generation (trace_id/span_id, parent linkage across tool calls + subagent spawns); exporter behind a config flag (stdout/file first, collector later); no vendor SaaS in core.
- [ ] Admin Traces tab (extends the Harness tab ticket) rendering span trees for a run id; reuses the admin shell + fetch pattern.
- [ ] Replay: seed + temperature + model + normalized prompt logged per run (exec-log schema extension); replay command re-executes a run id bit-for-bit for triage + regression tests.
- [ ] Unit tests: span parentage, replay determinism on a fixed-seed fixture (no live LLM).

## Related Files

- `src/api-governance/telemetry/collector.ts`, `src/generation/` (span emission), `src/views/admin.html` (Traces tab)
- `.harness/executions.jsonl` (replay fields), `src/async/store.ts` (existing idempotency, not to duplicate)
- `epic-observability-telemetry.md`, `epic-analytics-observability.md`

*Sync pending: no git issue yet — register via `giwt ticket` / `bun run plan:sync`.*
