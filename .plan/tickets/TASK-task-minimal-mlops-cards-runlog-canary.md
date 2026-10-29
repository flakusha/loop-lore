<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: TASK-minimal-mlops-cards-runlog-canary

**Status:** Not Started
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-model-family-presets

**Summary:**

Owner epic: `.plan/epics/epic-model-family-presets.md`

## Background

Epic status: Not Started (`model-families.yaml` does not exist). What exists:

- Capability seed: `src/db/schema-core.ts:119-137` `ModelCapabilities` (provider/model ids, context window, tool/vision support) - no card fields (license/intended-use/version/stage/cost/metrics/lineage).
- Serving primitive: `src/services/server-external-manager/index.ts:82-86` (`startLlamaSwap` hot-swap; probes at `probes.ts:77-80`) - no canary routing, no traffic split.
- Logging base: `src/db/schema-telemetry.ts:10-19` (`telemetry_events`); `schema-core.ts:175-192` (`request_results`) - no model_runs table, no prompt-template hash.
- `driftScore` in `assistant/personality/composer.ts:12-14` is prompt-voice divergence, NOT model quality drift. Research prescribes: (1) model card JSON, (2) run log, (3) canary, (4) rating-drop alert, (5) prompt-template hash - none landed.

Established solutions: HuggingFace model-card metadata standard (adopt subset: id/family/version/stage/capabilities/contextWindow/cost/license/metrics) - https://huggingface.co/docs/hub/model-cards ; Evidently PSI/KL drift math (PSI>0.2 + windowing; re-implement ~20 lines TS/SQL, library is Python wrong runtime) - https://docs.evidentlyai.com/metrics/explainer_drift . MLflow-style server DEFERRED (SQLite-first per mlops-lite philosophy).

## Change

1. `configs/models/cards/<model-id>.json` (id, family, version, stage dev|staging|prod, capabilities[], contextWindow, costPer1MTok, license, metrics{}) + Zod schema + loader; extend `model_capabilities` read path (NOT a new table).
2. SQLite `model_runs` (id, ts, model_id, prompt_template_hash, params_json, latency_ms, tokens_in/out, rating, tags); append on generation completion; prompt hash = sha256 of rendered template.
3. Canary: generation config `candidates[{modelId, trafficShare}]`; `routeModel()` weighted-random; staging candidate 5 pct then promote when rating>=4.0 over >=50 samples else rollback. Pure router + config.
4. Drift alert: nightly cron compares trailing-7d avg rating/p95 latency vs prior 7d per prod model; alert (notification row + log) when rating drops >10 pct or PSI>0.2 on rating buckets.

## Acceptance

- Card JSON validates; invalid stage/cost rejected.
- 100 generations yield 100 `model_runs` rows with template hash.
- Canary 5 pct routes ~5/100 (seeded test exact); promotion gate blocks <50 samples.
- Synthetic rating 4.5-3.8 week-over-week fires drift notification; stable ratings do not.

**Caveats:** TOCTOU: promotion reads a frozen sample window. Security: params_json may contain user prompts - apply existing telemetry PII hashing. Parallelism: weighted routing thread-safe under concurrent requests. Partial failure: runlog append failure must not fail generation (best-effort). Rollback: canary rollback is config-only (trafficShare-0). Stale state: drift windows pinned to explicit timestamps. Observability: canary share, per-model series, drift alerts in telemetry.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
