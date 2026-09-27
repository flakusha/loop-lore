<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: generation.failed drops model/provider context — failed calls unattributable

**Status:** Done
**Status Note:** Fixed by `cc7eb52af` (same commit as sibling latency BUG). Verified 2026-09-28: `generation-stats.test.ts` failed-generation cases pass (model+provider carried; no-context shape unchanged).
**Priority:** medium
**Effort:** Small
**Epic:** epic-analytics-observability
**Summary:** `generation.failed` records only `{ error, chatId }`; model and provider are dropped, so per-model error-rate analysis is impossible.
**Context:** Found 2026-09-27 during LLM execution-stats analysis. Sibling `generation.completed` (post-store.ts:147, non-stream.ts:170, stream-to-client.ts:233) records full token + model + provider context; the failure path does not.
**Acceptance Criteria:** See ## Acceptance Criteria below.
**Related:** BUG-generation-completed-latencyms-hardcoded-to-0-on-two-emit-pa, FEAT-error-monitoring-alert-rules-crud-webhook-notifications-erro, src/generation/auto-gen/handle-generation-error.ts

## Summary

`handleGenerationError` (`src/generation/auto-gen/handle-generation-error.ts:36-42`) records `generation.failed` with `data: { error, chatId }` only. The caller (`src/generation/auto-gen/auto-generation.ts:271`) has `resolved.resolvedModel` / `resolved.resolvedProviderName` in scope (threaded identically into the completed path at :260-261) but does not pass them. Failed calls — retries, timeouts, provider outages — therefore carry no model/provider identity, so per-model error-rate analysis and E11 error grouping cannot attribute them.

## What

- `src/generation/auto-gen/handle-generation-error.ts:22-29` — signature takes `(error, database, d, chatId, userId, attemptId?)`; no model/provider/token params.
- `src/generation/auto-gen/handle-generation-error.ts:36-42` — `data: { error, chatId }` only.
- `src/generation/auto-gen/auto-generation.ts:177-178` — `resolved` in scope at call site; `:260-261` passes `resolvedModel`/`resolvedProviderName` to the completed path but `:271` passes neither to the failure path.
- Consumers: `GET /api/telemetry/analytics/errors` groups by `(event_type, source, created_at)` (telemetry.ts:150-161) with no model dimension; `GET /api/analytics/overview` counts `generation.failed` without model split (analytics.ts:142-147). Both could group by model once the field exists.

## Why

Error-rate-by-model is the core E11-adjacent admin question ("which model is failing?"). The completed path already answers "which model succeeded"; the failure path must answer symmetrically or every error dashboard misattributes.

## Scope

- Extend `handleGenerationError` opts with optional `model`/`provider` (keep required params positional-compatible or switch to options object — smallest diff that typechecks).
- Pass `resolved.resolvedModel` / `resolved.resolvedProviderName` at the auto-generation.ts:271 call site. Generate-route failure paths (non-stream catch at non-stream.ts:211-225, stream catch at stream-to-client.ts:294-331) emit no `generation.failed` — verified 2026-09-27 via repo-wide grep (sole emitter is handle-generation-error.ts:37) — so the auto-gen call site is the only change needed.
- Keep raw `error` message redaction posture unchanged (telemetry.ts errors projection already narrows to counts; do not widen the wire shape).
- Regression test: failed generation records `model` + `provider` in `event_data`.
- Out of scope: alerting rules/webhooks (E11 ticket), latency fix (sibling BUG), per-model pricing.

## Acceptance Criteria

- [x] `generation.failed` `event_data` carries `model` + `provider` on the auto-gen path (sole emitter — generate-route failure paths verified to emit no `generation.failed`)
- [x] Errors projection wire shape unchanged (no new PII/raw-text leak)
- [x] `bun test src/generation/auto-gen/auto-generation.test.ts` green
