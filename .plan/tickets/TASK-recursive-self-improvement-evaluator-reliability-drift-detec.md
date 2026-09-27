<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Evaluator Reliability Drift Detector — Flake / Suspicious-Pass / Coverage-Regression Tracker

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)

**Status:** Not Started
**Priority:** High
**Effort:** (set per-ticket)
**Type:** Feature Task / Evaluator Reliability
**Tags:** evaluator-reliability, drift, flake-rate, suspicious-pass, coverage-regression, self-confirming-loop, urc-rsi-survey
**Epic:** epic-recursive-self-improvement

The UCR RSI survey (Chen et al., arXiv:2607.07663, July 2026) identifies **evaluator reliability** as the load-bearing pillar of every improvement loop, and names **self-confirming loops, model collapse, and diversity collapse** as the characteristic failure modes when the evaluator drifts. For loop-lore, the evaluator is the deterministic gate suite: typecheck, lint, dprint, md-lint, db-schema, size, coverage, unit + e2e tests. If the gate suite silently degrades (new flaky test added, coverage floor slowly eaten, suspicious-pass regression), the agent's "improvements" ship with weakening evidence and the loop becomes self-confirming.

This ticket adds a **drift detector** that runs alongside `bun run check` and emits a structured alert when the gate suite itself is unreliable.

## Why

Three observed drift classes in Sep-2026 weekly sweeps (`tree/` log, `.plan/backlog/`):

- **Flake inflation** — `tests/e2e/flows/browser/` has recurring `page.waitForTimeout` sleeps; nightly flake rate silently >5%; no alarm.
- **Coverage regression creep** — `TASK-license-compliance-gate` done but per-module coverage floor offenders accumulating; one-off waiver tickets pile up.
- **Suspicious-pass** — `BUG-analytics-per-user-routes-filter-telemetry-events-by-raw-ids` shipped a fix that masked a test (test passed in <50ms, prior median >500ms) — agent loop continued shipping "ready" PRs.

Each of these is invisible to a `bun run check` exit code. The gate suite returns green while the *evaluator's reliability* erodes.

## Core Features

- `src/check/drift-detector.ts` — consumes the last N MRPs (from ticket #16) + raw check reports + telemetry events; computes rolling metrics:
  - `flake_rate`: per-test pass/fail flips over the last 10 runs; flagged at >3% per test
  - `suspicious_pass`: tests completing in <10% of prior median runtime (cited as "evaluation awareness" risk in Anthropic's May 2026 essay)
  - `coverage_drift`: per-module coverage delta vs 7-day rolling window; flagged at >2pp drop
  - `gate_consistency`: same code → same gate score across two consecutive runs (catches non-determinism in tests, e.g. `Math.random()` without seed)
  - `false_pass_candidate`: tests that have NEVER failed but run in <1ms (do-nothing tests)
- Output: `tree/.tmp/check-drift-report.json` with per-metric score, threshold breach, suggested action ("open BUG-test-flake-XXX", "open TASK-coverage-waiver-locations-at-78-under-check-gate")
- `scripts/check-drift.ts` — gate: emits a structured alert via `src/notifications/` + writes to `tree/.tmp/agent-data/drift-<date>.json` for the agent loop to triage
- Threshold config in `src/config/schema.ts` under `drift:` section (defaults: flake 3%, suspicious-pass 10× ratio, coverage drift 2pp, consistency tolerance 0)
- Wire into watchdog (#1) — drift alert triggers watchdog event + opens a BUG ticket via the agent loop

## Acceptance Criteria

- [ ] Detector emits `check-drift-report.json` after every `bun run check` run; rolling window = 10
- [ ] Synthetic flake: a test that flips pass/fail 4× in 10 runs is flagged with `flake_rate=40%` and a suggested BUG ticket title
- [ ] Synthetic suspicious-pass: a <50ms test against a >500ms prior median is flagged with `suspicious_pass=true` and a TODO in the suggested action
- [ ] Coverage-drift: dropping coverage on `src/chat/` from 85% → 82% over 7 days flags with `coverage_drift=-3pp` and `module=src/chat`
- [ ] Gate consistency: re-running `bun run check` on the same commit twice produces the same gate scores (no flakes); a deliberately flaky test is detected as `false_pass_candidate`
- [ ] Threshold overrides via env (`DRIFT_FLAKE_RATE=0.02`) work without code changes
- [ ] Drift report is consumed by `agent_actions` (#9) when watchdog event fires; BUG ticket auto-filed with title + suggested-fix template

## Files

- `src/check/drift-detector.ts` — new
- `src/check/drift-detector.test.ts` — new (synthetic flake/suspicious-pass/coverage-drift fixtures)
- `scripts/check-drift.ts` — new
- `scripts/check-parallel.mjs` — register `drift` gate (warn default)
- `src/config/schema.ts` — extend with `drift` section
- `src/db/migrations/NNN_check_drift_history.ts` — new (append-only; next sequential number); stores per-run metric snapshots
- `src/agent/api/drift.ts` — new (consumes drift report, auto-files BUG ticket)
- `docs/ops/drift-detection.md` — new (threshold rationale, response playbook)

## Notes / Verification

- **Reference**: UCR RSI survey §5 (Self-Evaluation) + §5.4 (failure modes). The drift detector is the **meta-evaluator** — it evaluates the evaluator, not the agent's output. Map: test-gate → "verifier"; drift detector → "meta-verifier".
- **Verification hierarchy**: the drift detector sits **above** the test rung. It is **NOT** a verifier (it does not prove the gate is correct); it is a **signal** that the gate needs audit. The audit remains human.
- **Why historical**: the detector needs ≥10 runs of history to be statistically meaningful. Until then, the threshold defaults are conservative (3% flake, 10× suspicious-pass).
- **Why not ML**: a learned meta-evaluator trained on past failures would itself drift (per UCR §5.4 self-confirming). Heuristic + threshold + statistical-test only.
- **Anthropic "Evaluation Awareness" (May 2026)**: agents learn to game evaluators. The suspicious-pass detector is a cheap mitigation; not a defense. Pair with the **merge-readiness-pack** requirement for human-readable evidence (ticket #16).
- **No new dep**: use `bun:test` for stat tests; reuse `src/utils/statistics.ts` if present; else add a minimal mean/stdev helper (one file).

## Risks

- **False positives during refactors**: a module rename flips import paths; coverage calculation temporarily drops. Mitigation: 7-day rolling window + ignore the window on detected refactor commits (commit message contains `refactor(scope):`).
- **Threshold calibration**: 3% flake may be too strict for e2e (Playwright). Mitigation: per-tier thresholds — unit ≤0.5%, e2e ≤3%, browser ≤5%.
- **Auto-filed BUG noise**: a daily "drift detected" BUG from a non-issue is a ticket-closure burden. Mitigation: **dedupe** by `(metric, target, window)` — same finding across 3 days collapses into one ticket; reopen only if the underlying drift persists.
- **Storage growth**: per-run metric snapshots accumulate. Mitigation: 30-day retention in `check_drift_history` table; roll-up to daily summaries beyond.

